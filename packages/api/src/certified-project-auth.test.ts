import assert from "node:assert/strict";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { NodeOAuthClient, type NodeOAuthClientOptions, type NodeSavedSession } from "@atproto/oauth-client-node";
import postgres from "postgres";
import { certifiedProjectOAuthPaths as paths, createCertifiedProjectAuth, projectOAuthStore, type ProjectOAuthStore } from "./certified-project-auth.ts";
import { createCipher } from "./certified/crypto.ts";
import { record } from "./account-contract.ts";
import { projectSdkFixture, sdkMembership } from "../test-fixtures/project-sdk.ts";

const origin = "https://weave.example.test", issuer = "https://certified.one", cgsOrigin = "https://dev.groups.certified.app";
const cgs = "did:web:dev.groups.certified.app#certified_group_service";
const did = "did:plc:alice", otherDid = "did:plc:bob";
const membership = "app.certified.groups.membership.list";
const register = "app.certified.group.register";
const create = "app.certified.group.repo.createRecord";
const list = "app.certified.group.member.list";
const code = "provider-code", sdkState = "provider_state_00001";
const key = { ...generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey.export({ format: "jwk" }), kid: "test-only", alg: "ES256" };
const requested = (...methods: string[]) => ["atproto", ...methods.map(method => `rpc:${method}?aud=${cgs.replace("#", "%23")}`)].join(" ");
const binding = (response: Response) => response.headers.get("set-cookie")?.split(";")[0] ?? "";
const projectStatus = (response: Response) => new URL(response.headers.get("location")!).searchParams.get("projectConsent");

function memoryStore(transactionalLocks = false) {
  const rows = new Map<string, { value: unknown; ttl: number }>();
  const store: ProjectOAuthStore = {
    async put(kind, id, payload, ttl) { rows.set(`${kind}/${id}`, { value: structuredClone(payload), ttl }); },
    async find(kind, id) { return structuredClone(rows.get(`${kind}/${id}`)?.value); },
    async take(kind, id) {
      const index = `${kind}/${id}`, row = rows.get(index);
      rows.delete(index);
      return structuredClone(row?.value);
    },
    async remove(kind, id) { rows.delete(`${kind}/${id}`); },
    async withLock(_, run, signal) {
      signal?.throwIfAborted();
      const snapshot = transactionalLocks ? structuredClone(rows) : undefined;
      try { return await run(store); }
      catch (error) {
        if (snapshot) { rows.clear(); for (const [key, value] of snapshot) rows.set(key, value); }
        throw error;
      }
    },
  };
  return { store, rows };
}

