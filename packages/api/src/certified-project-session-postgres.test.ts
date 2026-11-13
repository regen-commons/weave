import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import postgres from "postgres";
import { createCipher } from "./certified/crypto.ts";
import { projectOAuthStore } from "./certified-project-auth.ts";
import { projectDatabase } from "./project-store.ts";
import { createCertifiedProjectProvider } from "./certified-project-provider.ts";
import { withProjectAuthCleanup } from "./project-runtime.ts";
import { projectSdkFixture, sdkMembership } from "../test-fixtures/project-sdk.ts";

const database = process.env.WEAVE_PROJECT_SESSION_TEST_DATABASE_URL;
test("independent PostgreSQL-backed SDK clients refresh once then overlap ordinary requests", {
  skip: !database, timeout: 20000,
}, async t => {
  const url = new URL(database!);
  if (url.hostname !== "127.0.0.1" || url.pathname !== "/weave_project_session_test")
    throw Error("dedicated_loopback_project_session_test_database_required");
  const admin = postgres(database!, { max: 1, onnotice: () => {} }), clients: postgres.Sql[] = [];
  try {
    await admin`drop schema if exists weave_project_oauth cascade`;
    await admin.unsafe(await readFile(new URL("../../../supabase/candidates/weave-project-oauth.sql", import.meta.url), "utf8"));
    await admin.unsafe(`do $$ begin
      if not exists(select 1 from pg_roles where rolname='weave_sdk_session_fixture') then
        create role weave_sdk_session_fixture login nosuperuser nocreatedb nocreaterole nobypassrls connection limit 8;
      end if;
    end $$`);
    await admin`grant weave_project_oauth_runtime to weave_sdk_session_fixture`;
    url.username = "weave_sdk_session_fixture"; url.password = "";
    const cipher = createCipher({ active: "fixture", keys: { fixture: randomBytes(32) }, lookup: randomBytes(32) }, "https://weave.example.test");
    for (let i = 0; i < 5; i++) clients.push(projectDatabase(url.href));
    const stores = clients.map(client => projectOAuthStore(client, cipher));
    const f = await projectSdkFixture(t, stores[0]);
    const instances = [f.auth, ...await Promise.all(stores.slice(1).map(store => f.makeAuth(store)))];
    await f.expire(); f.control.onRefresh = async () => { await delay(100); };
    let arrived!: () => void, release!: () => void, arrivals = 0;
    const concurrent = new Promise<void>(resolve => { arrived = resolve; });
    const held = new Promise<void>(resolve => { release = resolve; });
    f.control.resource = async request => {
      assert.equal(request.headers.get("authorization"), "DPoP rotated-access-1");
      if (++arrivals === instances.length) arrived();
      await held;
      return Response.json({ groups: [] });
    };
    const pending = Promise.allSettled(instances.map(auth =>
      auth.proxyServiceRequest(f.command(), f.actor.did, sdkMembership, { method: "GET" })));
    let failure: unknown;
    try {
      await Promise.race([concurrent, delay(4000).then(() => { throw Error("ordinary SDK requests remained serialized"); })]);
      const [during] = await admin`select count(*)::integer as count from pg_stat_activity
        where usename='weave_sdk_session_fixture' and state='idle in transaction'`;
      assert.equal(during!.count, 0);
    } catch (error) { failure = error; }
    finally { release(); }
    const results = await pending;
    const rejected = results.find(result => result.status === "rejected");
    if (rejected?.status === "rejected") throw rejected.reason;
    if (failure) throw failure;
    for (const result of results) if (result.status === "fulfilled") assert.equal(result.value?.status, 200);
    assert.equal(f.control.refreshes, 1);
    assert.ok(f.control.peak > 1);
    assert.equal((await f.saved())!.session.tokenSet.refresh_token, "rotated-refresh-1");
    await f.expire();
    f.control.resource = null;
    const controller = new AbortController(), request = f.command();
    let consumed!: () => void, finish!: () => void;
    const consumedToken = new Promise<void>(resolve => { consumed = resolve; });
    const refreshHeld = new Promise<void>(resolve => { finish = resolve; });
    f.control.onRefresh = async refresh => { controller.abort(); consumed(); await refreshHeld; assert.equal(refresh.signal.aborted, false); };
    const provider = createCertifiedProjectProvider({
      groupServiceOrigin: "https://dev.groups.certified.app", groupPdsOrigin: "https://certified.one",
      serviceAuth: ({ actorDid, method, signal }) => f.auth.mintServiceAuth(request, actorDid, method, signal),
      serviceProxy: ({ actorDid, method, init, query, signal }) => f.auth.proxyServiceRequest(request, actorDid, method, { ...init, signal }, query),
    });
    let responded = false;
    const response = withProjectAuthCleanup(f.auth, request, () =>
      provider.getMembership(f.actor.did, "did:plc:bbbbbbbbbbbbbbbbbbbbbbbb", controller.signal))
      .then(value => { responded = true; return value; });
    await consumedToken;
    try { await delay(25); assert.equal(responded, false); }
    finally { finish(); }
    assert.deepEqual(await response, { ok: false, code: "unavailable" });
    assert.equal((await f.saved())!.session.tokenSet.refresh_token, "rotated-refresh-2");
    const [row] = await admin`select count(*)::integer as count from pg_stat_activity
      where usename='weave_sdk_session_fixture' and state='idle in transaction'`;
    assert.equal(row!.count, 0);
  } finally { await Promise.all(clients.map(client => client.end({ timeout: 1 }))); await admin.end({ timeout: 1 }); }
});
