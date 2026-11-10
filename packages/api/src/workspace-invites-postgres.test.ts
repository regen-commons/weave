import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import postgres from "postgres";

const database = process.env.WEAVE_INVITES_TEST_DATABASE_URL;
let sql: postgres.Sql;
let workspaceId: string;
const id = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const did = (n: number) => `did:plc:invitefixture${n}`;
const groupDid = "did:plc:invitegroup";
const projectUri = `at://${groupDid}/org.hypercerts.collection/project`;
const proof = {projectUri,repositoryDid:groupDid,groupDid,cid:"bafyfixture",actorRole:"owner"};
const candidate = (name: string) => readFile(new URL(`../../../supabase/candidates/${name}.sql`,import.meta.url),"utf8");
const tokenHash = () => createHash("sha256").update(randomBytes(32)).digest("hex");
const integration = (name: string, run: () => Promise<void>) => test(name,{skip:!database},run);

async function call(actor: number,action: string,data: Record<string,unknown>,actorDid=did(actor),session=id(actor+10)) {
  return sql.begin(async tx => {
    await tx`set local role weave_workspace_runtime`;
    const [row] = await tx`select weave_workspace.invitation(${id(actor)},${session},${actorDid},${action},${tx.json(data)}) as result`;
    return row!.result;
  });
}
async function command(actor: number,action: string,data: Record<string,unknown>) {
  return sql.begin(async tx => {
    await tx`set local role weave_workspace_runtime`;
    const [row] = await tx`select weave_workspace.command(${id(actor)},${id(actor+10)},${did(actor)},${action},${tx.json(data)}) as result`;
    return row!.result;
  });
}
before(async () => {
  if (!database) return;
  const url = new URL(database);
  if (url.hostname !== "127.0.0.1" || url.pathname !== "/weave_workspace_invites_test") throw Error("dedicated_loopback_invites_database_required");
  sql = postgres(database,{max:4,onnotice:()=>{}});
  await sql.unsafe("drop schema if exists weave_workspace,weave,auth cascade");
  await sql.unsafe(`
    do $$ begin
      if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
      if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
      if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
    end $$;
    create schema auth;
    create table auth.users(id uuid primary key,is_anonymous boolean default false,banned_until timestamptz);
    create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
    create table auth.identities(user_id uuid,provider text,provider_id text);
    create schema weave;
    create table weave.initiatives(id uuid primary key,owner_id uuid,revision integer);
  `);
  await sql.unsafe(await candidate("weave-project-workspaces"));
  await sql.unsafe(await candidate("weave-workspace-invites"));
  for (const n of [1,2,3]) {
    await sql`insert into auth.users(id) values(${id(n)})`;
    await sql`insert into auth.sessions(id,user_id) values(${id(n+10)},${id(n)})`;
    await sql`insert into auth.identities values(${id(n)},'custom:certified',${`https://certified.one|${did(n)}`})`;
  }
  workspaceId = (await command(1,"link",proof)).workspaceId;
});
after(async () => { if (sql) await sql.end(); });

integration("invitation functions require the exact live session and are inaccessible from public Data API roles",async () => {
  await assert.rejects(call(1,"list",{...proof,workspaceId},did(2)),{code:"PT401"});
  await assert.rejects(call(1,"list",{...proof,workspaceId},did(1),id(12)),{code:"PT401"});
  for (const role of ["anon","authenticated","service_role"]) await assert.rejects(sql.begin(async tx => {
    await tx.unsafe(`set local role ${role}`);
    await tx`select weave_workspace.invitation(${id(1)},${id(11)},${did(1)},'claim','{}'::jsonb)`;
  }),{code:"42501"});
  await assert.rejects(sql.begin(async tx => {
    await tx`set local role weave_workspace_runtime`;
    await tx`select token_hash from weave_workspace.pending_invites`;
  }),{code:"42501"});
});

integration("claims are non-enumerating, bind one DID idempotently, and create no group or workspace grant",async () => {
  const hash = tokenHash();
  const created = await call(1,"create",{...proof,workspaceId,tokenHash:hash});
  const claimed = await call(2,"claim",{tokenHash:hash});
  assert.deepEqual(await call(2,"claim",{tokenHash:hash}),claimed);
  assert.deepEqual(Object.keys(claimed).sort(),["expiresAt","inviteId","status"]);
  await assert.rejects(call(3,"claim",{tokenHash:hash}),{code:"PT404"});
  await assert.rejects(call(3,"claim",{tokenHash:tokenHash()}),{code:"PT404"});
  assert.deepEqual(await command(2,"lookup",{...proof,actorRole:"member"}),{status:"access_required"});
  const [grants] = await sql`select count(*)::integer as count from weave_workspace.access_grants where user_id=${id(2)}`;
  assert.equal(grants!.count,0);
  const list = await call(1,"list",{...proof,workspaceId});
  const found = list.invitations.find((invite: {inviteId:string}) => invite.inviteId === created.inviteId);
  assert.equal(found.claimedDid,did(2));
  assert.ok(!JSON.stringify(list).includes(hash));
  await assert.rejects(call(2,"list",{...proof,workspaceId,actorRole:"member"}),{code:"PT403"});
});

