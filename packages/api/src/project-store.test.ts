import assert from "node:assert/strict";
import { test } from "node:test";
import { projectDatabase } from "./project-store.ts";

const host = "aws-0-us-east-1.pooler.supabase.com";
const database = `postgres://fixture:local-only@${host}:5432/postgres`;

test("explicit transaction mode selects Supabase's transaction endpoint and keeps certificate verification", async () => {
  const sql = projectDatabase(database, "fixture-ca", "supabase-transaction");
  try {
    assert.deepEqual(sql.options.host, [host]);
    assert.deepEqual(sql.options.port, [6543]);
    assert.equal(sql.options.max_pipeline, 1);
    assert.equal(sql.options.prepare, false);
    assert.deepEqual(sql.options.ssl, { rejectUnauthorized: true, ca: "fixture-ca", servername: host });
  } finally { await sql.end({ timeout: 1 }); }
});

test("an existing transaction endpoint is supported without selecting a different host", async () => {
  const sql = projectDatabase(database.replace(":5432/", ":6543/"), undefined, "supabase-transaction");
  try {
    assert.deepEqual(sql.options.port, [6543]);
    assert.deepEqual(sql.options.host, [host]);
  } finally { await sql.end({ timeout: 1 }); }
});

test("without the opt-in, configured hosted and local endpoints retain their ports", async () => {
  const hosted = projectDatabase(database, "fixture-ca");
  const local = projectDatabase("postgres://fixture@127.0.0.1:55445/weave_pool_test");
  try {
    assert.deepEqual(hosted.options.port, [5432]);
    assert.deepEqual(local.options.port, [55445]);
    assert.equal(local.options.ssl, false);
  } finally { await Promise.all([hosted.end({ timeout: 1 }), local.end({ timeout: 1 })]); }
});

test("transaction mode rejects other endpoints, unsupported ports and unknown modes before connecting", () => {
  for (const url of [
    "postgres://fixture@127.0.0.1:5432/postgres",
    "postgres://fixture@db.fixture.supabase.co:5432/postgres",
    "postgres://fixture@pooler.supabase.com.example.test:5432/postgres",
    database.replace(":5432/", ":6432/"),
  ]) assert.throws(() => projectDatabase(url, undefined, "supabase-transaction"), /invalid_project_transaction_pooler/);
  for (const mode of ["", "transaction", "session"])
    assert.throws(() => projectDatabase(database, undefined, mode), /invalid_project_database_pool_mode/);
  assert.throws(() => projectDatabase(`${database}?sslmode=disable`, undefined, "supabase-transaction"),
    /invalid_project_database/);
});
