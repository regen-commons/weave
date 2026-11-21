import { boundedJson, RENEWAL_SECONDS, sessionCookies } from "./account-http.ts";
import { accountRuntime } from "./account-runtime.ts";
import { parseDocument, record, uuid } from "./account-contract.ts";
import { AccountError, type AccountProvider, type AccountSessionTokens } from "./account-provider.ts";
interface Options {
  provider: AccountProvider | null;
  secureCookies?: boolean;
  fixture?: boolean;
  emailHintAvailable?: boolean;
  /** Milliseconds since the epoch; tests move the clock. */
  now?: () => number;
}
/** The access token is renewed once fewer than this many seconds remain. */
export const RENEW_BEFORE_SECONDS = 300;
/** Seconds left on an access token, read from its unverified `exp` only to time renewal. Supabase still verifies it. */
export function secondsLeft(token: string, now: number): number {
  try {
    const exp = record(JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString())).exp;
    return typeof exp === "number" && Number.isFinite(exp) ? exp - now / 1000 : 0;
  } catch {
    return 0;
  }
}
/**
 * When the app should ask again: just inside the renewal window when a renewal cookie exists, otherwise
 * just after expiry, so an ending session is noticed while the person is still here.
 */
function renewIn(left: number, renewable: boolean) {
  const seconds = renewable ? Math.floor(left) - RENEW_BEFORE_SECONDS + 30 : Math.ceil(left) + 1;
  return Math.min(3600, Math.max(30, seconds));
}
// Requests from several tabs can arrive together with one refresh token. One function instance sends one
// refresh for them; Supabase's reuse interval covers requests that reach different instances.
const renewals = new WeakMap<AccountProvider, Map<string, Promise<AccountSessionTokens>>>();
function renewOnce(provider: AccountProvider, refreshToken: string) {
  let pending = renewals.get(provider);
  if (!pending) renewals.set(provider, pending = new Map());
  let renewal = pending.get(refreshToken);
  if (!renewal) {
    renewal = provider.renew(refreshToken).finally(() => pending.delete(refreshToken));
    pending.set(refreshToken, renewal);
  }
  return renewal;
}
interface Session {
  access: string | null;
  /** Seconds left on `access` at the time of the request. */
  left: number;
  /** A renewal cookie came with the request or was just issued. */
  renewable: boolean;
  setCookies: string[];
}
export function createAccountHandlers({
  provider,
  secureCookies = true,
  fixture = false,
  emailHintAvailable = false,
  now = Date.now,
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
  /**
   * The request's access token, renewed first when it is missing or close to expiry and a renewal cookie
   * exists. A refused renewal means the session ended: sign_in_required, and the caller clears both cookies.
   * An outage keeps a still-valid access token in use and otherwise fails without ending anything.
   */
  async function session(request: Request, accounts: AccountProvider): Promise<Session> {
    const access = cookies.token(request), refreshToken = cookies.renewalToken(request), at = now();
    const left = access ? secondsLeft(access, at) : 0;
    if (!refreshToken || (access && left > RENEW_BEFORE_SECONDS))
      return { access, left, renewable: !!refreshToken, setCookies: [] };
    let renewed: AccountSessionTokens;
    try {
      renewed = await renewOnce(accounts, refreshToken);
    } catch (error) {
      if (error instanceof AccountError && error.status === 401) throw error;
      if (access && left > 0) return { access, left, renewable: true, setCookies: [] };
      throw error instanceof AccountError ? error : new AccountError(503, "account_unavailable");
    }
    return {
      access: renewed.token,
      left: secondsLeft(renewed.token, at) || renewed.expiresIn,
      renewable: true,
      setCookies: [cookies.session(renewed.token, renewed.expiresIn), cookies.renewal(renewed.refreshToken, RENEWAL_SECONDS)],
    };
  }
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
        const user = await authorized(provider, { ...current, access });
        const params = new URL(request.url).searchParams,
          id = params.get("id");
        if (id) {
          if (!uuid(id)) throw new AccountError(400, "invalid_data");
          return response(200, { available: true, user, saved: await provider.load(access, id) }, current.setCookies);
        }
        const offset = Number(params.get("offset") ?? 0);
        if (!Number.isSafeInteger(offset) || offset < 0 || offset > 10000)
          throw new AccountError(400, "invalid_data");
        return response(200, {
          available: true,
          signIn: "certified",
          fixture,
          user,
          items: await provider.list(access, offset),
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
function configuredHandlers() {
  const runtime = accountRuntime();
  return createAccountHandlers({ provider: runtime?.provider ?? null, secureCookies: runtime?.secureCookies ?? true,
    emailHintAvailable: !!runtime?.emailHints });
}
export const GET = (request: Request) => configuredHandlers().GET(request);
export const POST = (request: Request) => configuredHandlers().POST(request);
