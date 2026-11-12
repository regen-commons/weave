import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import postgres from "postgres";
import type { AccountDocument } from "./account-contract.ts";
import { parseMatchingShortlist, parseMatchingState } from "./matching-contract.ts";

const database = process.env.WEAVE_WORKSPACE_TEST_DATABASE_URL;
const baseline = process.env.WEAVE_WORKSPACE_TEST_BASELINE;
const enabled = Boolean(database);
const indexEnabled = process.env.WEAVE_WORKSPACE_TEST_PROJECT_INDEX === "1";
let sql: postgres.Sql;
const uid = (n: number) => `11000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const sid = (n: number) => `12000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const did = (n: number) => `did:plc:weavefixture${n}`;
const candidate = (name: string) => readFile(new URL(`../../../supabase/candidates/${name}.sql`, import.meta.url), "utf8");

before(async () => {
  if (!database) return;
  const url = new URL(database);
  if (url.hostname !== "127.0.0.1" || url.pathname !== "/weave_workspace_test" || !baseline) {
    throw Error("dedicated_loopback_workspace_test_database_and_baseline_required");
  }
  sql = postgres(database, { max: 8, onnotice: () => {} });
  await sql.unsafe("drop schema if exists weave_workspace, weave_auth, weave, auth, private, extensions cascade");
  await sql.unsafe(await readFile(new URL("../test-fixtures/weave-matching-postgres-setup.sql", import.meta.url), "utf8"));
  await sql`alter table auth.users add column email_confirmed_at timestamptz`;
  await sql.unsafe(await readFile(baseline, "utf8"));
  await sql.unsafe(await candidate("certified-private-access"));
  await sql.unsafe(await candidate("weave-matching"));
  await sql.unsafe(await candidate("weave-project-workspaces"));
  await sql.unsafe(await candidate("weave-team-content"));
  if (indexEnabled) {
    await sql.unsafe(await candidate("weave-project-index"));
    await sql.unsafe(await candidate("weave-matching-vectors"));
    await sql.unsafe(await candidate("weave-open-ended-sharing"));
    await sql.unsafe(await candidate("weave-public-evidence-snapshot"));
  }
  for (const n of [1, 2, 3, 4, 5]) {
    await sql`insert into auth.users(id) values(${uid(n)})`;
    await sql`insert into auth.sessions(id, user_id) values(${sid(n)}, ${uid(n)})`;
    if (n !== 5) await sql`insert into auth.identities values(${uid(n)}, 'custom:certified', ${`https://certified.one|${did(n)}`})`;
  }
});
after(async () => { if (sql) await sql.end(); });

const integration = (name: string, fn: () => Promise<void>) => test(name, { skip: !enabled, timeout: 30000 }, fn);
const rejects = (action: Promise<unknown>, code: string) => assert.rejects(action, { code });

function command(actor: number, action: string, data: Record<string, string | number | null | {title: string; description: string}>,
  identity = { did: did(actor), session: sid(actor) }) {
  return sql.begin(async (tx) => {
    await tx`set local role weave_workspace_runtime`;
    const [row] = await tx`select weave_workspace.command(
      ${uid(actor)}, ${identity.session}, ${identity.did}, ${action}, ${tx.json(data)}) as result`;
    return row!.result;
  });
}

function group(project: string, role: string, repository = "did:plc:groupfixture") {
  return { projectUri: `at://${repository}/org.hypercerts.collection/${project}`, repositoryDid: repository,
    groupDid: repository, actorRole: role, cid: "bafyfixture" };
}

async function withAccount<T>(actor: number, fn: (tx: postgres.TransactionSql) => Promise<T>) {
  return sql.begin(async (tx) => {
    await tx`set local role authenticated`;
    const claims = { sub: uid(actor), session_id: sid(actor), role: "authenticated", exp: Math.floor(Date.now() / 1000) + 600 };
    await tx`select set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`;
    return fn(tx);
  });
}

const support = {
  title: "Workspace fixture", description: null, capitalForms: ["social"], amount: null, timeframe: null, urgency: null,
  placeScope: "here", exchangeTerms: ["open"], purpose: null, capacity: null, audience: null, status: "open",
};
const document = {
  version: 1, initiative: { name: "Solo fixture", description: "", locations: [], isGlobal: false,
    links: [], stage: null, lenses: [], themes: [], beneficiaries: [], languages: [] },
  needs: [{ id: uid(91), value: support }], offers: [],
  funding: { form: { workCountries: "", benefitCountries: "", applicantBaseCountry: "", registrationCountry: "",
    applicantType: "unknown", fundingInstruments: [], goalMin: "", goalMax: "", currency: "", usWorkStates: "",
    usBenefitStates: "" }, programAnswers: {} },
};
const save = (actor: number, id: string, revision: number, request: string) => withAccount(actor, async (tx) => {
  const [row] = await tx`select weave.save_initiative(${id}, ${revision}, ${request}, ${tx.json(document)}) as result`;
  return row!.result;
});
const load = (actor: number, id: string) => withAccount(actor, async (tx) => {
  const [row] = await tx`select weave.load_initiative(${id}) as result`;
  return row!.result;
});

