import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { readFile } from "node:fs/promises";
import { createHash, randomBytes, createPublicKey, verify } from "node:crypto";
import { createServer } from "node:net";
import { get } from "node:http";
import { fork, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import postgres from "postgres";
import { createCipher } from "./certified/crypto.ts";
import { AuthStore, provisionSigningMaterial, replaceSigningMaterial } from "./certified/store.ts";
import { createCertifiedClient } from "./certified/adapters.ts";
import { generateSigningMaterial, rotateSigningMaterial } from "./certified/keys.ts";
import { startCertifiedServer } from "./certified-server.ts";
import { manageSigningKeys } from "./certified-admin.ts";
import { checkCertifiedReadiness } from "./certified/readiness.ts";
import { createBridgeObserver } from "./certified/operations.ts";

const database = process.env.WEAVE_BRIDGE_TEST_DATABASE_URL;
const enabled = !!database;
let admin: postgres.Sql, runtime: postgres.Sql, store: AuthStore, issuer: string;
const key = randomBytes(32), lookup = randomBytes(32), secret = randomBytes(40).toString("base64url");
let cipher: ReturnType<typeof createCipher>;
let runtimeUrl: string;
const children = new Set<ChildProcess>();

before(async () => {
  if (!database) return;
  const url = new URL(database);
  if (url.hostname !== "127.0.0.1" || url.pathname !== "/weave_bridge_test") throw Error("dedicated_loopback_test_database_required");
  const socket = createServer(); socket.listen(0, "127.0.0.1"); await once(socket, "listening");
  const address = socket.address(); assert.ok(address && typeof address !== "string");
  issuer = `http://127.0.0.1:${address.port}`;
  await new Promise<void>((resolve, reject) => socket.close(e => e ? reject(e) : resolve()));
  cipher = createCipher({ active: "test", keys: { test: key }, lookup }, issuer);
  admin = postgres(database, { max: 5, onnotice: () => {} });
  // Explicit disposable database only. No production URL can pass the guard above.
  await admin`drop schema if exists weave_auth cascade`;
  await admin.unsafe(await readFile(new URL("../../../supabase/candidates/certified-bridge.sql", import.meta.url), "utf8"));
  await admin.unsafe("do $$ begin if not exists(select 1 from pg_roles where rolname='bridge_fixture') then create role bridge_fixture login password 'bridge_fixture_only'; end if; end $$");
  await admin`grant weave_auth_runtime to bridge_fixture`;
  url.username = "bridge_fixture"; url.password = "bridge_fixture_only"; runtimeUrl = String(url);
  runtime = postgres(runtimeUrl, { max: 8, onnotice: () => {} });
  store = new AuthStore(runtime, cipher);
});
after(async () => {
  for (const child of children) child.kill();
  if (runtime) await runtime.end(); if (admin) await admin.end();
});
const integration = (name: string, fn: () => Promise<void>) => test(name, { skip: !enabled, timeout: 30000 }, fn);

integration("encrypted persistence, expiry, atomic take and consume across separate connections", async () => {
  const otherSql = postgres(runtimeUrl, { max: 3 });
  try {
    const other = new AuthStore(otherSql, cipher);
    await store.put("test", "private-id", { secret: "synthetic-secret" }, 60);
    assert.deepEqual(await other.find("test", "private-id"), { secret: "synthetic-secret" });
    const rows = await admin`select * from weave_auth.records`;
    assert.ok(!JSON.stringify(rows).includes("synthetic-secret"));
    assert.ok(!JSON.stringify(rows).includes("private-id"));
    const results = await Promise.all([store.take("test", "private-id"), other.take("test", "private-id")]);
    assert.equal(results.filter(Boolean).length, 1);
    await store.put("test", "consume", { code: "test" }, 60);
    const consumed = await Promise.allSettled([store.consume("test", "consume"), other.consume("test", "consume")]);
    assert.equal(consumed.filter(r => r.status === "fulfilled").length, 1);
    await store.put("test", "consume", { code: "updated" }, 60);
    await assert.rejects(store.consume("test", "consume"));
    await store.put("test", "expired", { code: "test" }, 60);
    await admin`update weave_auth.records set expires_at=now()-interval '1 second' where key_hash=${cipher.index("test","expired")}`;
    assert.equal(await other.find("test", "expired"), undefined);
    assert.equal(await other.take("test", "expired"), undefined);
    await store.prune();
  } finally { await otherSql.end(); }
});
integration("grant revocation rejects stale writers and SQL locks serialize competing instances", async () => {
  await store.put("oidc:AccessToken", "token", { grantId: "grant-one" }, 60);
  await store.put("oidc:Interaction", "switch-account", { grantId: "grant-one", result: { login: { accountId: "did:plc:bob" } } }, 60);
  const indexed = await admin`select grant_hash from weave_auth.records
    where namespace='oidc:Interaction' and key_hash=${cipher.index("oidc:Interaction", "switch-account")}`;
  assert.equal(indexed[0]?.grant_hash, null);
  // Model an interaction persisted by the old deployment before this repair.
  await admin`update weave_auth.records set grant_hash=${cipher.index("grant", "grant-one")}
    where namespace='oidc:Interaction' and key_hash=${cipher.index("oidc:Interaction", "switch-account")}`;
  await store.revokeGrant("grant-one");
  assert.equal(await store.find("oidc:AccessToken", "token"), undefined);
  assert.ok(await store.find("oidc:Interaction", "switch-account"), "a legacy-indexed account-switch interaction must survive grant revocation");
  await store.put("oidc:Interaction", "switch-account", { grantId: "grant-one", result: { login: { accountId: "did:plc:bob" } } }, 60);
  await assert.rejects(store.put("oidc:AccessToken", "late-token", { grantId: "grant-one" }, 60), /grant_revoked/);
  const otherSql = postgres(runtimeUrl, { max: 3 });
  try {
    const other = new AuthStore(otherSql, cipher), order: string[] = [];
    await Promise.all([store.withLock("shared", async () => {
      order.push("first-start"); await store.put("lock-test", "a", { valid: true }, 60); order.push("first-end");
    }), other.withLock("shared", async () => { order.push("second"); })]);
    assert.equal(order.indexOf("first-end") - order.indexOf("first-start"), 1);
    await assert.rejects(store.withLock("rollback", async () => { await store.put("rollback", "row", { valid: true }, 60); throw Error("abort"); }));
    assert.equal(await store.find("rollback", "row"), undefined);
  } finally { await otherSql.end(); }
});
integration("runtime cannot provision signing keys; encrypted provisioning and rotation persist", async () => {
  await assert.rejects(store.signingMaterial(), /not_provisioned/);
  const material = generateSigningMaterial();
  await assert.rejects(provisionSigningMaterial(runtime, cipher, material));
  await provisionSigningMaterial(admin, cipher, material);
  assert.deepEqual(await store.signingMaterial(), material);
  await assert.rejects(runtime`update weave_auth.settings set encrypted_payload='replacement' where name='signing'`);
  await assert.rejects(runtime`delete from weave_auth.settings where name='signing'`);
  const sdk = await createCertifiedClient(store,material,"https://identity.example.test");
  assert.equal((sdk.metadata as {scope:string}).scope,"atproto");
  assert.ok((sdk.jwks as {keys:{d?:string}[]}).keys.every(k=>!k.d));
  await assert.rejects(provisionSigningMaterial(admin, cipher, material));
  const next = rotateSigningMaterial(material);
  await replaceSigningMaterial(admin, cipher, material, next);
  assert.deepEqual(await new AuthStore(runtime, cipher).signingMaterial(), next);
  await assert.rejects(replaceSigningMaterial(admin, cipher, material, next), /changed/);
  // An unrelated database user has no access to the bridge schema.
  await admin.unsafe("do $$ begin if not exists(select 1 from pg_roles where rolname='bridge_outsider') then create role bridge_outsider login password 'outsider_fixture_only'; end if; end $$");
  const url = new URL(runtimeUrl); url.username="bridge_outsider"; url.password="outsider_fixture_only";
  const outsider = postgres(String(url));
  try { await assert.rejects(outsider`select * from weave_auth.records`); } finally { await outsider.end(); }
});
async function start(): Promise<ChildProcess> {
  const child = fork(new URL("../test-fixtures/certified-worker.ts", import.meta.url), [], {
    stdio: ["ignore", "ignore", "ignore", "ipc"],
    env: { ...process.env, WEAVE_BRIDGE_FIXTURE_CONFIG: JSON.stringify({ issuer, database: runtimeUrl, key: key.toString("base64url"), lookup: lookup.toString("base64url"), secret }) },
  });
  children.add(child);
  await Promise.race([once(child, "message"), once(child, "exit").then(() => { throw Error("fixture_worker_failed"); }),
    new Promise((_, reject) => { const timer=setTimeout(() => reject(Error("worker_timeout")), 10000); timer.unref(); })]);
  return child;
}
async function stop(child: ChildProcess) { child.send("stop"); await once(child, "exit"); children.delete(child); }
function browser() {
  const cookies = new Map<string,string>();
  return async (url: string, init: RequestInit = {}) => {
    const response = await fetch(url, { ...init, redirect: "manual", headers: { Cookie: [...cookies].map(([k,v])=>`${k}=${v}`).join("; "), ...init.headers } });
    for (const value of response.headers.getSetCookie()) {
      const first=value.split(";")[0]!, equals=first.indexOf("=");
      const name=first.slice(0,equals), content=first.slice(equals+1);
      if(content)cookies.set(name,content);else cookies.delete(name);
    }
    return response;
  };
}
integration("real OIDC provider survives process restart mid-sign-in and permits only one token exchange", async () => {
  let child=await start();
  const request=browser(), verifier=randomBytes(32).toString("base64url");
  const params=new URLSearchParams({ client_id:"weave-test", redirect_uri:"http://127.0.0.1:1/callback", response_type:"code", scope:"openid", nonce:"fixture-nonce", state:"relying-party-state", prompt:"login",
    code_challenge:createHash("sha256").update(verifier).digest("base64url"),code_challenge_method:"S256" });
  let response=await request(`${issuer}/auth?${params}`);
  let location=response.headers.get("location"); assert.ok(location);
  for(let n=0;n<8&&!location.startsWith("https://certified.example.test");n++) {
    response=await request(new URL(location,issuer).href); location=response.headers.get("location"); assert.ok(location, `expected redirect, got ${response.status}`);
  }
  assert.ok(location.startsWith("https://certified.example.test"));
  const state=new URL(location).searchParams.get("state")!;
  await stop(child); child=await start();
  response=await request(`${issuer}/at/callback?code=synthetic-code&state=${state}`);
  location=response.headers.get("location"); assert.ok(location);
  for(let n=0;n<12&&!location.startsWith("http://127.0.0.1:1/callback");n++) {
    response=await request(new URL(location,issuer).href); location=response.headers.get("location"); assert.ok(location, `expected redirect, got ${response.status}`);
  }
  assert.ok(location.startsWith("http://127.0.0.1:1/callback"));
  const callback=new URL(location); assert.equal(callback.searchParams.get("state"),"relying-party-state");
  const code=callback.searchParams.get("code"); assert.ok(code,callback.searchParams.get("error")??"code missing");
  await stop(child); child=await start();
  const exchange=(overrides: Record<string,string> = {})=>fetch(`${issuer}/token`,{method:"POST",body:new URLSearchParams({client_id:"weave-test",client_secret:secret,grant_type:"authorization_code",code,redirect_uri:"http://127.0.0.1:1/callback",code_verifier:verifier,...overrides})});
  assert.equal((await exchange({code_verifier:randomBytes(32).toString("base64url")})).status,400);
  assert.equal((await exchange({redirect_uri:"http://127.0.0.1:1/wrong"})).status,400);
  assert.equal((await exchange({client_secret:"invalid-client-secret"})).status,401);
  const exchanges=await Promise.all([exchange(),exchange()]); assert.equal(exchanges.filter(r=>r.ok).length,1);
  assert.equal(exchanges.find(r=>!r.ok)!.status,400);
  const token=await exchanges.find(r=>r.ok)!.json() as {id_token:string};
  const [header,payload,signature]=token.id_token.split(".");
  const claims=JSON.parse(Buffer.from(payload!,"base64url").toString());
  assert.equal(claims.sub,"https://certified.one|did:plc:synthetic"); assert.equal(claims.nonce,"fixture-nonce");
  assert.equal(claims.iss,issuer); assert.equal(claims.aud,"weave-test");
  assert.equal(Object.hasOwn(claims,"email"),false); assert.equal(Object.hasOwn(claims,"email_verified"),false);
  const jwks=await fetch(`${issuer}/jwks`).then(r=>r.json()) as {keys: ({kid:string}&import("node:crypto").webcrypto.JsonWebKey)[]};
  const kid=JSON.parse(Buffer.from(header!,"base64url").toString()).kid;
  assert.ok(verify("sha256",Buffer.from(`${header}.${payload}`),createPublicKey({key:jwks.keys.find(k=>k.kid===kid)!,format:"jwk"}),Buffer.from(signature!,"base64url")));
  assert.ok(jwks.keys.every(k=>!k.d));
  assert.equal((await request(`${issuer}/at/callback?code=synthetic-code&state=${state}`)).status,400);
  const discovery = await fetch(`${issuer}/.well-known/openid-configuration`).then(r=>r.json()) as { scopes_supported:string[];issuer:string };
  assert.deepEqual(discovery.scopes_supported,["openid"]);assert.equal(discovery.issuer,issuer);
  assert.equal((await fetch(`${issuer}/jwks`,{headers:{"X-Forwarded-Host":"attacker.example"}})).status,400);
  assert.equal((await fetch(`${issuer}/fixture/open`)).status,404);
  assert.equal((await fetch(`${issuer}/api/account`)).status,404);
  assert.equal((await fetch(`${issuer}/at/callback?code=synthetic-code&state=${state}`)).status,400);
  await stop(child);
});

integration("real OIDC account switches survive logout and process restarts without sharing subjects or grants", async () => {
  let child = await start();
  const request = browser(), redirectUri = "http://127.0.0.1:1/callback";
  async function follow(response: Response, destination: string): Promise<string> {
    for (let n = 0; n < 20; n++) {
      const location = response.headers.get("location");
      if (location?.startsWith(destination)) return location;
      if (location) { response = await request(new URL(location, issuer).href); continue; }
      const html = await response.text();
      const action = /<form method="post" action="([^"]+)"/.exec(html)?.[1];
      assert.equal(action, `${issuer}/session/end/confirm`, `expected redirect or provider account-switch form, got ${response.status}`);
      const body = new URLSearchParams([...html.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)"/g)].map(match => [match[1]!, match[2]!]));
      assert.equal(body.get("logout"), "yes"); assert.ok(body.get("xsrf"));
      // Resume must work on another worker with the same encrypted state and keys.
      await stop(child); child = await start();
      response = await request(action!, { method: "POST", body });
    }
    throw Error("fixture_redirect_limit");
  }
  let revoked: URLSearchParams | undefined;
  try {
    for (const actor of ["alice", "bob", "alice", "alice"]) {
      const verifier = randomBytes(32).toString("base64url");
      const params = new URLSearchParams({ client_id: "weave-test", redirect_uri: redirectUri, response_type: "code", scope: "openid", prompt: "login", state: "fixture-state", nonce: "fixture-nonce", code_challenge_method: "S256", code_challenge: createHash("sha256").update(verifier).digest("base64url") });
      const certified = await follow(await request(`${issuer}/auth?${params}`), "https://certified.example.test/");
      const state = new URL(certified).searchParams.get("state")!;
      const returned = await follow(await request(`${issuer}/at/callback?${new URLSearchParams({ state, code: `synthetic-${actor}` })}`), redirectUri);
      const callback = new URL(returned);
      assert.equal(callback.searchParams.get("error"), null);
      const code = callback.searchParams.get("code"); assert.ok(code);
      const body = new URLSearchParams({ client_id: "weave-test", client_secret: secret, grant_type: "authorization_code", redirect_uri: redirectUri, code, code_verifier: verifier });
      // Keep the first account's code unused, then prove switching revokes it.
      if (!revoked) { revoked = body; continue; }
      assert.equal((await fetch(`${issuer}/token`, { method: "POST", body: revoked })).status, 400);
      const response = await fetch(`${issuer}/token`, { method: "POST", body });
      assert.equal(response.status, 200);
      const token = await response.json() as { id_token: string };
      const claims = JSON.parse(Buffer.from(token.id_token.split(".")[1]!, "base64url").toString());
      assert.equal(claims.sub, `https://certified.one|did:plc:${actor}`);
      assert.equal(Object.hasOwn(claims, "email"), false);
      assert.equal((await fetch(`${issuer}/token`, { method: "POST", body })).status, 400);
    }
  } finally { await stop(child); }
});

