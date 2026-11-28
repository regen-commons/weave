import { parseUser, record, type AccountUser } from "./account-contract.ts";
export class AccountError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}
/** A Supabase session. The refresh token only ever travels in an HttpOnly cookie and to Supabase. */
export interface AccountSessionTokens { token: string; expiresIn: number; refreshToken: string }
export interface AccountProvider {
  signInUrl(challenge: string, callback: string, loginHint?: string): string;
  exchangeCode(code: string, verifier: string): Promise<AccountSessionTokens>;
  /**
   * Rotates a refresh token into a new session pair. Supabase rejects a revoked, expired, reused or banned
   * session; that is reported as sign_in_required. An outage is account_unavailable and ends nothing.
   */
  renew(refreshToken: string): Promise<AccountSessionTokens>;
  authorize(token: string): Promise<AccountUser>;
  signOut(token: string): Promise<void>;
}
/** Supabase Auth sends its error code in a header, and in the body of its initial API version. */
function supabaseErrorCode(response: Response, data: unknown): string | undefined {
  const header = response.headers.get("x-sb-error-code");
  if (header) return header;
  try {
    const code = record(data).error_code;
    return typeof code === "string" ? code : undefined;
  } catch {
    return undefined;
  }
}
/** Reads a token response from the PKCE or refresh grant. Anything unexpected is an outage, never a session. */
function sessionTokens(data: unknown): AccountSessionTokens {
  let o: Record<string, unknown>;
  try { o = record(data); } catch { throw new AccountError(503, "account_unavailable"); }
  if (
    typeof o.access_token !== "string" ||
    !/^[-A-Za-z0-9_]+\.[-A-Za-z0-9_]+\.[-A-Za-z0-9_]+$/u.test(o.access_token) ||
    o.access_token.length > 3800 ||
    typeof o.expires_in !== "number" ||
    !Number.isFinite(o.expires_in) ||
    o.expires_in <= 0 ||
    typeof o.refresh_token !== "string" ||
    !/^[\x21-\x7e]{8,1024}$/u.test(o.refresh_token)
  )
    throw new AccountError(503, "account_unavailable");
  return { token: o.access_token, expiresIn: Math.min(Math.floor(o.expires_in), 3600), refreshToken: o.refresh_token };
}
function supabaseRequests(url: string, key: string, request: typeof fetch) {
  const call = async (path: string, method: string, body: unknown, token?: string, schema = false) => {
    let response: Response;
    try {
      response = await request(`${url}${path}`, {
        method,
        headers: {
          apikey: key,
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(schema ? { "Content-Profile": "weave", "Accept-Profile": "weave" } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      throw new AccountError(503, "account_unavailable");
    }
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    return { response, data };
  };
  const rpc = async (name: string, body: unknown, token: string) => {
    const { response, data } = await call(`/rest/v1/rpc/${name}`, "POST", body, token, true);
    if (!response.ok) {
      let code = "", message = "";
      try {
        const error = record(data);
        code = String(error.code);
        message = String(error.message);
      } catch {
        /* Never return provider data. */
      }
      // Only a known reason is mapped to its own stable code; the provider's words never leave. A team save
      // of a card that was removed is refused with initiative_deleted.
      if (code === "PT409" && message === "initiative_deleted")
        throw new AccountError(409, message);
      if (["PT400", "PT401", "PT403", "PT404", "PT409", "PT429"].includes(code))
        throw new AccountError(
          Number(code.slice(2)),
          code === "PT429"
            ? "rate_limited"
            : code === "PT400"
              ? "invalid_data"
              : code === "PT409"
                ? "save_conflict"
                : code === "PT404"
                  ? "not_found"
                  : "sign_in_required",
        );
      if (response.status === 401) throw new AccountError(401, "sign_in_required");
      throw new AccountError(503, "account_unavailable");
    }
    return data;
  };
  return { call, rpc };
}

/** An exposed Weave RPC receives the publishable key and the caller's own token. */
export const createSupabaseWeaveRpc = (url: string, key: string, request: typeof fetch = fetch) =>
  supabaseRequests(url, key, request).rpc;

/** Auth and PostgREST receive only the publishable key and the person's own token. */
export function createSupabaseAccountProvider(
  url: string,
  key: string,
  request: typeof fetch = fetch,
): AccountProvider {
  const { call, rpc } = supabaseRequests(url, key, request);
  return {
    signInUrl(challenge, callback, loginHint) {
      const target = new URL(`${url}/auth/v1/authorize`);
      target.search = new URLSearchParams({ provider: "custom:certified", redirect_to: callback,
        code_challenge: challenge, code_challenge_method: "s256" }).toString();
      if (loginHint) {
        target.searchParams.set("login_hint", loginHint);
        target.searchParams.set("prompt", "login");
      }
      return target.href;
    },
    async exchangeCode(code, verifier) {
      const { response, data } = await call("/auth/v1/token?grant_type=pkce", "POST", { auth_code: code, code_verifier: verifier });
      // Supabase's PKCE flow lasts five minutes. Only its fixed error code is read, never its message.
      if (response.status === 422 && supabaseErrorCode(response, data) === "flow_state_expired")
        throw new AccountError(401, "sign_in_expired");
      if (!response.ok) throw new AccountError(response.status === 429 ? 429 : response.status >= 500 ? 503 : 401,
        response.status === 429 ? "rate_limited" : response.status >= 500 ? "account_unavailable" : "sign_in_failed");
      return sessionTokens(data);
    },
    async renew(refreshToken) {
      const { response, data } = await call("/auth/v1/token?grant_type=refresh_token", "POST", { refresh_token: refreshToken });
      // Any refusal (revoked, reused past Supabase's reuse window, expired, banned) ends the session.
      // Only the status is read; Supabase's codes and messages never leave.
      if (!response.ok) throw new AccountError(response.status === 429 ? 429 : response.status >= 500 ? 503 : 401,
        response.status === 429 ? "rate_limited" : response.status >= 500 ? "account_unavailable" : "sign_in_required");
      return sessionTokens(data);
    },
    async authorize(token) {
      // Both checks read only, so they run together. The user's answer is still judged first, and the
      // database predicate's failure is held until then, so the outcome is the one a sequence gave.
      const access = rpc("account_access", {}, token).then(value => ({ value }), (error: unknown) => ({ error }));
      const { response, data } = await call("/auth/v1/user", "GET", undefined, token);
      // A rate limit is not a refusal: it must not end, or revoke, a session that can still renew.
      if (!response.ok)
        throw new AccountError(
          response.status === 429 ? 429 : response.status >= 500 ? 503 : 401,
          response.status === 429 ? "rate_limited" : response.status >= 500 ? "account_unavailable" : "sign_in_required",
        );
      let user: AccountUser;
      try {
        user = parseUser(data);
      } catch {
        throw new AccountError(503, "account_unavailable");
      }
      const allowed = await access;
      if ("error" in allowed) throw allowed.error;
      if (allowed.value !== true) throw new AccountError(401, "sign_in_required");
      return user;
    },
    async signOut(token) {
      const { response } = await call("/auth/v1/logout?scope=local", "POST", {}, token);
      if (!response.ok && ![401, 403, 404].includes(response.status))
        throw new AccountError(503, "sign_out_unconfirmed");
    },
  };
}