integration("provider commands are private and require the live, exact Certified identity", async () => {
  const proof = group("authcheck", "member");
  await rejects(command(1, "lookup", proof, { did: did(2), session: sid(1) }), "PT401");
  await rejects(command(1, "lookup", proof, { did: did(1), session: sid(2) }), "PT401");
  await rejects(command(5, "lookup", proof), "PT401");
  await sql`update auth.sessions set not_after = now() - interval '1 second' where id = ${sid(4)}`;
  await rejects(command(4, "lookup", proof), "PT401");
  await sql`update auth.sessions set not_after = null where id = ${sid(4)}`;
  await sql`update auth.users set banned_until = now() + interval '1 hour' where id = ${uid(4)}`;
  await rejects(command(4, "lookup", proof), "PT401");
  await sql`update auth.users set banned_until = null where id = ${uid(4)}`;
  for (const role of ["authenticated", "anon", "service_role"]) {
    await rejects(sql.begin(async (tx) => {
      await tx.unsafe(`set local role ${role}`);
      await tx`select weave_workspace.command(${uid(1)}, ${sid(1)}, ${did(1)}, 'link', ${tx.json(proof)})`;
    }), "42501");
  }
  await rejects(sql.begin(async (tx) => {
    await tx`set local role weave_workspace_runtime`;
    await tx`select * from weave_workspace.access_grants`;
  }), "42501");
});

integration("solo linking keeps existing initiative identity, revisions and owner-only saves", async () => {
  const id = uid(10);
  const beforeLink = await save(1, id, 0, uid(20));
  const personal = { projectUri: `at://${did(1)}/org.hypercerts.collection/solo`, repositoryDid: did(1), cid: "bafysolo" };
  const data = { ...personal, initiativeId: id, expectedRevision: 1 };
  await rejects(command(2, "link", data), "PT403");
  await rejects(command(1, "link", { ...data, expectedRevision: 2 }), "PT409");
  assert.deepEqual(await command(1, "link", data), {
    status: "linked", workspaceId: id, accessRole: "admin", projectUri: personal.projectUri, cid: personal.cid,
  });
  assert.deepEqual(await load(1, id), beforeLink);
  await rejects(load(2, id), "PT404");
  const afterLink = await save(1, id, 1, uid(21));
  assert.equal(afterLink.revision, 2);
  assert.equal(afterLink.document.needs[0].id, uid(91));
  assert.equal((await command(1, "lookup", personal)).workspaceId, id);
});