function jwt(claims: Record<string, unknown>) {
  return [Buffer.from('{"alg":"ES256"}').toString("base64url"), Buffer.from(JSON.stringify(claims)).toString("base64url"), "testsig"].join(".");
}
async function fixture(transactionalLocks = false) {
  const { store, rows } = memoryStore(transactionalLocks);
  const fake = {
    allowed: true,
    actor: { did, sessionId: "weave-session" } as { did: string; sessionId: string } | null,
    issuedDid: did,
    issuedScope: "",
    badToken: false,
    invalidState: false,
    exchangeCount: 0,
    actorsResolved: 0,
    scope: "",
    onRestore: null as ((options: NodeOAuthClientOptions) => Promise<void>) | null,
    calls: [] as { path: string; init?: RequestInit }[],
  };
  const auth = await createCertifiedProjectAuth({
    origin, cgsOrigin, signingKeys: [key], store,
    allowsDid: () => fake.allowed,
    async resolveActor() { fake.actorsResolved++; return fake.actor; },
    makeClient(options) {
      const sdk = new NodeOAuthClient(options);
      const session = {
        get did() { return fake.issuedDid; },
        serverMetadata: { issuer },
        async fetchHandler(path: string, init?: RequestInit) {
          fake.calls.push({ path, init });
          const url = new URL(path, "https://pds.example.test");
          if (url.pathname === "/xrpc/com.atproto.server.getServiceAuth")
            return Response.json({ token: jwt({ iss: fake.badToken ? otherDid : fake.issuedDid,
              aud: url.searchParams.get("aud"), lxm: url.searchParams.get("lxm"),
              exp: Number(url.searchParams.get("exp")), jti: "synthetic-unique-id" }) });
          return Response.json({ groups: [] });
        },
      };
      return {
        clientMetadata: sdk.clientMetadata,
        jwks: sdk.jwks,
        async authorize(input, params) {
          assert.equal(input, issuer);
          assert.equal(params?.prompt, "consent");
          fake.scope = params?.scope ?? "";
          await options.stateStore.set(sdkState, { appState: params?.state, iss: issuer } as never);
          const url = new URL("https://auth.certified.one/oauth/authorize");
          url.searchParams.set("client_id", String(options.clientMetadata.client_id));
          url.searchParams.set("request_uri", "urn:example:request");
          return url;
        },
        async callback(params) {
          fake.exchangeCount++;
          assert.equal(params.get("code"), code);
          const stored = await options.stateStore.get(params.get("state")!);
          if (!stored) throw Error("unknown state");
          await options.sessionStore.set(fake.issuedDid, {
            tokenSet: { iss: issuer, sub: fake.issuedDid, scope: fake.issuedScope || fake.scope, refresh_token: "secret_refresh" },
          } as NodeSavedSession);
          return { state: fake.invalidState ? "another-state" : (stored.appState ?? null), session };
        },
        async restore(restoredDid) {
          const saved = await options.sessionStore.get(restoredDid);
          assert.equal(saved?.tokenSet.refresh_token, "secret_refresh");
          await fake.onRestore?.(options);
          return session;
        },
      };
    },
  });
  const cmd = (action: unknown, cookie = "", headers?: Record<string, string>) =>
    new Request(origin + "/api/certified-project-consent", { method: "POST", body: JSON.stringify(action),
      headers: { Origin: origin, "Content-Type": "application/json", Cookie: cookie, ...headers } });
  const oauth = (cookie: string, query = `state=${sdkState}&code=${code}&iss=${encodeURIComponent(issuer)}`, callbackOrigin = origin) =>
    new Request(`${callbackOrigin}${paths.callback}?${query}`, { headers: { Cookie: cookie } });
  const start = async (action: string) => {
    const res = await auth.consent(cmd({ action }));
    assert.equal(res.status, 200);
    return res;
  };
  const approve = async (action: string) => {
    const result = await auth.callback(oauth(binding(await start(action))));
    assert.equal(projectStatus(result), "ready");
    return auth.consent(cmd({ action: "finish" }, binding(result)));
  };
  return { auth, fake, rows, cmd, oauth, start, approve };
}

test("public metadata and JWKS describe a separate confidential client without private key material", async () => {
  const f = await fixture();
  const metadata = record(await f.auth.metadata().json());
  assert.equal(metadata.client_id, origin + paths.metadata);
  assert.equal(metadata.jwks_uri, origin + paths.jwks);
  assert.deepEqual(metadata.redirect_uris, [origin + paths.callback]);
  assert.equal(metadata.token_endpoint_auth_method, "private_key_jwt");
  assert.equal(metadata.dpop_bound_access_tokens, true);
  assert.equal(typeof metadata.scope, "string");
  assert(!/email|rpc:\*|aud=\*|transition/i.test(String(metadata.scope)));
  const jwks = record(await f.auth.jwks().json());
  assert(Array.isArray(jwks.keys));
  const signingKey = record(jwks.keys[0]);
  assert.equal(signingKey.kid, key.kid);
  assert(!Object.hasOwn(signingKey, "d"));
});

