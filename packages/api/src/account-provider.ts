import {
  parseSaved,
  parseSummaries,
  parseUser,
  record,
  type AccountDocument,
  type AccountUser,
  type SavedInitiative,
  type InitiativeSummary,
} from "./account-contract.ts";
export class AccountError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}
export interface AccountProvider {
  signInUrl(challenge: string, callback: string, loginHint?: string): string;
  exchangeCode(code: string, verifier: string): Promise<{ token: string; expiresIn: number }>;
  authorize(token: string): Promise<AccountUser>;
  signOut(token: string): Promise<void>;
  list(token: string, offset: number): Promise<InitiativeSummary[]>;
  load(token: string, id: string): Promise<SavedInitiative>;
  save(
    token: string,
    command: { id: string; expectedRevision: number; requestId: string; document: AccountDocument },
  ): Promise<SavedInitiative>;
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
      let code = "";
      try {
        code = String(record(data).code);
      } catch {
        /* Never return provider data. */
      }
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
      if (!response.ok) throw new AccountError(response.status === 429 ? 429 : response.status >= 500 ? 503 : 401,
        response.status === 429 ? "rate_limited" : response.status >= 500 ? "account_unavailable" : "sign_in_failed");
      let o: Record<string, unknown>;
      try { o = record(data); } catch { throw new AccountError(503, "account_unavailable"); }
      if (
        typeof o.access_token !== "string" ||
        !/^[-A-Za-z0-9_]+\.[-A-Za-z0-9_]+\.[-A-Za-z0-9_]+$/u.test(o.access_token) ||
        o.access_token.length > 3800 ||
        typeof o.expires_in !== "number" ||
        !Number.isFinite(o.expires_in) ||
        o.expires_in <= 0
      )
        throw new AccountError(503, "account_unavailable");
      return { token: o.access_token, expiresIn: Math.min(Math.floor(o.expires_in), 3600) };
    },
    async authorize(token) {
      const { response, data } = await call("/auth/v1/user", "GET", undefined, token);
      if (!response.ok)
        throw new AccountError(
          response.status >= 500 ? 503 : 401,
          response.status >= 500 ? "account_unavailable" : "sign_in_required",
        );
      let user: AccountUser;
      try {
        user = parseUser(data);
      } catch {
        throw new AccountError(503, "account_unavailable");
      }
      if ((await rpc("account_access", {}, token)) !== true) throw new AccountError(401, "sign_in_required");
      return user;
    },
    async signOut(token) {
      const { response } = await call("/auth/v1/logout?scope=local", "POST", {}, token);
      if (!response.ok && ![401, 403, 404].includes(response.status))
        throw new AccountError(503, "sign_out_unconfirmed");
    },
    async list(token, offset) {
      try {
        return parseSummaries(await rpc("list_initiatives", { p_offset: offset }, token));
      } catch (error) {
        if (error instanceof AccountError) throw error;
        throw new AccountError(503, "account_unavailable");
      }
    },
    async load(token, id) {
      try {
        return parseSaved(await rpc("load_initiative", { p_id: id }, token));
      } catch (error) {
        if (error instanceof AccountError) throw error;
        throw new AccountError(503, "account_unavailable");
      }
    },
    async save(token, command) {
      try {
        return parseSaved(
          await rpc(
            "save_initiative",
            {
              p_id: command.id,
              p_expected_revision: command.expectedRevision,
              p_request_id: command.requestId,
              p_document: command.document,
            },
            token,
          ),
        );
      } catch (error) {
        if (error instanceof AccountError) throw error;
        throw new AccountError(503, "account_unavailable");
      }
    },
  };
}