integration("simultaneous setup approvals produce one group workspace and one first admin", async () => {
  const member = group("setup", "member");
  const admin = group("setup", "admin");
  const owner = group("setup", "owner");
  const draft = await save(3, uid(11), 0, uid(22));
  const [first, second] = await Promise.all([command(3, "request_setup", member), command(3, "request_setup", member)]);
  assert.equal(first.status, "pending");
  assert.deepEqual(second, first);
  assert.deepEqual(await command(3, "lookup", member), { status: "unlinked" });
  await rejects(command(3, "approve_setup", { ...member, requestId: first.requestId }), "PT403");
  await rejects(command(1, "approve_setup", { ...group("setup", "owner", "did:plc:othergroup"), requestId: first.requestId }), "PT404");
  const attempts = await Promise.all([
    command(1, "approve_setup", { ...admin, requestId: first.requestId }),
    command(2, "approve_setup", { ...owner, requestId: first.requestId }),
  ]);
  const [linked] = attempts.filter((result) => result.status === "linked");
  assert.equal(attempts.filter((result) => result.status === "linked").length, 1);
  assert.equal(attempts.filter((result) => result.status === "access_required").length, 1);
  assert.equal(linked.accessRole, "admin");
  assert.notEqual(linked.workspaceId, uid(11));
  assert.deepEqual(await command(3, "lookup", member), { status: "access_required" });
  assert.deepEqual(await load(3, uid(11)), draft);
  await rejects(load(1, uid(11)), "PT404");

  const adminActor = attempts[0].status === "linked" ? 1 : 2;
  const otherActor = adminActor === 1 ? 2 : 1;
  const grant = { ...member, workspaceId: linked.workspaceId, recipientDid: did(3), recipientRole: "member",
    accessRole: "editor", observedAt: new Date().toISOString() };
  await rejects(command(otherActor, "check_recipient", grant), "PT403");
  await rejects(command(adminActor, "check_recipient", { ...grant, recipientDid: did(5) }), "PT404");
  assert.deepEqual(await command(adminActor, "check_recipient", grant), { status: "verified" });
  await rejects(command(otherActor, "grant_access", grant), "PT403");
  await rejects(command(adminActor, "grant_access", { ...grant, recipientRole: "absent" }), "PT403");
  await rejects(command(adminActor, "grant_access", { ...grant, recipientDid: did(5) }), "PT404");
  assert.deepEqual(await command(adminActor, "grant_access", grant), { status: "granted" });
  assert.equal((await command(3, "lookup", member)).accessRole, "editor");
  await rejects(command(adminActor, "suspend_access", grant), "PT403");
  const departed = { ...member, actorRole: null, recipientRole: "absent", recipientDid: did(3),
    observedAt: new Date().toISOString() };
  assert.deepEqual(await command(3, "suspend_access", departed), { status: "suspended" });
  assert.deepEqual(await command(3, "lookup", member), { status: "access_required" });
  await rejects(command(adminActor, "grant_access", grant), "PT409");
  assert.deepEqual(await load(3, uid(11)), draft);
  assert.equal((await command(adminActor, "lookup", member)).workspaceId, linked.workspaceId);
  await command(adminActor, "grant_access", { ...grant, observedAt: new Date().toISOString() });
  assert.equal((await command(3, "lookup", member)).accessRole, "editor");
  await command(adminActor, "revoke_access", grant);
  assert.deepEqual(await command(3, "lookup", member), { status: "access_required" });

  await rejects(command(otherActor, "recover_admin", owner), "PT409");
  await command(adminActor, "suspend_access", { ...departed, recipientDid: did(adminActor), observedAt: new Date().toISOString() });
  await rejects(command(otherActor, "recover_admin", { ...admin, workspaceId: linked.workspaceId }), "PT403");
  assert.deepEqual(await command(otherActor, "recover_admin", owner), {
    status: "linked", workspaceId: linked.workspaceId, accessRole: "admin", projectUri: member.projectUri, cid: member.cid,
  });
});

integration("creation persists exact intent and permits one claim for each upstream step", async () => {
  const initiativeId = uid(12);
  const original = await save(1, initiativeId, 0, uid(23));
  const requestId = uid(24);
  const inputs = {
    requestId, initiativeId, expectedRevision: 1, groupHandle: "fixture.certified.example",
    projectRkey: "weavefixture", createdAt: new Date().toISOString(), publicProfile: { title: "Example", description: "" },
  };
  const prepared = await command(1, "begin_create", inputs);
  assert.equal(prepared.status, "prepared");
  assert.equal(prepared.createdAt, inputs.createdAt);
  assert.deepEqual(await command(1, "begin_create", { ...inputs, projectRkey: "newkey", createdAt: new Date().toISOString() }), prepared);
  await rejects(command(1, "begin_create", { ...inputs, publicProfile: { title: "Different", description: "" } }), "PT409");
  await rejects(command(1, "begin_create", { ...inputs, requestId: uid(25) }), "PT409");
  await rejects(command(2, "get_create", { requestId }), "PT404");
  const step = { requestId, step: "group" };
  const claims = await Promise.all([command(1, "claim_create_step", step), command(1, "claim_create_step", step)]);
  assert.equal(claims.filter((claim) => claim.claimed).length, 1);
  assert.ok(claims.every((claim) => claim.status === "group_pending"));
  assert.equal(claims[0].groupReconcileAfter, claims[1].groupReconcileAfter);
  assert.ok(Date.parse(claims[0].groupReconcileAfter) > Date.now());
  await rejects(command(1, "abandon_prepared_create", { requestId }), "PT409");
  const project = group(inputs.projectRkey, "owner", "did:plc:newgroup");
  const groupProof = { requestId, groupDid: project.groupDid, groupHandle: inputs.groupHandle, actorRole: "owner" };
  await rejects(command(1, "record_group", { ...groupProof, groupHandle: "occupied.example" }), "PT403");
  await rejects(command(1, "record_group", { ...groupProof, actorRole: "admin" }), "PT403");
  await assert.rejects(command(1, "record_group", groupProof), { code: "PT409", message: "group_registration_pending" });
  const receipt = await command(1, "record_registration_receipt", groupProof);
  assert.equal(receipt.status, "group_pending");
  assert.equal(receipt.registrationDid, project.groupDid);
  await rejects(command(1, "record_group", { ...groupProof, groupDid: "did:plc:othergroup" }), "PT409");
  await rejects(command(1, "reject_group_claim", { requestId }), "PT409");
  assert.equal((await command(1, "record_group", groupProof)).status, "group_confirmed");
  const projectStep = { requestId, step: "project" };
  assert.equal((await command(1, "claim_create_step", projectStep)).claimed, true);
  assert.equal((await command(1, "claim_create_step", projectStep)).claimed, false);
  await rejects(command(1, "record_project", { ...project, requestId, projectUri: project.projectUri + "wrong" }), "PT403");
  assert.equal((await command(1, "record_project", { ...project, requestId })).status, "project_confirmed");
  assert.deepEqual(await load(1, initiativeId), original);
  const revised = await save(1, initiativeId, 1, uid(26));
  assert.equal((await command(1, "get_create", { requestId })).status, "project_confirmed");
  const linked = await command(1, "finish_create", { ...project, requestId });
  assert.equal(linked.status, "linked");
  assert.notEqual(linked.workspaceId, initiativeId);
  assert.deepEqual(await command(1, "finish_create", { ...project, requestId }), linked);
  assert.deepEqual(await load(1, initiativeId), revised);
});