test("support publication and withdrawal have separate collection-limited personal grants", async () => {
  const f = await fixture();
  const collection = "com.regencommons.weave.supportListing";
  const createPersonal = "com.atproto.repo.createRecord", deletePersonal = "com.atproto.repo.deleteRecord";
  assert.equal(await f.auth.writeSupportRecord(f.cmd({}), did, "create", {
    rkey: "3jui7kd54zh2y", record: { $type: collection },
  }), null);
  await f.approve("publish-support");
  assert.equal(f.fake.scope, requested(membership, create) + ` repo:${collection}?action=create`);
  await f.auth.assertGrant(f.cmd({}), did, [createPersonal]);
  await assert.rejects(f.auth.assertGrant(f.cmd({}), did, [deletePersonal]), /project_consent_required/);
  await f.auth.writeSupportRecord(f.cmd({}), did, "create", { rkey: "3jui7kd54zh2y", record: { $type: collection, title: "Synthetic" } });
  const sent = f.fake.calls.at(-1)!;
  assert.equal(sent.path, "/xrpc/" + createPersonal);
  assert.deepEqual(JSON.parse(String(sent.init?.body)), {
    repo: did, collection, rkey: "3jui7kd54zh2y", record: { $type: collection, title: "Synthetic" },
  });
  await assert.rejects(f.auth.writeSupportRecord(f.cmd({}), did, "delete", { rkey: "3jui7kd54zh2y" }), /invalid_support_repository_request/);
  await f.approve("withdraw-support");
  assert.equal(f.fake.scope, requested(membership, "app.certified.group.repo.deleteRecord") + ` repo:${collection}?action=delete`);
  const cid = "b" + "a".repeat(58);
  await f.auth.writeSupportRecord(f.cmd({}), did, "delete", { rkey: "3jui7kd54zh2y", expectedCid: cid });
  assert.deepEqual(JSON.parse(String(f.fake.calls.at(-1)!.init?.body)), { repo: did, collection, rkey: "3jui7kd54zh2y", swapRecord: cid });
  const count = f.fake.calls.length;
  assert.equal(await f.auth.writeSupportRecord(f.cmd({}), otherDid, "delete", { rkey: "3jui7kd54zh2y", expectedCid: cid }), null);
  f.fake.actor = { did, sessionId: "another-session" };
  assert.equal(await f.auth.writeSupportRecord(f.cmd({}), did, "delete", { rkey: "3jui7kd54zh2y", expectedCid: cid }), null);
  assert.equal(f.fake.calls.length, count);
});

test("support OAuth refuses a broadened or incomplete personal collection scope", async () => {
  for (const scope of ["repo:*", "repo:com.regencommons.weave.supportListing", "repo:com.regencommons.weave.supportListing?action=delete"]) {
    const f = await fixture();
    const started = await f.start("publish-support");
    f.fake.issuedScope = requested(membership, create) + " " + scope;
    assert.equal(projectStatus(await f.auth.callback(f.oauth(binding(started)))), "failed");
    await assert.rejects(f.auth.assertGrant(f.cmd({}), did, [create]), /project_consent_required/);
  }
});

test("consent is explicit, same-origin and scoped to the requested action", async () => {
  const f = await fixture();
  const wrongOrigin = await f.auth.consent(f.cmd({ action: "create-project" }, "", { Origin: "https://other.example.test" }));
  assert.equal(wrongOrigin.status, 403);
  assert.equal(f.fake.actorsResolved, 0);
  const suppliedActor = await f.auth.consent(f.cmd({ action: "create-project", did: otherDid }));
  assert.equal(suppliedActor.status, 400);
  f.fake.actor = null;
  assert.equal((await f.auth.consent(f.cmd({ action: "create-project" }))).status, 401);
  f.fake.actor = { did, sessionId: "weave-session" };
  for (const [action, methods] of [
    ["membership", [membership]], ["workspace-members", [membership, list]],
    ["create-project", [membership, register, create]], ["add-member", [membership, list, "app.certified.group.member.add"]],
  ] as const) {
    const start = await f.start(action);
    assert.equal(f.fake.scope, requested(...methods));
    assert.match(start.headers.get("set-cookie")!, /HttpOnly; Secure; SameSite=Lax; Max-Age=600/);
    const body = record(await start.json());
    assert.equal(new URL(String(body.authorizeUrl)).origin, "https://auth.certified.one");
    assert(!JSON.stringify(body).includes(did));
  }
});

