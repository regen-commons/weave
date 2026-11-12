import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer, type RequestListener } from "node:http";
import { once } from "node:events";
import { spawnSync } from "node:child_process";
import { checkPublishedBridge } from "./certified/readiness.ts";
import { generateSigningMaterial, publicKeys, rotateSigningMaterial } from "./certified/keys.ts";

const config = { issuer: "https://identity.example.test", clientId: "weave", clientSecret: "x".repeat(40), redirectUri: "https://database.example.test/auth/v1/callback" };
const signing = generateSigningMaterial();
function documents(): Record<string, unknown> {
  return {
    "/.well-known/openid-configuration": { issuer: config.issuer, authorization_endpoint: config.issuer + "/auth",
      token_endpoint: config.issuer + "/token", jwks_uri: config.issuer + "/jwks", scopes_supported: ["openid"] },
    "/jwks": { keys: publicKeys(signing.oidc) }, "/at-jwks.json": { keys: publicKeys(signing.at) },
    "/client-metadata.json": { client_id: config.issuer + "/client-metadata.json", scope: "atproto", jwks_uri: config.issuer + "/at-jwks.json",
      redirect_uris: [config.issuer + "/at/callback"], token_endpoint_auth_method: "private_key_jwt", dpop_bound_access_tokens: true },
  };
}
async function serve(handler: RequestListener, run: (port: number) => Promise<void>) {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  try { await run(address.port); }
  finally { await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); }); }
}
async function published(data: Record<string, unknown>, check: (port: number) => Promise<void>) {
  await serve((req, res) => {
    assert.equal(req.headers.host, "identity.example.test"); assert.equal(req.headers["x-forwarded-proto"], "https");
    assert.equal(req.headers.authorization, undefined); assert.equal(req.headers.cookie, undefined);
    res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(data[req.url!]));
  }, check);
}

test("readiness checks the advertised issuer, identity scopes and both public signing sets", async () => {
  await published(documents(), port => checkPublishedBridge(config, port, signing));
  await published(documents(), port => assert.rejects(checkPublishedBridge(config, port, rotateSigningMaterial(signing)), /bridge_not_ready/));
  for (const path of ["/jwks", "/at-jwks.json"]) {
    const data = documents(); data[path] = { keys: [] };
    await published(data, port => assert.rejects(checkPublishedBridge(config, port, signing), /bridge_not_ready/));
  }
  const leaked = documents(); leaked["/jwks"] = { keys: signing.oidc };
  await published(leaked, port => assert.rejects(checkPublishedBridge(config, port, signing), /bridge_not_ready/));
});

test("readiness rejects changed identity contracts", async () => {
  const changes = [
    ["/.well-known/openid-configuration", "issuer", "https://other.example.test"],
    ["/.well-known/openid-configuration", "scopes_supported", ["openid", "email"]],
    ["/client-metadata.json", "scope", "atproto transition:email"],
    ["/client-metadata.json", "redirect_uris", ["https://other.example.test/callback"]],
    ["/client-metadata.json", "dpop_bound_access_tokens", false],
  ] as const;
  for (const [path, name, value] of changes) {
    const data = documents(); (data[path] as Record<string, unknown>)[name] = value;
    await published(data, port => assert.rejects(checkPublishedBridge(config, port, signing), /bridge_not_ready/));
  }
});

test("readiness bounds response size and duration and refuses redirects or invalid JSON", async () => {
  const handlers: RequestListener[] = [
    (_req, res) => { res.writeHead(302, { Location: "https://private.example.test" }); res.end(); },
    (_req, res) => res.end("not json"),
    (_req, res) => res.end("x".repeat(65537)),
    () => { /* Deliberately never respond; the readiness deadline must abort it. */ },
  ];
  for (const handler of handlers) await serve(handler, port => assert.rejects(checkPublishedBridge(config, port, signing), /bridge_not_ready/));
});

test("readiness CLI fails closed without printing invalid configuration or secrets", () => {
  // The normal entrypoint must validate configuration without initializing oidc-provider.
  // A module hook makes the import boundary deterministic even on a warm filesystem.
  const importGuard = `import { registerHooks } from 'node:module'; registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === 'oidc-provider') throw Error('readiness_loaded_oidc_server');
      return nextResolve(specifier, context);
    }
  });`;
  const result = spawnSync(process.execPath, ["--import", `data:text/javascript,${encodeURIComponent(importGuard)}`,
    new URL("./certified-check.ts", import.meta.url).pathname], {
    env: { ...process.env, WEAVE_AUTH_ISSUER: "private-secret-not-an-origin", WEAVE_AUTH_CLIENT_ID: "weave",
      WEAVE_AUTH_CLIENT_SECRET: "private-secret", WEAVE_AUTH_REDIRECT_URI: "https://database.example.test/auth/v1/callback" },
    encoding: "utf8", timeout: 10000,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1); assert.equal(result.stdout, "");
  assert.equal(result.stderr.trim(), "certified_bridge_not_ready");
});