integration("a definite registration conflict releases its reservation and keeps the rejected request terminal", async () => {
  const initiativeId = uid(13);
  await save(1, initiativeId, 0, uid(27));
  const requestId = uid(28);
  const input = { requestId, initiativeId, expectedRevision: 1, groupHandle: "conflict.certified.example",
    projectRkey: "weavefixture", createdAt: new Date().toISOString(), publicProfile: { title: "Example", description: "" } };
  await command(1, "begin_create", input);
  await command(1, "claim_create_step", { requestId, step: "group" });
  assert.equal((await command(1, "reject_group_claim", { requestId })).status, "group_rejected");
  assert.equal((await command(1, "begin_create", input)).status, "group_rejected");
  await rejects(command(1, "record_group", { requestId, groupDid: "did:plc:occupied",
    groupHandle: input.groupHandle, actorRole: "owner" }), "PT409");
  const retryId = uid(29);
  assert.equal((await command(1, "begin_create", { ...input, requestId: retryId })).status, "prepared");
  await command(1, "claim_create_step", { requestId: retryId, step: "group" });
  await sql`update weave_workspace.create_intents set group_reconcile_after = now() - interval '1 second'
    where actor_id = ${uid(1)} and request_id = ${retryId}`;
  const reconciled = await command(1, "record_group", { requestId: retryId, groupDid: "did:plc:reconciled",
    groupHandle: input.groupHandle, actorRole: "owner" });
  assert.equal(reconciled.status, "group_confirmed");
});

function content(actor: number, workspace: string, action: string, data: object = {},
  role: string | null = "member", cid: string | null = "bafyfixture") {
  return sql.begin(async (tx) => {
    await tx`set local role weave_workspace_runtime`;
    const [row] = await tx`select weave_workspace.content_command(
      ${uid(actor)}, ${sid(actor)}, ${did(actor)}, ${workspace}, ${role}, ${cid}, ${action},
      ${JSON.stringify(data)}::text::jsonb) as result`;
    const [claims] = await tx`select nullif(current_setting('request.jwt.claims', true), '') as value`;
    assert.equal(claims?.value, null);
    return row!.result;
  });
}

async function activate(actor: number, name: string): Promise<string> {
  const proof = group(name, "owner", "did:plc:teamcontents");
  const result = await command(actor, "link", proof);
  assert.equal(result.status, "linked");
  return result.workspaceId;
}

function updateGrant(workspaceId: string, recipient: number, accessRole: string, action = "grant_access") {
  return command(1, action, { ...group("teamdraft", "owner", "did:plc:teamcontents"), workspaceId,
    recipientDid: did(recipient), recipientRole: "member", accessRole, observedAt: new Date().toISOString() });
}

function entryRef(state: { entries: Array<{ kind: string; entryId: string; revision: number; shareVersion: number }> }) {
  const { kind, entryId, revision, shareVersion } = state.entries[0]!;
  return { kind, entryId, revision, shareVersion };
}

async function reviewAndShare(actor: number, workspace: string, revision: number, requestId: string) {
  const state = await content(actor, workspace, "matching_state");
  const review = await content(actor, workspace, "matching_preview", {
    p_revision: revision, p_entries: [entryRef(state)],
  });
  return content(actor, workspace, "matching_change", { p_action: "share", p_request_id: requestId,
    p_review_id: review.reviewId });
}