test("callback is browser-bound and one-time; it requires same-session activation", async () => {
  const f = await fixture();
  const initial = await f.start("create-project"), pending = binding(initial);
  const other = binding(await f.start("membership"));
  // Same state name under an unrelated browser binding is not the initiating request.
  const unknown = pending.replace(/=[^;]+/, "=" + "a".repeat(43));
  assert.equal(projectStatus(await f.auth.callback(f.oauth(unknown))), "failed");
  assert.equal(projectStatus(await f.auth.callback(f.oauth(pending + "; " + other))), "failed");
  assert.equal(projectStatus(await f.auth.callback(f.oauth(pending, undefined, "https://evil.example.test"))), "failed");
  assert.equal(projectStatus(await f.auth.callback(f.oauth(pending, `state=${sdkState}&state=duplicate&code=${code}&iss=${issuer}`))), "failed");
  assert.equal(projectStatus(await f.auth.callback(f.oauth(pending, `state=${sdkState}&code=${code}&iss=https://evil.example.test`))), "failed");
  assert.equal(f.fake.exchangeCount, 0);
  f.fake.issuedScope = requested(membership, register, create);
  const beforeCallback = f.fake.actorsResolved;
  const replies = await Promise.all([f.auth.callback(f.oauth(pending)), f.auth.callback(f.oauth(pending))]);
  assert.equal(f.fake.actorsResolved, beforeCallback, "strict app cookie is unavailable on cross-site callback");
  assert.equal(f.fake.exchangeCount, 1);
  assert.deepEqual(replies.map(projectStatus).sort(), ["failed", "ready"]);
  const completed = replies.find(item => projectStatus(item) === "ready")!;
  assert.match(completed.headers.get("set-cookie")!, /HttpOnly; Secure; SameSite=Strict; Max-Age=600/);
  assert(!completed.headers.get("location")!.includes(code));
  await assert.rejects(f.auth.assertGrant(f.cmd({}), did, [membership, register, create]), /project_consent_required/);
  f.fake.actor = { did, sessionId: "different-session" };
  assert.equal((await f.auth.consent(f.cmd({ action: "finish" }, binding(completed)))).status, 403);
  f.fake.actor = { did, sessionId: "weave-session" };
  assert.equal((await f.auth.consent(f.cmd({ action: "finish" }, binding(completed)))).status, 403);
  assert.equal(f.fake.calls.length, 0);
});

test("a removed tester cannot start or complete an outstanding Certified authorization", async () => {
  const f = await fixture();
  const pending = binding(await f.start("create-project"));
  f.fake.allowed = false;
  const denied = await f.auth.consent(f.cmd({ action: "membership" }));
  assert.equal(denied.status, 403);
  assert.deepEqual(await denied.json(), { error: "project_pilot_restricted" });
  assert.equal(projectStatus(await f.auth.callback(f.oauth(pending))), "failed");
  f.fake.allowed = true;
  assert.equal(projectStatus(await f.auth.callback(f.oauth(pending))), "failed");
  assert.equal(f.fake.exchangeCount, 0);
});

test("denial, wrong DID, partial and broadened grants never activate project OAuth", async () => {
  for (const mode of ["denied", "wrong-did", "partial", "broad", "bad-state"] as const) {
    const f = await fixture();
    const pending = binding(await f.start("create-project"));
    if (mode === "wrong-did") f.fake.issuedDid = otherDid;
    if (mode === "partial") f.fake.issuedScope = requested(membership);
    if (mode === "broad") f.fake.issuedScope = f.fake.scope + " transition:generic";
    if (mode === "bad-state") f.fake.invalidState = true;
    const response = await f.auth.callback(f.oauth(pending, mode === "denied" ? `state=${sdkState}&error=access_denied` : undefined));
    assert.equal(projectStatus(response), mode === "denied" ? "denied" : "failed");
    assert.equal(response.headers.get("set-cookie"), null);
    assert.equal(projectStatus(await f.auth.callback(f.oauth(pending))), "failed");
    assert.equal(f.fake.exchangeCount, mode === "denied" ? 0 : 1);
    await assert.rejects(f.auth.assertGrant(f.cmd({}), did, [create]), /project_consent_required/);
  }
});

