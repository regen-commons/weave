import { record } from "./account-contract.ts";
import { RENEWAL_SECONDS, sessionCookies } from "./account-http.ts";
import { AccountError, type AccountProvider, type AccountSessionTokens } from "./account-provider.ts";

/** The access token is renewed once fewer than this many seconds remain. */
export const RENEW_BEFORE_SECONDS = 300;
/** A session renews for at most this long after the original sign-in, however often it is used. */
export const SESSION_CAP_SECONDS = 30 * 24 * 60 * 60;
const claims = (token: string): Record<string, unknown> | null => {
  try {
    return record(JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString()));
  } catch {
    return null;
  }
};
/** Seconds left on an access token, read from its unverified `exp` only to time renewal. Supabase still verifies it. */
export function secondsLeft(token: string, now: number): number {
  const exp = claims(token)?.exp;
  return typeof exp === "number" && Number.isFinite(exp) ? exp - now / 1000 : 0;
}
/**
 * When the person signed in, in Unix seconds: the earliest `amr` timestamp. Supabase writes one entry when it
 * creates the session and keeps it across refreshes; only later MFA steps add newer entries. Read it only from a
 * token Weave just received from Supabase, never from a cookie. Null when the token carries no timestamps.
 */
export function signedInAt(token: string): number | null {
  const amr = claims(token)?.amr;
  if (!Array.isArray(amr)) return null;
  const times = amr.map(entry => {
    try { return record(entry).timestamp; } catch { return undefined; }
  }).filter((time): time is number => typeof time === "number" && Number.isSafeInteger(time) && time > 0);
  return times.length ? Math.min(...times) : null;
}
// Requests from several tabs, or from the account and matching endpoints at once, can arrive with one refresh
// token. One function instance sends one refresh for them; Supabase's reuse interval covers other instances.
const renewals = new WeakMap<AccountProvider, Map<string, Promise<AccountSessionTokens>>>();
function renewOnce(provider: AccountProvider, refreshToken: string, now: number) {
  let pending = renewals.get(provider);
  if (!pending) renewals.set(provider, pending = new Map());
  let renewal = pending.get(refreshToken);
  if (!renewal) {
    renewal = provider.renew(refreshToken).then(async renewed => {
      const start = signedInAt(renewed.token);
      // Past the cap the session ends: Weave revokes it, so neither this refresh token nor the one just issued
      // can renew again. A token without timestamps is allowed; the renewal cookie's idle limit still applies.
      if (start !== null && now / 1000 - start >= SESSION_CAP_SECONDS) {
        await provider.signOut(renewed.token).catch(() => {});
        throw new AccountError(401, "sign_in_required");
      }
      return renewed;
    }).finally(() => pending.delete(refreshToken));
    pending.set(refreshToken, renewal);
  }
  return renewal;
}
export interface Session {
  access: string | null;
  /** Seconds left on `access` at the time of the request. */
  left: number;
  /** A renewal cookie came with the request or was just issued. */
  renewable: boolean;
  /** Cookies a renewal issued; every response to this request must carry them. */
  setCookies: string[];
}
/**
 * The request's access token, renewed first when it is missing or close to expiry and a renewal cookie
 * exists. A refused renewal means the session ended: sign_in_required, and the caller clears both cookies.
 * An outage keeps a still-valid access token in use and otherwise fails without ending anything.
 */
export async function resolveSession(
  request: Request, provider: AccountProvider, cookies: ReturnType<typeof sessionCookies>, now: number,
): Promise<Session> {
  const access = cookies.token(request), refreshToken = cookies.renewalToken(request);
  const left = access ? secondsLeft(access, now) : 0;
  if (!refreshToken || (access && left > RENEW_BEFORE_SECONDS))
    return { access, left, renewable: !!refreshToken, setCookies: [] };
  let renewed: AccountSessionTokens;
  try {
    renewed = await renewOnce(provider, refreshToken, now);
  } catch (error) {
    if (error instanceof AccountError && error.status === 401) throw error;
    if (access && left > 0) return { access, left, renewable: true, setCookies: [] };
    throw error instanceof AccountError ? error : new AccountError(503, "account_unavailable");
  }
  // Neither cookie outlives the cap, so a browser holding them stops at the cap even without a renewal.
  const start = signedInAt(renewed.token);
  const capped = (seconds: number) =>
    start === null ? seconds : Math.max(1, Math.min(seconds, Math.floor(start + SESSION_CAP_SECONDS - now / 1000)));
  return {
    access: renewed.token,
    left: secondsLeft(renewed.token, now) || renewed.expiresIn,
    renewable: true,
    setCookies: [cookies.session(renewed.token, capped(renewed.expiresIn)),
      cookies.renewal(renewed.refreshToken, capped(RENEWAL_SECONDS))],
  };
}

/**
 * For endpoints other than /api/account that act on the person's session, such as matching and projects.
 * They read only the access cookie, which lapses within the hour while the session itself can still renew,
 * so a 401 from them would sign a person out who is still signed in. This renews first, hands the handler a
 * request that carries the renewed access token, and returns the rotated cookies with its response. A 401
 * from here means the session ended, as from /api/account. The handler still runs its own authorization.
 */
export function withRenewedSession(
  handler: (request: Request) => Promise<Response>,
  options: () => { provider: AccountProvider; secureCookies: boolean; now?: () => number } | null,
) {
  return async (request: Request): Promise<Response> => {
    const settings = options();
    if (!settings) return handler(request);
    const cookies = sessionCookies(settings.secureCookies);
    let current: Session;
    try {
      current = await resolveSession(request, settings.provider, cookies, (settings.now ?? Date.now)());
    } catch (error) {
      const known = error instanceof AccountError ? error : new AccountError(503, "account_unavailable");
      const response = Response.json({ error: known.code }, { status: known.status,
        headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
      if (known.status === 401) for (const cookie of cookies.ended()) response.headers.append("Set-Cookie", cookie);
      return response;
    }
    if (!current.setCookies.length) return handler(request);
    const response = await handler(withAccessToken(request, cookies, current.access!));
    // A handler's response may have immutable headers, so the cookies go on a copy.
    const result = new Response(response.body, { status: response.status, statusText: response.statusText,
      headers: new Headers(response.headers) });
    for (const cookie of current.setCookies) result.headers.append("Set-Cookie", cookie);
    return result;
  };
}
/** The same request, with its access cookie replaced by the renewed token. */
export function withAccessToken(request: Request, cookies: ReturnType<typeof sessionCookies>, token: string) {
  const name = cookies.session().split("=")[0]!;
  const kept = (request.headers.get("cookie") ?? "").split(";").map(value => value.trim())
    .filter(value => value && !value.startsWith(`${name}=`));
  const headers = new Headers(request.headers);
  headers.set("cookie", [...kept, `${name}=${token}`].join("; "));
  return new Request(request, { headers });
}