integration("team saves require a current grant, preserve revisions and do not become personal saves", async () => {
  const team = await activate(1, "teamdraft");
  const draft = structuredClone(document);
  draft.needs[0]!.value.capitalForms = [];
  const initial = { expectedRevision: 0, requestId: uid(31), document: draft };
  assert.deepEqual(await content(1, team, "team_load"), { saved: null, accessRole: "admin" });
  await rejects(content(3, team, "team_load"), "PT404");
  await updateGrant(team, 2, "viewer");
  await updateGrant(team, 3, "editor");
  await rejects(content(2, team, "team_save", initial), "PT403");
  const saved = await content(3, team, "team_save", initial);
  assert.equal(saved.id, team);
  assert.equal(saved.revision, 1);
  assert.deepEqual(saved.document, draft);
  assert.deepEqual(await content(2, team, "team_load"), { saved, accessRole: "viewer" });
  assert.deepEqual(await content(3, team, "team_save", initial), saved);
  await rejects(content(3, team, "team_load", {}, null), "PT404");
  await rejects(content(3, team, "team_save", { ...initial, requestId: uid(32) }), "PT409");
  await rejects(load(1, team), "PT404");
  await rejects(save(2, team, 0, uid(33)), "PT404");

  const state = await content(3, team, "matching_state");
  const preview = { p_revision: 1, p_entries: [entryRef(state)] };
  await rejects(content(2, team, "matching_preview", preview), "PT403");
  await rejects(content(3, team, "matching_preview", preview), "PT409");
  await rejects(content(3, team, "matching_state", {}, "member", null), "PT403");
  await updateGrant(team, 3, "editor", "revoke_access");
  await rejects(content(3, team, "team_save", initial), "PT404");
  await rejects(content(3, team, "matching_state"), "PT404");
  await rejects(withAccount(2, (tx) => tx`select weave.matching_state(${team})`), "42501");
  await rejects(withAccount(2, (tx) => tx`select private.weave_matching_state(${team})`), "42501");
});

integration("matching returns only shared complementary entries from linked active workspaces", async () => {
  const need = await activate(1, "matchingneed");
  const offer = await activate(4, "matchingoffer");
  const offerDocument = { ...document, needs: [], offers: document.needs };
  await content(1, need, "team_save", { expectedRevision: 0, requestId: uid(34), document });
  await content(4, offer, "team_save", { expectedRevision: 0, requestId: uid(35), document: offerDocument });
  await reviewAndShare(1, need, 1, uid(36));
  const search = () => content(1, need, "matching_shortlist");
  assert.deepEqual((await search()).groups[0].candidates, []);
  await reviewAndShare(4, offer, 1, uid(37));
  assert.deepEqual((await search()).groups[0].candidates.map((c: { initiativeId: string }) => c.initiativeId), [offer]);

  const review = await content(4, offer, "matching_preview", {
    p_revision: 1, p_entries: [entryRef(await content(4, offer, "matching_state"))],
  });
  await content(4, offer, "pause_matching", {}, "owner", null);
  assert.deepEqual((await search()).groups[0].candidates, []);
  assert.deepEqual((await content(4, offer, "team_load")).saved.document, offerDocument);
  await content(4, offer, "matching_state");
  await rejects(content(4, offer, "matching_change", { p_action: "share", p_request_id: uid(39),
    p_review_id: review.reviewId }), "PT409");
  assert.deepEqual((await search()).groups[0].candidates, []);
  await reviewAndShare(4, offer, 1, uid(38));
  assert.equal((await search()).groups[0].candidates.length, 1);
});

