import { randomBytes } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { setTimeout as delay } from "node:timers/promises";
import { JoseKey, NodeOAuthClient, type NodeOAuthClientOptions, type NodeSavedSession, type NodeSavedState } from "@atproto/oauth-client-node";
import type postgres from "postgres";
import { boundedJson } from "./account-http.ts";
import { record } from "./account-contract.ts";
import { AccountError } from "./account-provider.ts";
import type { StateCipher } from "./certified/crypto.ts";
import { CERTIFIED_ISSUER, identitySubject } from "./certified/identity.ts";

export const certifiedProjectOAuthPaths = {
  metadata: "/api/certified-project-client",
  jwks: "/api/certified-project-jwks",
  callback: "/api/certified-project-callback",
} as const;

const membership = "app.certified.groups.membership.list";
const memberList = "app.certified.group.member.list";
const register = "app.certified.group.register";
const supportCollection = "com.regencommons.weave.supportListing";
const personalCreate = "com.atproto.repo.createRecord";
const personalDelete = "com.atproto.repo.deleteRecord";
const grantMethods = {
  membership: [membership],
  "workspace-members": [membership, memberList],
  "create-project": [membership, register, "app.certified.group.repo.createRecord"],
  "add-member": [membership, memberList, "app.certified.group.member.add"],
  "publish-support": [membership, "app.certified.group.repo.createRecord", personalCreate],
  "withdraw-support": [membership, "app.certified.group.repo.deleteRecord", personalDelete],
} as const;
type ConsentAction = keyof typeof grantMethods;
export type CertifiedProjectRpc = typeof grantMethods[ConsentAction][number];
const actions = Object.keys(grantMethods) as ConsentAction[];
const rpcMethods: readonly CertifiedProjectRpc[] = [...new Set(Object.values(grantMethods).flat())];
const attemptTtl = 600;
const grantTtl = 3600;
const cookieName = "__Host-weave_project_consent";
const nonce = /^[A-Za-z0-9_-]{43}$/u;
const randomId = () => randomBytes(32).toString("base64url");
const privateHeaders = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };

type Kind = "state" | "receipt" | "grant";
interface ProjectOAuthRecords {
  put(kind: Kind, id: string, payload: unknown, ttl: number): Promise<void>;
  find(kind: Kind, id: string): Promise<unknown>;
  take(kind: Kind, id: string): Promise<unknown>;
  remove(kind: Kind, id: string): Promise<void>;
}
export interface ProjectOAuthStore extends ProjectOAuthRecords {
  withLock<T>(id: string, run: (records: ProjectOAuthRecords) => Promise<T>, signal?: AbortSignal): Promise<T>;
}

