import { createHash, randomBytes } from "node:crypto";
import { AccountError, type AccountProvider } from "./account-provider.ts";
import { boundedJson, sessionCookies } from "./account-http.ts";
import { accountRuntime } from "./account-runtime.ts";
import type { SignInStore } from "./sign-in-store.ts";
import { signInEmail, type certifiedEmailHints } from "./certified/email-hint.ts";

const nonce = () => randomBytes(32).toString("base64url");
const tasks = new Set(["/", "/settings", "/start/initiative", "/start/initiative/check", "/start/needs", "/start/offers", "/start/finish", "/partners", "/funding", "/initiatives"]);
export function returnTask(path: unknown): string {
  if (typeof path !== "string" || path.length > 250 ||
      (!tasks.has(path) && !/^\/(funding\/[A-Za-z0-9_-]+|initiatives\/[a-z0-9-]+)$/.test(path)))
    throw new AccountError(400, "invalid_return_task");
  return path;
}
interface Options { origin: string; secureCookies: boolean; store: SignInStore; provider: AccountProvider; emailHints?: ReturnType<typeof certifiedEmailHints> }
/** Callback establishes identity only. Save and Load remain separate account commands. */
export function createSignInHandlers({ origin, secureCookies, store, provider, emailHints }: Options) {
  const cookies = sessionCookies(secureCookies);
  const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };
  const finish = (path: string, status: string, session?: string) => {
    const response = new Response(null, { status: 303, headers: { ...headers, Location: `${origin}${path}?account=${status}`, "Set-Cookie": cookies.pending() } });
    if (session) response.headers.append("Set-Cookie", session);
    return response;
  };
  return {
    async POST(request: Request) {
      try {
        if (new URL(request.url).origin !== origin || request.headers.get("origin") !== origin)
          throw new AccountError(403, "origin_required");
        if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json")
          throw new AccountError(415, "json_required");
        const body = await boundedJson(request), returnTo = returnTask(body.returnTo);
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
        if (previous) await store.take(previous);
        await store.put(id, { verifier, state, returnTo });
        return new Response(JSON.stringify({ redirect }), { status: 200,
          headers: { ...headers, "Content-Type": "application/json", "Set-Cookie": cookies.pending(id, 600) } });
      } catch (error) {
        const known = error instanceof AccountError ? error : new AccountError(503, "sign_in_unavailable");
        return new Response(JSON.stringify({ error: known.code }), { status: known.status, headers: { ...headers, "Content-Type": "application/json" } });
      }
    },
    async GET(request: Request) {
      let returnTo = "/settings";
      let established: string | undefined;
      try {
        const url = new URL(request.url);
        if (url.origin !== origin || url.href.length > 8192) throw Error("invalid_callback");
        const id = cookies.binding(request);
        if (!id) throw Error("invalid_browser_state");
        const attempt = await store.take(id);
        if (!attempt) throw Error("expired_or_used_state");
        returnTo = returnTask(attempt.returnTo);
        if (url.searchParams.getAll("state").length !== 1 || url.searchParams.get("state") !== attempt.state)
          throw Error("invalid_browser_state");
        if (url.searchParams.has("error")) return finish(returnTo, "cancelled");
        const code = url.searchParams.get("code");
        if (!code || code.length > 2048 || url.searchParams.getAll("code").length !== 1) throw Error("invalid_callback");
        const session = await provider.exchangeCode(code, attempt.verifier);
        established = session.token;
        // Authoritative database predicate rejects missing Certified identity, bans and revoked sessions.
        await provider.authorize(session.token);
        return finish(returnTo, "signed-in", cookies.session(session.token, session.expiresIn));
      } catch {
        if (established) { try { await provider.signOut(established); } catch {} }
        return finish(returnTo, "failed");
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