integration("production entry requires a restricted role and trusted HTTPS ingress, retaining keys after restart", async () => {
  // Provision a separate issuer after the protocol fixture has stopped. No Certified request is made.
  await admin`delete from weave_auth.settings`;
  const env = {
    WEAVE_AUTH_ISSUER: "https://identity.example.test",
    WEAVE_AUTH_CLIENT_ID: "weave-test",
    WEAVE_AUTH_CLIENT_SECRET: secret,
    WEAVE_AUTH_REDIRECT_URI: "https://database.example.test/auth/v1/callback",
    WEAVE_AUTH_DATABASE_URL: database!,
    WEAVE_AUTH_PORT: new URL(issuer).port,
    WEAVE_AUTH_ENCRYPTION_KEYS: JSON.stringify({ active: "test", keys: { test: key.toString("base64url") }, lookup: lookup.toString("base64url") }),
  };
  await manageSigningKeys("provision", env);
  await assert.rejects(manageSigningKeys("provision", env));
  await assert.rejects(startCertifiedServer(env), /restricted_database_role_required/);
  await assert.rejects(checkCertifiedReadiness(env), /restricted_database_role_required/);
  const runtimeEnv = { ...env, WEAVE_AUTH_DATABASE_URL: runtimeUrl };
  await assert.rejects(checkCertifiedReadiness(runtimeEnv)); // No worker is listening yet.
  const events: string[] = [], observer = createBridgeObserver(line => events.push(line));
  let running = await startCertifiedServer(runtimeEnv,observer);
  const headers = { Host: "identity.example.test", "X-Forwarded-Proto": "https" };
  // Fetch rewrites Host to its connection target. Native HTTP models a TLS ingress
  // preserving the public Host while forwarding to this loopback listener.
  const forwarded = (headers: Record<string, string>) => new Promise<{ status: number; body: string }>((resolve, reject) => {
    const request = get(`${issuer}/jwks`, { headers, timeout: 3000 }, response => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", chunk => { body += chunk; });
      response.on("end", () => resolve({ status: response.statusCode!, body }));
      response.on("error", reject);
    });
    request.on("timeout", () => request.destroy(Error("fixture_request_timeout")));
    request.on("error", reject);
  });
  let published: unknown;
  try {
    await checkCertifiedReadiness(runtimeEnv);
    assert.equal((await admin`select count(*)::int n from weave_auth.records where namespace='ops:readiness'`)[0]?.n,0);
    await admin`revoke insert on weave_auth.records from weave_auth_runtime`;
    try { await assert.rejects(checkCertifiedReadiness(runtimeEnv)); }
    finally { await admin`grant insert on weave_auth.records to weave_auth_runtime`; }
    const original = (await admin`select encrypted_payload from weave_auth.settings where name='signing'`)[0]!.encrypted_payload;
    await admin`update weave_auth.settings set encrypted_payload='corrupt' where name='signing'`;
    try { await assert.rejects(checkCertifiedReadiness(runtimeEnv)); }
    finally { await admin`update weave_auth.settings set encrypted_payload=${original} where name='signing'`; }
    assert.equal((await forwarded({ Host: headers.Host })).status, 400);
    assert.equal((await forwarded({ ...headers, "X-Forwarded-Proto": "http" })).status, 400);
    const response = await forwarded(headers);
    assert.equal(response.status, 200);
    published = JSON.parse(response.body);
  } finally { await running.close(); }
  running = await startCertifiedServer(runtimeEnv,observer);
  try {
    assert.deepEqual(JSON.parse((await forwarded(headers)).body), published);
    await manageSigningKeys("rotate",env);
    await assert.rejects(checkCertifiedReadiness(runtimeEnv), /bridge_not_ready/); // Old worker still advertises old keys.
  }
  finally { await running.close(); }
  running = await startCertifiedServer(runtimeEnv,observer);
  try { await checkCertifiedReadiness(runtimeEnv); }
  finally { await running.close(); }
  assert.equal(events.filter(line=>JSON.parse(line).event==='started').length,3);
  assert.equal(events.filter(line=>JSON.parse(line).event==='stopped').length,3);
  assert.ok(!events.join('').includes(secret));
});