/** Dedicated database role, private schema and project-specific encryption keys. */
export function projectOAuthStore(sql: postgres.Sql, cipher: StateCipher): ProjectOAuthStore {
  const records = (db: postgres.Sql | postgres.TransactionSql): ProjectOAuthRecords => {
    const hash = (kind: Kind, id: string) => cipher.index(kind, id);
    const open = (kind: Kind, key: string, row: { encrypted_payload: string } | undefined) =>
      row && cipher.open(kind, key, row.encrypted_payload);
    return {
      async put(kind, id, payload, ttl) {
        if (!Number.isInteger(ttl) || ttl < 1 || ttl > grantTtl) throw Error("invalid_project_oauth_ttl");
        const key = hash(kind, id);
        const encrypted = cipher.seal(kind, key, payload);
        await db`insert into weave_project_oauth.records(kind,key_hash,encrypted_payload,expires_at)
          values(${kind},${key},${encrypted},now()+make_interval(secs=>${ttl}))
          on conflict(kind,key_hash) do update set encrypted_payload=excluded.encrypted_payload, expires_at=excluded.expires_at`;
      },
      async find(kind, id) {
        const key = hash(kind, id);
        const rows = await db<{ encrypted_payload: string }[]>`select encrypted_payload from weave_project_oauth.records
          where kind=${kind} and key_hash=${key} and expires_at>now()`;
        return open(kind, key, rows[0]);
      },
      async take(kind, id) {
        const key = hash(kind, id);
        const rows = await db<{ encrypted_payload: string }[]>`delete from weave_project_oauth.records
          where kind=${kind} and key_hash=${key} and expires_at>now() returning encrypted_payload`;
        return open(kind, key, rows[0]);
      },
      async remove(kind, id) {
        await db`delete from weave_project_oauth.records where kind=${kind} and key_hash=${hash(kind, id)}`;
      },
    };
  };
  return {
    ...records(sql),
    async withLock<T>(id: string, run: (locked: ProjectOAuthRecords) => Promise<T>, signal?: AbortSignal): Promise<T> {
      const deadline = AbortSignal.any([AbortSignal.timeout(10000), ...(signal ? [signal] : [])]);
      let backoff = 25;
      while (true) {
        deadline.throwIfAborted();
        const outcome = await sql.begin(async tx => {
          deadline.throwIfAborted();
          const [row] = await tx`select pg_try_advisory_xact_lock(hashtextextended(${cipher.index("grant-lock", id)}, 0)) as acquired,
            set_config('idle_in_transaction_session_timeout', '10s', true)`;
          if (!row?.acquired) return { acquired: false } as const;
          deadline.throwIfAborted();
          return { acquired: true, value: await run(records(tx)) } as const;
        }) as { acquired: false } | { acquired: true; value: T };
        if (outcome.acquired) return outcome.value;
        // Only a busy lock retries. Never replay a callback, refresh, SQL error or
        // uncertain commit. The losing transaction ends before the backoff.
        await delay(backoff, undefined, { signal: deadline });
        backoff = Math.min(backoff * 2, 250);
      }
    },
  };
}

export interface CertifiedProjectActor {
  did: string;
  /** Verified app session ID. The same DID in a different session must consent again. */
  sessionId: string;
}
type Attempt = CertifiedProjectActor & { action: ConsentAction };
type Grant = Attempt & { expiresAt: number; session: NodeSavedSession };
interface ScopedSession {
  did: string;
  serverMetadata: { issuer: string };
  fetchHandler(path: string, init?: RequestInit): Promise<Response>;
}
interface ProjectOAuthClient {
  clientMetadata: unknown;
  jwks: unknown;
  authorize(input: string, options: Parameters<NodeOAuthClient["authorize"]>[1]): Promise<URL>;
  callback(params: URLSearchParams, options: Parameters<NodeOAuthClient["callback"]>[1]):
    Promise<{ state: string | null; session: ScopedSession }>;
  restore(did: string): Promise<ScopedSession>;
}
interface ProjectOAuthOptions {
  origin: string;
  cgsOrigin: string;
  returnPath?: string;
  store: ProjectOAuthStore;
  /** A dedicated array of project-client ES256 private JWKs, parsed from the server secret. */
  signingKeys: unknown;
  resolveActor(request: Request): Promise<CertifiedProjectActor | null>;
  allowsDid(did: string): boolean;
  /** Test fixture only; production always uses the pinned NodeOAuthClient. */
  makeClient?: (options: NodeOAuthClientOptions) => ProjectOAuthClient;
}
function isAction(value: unknown): value is ConsentAction {
  return typeof value === "string" && Object.hasOwn(grantMethods, value);
}
function isMethod(value: string): value is CertifiedProjectRpc {
  return (rpcMethods as readonly string[]).includes(value);
}
function supports(action: ConsentAction, method: string): boolean {
  return (grantMethods[action] as readonly string[]).includes(method);
}
function attempt(value: unknown): Attempt {
  const v = record(value);
  if (typeof v.did !== "string" || typeof v.sessionId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/u.test(v.sessionId) || !isAction(v.action))
    throw Error("invalid_project_consent_state");
  identitySubject(CERTIFIED_ISSUER, v.did, { did: v.did });
  return { did: v.did, sessionId: v.sessionId, action: v.action };
}
function sameActor(a: CertifiedProjectActor, b: CertifiedProjectActor) {
  return a.did === b.did && a.sessionId === b.sessionId;
}
function secureOrigin(value: string): `https://${string}` {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.origin !== value || !url.hostname.includes(".") || url.port)
    throw Error("invalid_project_oauth_origin");
  return value as `https://${string}`;
}
function cookie(request: Request) {
  const items = (request.headers.get("cookie") ?? "").split(";").map(part => part.trim()).filter(part => part.startsWith(cookieName + "="));
  const value = items.length === 1 ? items[0]!.slice(cookieName.length + 1) : "";
  return nonce.test(value) ? value : null;
}
const writeCookie = (value = "", ttl = 0, sameSite: "Lax" | "Strict" = "Strict") =>
  `${cookieName}=${value}; Path=/; HttpOnly; Secure; SameSite=${sameSite}; Max-Age=${ttl}`;