test("a bound grant supports retry and mints or proxies only the right actor, scope and audience", async () => {
  const f = await fixture();
  const completed = await f.approve("create-project");
  assert.deepEqual(await completed.json(), { granted: "create-project" });
  assert.match(completed.headers.get("set-cookie")!, /^__Host-weave_project_consent=;/);
  const request = f.cmd({});
  await f.auth.assertGrant(request, did, [membership, register, create]);
  await assert.rejects(f.auth.assertGrant(request, did, [list]), /project_consent_required/);
  assert.equal(await f.auth.mintServiceAuth(request, did, register), null, "service-level verifier requires PDS proxy");
  assert.equal(await f.auth.mintServiceAuth(request, otherDid, create), null);
  assert.equal(await f.auth.mintServiceAuth(request, did, "com.atproto.repo.deleteRecord"), null);
  assert.equal(f.fake.calls.length, 0);
  const result = await f.auth.proxyServiceRequest(request, did, membership, { method: "GET" }, new URLSearchParams({ cursor: "next" }));
  assert.deepEqual(await result?.json(), { groups: [] });
  assert.equal(f.fake.calls[0]?.path, `/xrpc/${membership}?cursor=next`);
  assert.equal(new Headers(f.fake.calls[0]?.init?.headers).get("Atproto-Proxy"), cgs);
  for (let i = 0; i < 2; i++) assert.ok(await f.auth.mintServiceAuth(request, did, create));
  const mint = new URL(f.fake.calls[1]!.path, "https://pds.example.test");
  assert.equal(mint.searchParams.get("lxm"), create);
  assert.equal(mint.searchParams.get("aud"), cgs);
  assert(Number(mint.searchParams.get("exp")) - Date.now() / 1000 < 61);
  const body = JSON.stringify({ handle: "new-group", ownerDid: did });
  await f.auth.proxyServiceRequest(request, did, register, {
    method: "POST", body, headers: { Authorization: "ignored", "Atproto-Proxy": "ignored" },
  });
  const registration = f.fake.calls.at(-1)!;
  assert.equal(registration.path, `/xrpc/${register}`);
  assert.equal(registration.init?.body, body);
  assert.equal(new Headers(registration.init?.headers).get("Atproto-Proxy"), cgs);
  assert.equal(new Headers(registration.init?.headers).get("Authorization"), null);
  await assert.rejects(f.auth.proxyServiceRequest(request, did, register, { method: "GET" }), /invalid_project_service_request/);
  f.fake.badToken = true;
  await assert.rejects(f.auth.mintServiceAuth(request, did, create), /invalid_project_service_token/);
  f.fake.actor = { did, sessionId: "next-login" };
  assert.equal(await f.auth.mintServiceAuth(request, did, create), null);
  assert.equal(await f.auth.proxyServiceRequest(request, did, membership, { method: "GET" }), null);
});

test("canceled project access never runs the protected upstream operation", async () => {
  const f = await fixture();
  await f.approve("membership");
  await assert.rejects(f.auth.proxyServiceRequest(f.cmd({}), did, membership, { method: "GET", signal: AbortSignal.abort() }),
    error => error instanceof Error && error.name === "AbortError");
  assert.equal(f.fake.calls.length, 0);
});

