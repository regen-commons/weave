import { observeApi } from "./usage.ts";
import { boundedJson, sessionCookies } from "./account-http.ts";
import { accountRuntime } from "./account-runtime.ts";
import { parseDocument, uuid } from "./account-contract.ts";
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
      let current: Session | undefined;
      try {
        current = await session(request, provider);
        const access = current.access;
        if (!access) return response(200, { available: true, signIn: "certified", fixture, user: null, items: [],
          ...(emailHintAvailable ? { emailHintAvailable } : {}) });
        const params = new URL(request.url).searchParams,
          id = params.get("id");
        if (id) {
          const user = await authorized(provider, { ...current, access });
          if (!uuid(id)) throw new AccountError(400, "invalid_data");
          return response(200, { available: true, user, saved: await provider.load(access, id) }, current.setCookies);
        }
        const offset = Number(params.get("offset") ?? 0);
        const listable = Number.isSafeInteger(offset) && offset >= 0 && offset <= 10000;
        // The list is read while the session is authorized, since every page asks for both. The database
        // applies the same access rule to the list itself, and a list read for a session that is then
        // refused is dropped unseen. The authorization's outcome is judged first, as when it ran first.
        const listing = listable
          ? provider.list(access, offset).then(items => ({ items }), (error: unknown) => ({ error }))
          : undefined;
        const user = await authorized(provider, { ...current, access });
        if (!listing) throw new AccountError(400, "invalid_data");
        const listed = await listing;
        if ("error" in listed) throw listed.error;
        return response(200, {
          available: true,
          signIn: "certified",
          fixture,
          user,
          items: listed.items,
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
        current = await session(request, provider);
        const access = current.access;
        if (!access) throw new AccountError(401, "sign_in_required");
        if (body.action === "delete") {
          // Exactly the card and revision the person saw, and a request ID kept for retries.
          const keys = Object.keys(body).sort().join(",");
          if (
            keys !== "action,expectedRevision,id,requestId" ||
            !uuid(body.id) ||
            !uuid(body.requestId) ||
            !Number.isSafeInteger(body.expectedRevision) ||
            Number(body.expectedRevision) < 1 ||
            Number(body.expectedRevision) >= 2147483647
          )
            throw new AccountError(400, "invalid_data");
          await authorized(provider, { ...current, access });
          const deleted = await provider.deleteInitiative(access, {
            id: body.id,
            expectedRevision: Number(body.expectedRevision),
            requestId: body.requestId,
          });
          if (deleted.id !== body.id || deleted.revision !== body.expectedRevision)
            throw new AccountError(503, "account_unavailable");
          return response(200, { deleted }, current.setCookies);
        }
        const user = await authorized(provider, { ...current, access });
        if (body.action === "save") {
          if (!uuid(body.accountId)) throw new AccountError(400, "invalid_data");
          if (body.accountId !== user.id) throw new AccountError(409, "account_changed");
          if (
            !uuid(body.id) ||
            !uuid(body.requestId) ||
            !Number.isSafeInteger(body.expectedRevision) ||
            Number(body.expectedRevision) < 0 ||
            Number(body.expectedRevision) >= 2147483647
          )
            throw new AccountError(400, "invalid_data");
          let document;
          try {
            document = parseDocument(body.document);
          } catch (error) {
            throw new AccountError(
              400,
              error instanceof Error && error.message === "document_too_large"
                ? "document_too_large"
                : "invalid_data",
            );
          }
          return response(200, {
            saved: await provider.save(access, {
              id: body.id,
              requestId: body.requestId,
              expectedRevision: Number(body.expectedRevision),
              document,
            }),
          }, current.setCookies);
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