const response = (value: unknown, status = 200, pendingCookie?: string) =>
  Response.json(value, { status, headers: { ...privateHeaders, ...(pendingCookie ? { "Set-Cookie": pendingCookie } : {}) } });
const denied = () => new AccountError(403, "project_consent_required");

async function tokenResponse(result: Response, did: string, audience: string, method: string) {
  if (!result.ok) {
    await result.body?.cancel();
    if (result.status === 401 || result.status === 403) return null;
    throw Error("certified_project_auth_unavailable");
  }
  const reader = result.body?.getReader();
  if (!reader) throw Error("invalid_project_service_token");
  let value = "", bytes = 0;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 8192) {
        await reader.cancel();
        throw Error("invalid_project_service_token");
      }
      value += decoder.decode(chunk.value, { stream: true });
    }
    const token = record(JSON.parse(value + decoder.decode())).token;
    if (typeof token !== "string" || !/^[\w-]+\.[\w-]+\.[\w-]+$/u.test(token)) throw Error();
    const claims = record(JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString("utf8")));
    if (claims.iss !== did || claims.aud !== audience || claims.lxm !== method ||
        typeof claims.jti !== "string" || claims.jti.length < 1 || claims.jti.length > 256 ||
        !Number.isInteger(claims.exp) || Number(claims.exp) <= Date.now() / 1000 || Number(claims.exp) > Date.now() / 1000 + 120)
      throw Error();
    return token;
  } catch { throw Error("invalid_project_service_token"); }
  finally { reader.releaseLock(); }
}

