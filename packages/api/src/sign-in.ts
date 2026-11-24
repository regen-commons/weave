import { createHash, randomBytes } from "node:crypto";
import { performance } from "node:perf_hooks";
import { uuid, type SignInResult } from "./account-contract.ts";
import { AccountError, type AccountProvider } from "./account-provider.ts";
import { boundedJson, RENEWAL_SECONDS, sessionCookies } from "./account-http.ts";
import { accountRuntime } from "./account-runtime.ts";
import type { SignInStore } from "./sign-in-store.ts";
import { signInEmail, type certifiedEmailHints } from "./certified/email-hint.ts";
import { serverTiming, withServerTiming } from "./certified/server-timing.ts";
import type { supabaseDirect } from "./sign-in-direct.ts";

const nonce = () => randomBytes(32).toString("base64url");
const tasks = new Set(["/", "/settings", "/start/initiative", "/start/initiative/check", "/start/needs", "/start/offers", "/start/finish", "/your-initiative", "/your-initiatives", "/partners", "/funding", "/initiatives"]);
export function returnTask(path: unknown): string {
  const workspace = typeof path === "string" && path.startsWith("/workspaces/") && uuid(path.slice("/workspaces/".length));
  if (typeof path !== "string" || path.length > 250 ||
      (!workspace && !tasks.has(path) && !/^\/(funding\/[A-Za-z0-9_-]+|initiatives\/[a-z0-9-]+)$/.test(path)))
    throw new AccountError(400, "invalid_return_task");
  return path;
}
// The bridge sends sign_in_expired after Supabase's flow window; the others are Supabase Auth's own codes.
const expiredCodes = new Set(["sign_in_expired", "flow_state_expired", "bad_oauth_state"]);
/** A fixed result for an error return. Provider descriptions are never read, kept or shown. */
export function errorReturn(params: URLSearchParams): Exclude<SignInResult, "signed-in"> | undefined {
  const errors = params.getAll("error"), codes = params.getAll("error_code");
  if (!errors.length && !codes.length) return undefined;
  const [error] = errors, [code] = codes;
  if (errors.length > 1 || codes.length > 1) return "failed";
  if (expiredCodes.has(error ?? "") || expiredCodes.has(code ?? "")) return "expired";
  // Supabase adds an error code to its own failures, including bans and disabled signup.
  return error === "access_denied" && code === undefined ? "cancelled" : "failed";
}
interface Options { origin: string; secureCookies: boolean; store: SignInStore; provider: AccountProvider; emailHints?: ReturnType<typeof certifiedEmailHints>;
  /** Wakes the identity bridge. It never rejects and is never needed for a sign-in to work. */
  warmBridge?: () => Promise<void>;
  /** Opens the connection to Supabase for direct starts (`sign-in-direct.ts`). It never rejects. */
  warmSupabase?: () => Promise<void>;
  /** Asks Supabase for the bridge address itself (`sign-in-direct.ts`). It never rejects. */
  toBridge?: ReturnType<typeof supabaseDirect> }