test("an authorized viewer can download bounded public evidence without any saved or shared entries", {
  skip: !enabled || !indexEnabled, timeout: 30000,
}, async () => {
  const team = await activate(1, "teamdraft");
  await updateGrant(team, 2, "viewer");
  const linked = await activate(4, "publicsnapshot");
  await rejects(content(4, team, "public_evidence"), "PT404");
  await rejects(content(2, team, "public_evidence", {}, null), "PT404");
  await rejects(content(2, team, "public_evidence", {}, "member", null), "PT403");
  await rejects(content(4, uid(76), "public_evidence"), "PT404");
  assert.deepEqual(await content(4, linked, "team_load"), { saved: null, accessRole: "admin" });

  const ownUri = group("publicsnapshot", "owner", "did:plc:teamcontents").projectUri;
  const base = "at://did:plc:publicsnapshot/org.hypercerts.collection/";
  await sql`insert into private.weave_project_index_checkpoint(completed_at) values(now())`;
  await sql`insert into private.weave_project_index_source(project_uri, status, permission_until, cid, checked_at, fetched_at)
    select ${base} || 'evidence-' || n, 'indexed', now()+interval '1 hour', 'current', now(), now()
    from generate_series(1,82) n`;
  await sql`insert into private.weave_project_index_source(project_uri, status, permission_until, cid, checked_at, fetched_at)
    values
    (${ownUri}, 'indexed', now()+interval '1 hour', 'current', now(), now()),
    (${base + "expired"}, 'indexed', now()-interval '1 minute', 'current', now(), now()),
    (${base + "unlisted"}, 'restricted', now()+interval '1 hour', 'current', now(), now()),
    (${base + "missing"}, 'missing', now()+interval '1 hour', 'current', now(), now()),
    (${base + "failed"}, 'failed', now()+interval '1 hour', 'current', now(), now()),
    (${base + "stale"}, 'indexed', now()+interval '1 hour', 'current', now(), now()-interval '8 days'),
    (${base + "wrong-cid"}, 'indexed', now()+interval '1 hour', 'current', now(), now())`;
  await sql`insert into private.weave_project_index_evidence(id, project_uri, evidence, lexical_text)
    select s.project_uri || ':' || n, s.project_uri,
      jsonb_build_object('projectUri', s.project_uri, 'cid', case when s.project_uri like '%wrong-cid' then 'old' else s.cid end,
        'passage', 'Watershed mapping research'), 'watershed mapping research'
    from private.weave_project_index_source s cross join generate_series(1,3) n`;

  const snapshot = await content(4, linked, "public_evidence");
  assert.equal(snapshot.workspaceId, linked);
  assert.equal(snapshot.status, "bounded");
  assert.equal(snapshot.truncated, true);
  assert.equal(snapshot.evidence.length, 160);
  const passages = snapshot.evidence as Array<{ projectUri: string; fetchedAt: string }>;
  assert.equal(new Set(passages.map(({ projectUri }) => projectUri)).size, 80);
  assert.ok(passages.every(({ projectUri, fetchedAt }) => projectUri.startsWith(base + "evidence-") && Date.parse(fetchedAt)));
  assert.ok(Date.parse(snapshot.availableUntil) - Date.now() <= 300_000);

  await sql`update private.weave_project_index_source set permission_until=now()+interval '2 minutes'
    where project_uri=${passages[0]!.projectUri}`;
  assert.ok(Date.parse((await content(4, linked, "public_evidence")).availableUntil) - Date.now() <= 120_000);
  const memberDocuments = await Promise.all([content(1, team, "team_load"), content(2, team, "team_load")]);
  assert.deepEqual(memberDocuments[0].saved, memberDocuments[1].saved);
  assert.equal(memberDocuments[1].saved.id, team);
  const memberSnapshots = await Promise.all([content(1, team, "public_evidence"), content(2, team, "public_evidence")]);
  assert.equal(memberSnapshots[1].workspaceId, team);
  assert.deepEqual(memberSnapshots[0].evidence, memberSnapshots[1].evidence);
  const matching = await content(2, team, "matching_state");
  assert.ok(matching.entries.length > 0);
  assert.ok(matching.entries.every(({ sharing }: { sharing: string }) => sharing === "private"));
  assert.deepEqual((await content(2, team, "matching_shortlist")).groups, []);
  await updateGrant(team, 2, "viewer", "revoke_access");
  await rejects(content(2, team, "public_evidence"), "PT404");
  await rejects(content(2, team, "team_load"), "PT404");
  await rejects(withAccount(1, (tx) => tx`select private.weave_public_project_snapshot(${ownUri})`), "42501");
});