export async function createCertifiedProjectAuth(options: ProjectOAuthOptions) {
  const { store } = options;
  const origin = secureOrigin(options.origin), cgsOrigin = secureOrigin(options.cgsOrigin);
  const service = `did:web:${new URL(cgsOrigin).hostname}#certified_group_service`;
  const returnUrl = new URL(options.returnPath ?? "/", origin);
  if (returnUrl.origin !== origin || returnUrl.username || returnUrl.password || returnUrl.hash ||
      returnUrl.searchParams.has("projectConsent")) throw Error("invalid_project_oauth_return_path");

  const rpcScope = (method: string) => `rpc:${method}?aud=${service.replace("#", "%23")}`;
  const methodScope = (method: string) => method === personalCreate
    ? `repo:${supportCollection}?action=create`
    : method === personalDelete ? `repo:${supportCollection}?action=delete` : rpcScope(method);
  const scopes = (methods: readonly string[]) => ["atproto", ...methods.map(methodScope)].join(" ");
  const clientMetadata: NodeOAuthClientOptions["clientMetadata"] = {
    client_id: `${origin}${certifiedProjectOAuthPaths.metadata}`,
    client_name: "Weave project actions",
    redirect_uris: [`${origin}${certifiedProjectOAuthPaths.callback}`],
    jwks_uri: `${origin}${certifiedProjectOAuthPaths.jwks}`,
    scope: scopes(rpcMethods),
    response_types: ["code"],
    grant_types: ["authorization_code", "refresh_token"],
    token_endpoint_auth_method: "private_key_jwt",
    token_endpoint_auth_signing_alg: "ES256",
    application_type: "web",
    dpop_bound_access_tokens: true,
  };
  if (!Array.isArray(options.signingKeys) || !options.signingKeys.length || options.signingKeys.length > 3)
    throw Error("invalid_project_oauth_keys");
  const kids = new Set<string>();
  const keyset = await Promise.all(options.signingKeys.map(async (item: unknown) => {
    const { kid, alg, kty, crv, x, y, d } = record(item);
    if (alg !== "ES256" || kty !== "EC" || crv !== "P-256" ||
        typeof kid !== "string" || !/^[A-Za-z0-9_-]{1,64}$/u.test(kid) || kids.has(kid) ||
        typeof x !== "string" || typeof y !== "string" || typeof d !== "string" ||
        !nonce.test(x) || !nonce.test(y) || !nonce.test(d)) throw Error("invalid_project_oauth_keys");
    kids.add(kid);
    return JoseKey.fromJWK({ kid, alg, kty, crv, x, y, d, key_ops: ["sign"] });
  }));

  const checkScope = (session: NodeSavedSession, input: Attempt) => {
    const { iss, sub, scope } = session.tokenSet;
    if (iss !== CERTIFIED_ISSUER || sub !== input.did) throw Error("invalid_project_consent_identity");
    const requested = new Set(["atproto", ...grantMethods[input.action].map(method =>
      methodScope(method).replace("%23", "#"))]);
    const actual = scope.split(" ").map(part => {
      if (part === "atproto") return part;
      if (part === `repo:${supportCollection}?action=create` || part === `repo:${supportCollection}?action=delete`) return part;
      const rpc = /^(rpc:[A-Za-z.]+\?aud=)([^&]+)$/u.exec(part);
      if (!rpc) throw denied();
      return rpc[1]! + decodeURIComponent(rpc[2]!);
    });
    if (actual.length !== requested.size || new Set(actual).size !== requested.size || actual.some(part => !requested.has(part)))
      throw denied();
  };
  const makeClient = (
    signal = AbortSignal.timeout(10000),
    stateStore: NodeOAuthClientOptions["stateStore"] = {
      set: async () => { throw Error("unexpected_project_oauth_state"); },
      get: async () => undefined,
      del: async () => {},
    },
    sessionStore: NodeOAuthClientOptions["sessionStore"] = {
      set: async () => { throw Error("unexpected_project_oauth_session"); },
      get: async () => undefined,
      del: async () => {},
    },
    implementation: Pick<NodeOAuthClientOptions, "requestLock" | "fetch"> = {},
  ) => (options.makeClient ?? (input => new NodeOAuthClient(input)))({
    clientMetadata, keyset, stateStore, sessionStore,
    // Initial consent uses one client per attempt; restored sessions override
    // this with the SDK's durable session/refresh lock below.
    requestLock: async (_name, fn) => fn(),
    fetch: (input, init) => fetch(input, {
      ...init, redirect: "error",
      signal: AbortSignal.any([signal, ...(init?.signal ? [init.signal] : []), ...(input instanceof Request ? [input.signal] : [])]),
    }),
    ...implementation,
  });
  const publicClient = makeClient();
  const requests = new WeakMap<Request, { closing: boolean; pending: Set<Promise<void>> }>();
  const requestState = (request: Request) => {
    let state = requests.get(request);
    if (!state) { state = { closing: false, pending: new Set() }; requests.set(request, state); }
    return state;
  };
  const grantKey = (a: Attempt) => JSON.stringify([origin, service, a.did, a.sessionId, a.action]);
  const getActor = async (request: Request) => {
    const actor = await options.resolveActor(request);
    if (actor && !options.allowsDid(actor.did)) throw new AccountError(403, "project_pilot_restricted");
    return actor && attempt({ ...actor, action: "membership" });
  };

  async function start(request: Request, actor: CertifiedProjectActor, action: ConsentAction) {
    const binding = randomId();
    const input = { ...actor, action };
    const client = makeClient(AbortSignal.any([request.signal, AbortSignal.timeout(10000)]), {
      async set(state, value) {
        if (value.iss !== CERTIFIED_ISSUER || !/^[A-Za-z0-9_-]{16,256}$/u.test(state))
          throw Error("invalid_project_consent_issuer");
        await store.put("state", `${binding}:${state}`, value, attemptTtl);
      },
      get: async () => undefined,
      del: async () => {},
    });
    const target = await client.authorize(CERTIFIED_ISSUER, {
      state: JSON.stringify(input), scope: scopes(grantMethods[action]), prompt: "consent",
    });
    const endpoint = target.origin + target.pathname;
    if (![CERTIFIED_ISSUER + "/oauth/authorize", "https://auth.certified.one/oauth/authorize"].includes(endpoint) ||
        target.username || target.password || target.hash ||
        target.searchParams.getAll("client_id").length !== 1 || target.searchParams.get("client_id") !== clientMetadata.client_id ||
        target.searchParams.getAll("request_uri").length !== 1 || !target.searchParams.get("request_uri"))
      throw Error("invalid_project_consent_authorization");
    return response({ authorizeUrl: target.href }, 200, writeCookie(binding, attemptTtl, "Lax"));
  }
  function complete(status: "ready" | "denied" | "failed", receipt?: string) {
    const url = new URL(returnUrl);
    url.searchParams.set("projectConsent", status);
    return new Response(null, { status: 303, headers: {
      ...privateHeaders, Location: url.href, ...(receipt ? { "Set-Cookie": writeCookie(receipt, attemptTtl) } : {}),
    } });
  }
  function savedGrant(raw: unknown): Grant {
    const value = record(raw);
    const input = attempt(raw);
    if (typeof value.expiresAt !== "number" || !Number.isSafeInteger(value.expiresAt)) throw Error("invalid_project_oauth_grant");
    const session = value.session as NodeSavedSession;
    checkScope(session, input);
    return { ...input, expiresAt: value.expiresAt, session };
  }
  async function finish(request: Request, actor: CertifiedProjectActor) {
    const receipt = cookie(request);
    if (!receipt) throw denied();
    const pending = await store.find("receipt", receipt);
    if (!pending) throw denied();
    const candidate = savedGrant(pending), key = grantKey(candidate);
    if (!sameActor(actor, candidate)) {
      await store.remove("receipt", receipt);
      throw denied();
    }
    await store.withLock(key, async locked => {
      const staged = await locked.take("receipt", receipt);
      if (!staged) throw denied();
      const grant = savedGrant(staged);
      const ttl = Math.floor((grant.expiresAt - Date.now()) / 1000);
      if (grantKey(grant) !== key || ttl < 1) throw denied();
      await locked.put("grant", key, grant, ttl);
    }, request.signal);
    return response({ granted: candidate.action }, 200, writeCookie());
  }
  async function selectGrant(actor: CertifiedProjectActor, methods: readonly string[]) {
    const eligible = actions.filter(action => methods.every(method => supports(action, method)));
    // Prefer the smallest active grant. Broader action grants can also cover their own prerequisite reads.
    for (const action of eligible.sort((a, b) => grantMethods[a].length - grantMethods[b].length)) {
      const key = grantKey({ ...actor, action });
      const raw = await store.find("grant", key);
      if (!raw) continue;
      const grant = savedGrant(raw);
      if (sameActor(grant, actor) && grant.action === action && grant.expiresAt > Date.now()) return { key, action };
    }
    return null;
  }
  async function callAsActor<T>(request: Request, expectedDid: string, method: CertifiedProjectRpc,
    run: (session: ScopedSession, signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T | null> {
    const deadline = AbortSignal.any([request.signal, AbortSignal.timeout(10000), ...(signal ? [signal] : [])]);
    const actor = await getActor(request);
    if (!actor || actor.did !== expectedDid) return null;
    const selected = await selectGrant(actor, [method]);
    if (!selected) return null;
    const state = requestState(request);
    type SessionContext = { records: ProjectOAuthRecords; grant: Grant; changed: boolean; refresh?: AbortSignal };
    const sessions = new AsyncLocalStorage<SessionContext>();
    let observedVersion: string | undefined;
    const version = (grant: Grant) => JSON.stringify([
      grant.expiresAt, grant.session.tokenSet.access_token ?? null, grant.session.tokenSet.refresh_token ?? null, grant.session.dpopJwk,
    ]);
    const checkedGrant = (raw: unknown) => {
      if (!raw) return undefined;
      const grant = savedGrant(raw);
      return sameActor(grant, actor) && grant.action === selected.action && grant.expiresAt > Date.now() ? grant : undefined;
    };
    const open = () => {
      deadline.throwIfAborted();
      if (state.closing) throw Error("project_request_closed");
    };
    async function sessionLock<T>(fn: () => T | PromiseLike<T>): Promise<T> {
      if (sessions.getStore()) return fn();
      open();
      let settled!: () => void;
      const completion = new Promise<void>(resolve => { settled = resolve; });
      state.pending.add(completion);
      try {
        const outcome = await store.withLock(selected!.key, async records => {
          open();
          const grant = checkedGrant(await records.find("grant", selected!.key));
          if (!grant) throw denied();
          const context: SessionContext = { records, grant, changed: false };
          return sessions.run(context, async () => {
            try { return { value: await fn() } as const; }
            catch (error) {
              // A consumed refresh token cannot safely be reused after an uncertain
              // exchange. Commit deletion or a completed rotation before failing.
              if (context.refresh && !context.changed) await records.remove("grant", selected!.key);
              return { error } as const;
            }
          });
        }, deadline);
        if ("error" in outcome) throw outcome.error;
        return outcome.value;
      } finally { settled(); state.pending.delete(completion); }
    }
    const client = makeClient(deadline, undefined, {
      async get(did) {
        if (did !== actor.did) return undefined;
        const grant = sessions.getStore()?.grant ?? checkedGrant(await store.find("grant", selected.key));
        if (grant) observedVersion = version(grant);
        return grant?.session;
      },
      async set(did, session) {
        if (did !== actor.did) throw Error("invalid_project_consent_identity");
        await sessionLock(async () => {
          const context = sessions.getStore()!;
          if (observedVersion !== version(context.grant)) throw Error("project_session_changed");
          checkScope(session, context.grant);
          const ttl = Math.floor((context.grant.expiresAt - Date.now()) / 1000);
          if (ttl < 1) throw denied();
          await context.records.put("grant", selected.key, { ...context.grant, session }, ttl);
          context.grant.session = session;
          context.changed = true;
          observedVersion = version(context.grant);
        });
      },
      async del(did) {
        if (did !== actor.did || !observedVersion) return;
        await sessionLock(async () => {
          const context = sessions.getStore()!;
          // A delayed invalid-token reply must not delete a newer rotation or consent.
          if (version(context.grant) === observedVersion) {
            await context.records.remove("grant", selected.key);
            context.changed = true;
          }
        });
      },
    }, {
      async requestLock(name, fn) {
        if (name !== `@atproto-oauth-client-${actor.did}`) throw Error("unexpected_project_session_lock");
        return sessionLock(fn);
      },
      async fetch(input, init) {
        const body = init?.body;
        let form: URLSearchParams | undefined;
        if (body instanceof URLSearchParams) form = body;
        else if (typeof body === "string") form = new URLSearchParams(body);
        else if (input instanceof Request && input.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded"))
          form = new URLSearchParams(await input.clone().text());
        if (form?.get("grant_type") === "refresh_token") {
          const context = sessions.getStore();
          if (!context) throw Error("project_refresh_requires_lock");
          if (!context.refresh) {
            open();
            // Verify transaction liveness and reset its idle timer before consuming
            // the old token. One independent budget includes a DPoP nonce retry.
            if (!checkedGrant(await context.records.find("grant", selected.key))) throw denied();
            open();
            context.refresh = AbortSignal.timeout(5000);
          }
          return fetch(input, { ...init, redirect: "error", signal: context.refresh });
        }
        open();
        return fetch(input, { ...init, redirect: "error", signal: AbortSignal.any([
          deadline, ...(init?.signal ? [init.signal] : []), ...(input instanceof Request ? [input.signal] : []),
        ]) });
      },
    });
    try {
      open();
      const session = await client.restore(actor.did);
      if (session.did !== actor.did || session.serverMetadata.issuer !== CERTIFIED_ISSUER)
        throw Error("invalid_project_consent_identity");
      open();
      return await run(session, deadline);
    } finally { sessions.disable(); }
  }

  return {
    async settle(request: Request) {
      const state = requestState(request);
      state.closing = true;
      while (state.pending.size) await Promise.all([...state.pending]);
    },
    metadata: () => response(publicClient.clientMetadata),
    jwks: () => response(publicClient.jwks),
    async consent(request: Request) {
      if (request.method !== "POST") return response({ error: "method_not_allowed" }, 405);
      if (new URL(request.url).origin !== origin || request.headers.get("origin") !== origin)
        return response({ error: "invalid_origin" }, 403);
      if (request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json")
        return response({ error: "invalid_data" }, 415);
      try {
        const body = await boundedJson(request);
        if (Object.keys(body).length !== 1 || (body.action !== "finish" && !isAction(body.action)))
          throw new AccountError(400, "invalid_data");
        const actor = await getActor(request);
        if (!actor) throw new AccountError(401, "sign_in_required");
        return await (body.action === "finish" ? finish(request, actor) : start(request, actor, body.action));
      } catch (error) {
        if (error instanceof AccountError) return response({ error: error.code }, error.status);
        return response({ error: "certified_project_auth_unavailable" }, 503);
      }
    },
    async callback(request: Request) {
      if (request.method !== "GET") return response({ error: "method_not_allowed" }, 405);
      const url = new URL(request.url);
      const params = url.searchParams;
      const binding = cookie(request), state = params.get("state");
      const single = (key: string) => params.getAll(key).length === 1;
      if (url.origin !== origin || url.pathname !== certifiedProjectOAuthPaths.callback || url.search.length > 4096 ||
          !binding || !state || !/^[A-Za-z0-9_-]{16,256}$/u.test(state) || !single("state") || params.has("response"))
        return complete("failed");
      const isError = single("error") && Boolean(params.get("error")) && !params.has("code");
      const isCode = single("code") && Boolean(params.get("code")) && !params.has("error");
      if ((!isCode && !isError) || (params.has("iss") && (!single("iss") || params.get("iss") !== CERTIFIED_ISSUER)) ||
          (isCode && params.get("iss") !== CERTIFIED_ISSUER)) return complete("failed");
      try {
        const stored = await store.take("state", `${binding}:${state}`) as NodeSavedState | undefined;
        if (!stored || stored.iss !== CERTIFIED_ISSUER || !stored.appState) return complete("failed");
        if (isError) return complete(params.get("error") === "access_denied" ? "denied" : "failed");
        const input = attempt(JSON.parse(stored.appState));
        if (!options.allowsDid(input.did)) return complete("failed");
        let session: NodeSavedSession | undefined;
        const client = makeClient(AbortSignal.any([request.signal, AbortSignal.timeout(10000)]), {
          get: async id => id === state ? stored : undefined,
          set: async () => { throw Error("unexpected_project_oauth_state"); },
          del: async () => {},
        }, {
          get: async did => did === input.did ? session : undefined,
          async set(did, saved) {
            if (did !== input.did) throw Error("invalid_project_consent_identity");
            checkScope(saved, input);
            session = saved;
          },
          del: async () => { session = undefined; },
        });
        const result = await client.callback(params, {});
        if (result.state !== stored.appState || result.session.did !== input.did ||
            result.session.serverMetadata.issuer !== CERTIFIED_ISSUER || !session) return complete("failed");
        const receipt = randomId();
        await store.put("receipt", receipt, { ...input, session, expiresAt: Date.now() + grantTtl * 1000 }, attemptTtl);
        // SameSite=Strict keeps the Weave session off the cross-site callback. The
        // browser must complete a same-origin POST before the staged token can be used.
        return complete("ready", receipt);
      } catch { return complete("failed"); }
    },
    async assertGrant(request: Request, expectedDid: string, methods: readonly string[]) {
      const actor = await getActor(request);
      if (!actor || actor.did !== expectedDid || !methods.length || !methods.every(isMethod) ||
          !await selectGrant(actor, methods)) throw denied();
    },
    async mintServiceAuth(request: Request, expectedDid: string, method: string, signal?: AbortSignal) {
      if (!isMethod(method) || method === register || method === membership || method === personalCreate || method === personalDelete) return null;
      return callAsActor(request, expectedDid, method, async (session, deadline) => {
        const params = new URLSearchParams({ aud: service, lxm: method, exp: String(Math.floor(Date.now() / 1000) + 60) });
        const result = await session.fetchHandler(`/xrpc/com.atproto.server.getServiceAuth?${params}`, { signal: deadline });
        return tokenResponse(result, expectedDid, service, method);
      }, signal);
    },
    async writeSupportRecord(request: Request, expectedDid: string, operation: "create" | "delete",
      input: { rkey: string; record?: unknown; expectedCid?: string }, signal?: AbortSignal) {
      if (!/^[2-7a-j][2-7a-z]{12}$/u.test(input.rkey)) throw Error("invalid_support_repository_request");
      const method = operation === "create" ? personalCreate : operation === "delete" ? personalDelete : null;
      if (!method || (operation === "delete" && (!input.expectedCid || !/^b[a-z2-7]{40,100}$/u.test(input.expectedCid))) ||
          (operation === "create" && record(input.record).$type !== supportCollection))
        throw Error("invalid_support_repository_request");
      const body = JSON.stringify({ repo: expectedDid, collection: supportCollection, rkey: input.rkey,
        ...(operation === "create" ? { record: input.record } : { swapRecord: input.expectedCid }) });
      if (Buffer.byteLength(body) > 65536) throw Error("invalid_support_repository_request");
      return callAsActor(request, expectedDid, method, (session, deadline) => session.fetchHandler(`/xrpc/${method}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body, signal: deadline,
      }), signal);
    },
    async proxyServiceRequest(request: Request, expectedDid: string, method: string, init: RequestInit, query?: URLSearchParams) {
      // Service-level CGS methods require a bare-DID JWT. The PDS proxy checks
      // the fragment-scoped grant but signs the outbound token with that bare DID.
      if (method !== register && method !== membership) return null;
      const search = query?.toString() ?? "";
      if (search.length > 2048 || (method === register ? (init.method !== "POST" || typeof init.body !== "string" ||
          Buffer.byteLength(init.body) > 65536 || Boolean(search)) : (init.method !== "GET" || init.body != null)))
        throw Error("invalid_project_service_request");
      return callAsActor(request, expectedDid, method, (session, signal) =>
        session.fetchHandler(`/xrpc/${method}${search ? "?" + search : ""}`, {
          method: init.method, signal,
          headers: { "Atproto-Proxy": service, ...(method === register ? { "Content-Type": "application/json" } : {}) },
          ...(method === register ? { body: init.body } : {}),
        }), init.signal ?? undefined);
    },
  };
}
