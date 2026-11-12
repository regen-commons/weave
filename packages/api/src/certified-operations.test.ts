import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer, get, type RequestListener } from "node:http";
import { once } from "node:events";
import { createHash } from "node:crypto";
import { FetchRequestError, FetchResponseError, NodeOAuthClient, OAuthResolverError, OAuthResponseError } from "@atproto/oauth-client-node";
import { certifiedAuthorizationFailure, createCertifiedClient } from "./certified/adapters.ts";
import { createBridge } from "./certified/bridge.ts";
import { generateSigningMaterial } from "./certified/keys.ts";
import { createBridgeObserver, observeBridgeRequests, pruneExpiredState } from "./certified/operations.ts";
import type { BridgeStartFailure } from "./certified/operations.ts";
import type { AuthStore } from "./certified/store.ts";

async function withServer(handler: RequestListener, run: (origin: string) => Promise<void>) {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  try { await run(`http://127.0.0.1:${address.port}`); }
  finally { await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); }
}

test("bridge events describe outcomes without request paths, credentials, bodies or identities", async () => {
  const lines: string[] = [], observer = createBridgeObserver(line => lines.push(line));
  await withServer(observeBridgeRequests((_req, res) => { res.statusCode = 400; res.end("rejected"); }, observer), async origin => {
    for (const path of ["/token?code=private-code", "/interaction/private-interaction/complete?ticket=private-ticket", "/private-email@example.test"]) {
      await fetch(origin + path, { method: "POST", headers: { Cookie: "session=private-cookie", Authorization: "Bearer private-token" }, body: "private-body" });
    }
  });
  assert.equal(lines.length, 3); // close after finish must not double-count.
  assert.deepEqual(lines.map(line => JSON.parse(line).route), ["token", "interaction", "unknown"]);
  for (const line of lines) {
    assert.ok(!line.includes("private-"));
    const event = JSON.parse(line);
    assert.deepEqual(Object.keys(event).sort(), ["aborted", "component", "duration_ms", "event", "route", "status"]);
    assert.equal(event.status, 400); assert.equal(event.aborted, false);
    assert.ok(Number.isInteger(event.duration_ms) && event.duration_ms >= 0);
  }
});

test("aborted requests have one outcome; a broken log sink cannot break HTTP", async () => {
  const lines: string[] = [], observer = createBridgeObserver(line => lines.push(line));
  await withServer(observeBridgeRequests((_req, res) => { res.destroy(); }, observer), async origin => {
    await new Promise<void>(resolve => { get(origin + "/auth/private-request", response => response.resume()).once("error", () => resolve()); });
  });
  assert.equal(lines.length, 1);
  assert.equal(JSON.parse(lines[0]!).aborted, true); assert.equal(JSON.parse(lines[0]!).status, 0);
  const broken = createBridgeObserver(() => { throw Error("private-sink-failure"); });
  await withServer(observeBridgeRequests((_req, res) => res.end("ok"), broken), async origin => {
    assert.equal(await fetch(origin).then(response => response.text()), "ok");
  });
});

test("cleanup failures are observable without serializing provider or database errors", async () => {
  const lines: string[] = [], observer = createBridgeObserver(line => lines.push(line));
  await pruneExpiredState({ prune: async () => { throw Error("postgres://private-secret@private-host"); } }, observer);
  await pruneExpiredState({ prune: async () => {} }, observer);
  observer.event("provider_error");
  assert.deepEqual(lines.map(line => JSON.parse(line)), [
    { component: "certified_bridge", event: "cleanup_failed" },
    { component: "certified_bridge", event: "cleanup_succeeded" },
    { component: "certified_bridge", event: "provider_error" },
  ]);
});