integration("a second workspace finds only selected shares and loses them after edits or withdrawal", async () => {
  const team = await activate(1, "editingshare");
  const second = await activate(4, "secondmatching");
  const proof = group("editingshare", "owner", "did:plc:teamcontents");
  const grant = (recipient: number, role: string) => command(1, "grant_access", {
    ...proof, workspaceId: team, recipientDid: did(recipient), recipientRole: "member",
    accessRole: role, observedAt: new Date().toISOString(),
  });
  await grant(2, "viewer");
  await grant(3, "editor");
  const teamDoc: AccountDocument = { ...document, version: 1, needs: [{ id: uid(81), value: { ...support, title: "Watershed mapping" } }],
    offers: [{ id: uid(82), value: { ...support, title: "Watershed mapping training" } }] };
  const secondDoc = { ...document,
    needs: [{ id: uid(83), value: { ...support, title: "Watershed mapping" } }],
    offers: [{ id: uid(84), value: { ...support, title: "Watershed mapping training" } }] };
  let saved = await content(3, team, "team_save", { expectedRevision: 0, requestId: uid(60), document: teamDoc });
  await content(4, second, "team_save", { expectedRevision: 0, requestId: uid(61), document: secondDoc });
  const rows = async (actor: number, id: string) => (await content(actor, id, "matching_state")).entries;
  const ref = (row: Parameters<typeof entryRef>[0]["entries"][number]) => entryRef({ entries: [row] });
  const review = (actor: number, id: string, revision: number, entries: object[]) =>
    content(actor, id, "matching_preview", { p_revision: revision, p_entries: entries });
  const share = async (actor: number, id: string, revision: number, entries: object[], request: number) => {
    const prepared = await review(actor, id, revision, entries);
    await content(actor, id, "matching_change", { p_action: "share", p_request_id: uid(request), p_review_id: prepared.reviewId });
    return prepared;
  };
  await share(4, second, 1, (await rows(4, second)).map(ref), 62);
  const visible = async () => (await content(4, second, "matching_shortlist")).groups
    .flatMap((g: { candidates: Array<{ initiativeId: string; kind: string }> }) => g.candidates)
    .filter((c: { initiativeId: string }) => c.initiativeId === team);
  assert.deepEqual(await visible(), []);
  await rejects(content(2, team, "team_save", { expectedRevision: 1, requestId: uid(63), document: teamDoc }), "PT403");
  const firstRows = await rows(3, team);
  await rejects(review(2, team, 1, [ref(firstRows[0])]), "PT403");
  const prepared = await review(3, team, 1, [ref(firstRows.find((r: {kind: string}) => r.kind === "need"))]);
  await rejects(content(2, team, "matching_change", { p_action: "share", p_request_id: uid(64), p_review_id: prepared.reviewId }), "PT403");
  await content(3, team, "matching_change", { p_action: "share", p_request_id: uid(65), p_review_id: prepared.reviewId });
  assert.deepEqual((await visible()).map((c: {kind: string}) => c.kind), ["need"]);
  assert.equal((await rows(2, team)).find((r: {kind: string}) => r.kind === "offer").sharing, "private");

  let changed: AccountDocument = { ...teamDoc, needs: [{ ...teamDoc.needs[0]!, value: { ...teamDoc.needs[0]!.value,
    description: "Revised watershed mapping scope" } }] };
  const stale = await review(3, team, saved.revision, [ref((await rows(3, team)).find((r: {kind: string}) => r.kind === "need"))]);
  saved = await content(3, team, "team_save", { expectedRevision: saved.revision, requestId: uid(66), document: changed });
  assert.deepEqual(await visible(), []);
  await rejects(content(3, team, "matching_change", { p_action: "share", p_request_id: uid(67), p_review_id: stale.reviewId }), "PT409");

  for (const [kind, request] of [["need", 68], ["offer", 71]] as const) {
    await share(3, team, saved.revision, [ref((await rows(3, team)).find((r: {kind: string}) => r.kind === kind))], request);
    assert.ok((await visible()).some((c: {kind: string}) => c.kind === kind));
    if (kind === "offer") {
      changed = { ...changed, offers: [{ ...changed.offers[0]!, value: { ...changed.offers[0]!.value,
        description: "Revised watershed mapping training capacity" } }] };
      saved = await content(3, team, "team_save", { expectedRevision: saved.revision, requestId: uid(75), document: changed });
      assert.deepEqual(await visible(), []);
      await share(3, team, saved.revision,
        [ref((await rows(3, team)).find((r: {kind: string}) => r.kind === kind))], 76);
      assert.ok((await visible()).some((c: {kind: string}) => c.kind === kind));
    }
    const selected = ref((await rows(3, team)).find((r: {kind: string}) => r.kind === kind));
    await rejects(content(2, team, "matching_change", { p_action: "withdraw", p_request_id: uid(request+1), p_entries: [selected] }), "PT403");
    await content(3, team, "matching_change", { p_action: "withdraw", p_request_id: uid(request+2), p_entries: [selected] });
    assert.deepEqual(await visible(), []);
  }
  const unchanged = await content(2, team, "team_load");
  assert.equal(unchanged.accessRole, "viewer");
  assert.deepEqual(unchanged.saved.document, changed);
});


