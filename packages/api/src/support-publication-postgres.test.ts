import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import postgres from "postgres";

// Separate database: this suite must not reset a workspace suite's schemas during parallel node tests.
const database = process.env.WEAVE_SUPPORT_TEST_DATABASE_URL;
const baseline = process.env.WEAVE_SUPPORT_TEST_BASELINE;
let sql: postgres.Sql;
let serial = 10;
const uid = (n: number) => `41000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const sid = uid(2), owner = uid(1), viewer = uid(3), viewerSession = uid(4);
const did = "did:plc:aaaaaaaaaaaaaaaaaaaaaaaa", viewerDid = "did:plc:bbbbbbbbbbbbbbbbbbbbbbbb";
const groupDid = "did:plc:cccccccccccccccccccccccc";
const cid = "b" + "a".repeat(58);
const candidate = (name: string) => readFile(new URL(`../../../supabase/candidates/${name}.sql`, import.meta.url), "utf8");
before(async () => {
  if (!database) return;
  const url = new URL(database);
  if (url.hostname !== "127.0.0.1" || url.pathname !== "/weave_support_test" || !baseline)
    throw Error("dedicated_loopback_support_test_database_and_baseline_required");
  sql = postgres(database, { max: 4, onnotice: () => {} });
  await sql.unsafe("drop schema if exists weave_workspace,weave_auth,weave,auth,private,extensions cascade");
  await sql.unsafe(await readFile(new URL("../test-fixtures/weave-matching-postgres-setup.sql", import.meta.url), "utf8"));
  await sql`alter table auth.users add column email_confirmed_at timestamptz`;
  await sql.unsafe(await readFile(baseline, "utf8"));
  for (const name of ["certified-private-access", "weave-matching", "weave-project-workspaces", "weave-team-content", "weave-support-publication"])
    await sql.unsafe(await candidate(name));
  await sql`insert into auth.users(id) values(${owner}),(${viewer})`;
  await sql`insert into auth.sessions(id,user_id) values(${sid},${owner}),(${viewerSession},${viewer})`;
  await sql`insert into auth.identities values(${owner},'custom:certified',${`https://certified.one|${did}`}),
    (${viewer},'custom:certified',${`https://certified.one|${viewerDid}`})`;
});
after(async () => { if (sql) await sql.end(); });
const integration = (name: string, fn: () => Promise<void>) => test(name, { skip: !database, timeout: 30000 }, fn);
const reject = (call: Promise<unknown>, code: string) => assert.rejects(call, { code });
const value = { title: "A fictional place to meet", description: "Public details", capitalForms: ["social"], amount: null,
  timeframe: null, urgency: null, placeScope: "here", exchangeTerms: ["open"], purpose: "Private purpose",
  capacity: null, audience: null, status: "open" };
const document = (entry: string) => ({ version: 1, initiative: { name: "Fictional project", description: "Private workspace summary",
  locations: [], isGlobal: false, links: [], stage: null, lenses: [] as string[], themes: [], beneficiaries: [], languages: [] },
  needs: [{ id: entry, value }], offers: [], funding: { form: { workCountries: "", benefitCountries: "", applicantBaseCountry: "",
    registrationCountry: "", applicantType: "unknown", fundingInstruments: [], goalMin: "", goalMax: "", currency: "",
    usWorkStates: "", usBenefitStates: "" }, programAnswers: {} } });
interface Fixture { id: string; entry: string; group: boolean; doc: ReturnType<typeof document>; }
async function command(f: Fixture, action: string, data: Record<string, unknown> = {}, who = owner, session = sid,
  identity = did, role: string | null = f.group ? "owner" : null) {
  return sql.begin(async tx => {
    await tx`set local role weave_workspace_runtime`;
    const [row] = await tx`select weave_workspace.support_command(${who},${session},${identity},${f.id},${role},
      ${cid},${action},${JSON.stringify(data)}::text::jsonb) as result`;
    return row!.result;
  });
}
async function save(f: Fixture, expectedRevision: number, doc = f.doc) {
  return sql.begin(async tx => {
    if (f.group) {
      await tx`set local role weave_workspace_runtime`;
      const [row] = await tx`select weave_workspace.content_command(${owner},${sid},${did},${f.id},'owner',null,
        'team_save',${JSON.stringify({ expectedRevision, requestId: uid(++serial), document: doc })}::text::jsonb) as result`;
      return row!.result;
    }
    await tx`set local role authenticated`;
    await tx`select set_config('request.jwt.claims',${JSON.stringify({ sub: owner, session_id: sid, role: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 600 })},true)`;
    const [row] = await tx`select weave.save_initiative(${f.id},${expectedRevision},${uid(++serial)},${JSON.stringify(doc)}::text::jsonb) as result`;
    return row!.result;
  });
}
async function fixture(group: boolean): Promise<Fixture> {
  const entry = uid(++serial), id = uid(++serial), doc = document(entry);
  const f = { id, entry, group, doc };
  const repo = group ? groupDid : did;
  if (!group) await save(f, 0);
  // Synthetic verified link and explicit grant; setup authority is tested in the workspace suite.
  await sql`insert into weave_workspace.project_links(id,project_uri,repository_did,group_did,solo_initiative_id,cid,linked_by)
    values(${id},${`at://${repo}/org.hypercerts.collection/project-${serial}`},${repo},${group ? repo : null},
      ${group ? null : id},${cid},${owner})`;
  if (group) {
    await sql`insert into weave_workspace.access_grants(workspace_id,user_id,member_did,access_role,granted_by)
      values(${id},${owner},${did},'admin',${owner}),(${id},${viewer},${viewerDid},'viewer',${owner})`;
    await save(f, 0);
  }
  return f;
}
async function review(f: Fixture, expiresAt: string | null = null) {
  const [row] = await sql`select i.revision,e.matching_revision from weave.initiatives i join private.weave_matching_entries e
    on e.initiative_id=i.id where i.id=${f.id} and e.id=${f.entry} and e.kind='need'`;
  return command(f, "support_review", { kind: "need", entryId: f.entry, expectedRevision: row!.revision,
    expectedEntryRevision: Number(row!.matching_revision), expiresAt });
}
async function publish(f: Fixture, reviewed: { reviewId: string }, requestId = uid(++serial)) {
  const data = { requestId, reviewId: reviewed.reviewId, audience: "public-atproto", confirmPublic: true };
  const state = await command(f, "support_publish", data);
  return { state, data };
}
const checkpoint = (f: Fixture, operationId: string, event: string, extra: Record<string, unknown> = {}) =>
  command(f, "support_checkpoint", { kind: "need", entryId: f.entry, operationId, event, ...extra });
const current = async (f: Fixture) => (await command(f, "support_state")).listings[0];

for (const group of [false, true]) {
  integration(`PostgreSQL ${group ? "group" : "personal"}: exact consent, stable key, idempotence and monotonic public version`, async () => {
    const f = await fixture(group), reviewed = await review(f);
    assert.equal(reviewed.audience, "public-atproto");
    assert.equal(reviewed.record.expiresAt, undefined);
    assert.equal(reviewed.record.description, "Public details");
    assert.equal(reviewed.record.purpose, undefined);
    assert.equal(reviewed.record.initiative, undefined);
    assert.equal((await command(f, "support_state")).listings.length, 0, "review creates no publication");
    await reject(command(f, "support_publish", { requestId: uid(++serial), reviewId: reviewed.reviewId,
      audience: "weave-users", confirmPublic: true }), "PT400");
    const p = await publish(f, reviewed);
    assert.equal(p.state.status, "publish_pending");
    assert.match(p.state.rkey, /^[2-7a-j][2-7a-z]{12}$/);
    assert.deepEqual(await command(f, "support_publish", p.data), p.state);
    await reject(command(f, "support_publish", { ...p.data, confirmPublic: false }), "PT409");
    const claims = await Promise.all([checkpoint(f, p.state.operationId, "sending"), checkpoint(f, p.state.operationId, "sending")]);
    assert.equal(claims.filter(claim => claim.claimed === true).length, 1);
    await checkpoint(f, p.state.operationId, "published", { cid });
    await command(f, "support_withdraw", { kind: "need", entryId: f.entry, requestId: uid(++serial) });
    await checkpoint(f, p.state.operationId, "withdrawn");
    const replacementReview = await review(f), replacement = await publish(f, replacementReview);
    assert.equal(replacement.state.rkey, p.state.rkey);
    assert.equal(replacement.state.record.createdAt, p.state.record.createdAt);
    assert(Date.parse(replacement.state.record.updatedAt) > Date.parse(p.state.record.updatedAt));
    await reject(checkpoint(f, p.state.operationId, "withdrawn"), "PT409");
    await reject(command(f, "support_publish", p.data), "PT409");
    assert.equal((await current(f)).operationId, replacement.state.operationId);
  });
}

integration("PostgreSQL reviews reject stale saved or entry revisions and unclassified entries", async () => {
  const f = await fixture(true), reviewed = await review(f);
  const changed = structuredClone(f.doc); changed.needs[0]!.value.title = "Changed public title";
  await save(f, 1, changed);
  await reject(publish(f, reviewed), "PT409");
  await reject(command(f, "support_review", { kind: "need", entryId: f.entry, expectedRevision: 1,
    expectedEntryRevision: reviewed.expectedEntryRevision, expiresAt: null }), "PT409");
  changed.needs[0]!.value.capitalForms = [];
  await save(f, 2, changed);
  await reject(review(f), "PT409");
});

integration("PostgreSQL edit/close/delete and confirmed project unlisting queue withdrawal in the private save transaction", async () => {
  for (const change of ["edit", "close", "delete", "unlist"] as const) {
    const f = await fixture(true), { state } = await publish(f, await review(f));
    await checkpoint(f, state.operationId, "sending");
    await checkpoint(f, state.operationId, "published", { cid });
    const changed = structuredClone(f.doc);
    if (change === "edit") changed.needs[0]!.value.title = "Replacement remains private";
    if (change === "close") changed.needs[0]!.value.status = "met";
    if (change === "delete") changed.needs = [];
    if (change === "unlist") await command(f, "support_project_ineligible");
    else await save(f, 1, changed);
    const pending = await current(f);
    assert.equal(pending.status, "withdrawal_pending");
    assert.equal(pending.cid, cid);
    assert.equal(pending.record.title, "A fictional place to meet");
    assert.equal((await checkpoint(f, state.operationId, "withdrawn")).status, "withdrawn");
  }
});

integration("PostgreSQL external withdrawal preserves an independent matching share", async () => {
  const f = await fixture(true), { state } = await publish(f, await review(f));
  await checkpoint(f, state.operationId, "published", { cid });
  await sql`update weave.needs set matching_audience='weave_users',matching_withdrawn=false,
    matching_reviewed_revision=matching_revision,matching_reviewed_summary_revision=1,
    matching_expires_at=now()+interval '1 day' where initiative_id=${f.id} and id=${f.entry}`;
  const [before] = await sql`select value,matching_audience,matching_withdrawn,matching_revision from weave.needs where initiative_id=${f.id}`;
  await checkpoint(f, state.operationId, "external_withdrawn");
  const [after] = await sql`select value,matching_audience,matching_withdrawn,matching_revision from weave.needs where initiative_id=${f.id}`;
  assert.deepEqual(after, before);
});

integration("PostgreSQL learning types are reviewed publicly and changing them queues withdrawal", async () => {
  const f = await fixture(true);
  const learning = { ...f.doc, initiative: { ...f.doc.initiative, lenses: ["learning"] } };
  await save(f, 1, learning);
  const reviewed = await review(f);
  assert.deepEqual(reviewed.record.lenses, ["learning"]);
  const { state } = await publish(f, reviewed);
  await checkpoint(f, state.operationId, "sending");
  await checkpoint(f, state.operationId, "published", { cid });
  await save(f, 2, { ...learning, initiative: { ...learning.initiative, lenses: ["research"] } });
  const pending = await current(f);
  assert.equal(pending.status, "withdrawal_pending");
  assert.deepEqual(pending.record.lenses, ["learning"], "an edit never silently republishes a new type of work");
});

integration("PostgreSQL publication history returns bounded keyset pages including removed-entry requests", async () => {
  const f = await fixture(true), { state } = await publish(f, await review(f));
  const alphabet = "234567abcdefghijklmnopqrstuvwxyz";
  for (let n = 0; n < 101; n++) {
    const rkey = "3jui7kd54z" + alphabet[Math.floor(n / 1024)]! + alphabet[Math.floor(n / 32) % 32]! + alphabet[n % 32]!;
    await sql`insert into weave_workspace.support_listings(workspace_id,kind,entry_id,rkey,operation_id,entry_revision,record_value,status)
      values(${f.id},'offer',${uid(1000 + n)},${rkey},${uid(2000 + n)},1,
        ${JSON.stringify({ ...state.record, kind: "offer" })}::text::jsonb,'withdrawal_pending')`;
  }
  const first = await command(f, "support_state", { afterKind: null, afterEntryId: null });
  assert.equal(first.listings.length, 100);
  assert(first.next);
  assert.equal(first.listings[0].kind, "need");
  const second = await command(f, "support_state", { afterKind: first.next.kind, afterEntryId: first.next.entryId });
  assert.equal(second.listings.length, 2);
  assert.equal(second.next, null);
  assert.equal(new Set([...first.listings, ...second.listings].map((item: { kind: string; entryId: string }) => `${item.kind}:${item.entryId}`)).size, 102);
});

integration("PostgreSQL bound sessions, explicit editor grants and current membership protect publication state", async () => {
  const f = await fixture(true);
  await reject(command(f, "support_state", {}, owner, viewerSession), "PT401");
  await reject(command(f, "support_get", { kind: "need", entryId: f.entry }, viewer, viewerSession, viewerDid, "member"), "PT403");
  await reject(command(f, "support_state", {}, owner, sid, did, null), "PT404");
  await command(f, "support_membership_absent", { observedAt: new Date().toISOString() }, owner, sid, did, null);
  const [grant] = await sql`select suspension_reason from weave_workspace.access_grants where workspace_id=${f.id} and user_id=${owner}`;
  assert.equal(grant!.suspension_reason, "membership_removed");
  await reject(command(f, "support_state"), "PT404");
  await reject(sql.begin(async tx => {
    await tx`set local role authenticated`;
    await tx`select * from weave_workspace.support_listings`;
  }), "42501");
});