test("Certified start failures retain safe stage and status without leaking SDK or store errors", async t => {
  const lines: string[] = [], observer = createBridgeObserver(line => lines.push(line));
  const signing = generateSigningMaterial();
  const records = new Map<string, Record<string, unknown>>();
  let failBrowserState = false;
  const store = {
    signingMaterial: async () => signing,
    async put(namespace: string, id: string, payload: Record<string, unknown>) {
      if (failBrowserState && namespace === "browser:at") throw Error("postgres://private-secret@private-host");
      records.set(`${namespace}:${id}`, payload);
    },
    async find(namespace: string, id: string) { return records.get(`${namespace}:${id}`); },
  } as unknown as AuthStore;
  const sdkRequest = new Request("https://certified.one/private-path?login_hint=private-email@example.test", {
    headers: { Cookie: "private-cookie", Authorization: "Bearer private-token" },
  });
  const unknownRejection = new OAuthResponseError(new Response(null, { status: 401 }), {
    error: "private-provider-error", error_description: "private-provider-details",
  });
  const knownRejection = new OAuthResponseError(new Response(null, { status: 400 }), {
    error: "invalid_client", error_description: "private-client-assertion",
  });
  const timeout = FetchRequestError.from(sdkRequest, new DOMException("private-timeout", "TimeoutError"));
  const discoveryTimeout = new OAuthResolverError("private-discovery-url", { cause: timeout });
  const invalidResponse = new FetchResponseError(new Response("private-response-body", { status: 200 }));
  const connectionFailure = FetchRequestError.from(sdkRequest, new Error("private-network-error"));
  let sdkFailure: unknown;
  t.mock.method(NodeOAuthClient.prototype, "authorize", async () => { throw sdkFailure; });
  const certified = await createCertifiedClient(store, signing, "https://auth.example.test");

  let bridge: RequestListener;
  await withServer((req, res) => bridge(req, res), async issuer => {
    const redirectUri = "http://127.0.0.1:1/callback";
    bridge = await createBridge({ issuer, clientId: "weave", clientSecret: "x".repeat(40), redirectUri,
      loopbackTest: true }, store, certified, observer);
    const params = new URLSearchParams({
      client_id: "weave", redirect_uri: redirectUri, response_type: "code", scope: "openid",
      state: "private-relying-party-state", prompt: "login", code_challenge_method: "S256",
      code_challenge: createHash("sha256").update("private-pkce-verifier").digest("base64url"),
    });
    for (const failure of [
      unknownRejection, knownRejection, timeout, discoveryTimeout, invalidResponse,
      connectionFailure, Error("private-sdk-failure"), null,
    ]) {
      sdkFailure = failure;
      failBrowserState = failure === null;
      const started = await fetch(`${issuer}/auth?${params}`, { redirect: "manual" });
      const location = started.headers.get("location");
      assert.ok(location?.startsWith(`${issuer}/interaction/`));
      const cookie = started.headers.getSetCookie().map(value => value.split(";", 1)[0]).join("; ");
      const response = await fetch(location!, { headers: { Cookie: cookie }, redirect: "manual" });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: "sign_in_failed" });
    }
  });
  const diagnostic = (stage: string, error: string, upstream_status?: number) => ({
    component: "certified_bridge", event: "certified_start_failed", stage, error,
    ...(upstream_status === undefined ? {} : { upstream_status }),
  });
  assert.deepEqual(lines.map(line => JSON.parse(line)).filter(value => value.event !== "request_failed"), [
    diagnostic("oauth_authorize", "upstream_rejected", 401),
    { ...diagnostic("oauth_authorize", "upstream_rejected", 400), oauth_error: "invalid_client" },
    diagnostic("oauth_authorize", "upstream_timeout"),
    diagnostic("oauth_discovery", "upstream_timeout"),
    diagnostic("oauth_authorize", "validation_failed", 200),
    diagnostic("oauth_authorize", "upstream_request_failed"),
    diagnostic("oauth_authorize", "validation_failed"),
    diagnostic("browser_state", "state_store_failed"),
  ]);
  assert.ok(lines.every(line => !line.includes("private-")));
});

test("the real SDK exposes discovery and pre-PAR state failures through safe diagnostics", async t => {
  const issuer = "https://certified.one";
  const stateError = Error("postgres://private-secret@private-host");
  const store = {
    async put(namespace: string) {
      assert.equal(namespace, "at:state");
      throw stateError;
    },
  } as unknown as AuthStore;
  let outcome: "rejected" | "timeout" | "state_write" = "rejected";
  t.mock.method(globalThis, "fetch", async (input: Request) => {
    if (input.url === issuer + "/.well-known/oauth-protected-resource") return new Response(null, { status: 404 });
    assert.equal(input.url, issuer + "/.well-known/oauth-authorization-server");
    if (outcome === "rejected") return new Response("private-response-body", { status: 503 });
    if (outcome === "timeout") throw new Error("private-network-wrapper", {
      cause: new DOMException("private-timeout", "TimeoutError"),
    });
    return Response.json({
      issuer, authorization_endpoint: issuer + "/oauth/authorize", token_endpoint: issuer + "/oauth/token",
      pushed_authorization_request_endpoint: issuer + "/oauth/par", client_id_metadata_document_supported: true,
      token_endpoint_auth_methods_supported: ["private_key_jwt"],
      token_endpoint_auth_signing_alg_values_supported: ["ES256"], dpop_signing_alg_values_supported: ["ES256"],
    });
  });
  const signing = generateSigningMaterial();
  for (const [scenario, expected] of [
    ["rejected", { stage: "oauth_discovery", error: "upstream_rejected", upstreamStatus: 503 }],
    ["timeout", { stage: "oauth_discovery", error: "upstream_timeout" }],
    ["state_write", { stage: "oauth_state", error: "state_store_failed" }],
  ] as const) {
    outcome = scenario;
    const certified = await createCertifiedClient(store, signing, "https://auth.example.test");
    await assert.rejects(certified.authorize("private-state"), error => {
      if (scenario === "state_write") assert.equal(error, stateError);
      assert.deepEqual(certifiedAuthorizationFailure(error), expected);
      return true;
    });
  }
});

test("Certified start diagnostics reject unknown labels and omit invalid statuses and extra fields", () => {
  const lines: string[] = [], observer = createBridgeObserver(line => lines.push(line));
  observer.startFailure({ stage: "private-path", error: "validation_failed" } as unknown as BridgeStartFailure);
  observer.startFailure({ stage: "oauth_authorize", error: "private-description" } as unknown as BridgeStartFailure);
  observer.startFailure({ stage: "oauth_authorize", error: "upstream_rejected", upstreamStatus: 400,
    oauthError: "private-oauth-code" } as unknown as BridgeStartFailure);
  const failure = { stage: "oauth_state", error: "state_store_failed", upstreamStatus: 999, cause: "private-secret" } as const;
  observer.startFailure(failure);
  assert.deepEqual(lines.map(line => JSON.parse(line)), [
    { component: "certified_bridge", event: "certified_start_failed", stage: "oauth_authorize",
      error: "upstream_rejected", upstream_status: 400 },
    { component: "certified_bridge", event: "certified_start_failed", stage: "oauth_state", error: "state_store_failed" },
  ]);
});
