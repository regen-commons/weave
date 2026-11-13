import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { after, before, test } from "node:test";
import postgres from "postgres";
import { createCipher } from "./certified/crypto.ts";
import { projectOAuthStore, type ProjectOAuthStore } from "./certified-project-auth.ts";
import { projectDatabase } from "./project-store.ts";

const database = process.env.WEAVE_PROJECT_LOCK_TEST_DATABASE_URL;
let admin: postgres.Sql;
const clients: postgres.Sql[] = [];
const stores: ProjectOAuthStore[] = [];

before(async () => {
  if (!database) return;
  const url = new URL(database);
  if (url.hostname !== "127.0.0.1" || url.pathname !== "/weave_project_lock_test")
    throw Error("dedicated_loopback_project_lock_test_database_required");
  admin = postgres(database, { max: 1, onnotice: () => {} });
  await admin`drop schema if exists weave_project_oauth cascade`;
  await admin.unsafe(await readFile(new URL("../../../supabase/candidates/weave-project-oauth.sql", import.meta.url), "utf8"));
  await admin.unsafe(`do $$ begin
    if not exists(select 1 from pg_roles where rolname='weave_grant_lock_fixture') then
      create role weave_grant_lock_fixture login nosuperuser nocreatedb nocreaterole nobypassrls connection limit 8;
    end if;
  end $$`);
  await admin`grant weave_project_oauth_runtime to weave_grant_lock_fixture`;
  url.username = "weave_grant_lock_fixture";
  url.password = "";
  const cipher = createCipher({ active: "fixture", keys: { fixture: randomBytes(32) }, lookup: randomBytes(32) }, "https://weave.example.test");
  for (let i = 0; i < 6; i++) {
    const client = projectDatabase(url.href);
    clients.push(client);
    stores.push(projectOAuthStore(client, cipher));
  }
});
after(async () => { await Promise.all(clients.map(client => client.end({ timeout: 1 }))); await admin?.end({ timeout: 1 }); });

test("contending grant users wait beyond two seconds without blocked SQL waiters or replaying work", {
  skip: !database, timeout: 20000,
}, async () => {
  let started!: () => void;
  const entered = new Promise<void>(resolve => { started = resolve; });
  let active = 0, calls = 0;
  const advance = async (locked: Parameters<Parameters<ProjectOAuthStore["withLock"]>[1]>[0]) => {
    active++; calls++;
    assert.equal(active, 1);
    try {
      const prior = await locked.find("grant", "revision") as { revision: number } | undefined;
      const revision = (prior?.revision ?? 0) + 1;
      await locked.put("grant", "revision", { revision }, 60);
      await delay(25);
      return revision;
    } finally { active--; }
  };
  const holder = stores[0]!.withLock("shared-grant", async locked => {
    started(); await delay(2500); return advance(locked);
  });
  await entered;
  const waiting = stores.slice(1, 5).map(store => store.withLock("shared-grant", advance));
  const pending = Promise.allSettled([holder, ...waiting]);
  let failure: unknown;
  try {
    await delay(150);
    const [row] = await admin`select count(*) filter(where l.granted)::integer as held,
      count(*) filter(where not l.granted)::integer as blocked from pg_locks l
      join pg_stat_activity a on a.pid=l.pid where a.usename='weave_grant_lock_fixture' and l.locktype='advisory'`;
    assert.equal(row!.held, 1);
    assert.equal(row!.blocked, 0);
    assert.equal(await stores[5]!.withLock("unrelated-grant", async () => "available"), "available");
  } catch (error) { failure = error; }
  const results = await pending;
  const rejected = results.find(result => result.status === "rejected");
  if (rejected?.status === "rejected") throw rejected.reason;
  if (failure) throw failure;
  assert.deepEqual(results.map(result => result.status === "fulfilled" ? result.value : null).toSorted(), [1, 2, 3, 4, 5]);
  assert.equal(calls, 5);
});

test("a canceled lock waiter never starts protected work and the lock remains reusable", {
  skip: !database, timeout: 5000,
}, async () => {
  let release!: () => void, started!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const entered = new Promise<void>(resolve => { started = resolve; });
  const holder = stores[0]!.withLock("abort-grant", async () => { started(); await held; });
  await entered;
  let calls = 0;
  try {
    await assert.rejects(stores[1]!.withLock("abort-grant", async () => { calls++; }, AbortSignal.timeout(60)),
      error => error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name));
    assert.equal(calls, 0);
  } finally { release(); await holder; }
  assert.equal(await stores[1]!.withLock("abort-grant", async () => "reused"), "reused");
});

test("a canceled local-pool waiter does no late work when the connection becomes available", {
  skip: !database, timeout: 5000,
}, async () => {
  const reserved = await clients[0]!.reserve();
  let calls = 0;
  const rejected = assert.rejects(stores[0]!.withLock("late-lease", async () => { calls++; }, AbortSignal.timeout(30)),
    error => error instanceof Error && error.name === "TimeoutError");
  await delay(100);
  reserved.release();
  await rejected;
  assert.equal(calls, 0);
});

test("the pool queue ceiling removes its job and callback failures are never retried", {
  skip: !database, timeout: 20000,
}, async () => {
  const reserved = await clients[0]!.reserve();
  let calls = 0;
  try {
    await assert.rejects(stores[0]!.withLock("queue-ceiling", async () => { calls++; }), { code: "QUEUE_TIMEOUT" });
  } finally { reserved.release(); }
  await clients[0]!`select 1`;
  assert.equal(calls, 0);
  await assert.rejects(stores[0]!.withLock("callback-failure", async locked => {
    calls++;
    await locked.put("grant", "rolled-back", { revision: 1 }, 60);
    throw Object.assign(Error("synthetic callback failure"), { code: "QUEUE_TIMEOUT" });
  }), /synthetic callback failure/);
  assert.equal(calls, 1);
  assert.equal(await stores[0]!.find("grant", "rolled-back"), undefined);
  assert.equal(await stores[0]!.withLock("callback-failure", async () => "reused"), "reused");
});
