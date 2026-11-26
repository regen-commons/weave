import assert from "node:assert/strict";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { NodeOAuthClient, type NodeOAuthClientOptions, type NodeSavedSession } from "@atproto/oauth-client-node";
import postgres from "postgres";
import { certifiedProjectOAuthPaths as paths, consentPrompt, createCertifiedProjectAuth, grantLifetime, ownRepositoryMethods, projectOAuthStore, type ProjectOAuthStore } from "./certified-project-auth.ts";
import { createCipher } from "./certified/crypto.ts";
import { record } from "./account-contract.ts";
import { createSupportPublicationAdapter } from "./support-publication-provider.ts";
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
interface Readying {
  /** Stands in for the SDK's resolver, so the primer can ready Certified. */
  resolve?: () => Promise<{ metadata: { issuer: string; pushed_authorization_request_endpoint?: string } }>;
  primeFetch?: typeof fetch;
  /** Sees the options of every client the auth makes. */
  made?: (options: NodeOAuthClientOptions) => void;
  /** Holds actor resolution until the test lets it go. */
  actorGate?: Promise<void>;
  order?: string[];
}
async function fixture(transactionalLocks = false, readying: Readying = {}) {
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
    prompts: [] as (string | undefined)[],
    onRestore: null as ((options: NodeOAuthClientOptions) => Promise<void>) | null,
    calls: [] as { path: string; init?: RequestInit }[],
  };
  const auth = await createCertifiedProjectAuth({
    origin, cgsOrigin, signingKeys: [key], store,
    allowsDid: () => fake.allowed,
    ...(readying.primeFetch ? { primeFetch: readying.primeFetch } : {}),
    async resolveActor() {
      readying.order?.push("actor");
      await readying.actorGate;
      fake.actorsResolved++; return fake.actor;
    },
    makeClient(options) {
      readying.made?.(options);
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
        ...(readying.resolve ? { oauthResolver: { resolve: readying.resolve } } : {}),
        async authorize(input, params) {
          readying.order?.push("authorize");
          assert.equal(input, issuer);
          fake.prompts.push(params?.prompt);
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
  const { supportCreate: createPersonal, supportDelete: deletePersonal } = ownRepositoryMethods;
  assert.equal(await f.auth.writeSupportRecord(f.cmd({}), did, "create", {
    rkey: "3jui7kd54zh2y", record: { $type: collection },
  }), null);
  await f.approve("publish-support");
  assert.equal(f.fake.scope, requested(membership, create) + ` repo:${collection}?action=create`);
  await f.auth.assertGrant(f.cmd({}), did, [createPersonal]);
  await assert.rejects(f.auth.assertGrant(f.cmd({}), did, [deletePersonal]), /project_consent_required/);
  await f.auth.writeSupportRecord(f.cmd({}), did, "create", { rkey: "3jui7kd54zh2y", record: { $type: collection, title: "Synthetic" } });
  const sent = f.fake.calls.at(-1)!;
  assert.equal(sent.path, "/xrpc/com.atproto.repo.createRecord");
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

test("each consent action asks Certified for exactly its own scopes, and the earlier actions ask what they asked before", async () => {
  const aud = "did:web:dev.groups.certified.app%23certified_group_service";
  const rpc = (method: string) => `rpc:${method}?aud=${aud}`;
  const read = rpc("app.certified.groups.membership.list");
  const expected = {
    membership: `atproto ${read}`,
    "workspace-members": `atproto ${read} ${rpc("app.certified.group.member.list")}`,
    "create-project": `atproto ${read} ${rpc("app.certified.group.register")} ${rpc("app.certified.group.repo.createRecord")}`,
    "add-member": `atproto ${read} ${rpc("app.certified.group.member.list")} ${rpc("app.certified.group.member.add")}`,
    "publish-support": `atproto ${read} ${rpc("app.certified.group.repo.createRecord")} repo:com.regencommons.weave.supportListing?action=create`,
    "withdraw-support": `atproto ${read} ${rpc("app.certified.group.repo.deleteRecord")} repo:com.regencommons.weave.supportListing?action=delete`,
    "publish-initiative": `atproto ${read} repo:org.hypercerts.collection?action=create repo:app.certified.location?action=create `
      + "repo:com.regencommons.weave.supportListing?action=create",
  };
  const f = await fixture();
  for (const [action, scope] of Object.entries(expected)) {
    await f.start(action);
    assert.equal(f.fake.scope, scope, action);
  }
  // The client's own list keeps its earlier order and adds the two new collections at the end.
  assert.equal(record(await f.auth.metadata().json()).scope, `atproto ${read} ${rpc("app.certified.group.member.list")} `
    + `${rpc("app.certified.group.register")} ${rpc("app.certified.group.repo.createRecord")} ${rpc("app.certified.group.member.add")} `
    + `repo:com.regencommons.weave.supportListing?action=create ${rpc("app.certified.group.repo.deleteRecord")} `
    + "repo:com.regencommons.weave.supportListing?action=delete repo:org.hypercerts.collection?action=create "
    + "repo:app.certified.location?action=create");
});

test("one publish-initiative grant creates the project, its place and its support listings in the person's own repository, and nothing else", async () => {
  const f = await fixture();
  const { projectCreate, locationCreate, supportCreate, supportDelete } = ownRepositoryMethods;
  const rkey = "3jui7kd54zh2y";
  const project = { $type: "org.hypercerts.collection", type: "project", title: "Synthetic garden", createdAt: "2026-11-25T00:00:00.000Z" };
  const place = { $type: "app.certified.location", name: "Synthetic valley" };
  assert.equal(await f.auth.createOwnRecord(f.cmd({}), did, "org.hypercerts.collection", { rkey, record: project }), null);
  assert.equal(f.fake.calls.length, 0, "nothing is sent before consent");
  await f.approve("publish-initiative");
  await f.auth.assertGrant(f.cmd({}), did, [projectCreate, locationCreate]);
  await f.auth.assertGrant(f.cmd({}), did, [supportCreate]);
  for (const method of [supportDelete, create, register, list])
    await assert.rejects(f.auth.assertGrant(f.cmd({}), did, [method]), /project_consent_required/, method);
  assert.equal(await f.auth.mintServiceAuth(f.cmd({}), did, projectCreate), null, "a repository write is never a service token");

  // Support publication checks the same grant, so the person sees one Certified screen for the whole draft.
  const adapter = createSupportPublicationAdapter({
    projectProvider: { readRepoRecord: async () => ({ ok: false, code: "not_found" }) }, groupServiceOrigin: cgsOrigin,
    assertGrant: (actorDid, methods) => f.auth.assertGrant(f.cmd({}), actorDid, methods),
    serviceAuth: async () => null,
    personalWrite: (actorDid, operation, input, signal) => f.auth.writeSupportRecord(f.cmd({}), actorDid, operation, input, signal),
  });
  const target = { projectUri: `at://${did}/org.hypercerts.collection/${rkey}`, repositoryDid: did, groupDid: null };
  await adapter.authorize(did, target, "create");
  await assert.rejects(adapter.authorize(did, target, "delete"), /project_consent_required/);

  for (const [collection, entry] of [["org.hypercerts.collection", project], ["app.certified.location", place]] as const) {
    await f.auth.createOwnRecord(f.cmd({}), did, collection, { rkey, record: entry });
    const sent = f.fake.calls.at(-1)!;
    assert.equal(sent.path, "/xrpc/com.atproto.repo.createRecord");
    assert.equal(sent.init?.method, "POST");
    assert.deepEqual(JSON.parse(String(sent.init?.body)), { repo: did, collection, rkey, record: entry });
  }
  const listing = { $type: "com.regencommons.weave.supportListing", title: "Synthetic" };
  await f.auth.writeSupportRecord(f.cmd({}), did, "create", { rkey, record: listing });
  assert.deepEqual(JSON.parse(String(f.fake.calls.at(-1)!.init?.body)).record, listing);

  const count = f.fake.calls.length;
  for (const [collection, input] of [
    ["com.regencommons.weave.supportListing", { rkey, record: listing }],
    ["org.hypercerts.collection", { rkey, record: place }],
    ["app.certified.location", { rkey: "not-a-key", record: place }],
    ["org.hypercerts.collection", { rkey, record: [project] }],
  ] as const) await assert.rejects(f.auth.createOwnRecord(f.cmd({}), did, collection as never, input), /invalid_own_repository_request/);
  assert.equal(await f.auth.createOwnRecord(f.cmd({}), otherDid, "org.hypercerts.collection", { rkey, record: project }), null);
  f.fake.actor = { did, sessionId: "another-session" };
  assert.equal(await f.auth.createOwnRecord(f.cmd({}), did, "org.hypercerts.collection", { rkey, record: project }), null);
  assert.equal(f.fake.calls.length, count, "a refused write never reaches the PDS");
});

test("a publish-initiative grant is refused unless Certified returns exactly its scopes", async () => {
  const read = `rpc:${membership}?aud=${cgs.replace("#", "%23")}`;
  const project = "repo:org.hypercerts.collection?action=create", place = "repo:app.certified.location?action=create";
  const support = "repo:com.regencommons.weave.supportListing?action=create";
  for (const scope of [
    `atproto ${read} ${project} ${support}`,
    `atproto ${read} ${project} ${place}`,
    `atproto ${read} repo:org.hypercerts.collection ${place} ${support}`,
    `atproto ${read} ${project} ${place} ${support} repo:com.regencommons.weave.supportListing?action=delete`,
    `atproto ${read} ${project} ${place} ${support} repo:*`,
  ]) {
    const f = await fixture();
    const started = await f.start("publish-initiative");
    f.fake.issuedScope = scope;
    assert.equal(projectStatus(await f.auth.callback(f.oauth(binding(started)))), "failed", scope);
    await assert.rejects(f.auth.assertGrant(f.cmd({}), did, [ownRepositoryMethods.projectCreate]), /project_consent_required/);
  }
  // An earlier action's grant never comes back carrying the new collections.
  const f = await fixture();
  const started = await f.start("publish-support");
  f.fake.issuedScope = `${requested(membership, create)} ${support} ${project}`;
  assert.equal(projectStatus(await f.auth.callback(f.oauth(binding(started)))), "failed");
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

test("only the read-only grant lasts the session; every grant that can write still ends within the hour", async () => {
  const day = 24 * 60 * 60;
  assert.equal(grantLifetime("membership"), 30 * day);
  for (const action of ["workspace-members", "create-project", "add-member", "publish-support", "withdraw-support", "publish-initiative", "unknown"])
    assert.equal(grantLifetime(action), 3600, action);

  const f = await fixture();
  const before = Date.now();
  assert.equal((await f.approve("membership")).status, 200);
  const read = [...f.rows.entries()].find(([key]) => key.startsWith("grant/"))!;
  assert.ok(read[1].ttl > 30 * day - 60 && read[1].ttl <= 30 * day, "the read grant is kept for as long as a session can last");
  const readExpiry = record(read[1].value).expiresAt as number;
  assert.ok(readExpiry >= before + 30 * day * 1000 - 1000 && readExpiry <= Date.now() + 30 * day * 1000);
  await f.auth.assertGrant(f.cmd({}), did, [membership]);
  // It belongs to one Weave session: the same person in another session has none.
  f.fake.actor = { did, sessionId: "another-session" };
  await assert.rejects(f.auth.assertGrant(f.cmd({}), did, [membership]), /project_consent_required/);
  f.fake.actor = { did, sessionId: "weave-session" };

  f.fake.issuedScope = requested(membership, register, create);
  assert.equal((await f.approve("create-project")).status, 200);
  const grants = [...f.rows.entries()].filter(([key]) => key.startsWith("grant/"));
  assert.equal(grants.length, 2);
  const write = grants.find(([key]) => key !== read[0])!;
  assert.ok(write[1].ttl > 3540 && write[1].ttl <= 3600, "a grant that can write is asked for again after an hour");

  // A write grant whose record claims a longer life is not honoured, even inside the store's own limit.
  f.rows.set(write[0], { ...write[1], value: { ...record(write[1].value), expiresAt: Date.now() + 2 * 3600 * 1000 } });
  await assert.rejects(f.auth.assertGrant(f.cmd({}), did, [register]));
  // And a read grant past the session's limit is refused the same way.
  f.rows.set(read[0], { ...read[1], value: { ...record(read[1].value), expiresAt: Date.now() + 31 * day * 1000 } });
  await assert.rejects(f.auth.assertGrant(f.cmd({}), did, [membership]));
});

test("time ends a write grant within the hour and leaves the read grant; sign-out ends both", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.UTC(2026, 10, 22) });
  const f = await fixture();
  assert.equal((await f.approve("membership")).status, 200);
  f.fake.issuedScope = requested(membership, register, create);
  assert.equal((await f.approve("create-project")).status, 200);
  await f.auth.assertGrant(f.cmd({}), did, [register]);
  t.mock.timers.tick(61 * 60 * 1000);
  await assert.rejects(f.auth.assertGrant(f.cmd({}), did, [register]), /project_consent_required/, "61 minutes on, creating a project asks again");
  await assert.rejects(f.auth.assertGrant(f.cmd({}), did, [membership, register, create]), /project_consent_required/);
  await f.auth.assertGrant(f.cmd({}), did, [membership]);
  t.mock.timers.tick(29 * 24 * 60 * 60 * 1000);
  await f.auth.assertGrant(f.cmd({}), did, [membership]);
  // Signed out, or with a session Weave no longer accepts, nobody is acting: the grant cannot be used.
  f.fake.actor = null;
  await assert.rejects(f.auth.assertGrant(f.cmd({}), did, [membership]), /project_consent_required/);
  f.fake.actor = { did, sessionId: "weave-session" };
  t.mock.timers.tick(2 * 24 * 60 * 60 * 1000);
  await assert.rejects(f.auth.assertGrant(f.cmd({}), did, [membership]), /project_consent_required/, "past 30 days it has ended on its own");
});

test("signing out deletes that session's grants, and only those; a failure there is passed over", async () => {
  const f = await fixture();
  assert.equal((await f.approve("membership")).status, 200);
  f.fake.issuedScope = requested(membership, register, create);
  assert.equal((await f.approve("create-project")).status, 200);
  // The same person, signed in somewhere else, holds a grant of their own.
  f.fake.actor = { did, sessionId: "another-session" };
  f.fake.issuedScope = "";
  assert.equal((await f.approve("membership")).status, 200);
  const grants = () => [...f.rows.keys()].filter(key => key.startsWith("grant/")).length;
  assert.equal(grants(), 3);

  f.fake.actor = { did, sessionId: "weave-session" };
  assert.equal(await f.auth.forget(f.cmd({})), 7, "every action's grant is asked for, since a session's grants cannot be listed");
  assert.equal(grants(), 1, "the tokens and the key they are bound to are gone from the store");
  await assert.rejects(f.auth.assertGrant(f.cmd({}), did, [membership]), /project_consent_required/);
  await assert.rejects(f.auth.assertGrant(f.cmd({}), did, [register]), /project_consent_required/);
  f.fake.actor = { did, sessionId: "another-session" };
  await f.auth.assertGrant(f.cmd({}), did, [membership]);
  assert.equal(await f.auth.forget(f.cmd({})), 7);
  assert.equal(grants(), 0);
  assert.equal(await f.auth.forget(f.cmd({})), 7, "forgetting twice is harmless");

  // A consent that came back from Certified but was not finished is a receipt holding the same tokens.
  // Sign-out removes it first, so a finish from another tab cannot make a grant of it afterwards.
  f.fake.actor = { did, sessionId: "weave-session" };
  const returned = await f.auth.callback(f.oauth(binding(await f.start("membership"))));
  assert.equal(projectStatus(returned), "ready");
  const receipts = () => [...f.rows.keys()].filter(key => key.startsWith("receipt/")).length;
  assert.equal(receipts(), 1);
  assert.equal(await f.auth.forget(f.cmd({}, binding(returned))), 7);
  assert.equal(receipts(), 0);
  assert.equal((await f.auth.consent(f.cmd({ action: "finish" }, binding(returned)))).status, 403, "the unfinished consent cannot be finished after sign-out");
  assert.equal(grants(), 0);

  // Nobody can be verified, or the check itself fails: nothing is touched and nothing is thrown.
  f.fake.actor = null;
  assert.equal(await f.auth.forget(f.cmd({})), 0);
  const broken = await createCertifiedProjectAuth({ origin, cgsOrigin, signingKeys: [key], store: memoryStore().store,
    allowsDid: () => true, resolveActor: async () => { throw new Error("session check failed"); } });
  assert.equal(await broken.forget(f.cmd({})), 0);
  // A removed tester's grants are deleted too: leaving does not depend on still being allowed in.
  const removedTester = await fixture();
  assert.equal((await removedTester.approve("membership")).status, 200);
  removedTester.fake.allowed = false;
  assert.equal(await removedTester.auth.forget(removedTester.cmd({})), 7);
  assert.equal([...removedTester.rows.keys()].filter(key => key.startsWith("grant/")).length, 0);

  // A store that fails for some grants, or a time limit that has passed, stops nothing else.
  const flaky = memoryStore();
  let locks = 0;
  const failing = await createCertifiedProjectAuth({ origin, cgsOrigin, signingKeys: [key], allowsDid: () => true,
    resolveActor: async () => ({ did, sessionId: "weave-session" }),
    store: { ...flaky.store, withLock: async (id, run, signal) => { if (++locks % 2) throw new Error("database busy"); return flaky.store.withLock(id, run, signal); } } });
  assert.equal(await failing.forget(f.cmd({})), 3, "the removals that could run did");
  assert.equal(locks, 7);
  assert.equal(await failing.forget(f.cmd({}), AbortSignal.abort()), 0, "past its limit it starts nothing");
});

test("the store itself keeps a grant no longer than its action allows", async () => {
  // Validation comes before any query, so a store with no database shows which writes it would send.
  const reached = Error("reached the database");
  const sql = (() => { throw reached; }) as never;
  const store = projectOAuthStore(sql, createCipher({ active: "k", keys: { k: randomBytes(32) }, lookup: randomBytes(32) }, origin));
  const day = 24 * 60 * 60;
  for (const [kind, payload, ttl] of [
    ["grant", { action: "create-project" }, 3601], ["grant", { action: "workspace-members" }, day], ["grant", {}, 3601], ["grant", null, 3601],
    ["grant", { action: "membership" }, 30 * day + 1], ["state", {}, 601], ["receipt", { action: "membership" }, 601], ["grant", { action: "membership" }, 0],
  ] as const)
    await assert.rejects(store.put(kind, "id", payload, ttl), /invalid_project_oauth_ttl/, `${kind} ${JSON.stringify(payload)} ${ttl}`);
  for (const [kind, payload, ttl] of [
    ["grant", { action: "membership" }, 30 * day], ["grant", { action: "create-project" }, 3600], ["state", {}, 600], ["receipt", { action: "membership" }, 600],
  ] as const)
    await assert.rejects(store.put(kind, "id", payload, ttl), (error) => error === reached, `${kind} ${ttl} passes the limit`);
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

test("only the read-only grant lets Certified skip its screen; every grant that can write asks each time", async () => {
  const f = await fixture();
  const writes = ["workspace-members", "create-project", "add-member", "publish-support", "withdraw-support"] as const;
  for (const action of ["membership", ...writes]) await f.start(action);
  assert.deepEqual(f.fake.prompts, [undefined, ...writes.map(() => "consent")]);
  assert.equal(consentPrompt("membership"), undefined);
  for (const action of [...writes, "finish", "unknown"]) assert.equal(consentPrompt(action), "consent");
});

test("a read approved without a screen still activates only for the signed-in DID and the exact read scope", async () => {
  for (const mode of ["wrong-did", "broad", "write"] as const) {
    const f = await fixture();
    const pending = binding(await f.start("membership"));
    if (mode === "wrong-did") f.fake.issuedDid = otherDid;
    if (mode === "broad") f.fake.issuedScope = f.fake.scope + " transition:generic";
    if (mode === "write") f.fake.issuedScope = requested(membership, register, create);
    assert.equal(projectStatus(await f.auth.callback(f.oauth(pending))), "failed");
    await assert.rejects(f.auth.assertGrant(f.cmd({}), did, [membership]), /project_consent_required/);
  }
  const f = await fixture();
  assert.equal((record(await (await f.approve("membership")).json())).granted, "membership");
  await f.auth.assertGrant(f.cmd({}), did, [membership]);
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

test("every client shares one set of Certified caches, and a start readies Certified while the session is checked", async () => {
  const made: NodeOAuthClientOptions[] = [], order: string[] = [];
  let releaseActor!: () => void;
  const actorGate = new Promise<void>(resolve => { releaseActor = resolve; });
  const f = await fixture(false, {
    made: options => made.push(options), order, actorGate,
    resolve: async () => ({ metadata: { issuer, pushed_authorization_request_endpoint: `${issuer}/oauth/par` } }),
    primeFetch: async () => {
      order.push("prime");
      return new Response(null, { status: 400, headers: { "DPoP-Nonce": "n".repeat(43) } });
    },
  });
  const pending = f.auth.consent(f.cmd({ action: "membership" }));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(order, ["actor", "prime"], "readying starts before the session check ends");
  releaseActor();
  const started = await pending;
  assert.equal(started.status, 200);
  assert.deepEqual(order, ["actor", "prime", "authorize"]);
  assert.match(started.headers.get("server-timing") ?? "", /^actor;dur=\d+, prime;dur=\d+, par;dur=\d+$/u);

  // The callback and a later attempt use the same caches, so the nonce readied above is still there.
  const back = await f.auth.callback(f.oauth(binding(started)));
  assert.equal(projectStatus(back), "ready");
  assert.match(back.headers.get("server-timing") ?? "", /^exchange;dur=\d+, state;dur=\d+$/u);
  await f.start("create-project");
  assert.ok(made.length >= 4);
  for (const options of made) {
    assert.equal(options.dpopNonceCache, made[0]!.dpopNonceCache);
    assert.equal(options.authorizationServerMetadataCache, made[0]!.authorizationServerMetadataCache);
    assert.equal(options.protectedResourceMetadataCache, made[0]!.protectedResourceMetadataCache);
  }
  assert.equal(await made[0]!.dpopNonceCache!.get(issuer), "n".repeat(43));
  assert.equal(order.filter(step => step === "prime").length, 1, "a cached nonce is not asked for again");
  assert.equal(await f.auth.prime(), "ready");
});

test("readying Certified never decides a consent: refused sessions, finishes and failures answer as before", async () => {
  let primes = 0;
  const f = await fixture(false, {
    resolve: async () => { throw Error("discovery-down"); },
    primeFetch: async () => { primes++; return new Response(null, { status: 400 }); },
  });
  // Certified's metadata cannot be read: the start still goes ahead, and its PAR fetches what it needs.
  assert.equal((await f.auth.consent(f.cmd({ action: "membership" }))).status, 200);
  assert.equal(await f.auth.prime(), "failed");
  // No session: refused, with timing and nothing started.
  f.fake.actor = null;
  const refused = await f.auth.consent(f.cmd({ action: "membership" }));
  assert.equal(refused.status, 401);
  assert.deepEqual(await refused.json(), { error: "sign_in_required" });
  assert.match(refused.headers.get("server-timing") ?? "", /^actor;dur=\d+$/u);
  // A finish readies nothing.
  f.fake.actor = { did, sessionId: "weave-session" };
  const resolvedBefore = f.fake.actorsResolved;
  assert.equal((await f.auth.consent(f.cmd({ action: "finish" }))).status, 403);
  assert.equal(f.fake.actorsResolved, resolvedBefore + 1);
  assert.equal(primes, 0, "nothing is sent to a PAR endpoint the metadata never named");
});
