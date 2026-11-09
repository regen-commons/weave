import { FetchRequestError, FetchResponseError, JoseKey, NodeOAuthClient, OAuthResolverError, OAuthResponseError,
  type NodeSavedState, type NodeSavedSession } from "@atproto/oauth-client-node";
import { errors, type AdapterFactory } from "oidc-provider";
import { AuthStore } from "./store.ts";
import { CERTIFIED_ISSUER, identitySubject } from "./identity.ts";
import type { SigningMaterial } from "./keys.ts";
import { allowlistedOAuthError, type BridgeStartFailure, type BridgeStartStage } from "./operations.ts";

export function oidcAdapter(store: AuthStore): AdapterFactory {
  return model => ({
    upsert: (id, payload, expiresIn) => store.put(`oidc:${model}`, id, payload, expiresIn ?? 3600),
    find: id => store.find(`oidc:${model}`, id),
    findByUid: uid => store.findByUid(`oidc:${model}`, uid),
    // Device authorization is disabled. Never index or accept user-entered codes.
    findByUserCode: async () => undefined,
    async consume(id) {
      try { await store.consume(`oidc:${model}`, id); }
      catch (error) {
        if (error instanceof Error && error.message === "state_already_used")
          throw new errors.InvalidGrant("authorization state is no longer usable");
        throw error;
      }
    },
    destroy: id => store.remove(`oidc:${model}`, id),
    revokeByGrantId: id => store.revokeGrant(id),
  });
}
export interface CertifiedClient {
  authorize(state: string, email?: string): Promise<URL>;
  callback(params: URLSearchParams): Promise<{ state: string | null; subject: string }>;
  metadata: unknown;
  jwks: unknown;
}
// Mark local boundaries without replacing the SDK or store exception.
const authorizationStages = new WeakMap<Error, "oauth_state" | "authorize_redirect">();

export function certifiedAuthorizationFailure(error: unknown): BridgeStartFailure {
  let stage: BridgeStartStage = "oauth_authorize";
  let upstream: OAuthResponseError | FetchResponseError | undefined;
  let requestFailed = false;
  let failure = error;
  // The SDK can wrap fetch failures in resolver and request errors.
  for (let depth = 0; depth < 6 && failure instanceof Error; depth++, failure = failure.cause) {
    const localStage = authorizationStages.get(failure);
    if (localStage) return { stage: localStage, error: localStage === "oauth_state" ? "state_store_failed" : "validation_failed" };
    if (failure instanceof OAuthResolverError) stage = "oauth_discovery";
    if (failure instanceof DOMException && failure.name === "TimeoutError") return { stage, error: "upstream_timeout" };
    if (failure instanceof FetchRequestError) requestFailed = true;
    if (failure instanceof OAuthResponseError || failure instanceof FetchResponseError) upstream ??= failure;
  }
  if (upstream) {
    const upstreamStatus = upstream.response.status;
    if (upstreamStatus < 400) return { stage, error: "validation_failed", upstreamStatus };
    const oauthError = upstream instanceof OAuthResponseError ? allowlistedOAuthError(upstream.error) : undefined;
    return { stage, error: "upstream_rejected", upstreamStatus, ...(oauthError ? { oauthError } : {}) };
  }
  return { stage, error: requestFailed ? "upstream_request_failed" : "validation_failed" };
}
const certifiedEmailAuthorization = "https://auth.certified.one/oauth/authorize";
const invalidParValue = /[\s\p{Cc}]/u;

/** Certified's pushed request accepts AT identifiers. Its email page accepts the email hint. */
export function certifiedEmailRedirect(authorization: URL, email: string | undefined): URL {
  if (!email) return authorization;
  const endpoint = authorization.origin + authorization.pathname;
  if ((endpoint !== `${CERTIFIED_ISSUER}/oauth/authorize` && endpoint !== certifiedEmailAuthorization) ||
      authorization.username || authorization.password || authorization.href.includes("#"))
    throw Error("invalid_certified_authorization_endpoint");
  const clientIds = authorization.searchParams.getAll("client_id");
  const requestUris = authorization.searchParams.getAll("request_uri");
  const [clientId] = clientIds;
  const [requestUri] = requestUris;
  if (clientIds.length !== 1 || requestUris.length !== 1 || !clientId || !requestUri ||
      invalidParValue.test(clientId) || invalidParValue.test(requestUri))
    throw Error("invalid_certified_authorization_request");
  const target = new URL(certifiedEmailAuthorization);
  target.search = new URLSearchParams({ client_id: clientId, request_uri: requestUri, prompt: "login", login_hint: email }).toString();
  return target;
}
export async function createCertifiedClient(store: AuthStore, signing: SigningMaterial, issuer: string): Promise<CertifiedClient> {
  const client = new NodeOAuthClient({
    clientMetadata: {
      client_id: `${issuer}/client-metadata.json`, client_name: "Weave",
      redirect_uris: [`${issuer}/at/callback`], jwks_uri: `${issuer}/at-jwks.json`,
      scope: "atproto", response_types: ["code"], grant_types: ["authorization_code", "refresh_token"],
      token_endpoint_auth_method: "private_key_jwt", token_endpoint_auth_signing_alg: "ES256",
      application_type: "web", dpop_bound_access_tokens: true,
    },
    keyset: await Promise.all(signing.at.map(({ use: _use, ...key }) =>
      JoseKey.fromJWK({ ...key, key_ops: ["sign"] }))),
    stateStore: {
      async set(key, value) {
        try { await store.put("at:state", key, value, 600); }
        catch (error) {
          if (error instanceof Error) authorizationStages.set(error, "oauth_state");
          throw error;
        }
      },
      // Atomic removal prevents two instances exchanging the same AT code/state.
      get: async key => await store.take("at:state", key) as NodeSavedState | undefined,
      del: key => store.remove("at:state", key),
    },
    sessionStore: {
      set: (key, value) => store.put("at:session", key, value, 3600),
      get: async key => await store.find("at:session", key) as NodeSavedSession | undefined,
      del: key => store.remove("at:session", key),
    },
    requestLock: (name, fn) => store.withLock(`at:${name}`, async () => fn()),
    fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.any([
        AbortSignal.timeout(10000), ...(init?.signal ? [init.signal] : []),
        ...(input instanceof Request ? [input.signal] : []),
      ]) }),
  });
  return {
    metadata: client.clientMetadata,
    jwks: client.jwks,
    async authorize(state, email) {
      const authorization = await client.authorize(CERTIFIED_ISSUER, {
        state, scope: "atproto", ...(email ? { prompt: "login" } : {}),
      });
      try { return certifiedEmailRedirect(authorization, email); }
      catch (error) {
        if (error instanceof Error) authorizationStages.set(error, "authorize_redirect");
        throw error;
      }
    },
    async callback(params) {
      const result = await client.callback(params);
      const response = await result.session.fetchHandler("/xrpc/com.atproto.server.getSession");
      if (!response.ok) throw new Error("certified_session_unavailable");
      const subject = identitySubject(result.session.serverMetadata.issuer, result.session.did, await response.json());
      // This bridge only needs proof of identity, not continuing PDS access.
      await store.remove("at:session", result.session.did);
      return { state: result.state ?? null, subject };
    },
  };
}
