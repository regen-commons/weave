import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import postgres from "postgres";

const database = process.env.WEAVE_DISCOVERY_TEST_DATABASE_URL;
let sql: postgres.Sql;
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const did = (n: number) => `did:plc:discoveryfixture${n}`;
const group = "did:plc:discoverygroup";
const uri = (n: number, repository = group) => `at://${repository}/org.hypercerts.collection/project${n}`;
const candidate = (name: string) => readFile(new URL(`../../../supabase/candidates/${name}.sql`, import.meta.url), "utf8");

before(async () => {
  if (!database) return;
  const url = new URL(database);
  if (url.hostname !== "127.0.0.1" || url.pathname !== "/weave_project_discovery_test")
    throw Error("dedicated_loopback_discovery_test_database_required");
  sql = postgres(database, { max: 1, onnotice: () => {} });
  await sql.unsafe("drop schema if exists weave_workspace, weave, auth cascade");
  await sql.unsafe(`
    do $$ begin
      if not exists(select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
      if not exists(select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
      if not exists(select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
    end $$;
    create schema auth;
    create table auth.users(id uuid primary key, is_anonymous boolean default false, banned_until timestamptz);
    create table auth.sessions(id uuid primary key, user_id uuid, not_after timestamptz);
    create table auth.identities(user_id uuid, provider text, provider_id text);
    create schema weave;
    create table weave.initiatives(id uuid primary key, owner_id uuid, revision integer);
  `);
  await sql.unsafe(await candidate("weave-project-workspaces"));
  await sql.unsafe(await candidate("weave-project-discovery"));
  for (const n of [1, 2, 3]) {
    await sql`insert into auth.users(id) values(${id(n)})`;
    await sql`insert into auth.sessions(id,user_id) values(${id(n + 10)},${id(n)})`;
    await sql`insert into auth.identities values(${id(n)},'custom:certified',${`https://certified.one|${did(n)}`})`;
  }
});
after(async () => { if (sql) await sql.end(); });
const integration = (name: string, run: () => Promise<void>) => test(name, { skip: !database }, run);

async function read(actor: number, action: string, data: Record<string, unknown> = {}, actorDid = did(actor), session = id(actor + 10)) {
  return sql.begin(async tx => {
    await tx`set local role weave_workspace_runtime`;
    const [row] = await tx`select weave_workspace.discovery(${id(actor)},${session},${actorDid},${action},${tx.json(data)}) as result`;
    return row!.result;
  });
}

integration("discovery checks the exact live actor/session and denies all direct Data API roles", async () => {
  await assert.rejects(read(1, "list_workspaces", {}, did(2)), { code: "PT401" });
  await assert.rejects(read(1, "list_workspaces", {}, did(1), id(12)), { code: "PT401" });
  await sql`update auth.sessions set not_after = now() - interval '1 second' where id = ${id(13)}`;
  await assert.rejects(read(3, "list_workspaces"), { code: "PT401" });
  await sql`update auth.sessions set not_after = null where id = ${id(13)}`;
  await sql`update auth.users set banned_until = now() + interval '1 hour' where id = ${id(3)}`;
  await assert.rejects(read(3, "list_workspaces"), { code: "PT401" });
  await sql`update auth.users set banned_until = null where id = ${id(3)}`;
  for (const role of ["anon", "authenticated", "service_role"]) {
    await assert.rejects(sql.begin(async tx => {
      await tx.unsafe(`set local role ${role}`);
      await tx`select weave_workspace.discovery(${id(1)},${id(11)},${did(1)},'list_workspaces','{}'::jsonb)`;
    }), { code: "42501" });
  }
});

integration("workspace pages require active explicit grants or exact solo ownership and preserve keyset boundaries", async () => {
  for (let n = 100; n < 127; n++) {
    await sql`insert into weave_workspace.project_links(id,project_uri,repository_did,group_did,cid)
      values(${id(n)},${uri(n)},${group},${group},'bafyfixture')`;
    await sql`insert into weave_workspace.access_grants(workspace_id,user_id,member_did,access_role)
      values(${id(n)},${id(1)},${did(1)},'editor')`;
  }
  const first = await read(1, "list_workspaces");
  assert.equal(first.entries.length, 25);
  assert.equal(first.cursor, id(124));
  const second = await read(1, "list_workspaces", { cursor: first.cursor });
  assert.deepEqual(second.entries.map((entry: {workspaceId: string}) => entry.workspaceId), [id(125),id(126)]);
  assert.equal(second.cursor, undefined);
  assert.deepEqual((await read(2, "list_workspaces")).entries, []);
  await sql`update weave_workspace.access_grants set suspended_at = now(), suspension_reason = 'revoked'
    where workspace_id = ${id(100)}`;
  assert.equal((await read(1, "list_workspaces")).entries[0].workspaceId, id(101));
  await sql`update weave_workspace.access_grants set member_did = ${did(2)} where workspace_id = ${id(101)}`;
  assert.equal((await read(1, "list_workspaces")).entries[0].workspaceId, id(102));
  await sql`insert into weave.initiatives values(${id(200)},${id(2)},1)`;
  await sql`insert into weave_workspace.project_links(id,project_uri,repository_did,solo_initiative_id,cid)
    values(${id(200)},${uri(200,did(2))},${did(2)},${id(200)},'bafysolo')`;
  assert.deepEqual((await read(2, "list_workspaces")).entries, [{ workspaceId: id(200), projectUri: uri(200,did(2)),
    repositoryDid: did(2), kind: "personal", accessRole: "admin" }]);
  await assert.rejects(read(1, "list_workspaces", { cursor: "malformed" }), { code: "PT400" });
  await assert.rejects(read(1, "list_workspaces", { actorRole: "admin" }), { code: "PT400" });
});

integration("pending requests require group administration and omit private requester identity", async () => {
  await sql`insert into weave_workspace.setup_requests(id,project_uri,group_did,requester_id)
    values(${id(300)},${uri(300)},${group},${id(2)})`;
  await assert.rejects(read(1, "list_setup_requests", { groupDid: group, actorRole: "member" }), { code: "PT403" });
  const result = await read(1, "list_setup_requests", { groupDid: group, actorRole: "admin" });
  assert.equal(result.entries[0].requestId, id(300));
  assert.deepEqual(Object.keys(result.entries[0]).sort(), ["groupDid", "projectUri", "requestId", "requestedAt"]);
  assert.deepEqual((await read(1, "list_setup_requests", { groupDid: did(3), actorRole: "owner" })).entries, []);
  await sql`insert into weave_workspace.project_links(id,project_uri,repository_did,group_did,cid)
    values(${id(301)},${uri(300)},${group},${group},'bafyfixture')`;
  assert.deepEqual((await read(1, "list_setup_requests", { groupDid: group, actorRole: "owner" })).entries, []);
});