/** Callback establishes identity only. Save and Load remain separate account commands. */
export function createSignInHandlers({ origin, secureCookies, store, provider, emailHints, warmBridge, warmSupabase, toBridge }: Options) {
  const cookies = sessionCookies(secureCookies);
  const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };
  const finish = (path: string, status: SignInResult, session: string[] = []) => {
    const response = new Response(null, { status: 303, headers: { ...headers, Location: `${origin}${path}?account=${status}`, "Set-Cookie": cookies.pending() } });
    for (const cookie of session) response.headers.append("Set-Cookie", cookie);
    return response;
  };
  return {
    async POST(request: Request) {
      const timing = serverTiming();
      try {
        if (new URL(request.url).origin !== origin || request.headers.get("origin") !== origin)
          throw new AccountError(403, "origin_required");
        if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json")
          throw new AccountError(415, "json_required");
        const body = await boundedJson(request);
        // A page that shows Sign In to someone signed out asks this first, so the press that follows
        // meets a warm function, a store whose one-time role check is done and a woken bridge. It
        // starts no attempt, sets no cookie and says nothing about whether any of it worked.
        if (body.warm === true) {
          if (Object.keys(body).length !== 1) throw new AccountError(400, "invalid_data");
          await Promise.allSettled([timing.time("store", async () => store.ready?.()), timing.time("bridge", async () => warmBridge?.()),
            timing.time("supabase", async () => warmSupabase?.())]);
          return withServerTiming(new Response(JSON.stringify({ warm: true }), { status: 200, headers: { ...headers, "Content-Type": "application/json" } }), timing);
        }
        const returnTo = returnTask(body.returnTo);
        // A press with no warning still gives the bridge a head start on the redirects that follow.
        // Nothing the waker does, or fails to do, changes the start.
        try { void warmBridge?.().catch(() => {}); } catch { /* The start goes on. */ }
        // A cached form may still submit an address without the redirect disclosure.
        const useEmail = body.email !== undefined && body.emailRedirectConsent === true;
        const email = useEmail ? signInEmail(body.email) : undefined;
        if (useEmail && !email) throw new AccountError(400, "invalid_sign_in_email");
        if (email && !emailHints) throw new AccountError(503, "sign_in_unavailable");
        const id = nonce(), state = nonce(), verifier = nonce();
        // Supabase owns its provider state; the app binds its own return URL to this browser.
        const callback = `${origin}/api/sign-in?state=${state}`;
        const redirect = provider.signInUrl(createHash("sha256").update(verifier).digest("base64url"), callback,
          email ? emailHints?.seal(email) : undefined);
        const previous = cookies.binding(request);
        // The attempt is stored as before; Supabase is asked at the same time. Its answer is only used
        // once the attempt is safely stored, and a failed store fails the start as it always has.
        const asked = performance.now();
        const [direct] = await Promise.all([
          toBridge ? toBridge(redirect, callback).then(target => {
            timing.add("supabase", performance.now() - asked, target ? "direct" : "fallback");
            return target;
          }) : Promise.resolve(undefined),
          timing.time("state", async () => {
            if (previous) await store.take(previous);
            await store.put(id, { verifier, state, returnTo });
          }),
        ]);
        return withServerTiming(new Response(JSON.stringify({ redirect: direct ?? redirect }), { status: 200,
          headers: { ...headers, "Content-Type": "application/json", "Set-Cookie": cookies.pending(id, 600) } }), timing);
      } catch (error) {
        const known = error instanceof AccountError ? error : new AccountError(503, "sign_in_unavailable");
        return new Response(JSON.stringify({ error: known.code }), { status: known.status, headers: { ...headers, "Content-Type": "application/json" } });
      }
    },
    async GET(request: Request) {
      const timing = serverTiming();
      let returnTo = "/settings";
      let established: string | undefined;
      try {
        const url = new URL(request.url);
        if (url.origin !== origin || url.href.length > 8192) throw Error("invalid_callback");
        const id = cookies.binding(request);
        const returned = errorReturn(url.searchParams), states = url.searchParams.getAll("state");
        // Supabase always returns the state this handler put in redirect_to. A return without it comes from
        // the bridge ending an attempt that ran past Supabase's flow window. It only chooses the message
        // and recovers this browser's task; it can never establish a session.
        if (!states.length) {
          const attempt = id ? await store.take(id) : undefined;
          if (attempt) returnTo = returnTask(attempt.returnTo);
          return finish(returnTo, returned ?? "failed");
        }
        if (!id) throw Error("invalid_browser_state");
        const attempt = await store.take(id);
        if (!attempt) throw Error("expired_or_used_state");
        returnTo = returnTask(attempt.returnTo);
        if (states.length !== 1 || states[0] !== attempt.state) throw Error("invalid_browser_state");
        if (returned) return finish(returnTo, returned);
        const code = url.searchParams.get("code");
        if (!code || code.length > 2048 || url.searchParams.getAll("code").length !== 1) throw Error("invalid_callback");
        const session = await timing.time("exchange", () => provider.exchangeCode(code, attempt.verifier));
        established = session.token;
        // Authoritative database predicate rejects missing Certified identity, bans and revoked sessions.
        await timing.time("authorize", () => provider.authorize(session.token));
        // The refresh token lets /api/account renew the access token before its hour runs out.
        return withServerTiming(finish(returnTo, "signed-in", [cookies.session(session.token, session.expiresIn),
          cookies.renewal(session.refreshToken, RENEWAL_SECONDS)]), timing);
      } catch (error) {
        if (established) { try { await provider.signOut(established); } catch {} }
        return finish(returnTo, error instanceof AccountError && error.code === "sign_in_expired" ? "expired" : "failed");
      }
    },
  };
}
const unavailable = () => new Response(JSON.stringify({ error: "sign_in_unavailable" }), { status: 503,
  headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store" } });
export const POST = (request: Request) => {
  const runtime = accountRuntime();
  return runtime ? createSignInHandlers(runtime).POST(request) : unavailable();
};
export const GET = (request: Request) => {
  const runtime = accountRuntime();
  return runtime ? createSignInHandlers(runtime).GET(request) : unavailable();
};