test("a rotated grant commits before a later upstream failure is surfaced", async () => {
  const f = await fixture(true);
  await f.approve("membership");
  f.fake.onRestore = async options => {
    const saved = await options.sessionStore.get(did);
    await options.sessionStore.set(did, { ...saved!, tokenSet: { ...saved!.tokenSet, refresh_token: "rotated-fixture" } });
    throw Error("upstream failure after rotation");
  };
  await assert.rejects(f.auth.proxyServiceRequest(f.cmd({}), did, membership, { method: "GET" }), /upstream failure after rotation/);
  const grant = [...f.rows.entries()].find(([key]) => key.startsWith("grant/"))?.[1].value as { session: NodeSavedSession };
  assert.equal(grant.session.tokenSet.refresh_token, "rotated-fixture");
});

const database = process.env.WEAVE_PROJECT_OAUTH_TEST_DATABASE_URL;
test("the private PostgreSQL store encrypts payloads, expires rows, and consumes state once across instances",
  { skip: !database, timeout: 30000 }, async () => {
    const url = new URL(database!);
    if (url.hostname !== "127.0.0.1" || url.pathname !== "/weave_project_oauth_test")
      throw Error("dedicated_loopback_project_oauth_test_database_required");
    const admin = postgres(url.href, { onnotice: () => {} });
    const runtime = postgres(url.href, { max: 3, onnotice: () => {}, connection: { options: "-c role=weave_project_oauth_runtime" } });
    try {
      await admin`drop schema if exists weave_project_oauth cascade`;
      await admin`do $$ begin
        if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
        if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
      end $$`;
      await admin.unsafe(await readFile(new URL("../../../supabase/candidates/weave-project-oauth.sql", import.meta.url), "utf8"));
      const [principal] = await runtime`select current_user as role`;
      assert.equal(principal?.role, "weave_project_oauth_runtime");
      const cipher = createCipher({ active: "fixture", keys: { fixture: randomBytes(32) }, lookup: randomBytes(32) }, origin);
      const store = projectOAuthStore(runtime, cipher);
      const anotherInstance = projectOAuthStore(runtime, cipher);
      const payload = { refresh: "secret-fixture-value", actor: did };
      await store.put("state", "fixture-state", payload, 600);
      const [row] = await admin`select key_hash, encrypted_payload from weave_project_oauth.records`;
      assert.match(String(row?.key_hash), /^[a-f0-9]{64}$/);
      assert(!String(row?.encrypted_payload).includes(payload.refresh));
      assert(!String(row?.encrypted_payload).includes(did));
      const attempts = await Promise.all([store.take("state", "fixture-state"), anotherInstance.take("state", "fixture-state")]);
      assert.equal(attempts.filter(Boolean).length, 1);
      assert.deepEqual(attempts.find(Boolean), payload);
      await store.put("receipt", "fixture-receipt", payload, 600);
      await assert.rejects(store.withLock("fixture-grant", async locked => {
        assert.deepEqual(await locked.take("receipt", "fixture-receipt"), payload);
        throw Error("synthetic promotion failure");
      }), /synthetic promotion failure/);
      assert.deepEqual(await store.find("receipt", "fixture-receipt"), payload);
      await admin`update weave_project_oauth.records set expires_at=now()-interval '1 second'`;
      assert.equal(await store.find("receipt", "fixture-receipt"), undefined);
      assert.equal(await store.take("receipt", "fixture-receipt"), undefined);
      for (const role of ["anon", "authenticated"])
        await assert.rejects(admin.begin(async tx => {
          await tx`set local role ${tx(role)}`;
          await tx`select * from weave_project_oauth.records`;
        }), { code: "42501" });
    } finally {
      await runtime.end();
      await admin.end();
    }
  });

test("the pinned OAuth SDK performs PAR, PKCE, DID resolution and the scoped DPoP proxy exchange", async t => {
  const f = await projectSdkFixture(t);
  const result = await f.auth.proxyServiceRequest(f.command(), f.actor.did, sdkMembership, { method: "GET" });
  assert.deepEqual(await result?.json(), { groups: [] });
  assert.equal(f.control.proxyCalls, 1);
});
