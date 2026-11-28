import { observeApi } from "./usage.ts";
import { boundedJson, sessionCookies } from "./account-http.ts";
import { accountRuntime } from "./account-runtime.ts";
import { AccountError, type AccountProvider } from "./account-provider.ts";
import { RENEW_BEFORE_SECONDS, resolveSession, withAccessToken, type Session } from "./account-session.ts";
export { RENEW_BEFORE_SECONDS, secondsLeft } from "./account-session.ts";
interface Options {
  provider: AccountProvider | null;
  secureCookies?: boolean;
  fixture?: boolean;
  emailHintAvailable?: boolean;
  /** Milliseconds since the epoch; tests move the clock. */
  now?: () => number;
  /**
   * What else ends with the session, given a request that still carries its valid access token: the
   * Certified project grants. It runs before the session is revoked, because only a live session can
   * find them, and it can never stop or fail a sign-out.
   */
  onSignOut?: (request: Request) => Promise<unknown>;
  /** How long a sign-out waits for `onSignOut`, in milliseconds. */
  signOutWait?: number;
}
/**
 * When the app should ask again: just inside the renewal window when a renewal cookie exists, otherwise
 * just after expiry, so an ending session is noticed while the person is still here.
 */
function renewIn(left: number, renewable: boolean) {
  const seconds = renewable ? Math.floor(left) - RENEW_BEFORE_SECONDS + 30 : Math.ceil(left) + 1;
  return Math.min(3600, Math.max(30, seconds));
}
export function createAccountHandlers({
  provider,
  secureCookies = true,
  fixture = false,
  emailHintAvailable = false,
  now = Date.now,
  onSignOut,
  signOutWait = 5000,
}: Options) {
  const cookies = sessionCookies(secureCookies);
  const response = (status: number, body: unknown, setCookies: string[] = []) => {
    const result = new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store", Vary: "Cookie" },
    });
    for (const cookie of setCookies) result.headers.append("Set-Cookie", cookie);
    return result;
  };
  const session = (request: Request, accounts: AccountProvider) => resolveSession(request, accounts, cookies, now());
  /**
   * The database predicate decides every request, renewed or not. When it rejects a session this browser can
   * still renew, Weave revokes that session at Supabase too, so a rejected identity cannot keep refreshing.
   */
  async function authorized(accounts: AccountProvider, current: Session & { access: string }) {
    try {
      return await accounts.authorize(current.access);
    } catch (error) {
      if (error instanceof AccountError && error.status === 401 && current.renewable)
        await accounts.signOut(current.access).catch(() => {});
      throw error;
    }
  }
  /**
   * An ended session clears every session cookie. Any other failure still delivers a renewal that already
   * happened: Supabase has rotated the refresh token, and the browser's old one stops working.
   */
  const failure = (error: unknown, current?: Session) => {
    const known = error instanceof AccountError ? error : new AccountError(503, "account_unavailable");
    return response(known.status, { error: known.code }, known.status === 401 ? cookies.ended() : current?.setCookies);
  };
  return {
    async GET(request: Request) {
      if (!provider) return response(200, { available: false });
      // DL-155, step 7: the earlier private saves are gone (D49), so one is never opened by its ID.
      if (new URL(request.url).searchParams.has("id")) return response(410, { error: "private_saves_retired" });
      let current: Session | undefined;
      try {
        current = await session(request, provider);
        const access = current.access;
        if (!access) return response(200, { available: true, signIn: "certified", fixture, user: null,
          ...(emailHintAvailable ? { emailHintAvailable } : {}) });
        const user = await authorized(provider, { ...current, access });
        return response(200, {
          available: true,
          signIn: "certified",
          fixture,
          user,
          renewIn: renewIn(current.left, current.renewable),
        }, current.setCookies);
      } catch (error) {
        return failure(error, current);
      }
    },
    async POST(request: Request) {
      let current: Session | undefined;
      try {
        if (request.headers.get("origin") !== new URL(request.url).origin)
          throw new AccountError(403, "origin_required");
        if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json")
          throw new AccountError(415, "json_required");
        if (!provider) throw new AccountError(503, "accounts_not_configured");
        const body = await boundedJson(request);
        if (!["sign_out", "save", "delete"].includes(String(body.action))) throw new AccountError(400, "invalid_action");
        // DL-155: nothing is saved privately any more (step 4), and the earlier saves are gone (step 7, D49).
        if (body.action === "save" || body.action === "delete") throw new AccountError(410, "private_saves_retired");
        if (body.action === "sign_out") {
          // Logout revokes the whole Supabase session, its refresh tokens included. An expired access token
          // is renewed first so the revocation can be sent; a session Supabase already refuses has ended.
          try {
            current = await session(request, provider);
          } catch (error) {
            if (!(error instanceof AccountError && error.status === 401))
              throw new AccountError(503, "sign_out_unconfirmed");
          }
          if (current?.access && onSignOut) {
            // Bounded and swallowed: whatever happens here, the session is revoked next.
            const cleanup = new Request(request.url, { headers: { cookie: request.headers.get("cookie") ?? "" } });
            let timer: ReturnType<typeof setTimeout> | undefined;
            try {
              await Promise.race([
                Promise.resolve().then(() => onSignOut(withAccessToken(cleanup, cookies, current!.access!))).catch(() => {}),
                new Promise<void>(resolve => { timer = setTimeout(resolve, signOutWait); }),
              ]);
            } finally { clearTimeout(timer); }
          }
          if (current?.access) await provider.signOut(current.access);
          return response(200, { signedOut: true }, [...cookies.ended(), cookies.pending()]);
        }
        throw new AccountError(400, "invalid_action");
      } catch (error) {
        return failure(error, current);
      }
    },
  };
}
/**
 * The project runtime is loaded only here, at sign-out, so every other account request stays as light
 * as it was. Where projects are switched off there is nothing to forget.
 */
async function forgetProjectGrants(request: Request) {
  const { projectRuntime } = await import("./project-runtime.ts");
  return (await projectRuntime())?.auth.forget(request);
}
function configuredHandlers() {
  const runtime = accountRuntime();
  return createAccountHandlers({ provider: runtime?.provider ?? null, secureCookies: runtime?.secureCookies ?? true,
    emailHintAvailable: !!runtime?.emailHints, onSignOut: forgetProjectGrants });
}
export const GET = observeApi("account", (request: Request) => configuredHandlers().GET(request));
export const POST = observeApi("account", (request: Request) => configuredHandlers().POST(request));
