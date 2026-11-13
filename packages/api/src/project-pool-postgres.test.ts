import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import postgres from "postgres";
import { projectDatabase } from "./project-store.ts";

const database = process.env.WEAVE_PROJECT_POOL_TEST_DATABASE_URL;
let admin: postgres.Sql | undefined;
let workerUrl: string;

before(async () => {
  if (!database) return;
  const url = new URL(database);
  if (url.hostname !== "127.0.0.1" || url.pathname !== "/weave_pool_test")
    throw Error("dedicated_loopback_pool_test_database_required");
  admin = postgres(database, { max: 1, onnotice: () => {} });
  await admin.unsafe(`do $$ begin
    if not exists(select 1 from pg_roles where rolname='weave_pool_fixture') then
      create role weave_pool_fixture login nosuperuser nocreatedb nocreaterole nobypassrls connection limit 8;
    end if;
  end $$`);
  url.username = "weave_pool_fixture";
  url.password = "";
  workerUrl = url.href;
});

after(async () => { await admin?.end({ timeout: 1 }); });

test("five warm workers complete concurrent work within an eight-connection role budget", {
  skip: !database, timeout: 15000,
}, async () => {
  const workers = Array.from({ length: 5 }, () => projectDatabase(workerUrl));
  try {
    const operations = workers.flatMap((sql, worker) =>
      Array.from({ length: 3 }, (_, query) => ({ sql, value: worker * 3 + query })));
    const results = await Promise.allSettled(operations.map(({ sql, value }) =>
      sql`select ${value}::integer as value, pg_sleep(0.05)`));
    const failures = results.flatMap(result => result.status === "rejected"
      ? [result.reason instanceof postgres.PostgresError ? result.reason.code : "unexpected_error"] : []);
    assert.deepEqual(failures, []);
    for (const [index, result] of results.entries()) {
      assert.equal(result.status, "fulfilled");
      if (result.status === "fulfilled") assert.equal(result.value[0]!.value, operations[index]!.value);
    }
    const [connections] = await admin!`select count(*)::integer as count from pg_stat_activity
      where usename='weave_pool_fixture'`;
    assert.ok(connections!.count <= 8);
  } finally {
    await Promise.all(workers.map(sql => sql.end({ timeout: 1 })));
  }
});

test("the one-query pipeline supports committed transactions and rolls failures back", {
  skip: !database, timeout: 15000,
}, async () => {
  const sql = projectDatabase(workerUrl);
  try {
    await sql`create temporary table pool_transaction_fixture (value integer not null)`;
    await sql.begin(async transaction => {
      await transaction`insert into pool_transaction_fixture values (1)`;
      const [row] = await transaction`select sum(value)::integer as total from pool_transaction_fixture`;
      assert.equal(row!.total, 1);
    });
    await assert.rejects(sql.begin(async transaction => {
      await transaction`insert into pool_transaction_fixture values (2)`;
      throw Error("fixture_rollback");
    }), /fixture_rollback/);
    const [row] = await sql`select sum(value)::integer as total from pool_transaction_fixture`;
    assert.equal(row!.total, 1);
  } finally { await sql.end({ timeout: 1 }); }
});