integration("approval delegates grant validation atomically and replay cannot restore revoked access",async () => {
  const hash = tokenHash();
  const created = await call(1,"create",{...proof,workspaceId,tokenHash:hash});
  await call(2,"claim",{tokenHash:hash});
  const approval = {...proof,workspaceId,inviteId:created.inviteId,recipientDid:did(2),accessRole:"viewer",
    recipientRole:"member",observedAt:new Date().toISOString()};
  await assert.rejects(call(1,"approve",{...approval,recipientDid:did(3)}),{code:"PT404"});
  await assert.rejects(call(1,"approve",{...approval,recipientRole:"absent"}),{code:"PT403"});
  await assert.rejects(call(1,"approve",{...approval,observedAt:new Date(Date.now()-120000).toISOString()}),{code:"PT409"});
  const [pending] = await sql`select approved_at from weave_workspace.pending_invites where id=${created.inviteId}`;
  assert.equal(pending!.approved_at,null);
  assert.deepEqual(await call(1,"approve",approval),{status:"granted",inviteId:created.inviteId});
  assert.equal((await command(2,"lookup",{...proof,actorRole:"member"})).accessRole,"viewer");
  await command(1,"revoke_access",{...proof,workspaceId,recipientDid:did(2)});
  assert.deepEqual(await call(1,"approve",{...approval,accessRole:"admin",observedAt:new Date().toISOString()}),
    {status:"already_reviewed",inviteId:created.inviteId});
  assert.deepEqual(await command(2,"lookup",{...proof,actorRole:"member"}),{status:"access_required"});
});

integration("revoked and expired invitations cannot be claimed and expiry is exactly bounded to seven days",async () => {
  const hash = tokenHash();
  const created = await call(1,"create",{...proof,workspaceId,tokenHash:hash});
  const [row] = await sql`select expires_at-created_at as lifetime from weave_workspace.pending_invites where id=${created.inviteId}`;
  assert.equal(row!.lifetime,"7 days");
  await call(1,"revoke",{...proof,workspaceId,inviteId:created.inviteId});
  await assert.rejects(call(2,"claim",{tokenHash:hash}),{code:"PT404"});
  const expiredHash = tokenHash();
  const expired = await call(1,"create",{...proof,workspaceId,tokenHash:expiredHash});
  await sql`update weave_workspace.pending_invites set created_at=now()-interval '8 days',expires_at=now()-interval '1 day'
    where id=${expired.inviteId}`;
  await assert.rejects(call(2,"claim",{tokenHash:expiredHash}),{code:"PT404"});
});

integration("the active invitation quota serializes concurrent create calls",async () => {
  await sql`update weave_workspace.pending_invites set revoked_at=now()
    where workspace_id=${workspaceId} and approved_at is null`;
  for (let count=0;count<24;count++) await call(1,"create",{...proof,workspaceId,tokenHash:tokenHash()});
  const outcomes = await Promise.allSettled([1,2].map(() => call(1,"create",{...proof,workspaceId,tokenHash:tokenHash()})));
  assert.equal(outcomes.filter(outcome => outcome.status === "fulfilled").length,1);
  const rejected = outcomes.find(outcome => outcome.status === "rejected");
  assert.ok(rejected?.status === "rejected");
  assert.equal(rejected.reason.code,"PT429");
});

integration("a claim waiting across invitation expiry cannot use the statement's earlier timestamp",async()=>{
  const hash=tokenHash();
  // Clear quota independently of earlier examples.
  await sql`update weave_workspace.pending_invites set revoked_at=now() where workspace_id=${workspaceId} and approved_at is null`;
  const created=await call(1,"create",{...proof,workspaceId,tokenHash:hash});
  await sql`update weave_workspace.pending_invites set created_at=clock_timestamp()-interval '1 day',
    expires_at=clock_timestamp()+interval '150 milliseconds' where id=${created.inviteId}`;
  let locked!:()=>void,release!:()=>void;
  const hasLock=new Promise<void>(resolve=>{locked=resolve;}), releaseLock=new Promise<void>(resolve=>{release=resolve;});
  const transaction=sql.begin(async tx=>{await tx`select id from weave_workspace.pending_invites where id=${created.inviteId} for update`;locked();await releaseLock;});
  await hasLock;
  const claim=call(3,"claim",{tokenHash:hash});
  const rejection=assert.rejects(claim,{code:"PT404"});
  await delay(200);release();await transaction;await rejection;
});