test("open-ended shares retain direct and lexical public evidence through the vector adapter", {
  skip: !enabled || !indexEnabled, timeout: 30000,
}, async () => {
  const need = await activate(1, "openendedneed");
  const offer = await activate(4, "openendedoffer");
  const supportValue = { ...support, title: "Canopy quadrat inventory", capitalForms: ["intellectual"] };
  const needDocument = { ...document, needs: [{ id: uid(181), value: supportValue }] };
  const offerDocument = { ...document, needs: [], offers: [{ id: uid(182), value: supportValue }] };
  await content(1, need, "team_save", { expectedRevision: 0, requestId: uid(183), document: needDocument });
  await content(4, offer, "team_save", { expectedRevision: 0, requestId: uid(184), document: offerDocument });
  const state = await content(1, need, "matching_state");
  const previewInput = { p_revision: 1, p_entries: [entryRef(state)] };
  await rejects(content(1, need, "matching_preview", { ...previewInput, p_expires_at: "2000-01-01T00:00:00Z" }), "PT400");
  await rejects(content(1, need, "matching_preview", { ...previewInput, p_expires_at: "infinity" }), "PT400");
  const review = await content(1, need, "matching_preview", previewInput);
  assert.equal(review.expiresAt, null);
  const [reviewDeadline] = await sql`select expires_at, valid_until>now() and valid_until<=now()+interval '15 minutes' bounded
    from private.weave_matching_reviews where id=${review.reviewId}`;
  assert.equal(reviewDeadline!.expires_at, null);
  assert.equal(reviewDeadline!.bounded, true);
  await content(1, need, "matching_change", { p_action: "share", p_request_id: uid(185), p_review_id: review.reviewId });
  await reviewAndShare(4, offer, 1, uid(186));
  const shared = parseMatchingState(await content(1, need, "matching_state"));
  assert.equal(shared.entries[0]!.sharing, "shared");
  assert.equal(shared.entries[0]!.expiresAt, null);
  const reference = entryRef(shared);

  const projectUri = "at://did:plc:openendedcorpus/org.hypercerts.collection/canopy";
  await sql`insert into private.weave_project_index_source(project_uri,status,permission_until,cid,checked_at,fetched_at)
    values(${projectUri},'indexed',now()+interval '1 hour','bafyfixture',now(),now())`;
  await sql`insert into private.weave_project_index_evidence(id,project_uri,evidence,lexical_text)
    values('openended-canopy',${projectUri},${sql.json({ projectUri, cid: "bafyfixture", passage: "Canopy quadrat inventory expertise." })},
      'canopy quadrat inventory expertise')`;
  const [settings] = await sql`select hybrid_enabled from private.weave_matching_retrieval_settings where singleton`;
  assert.equal(settings!.hybrid_enabled, false);
  const readPublic = async () => {
    const [row] = await sql`select private.weave_matching_indexed_public_evidence(${need},${reference.kind},${reference.entryId},
      ${reference.revision},${reference.shareVersion}) as result`;
    return row!.result;
  };
  const external = await readPublic();
  assert.equal(external.modelVersion, null);
  assert.ok(external.evidence.some((row: { projectUri: string }) => row.projectUri === projectUri));
  const shortlist = await content(1, need, "matching_shortlist");
  const groups = parseMatchingShortlist(shortlist.groups);
  assert.equal(groups[0]!.entry.expiresAt, null);
  assert.ok(groups[0]!.candidates.some(candidate => candidate.initiativeId === offer && candidate.expiresAt === null));
  assert.ok((shortlist.groups[0].publicEvidence as Array<{ projectUri: string }>).some(row => row.projectUri === projectUri));

  const [configuration] = await sql`select private.weave_matching_embedding_model() as model`;
  const model = configuration!.model as string;
  const pending = await sql.begin(async tx => {
    await tx`set local role weave_query_embedding_job`;
    const [row] = await tx`select private.weave_matching_vector_pending(${model},25) as result`;
    return row!.result as Array<{ initiativeId: string }>;
  });
  assert.ok(pending.some(row => row.initiativeId === need));
  const vector = JSON.stringify([1, ...Array<number>(255).fill(0)]);
  const writeVector = () => sql.begin(async tx => {
    await tx`set local role weave_query_embedding_job`;
    const [row] = await tx`select private.weave_matching_vector_store(${need},${reference.kind},${reference.entryId},
      ${reference.revision},${reference.shareVersion},${model},${vector}::extensions.vector) as stored`;
    return row!.stored;
  });
  assert.equal(await writeVector(), true);
  // Withdrawal still closes every path, including a vector worker holding stale input.
  await content(1, need, "matching_change", { p_action: "withdraw", p_request_id: uid(187), p_entries: [reference] });
  assert.deepEqual((await readPublic()).evidence, []);
  assert.equal(await writeVector(), false);
});
