import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import postgres from "postgres";

// Separate database: this suite must not reset another suite's schemas during parallel node tests.
const database = process.env.WEAVE_DELETION_TEST_DATABASE_URL;
const baseline = process.env.WEAVE_DELETION_TEST_BASELINE;
let sql: postgres.Sql;
let serial = 100;
const uid = (n: number) => `51000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const next = () => uid(++serial);
const owner = uid(1), other = uid(2), expired = uid(3);
const session = (actor: string) => `52${actor.slice(2)}`;
const did = (actor: string) => `did:plc:deletionfixture${actor.slice(-1)}`;
const candidate = (name: string) => readFile(new URL(`../../../supabase/candidates/${name}.sql`, import.meta.url), "utf8");
// The production order of the website migrations, then the candidates not applied yet.
const CANDIDATES = ["certified-private-access", "weave-matching", "weave-project-index", "weave-matching-vectors",
  "weave-project-oauth", "weave-project-workspaces", "weave-team-content", "weave-public-evidence-snapshot",
  "weave-project-discovery", "weave-workspace-invites", "weave-support-publication", "weave-open-ended-sharing",
  "weave-initiative-deletion", "weave-project-index-card-facts", "weave-project-index-work-scope",
  "weave-project-index-organization-description", "weave-initiative-deletion-stale-references"];

before(async () => {
  if (!database) return;
  const url = new URL(database);
  if (url.hostname !== "127.0.0.1" || url.pathname !== "/weave_deletion_test" || !baseline)
    throw Error("dedicated_loopback_deletion_test_database_and_baseline_required");
  sql = postgres(database, { max: 6, onnotice: () => {} });
  await sql.unsafe("drop schema if exists weave_workspace, weave_project_oauth, weave_auth, weave, auth, private, extensions cascade");
  await sql.unsafe(await readFile(new URL("../test-fixtures/weave-matching-postgres-setup.sql", import.meta.url), "utf8"));
  await sql`alter table auth.users add column email_confirmed_at timestamptz`;
  await sql.unsafe(await readFile(baseline, "utf8"));
  for (const name of CANDIDATES) await sql.unsafe(await candidate(name));
  for (const actor of [owner, other, expired]) {
    await sql`insert into auth.users(id) values(${actor})`;
    await sql`insert into auth.sessions(id, user_id) values(${session(actor)}, ${actor})`;
    await sql`insert into auth.identities values(${actor}, 'custom:certified', ${`https://certified.one|${did(actor)}`})`;
  }
  await sql`update auth.sessions set not_after = now() - interval '1 second' where user_id = ${expired}`;
});
after(async () => { if (sql) await sql.end(); });
const integration = (name: string, fn: () => Promise<void>) => test(name, { skip: !database, timeout: 60000 }, fn);
const rejects = (action: Promise<unknown>, code: string, message?: string) =>
  assert.rejects(action, (error: { code?: string; message?: string }) => {
    assert.equal(error.code, code);
    if (message) assert.equal(error.message, message);
    return true;
  });

const support = { title: "Deletion fixture", description: null, capitalForms: ["social"], amount: null, timeframe: null,
  urgency: null, placeScope: "here", exchangeTerms: ["open"], purpose: null, capacity: null, audience: null, status: "open" };
const documentFor = (name: string, need = next(), offer = next()) => ({
  version: 1, initiative: { name, description: "", locations: [], isGlobal: false, links: [], stage: null, lenses: [],
    themes: [], beneficiaries: [], languages: [] },
  needs: [{ id: need, value: support }], offers: [{ id: offer, value: { ...support, title: "Offer fixture" } }],
  funding: { form: { workCountries: "", benefitCountries: "", applicantBaseCountry: "", registrationCountry: "",
    applicantType: "unknown", fundingInstruments: [], goalMin: "", goalMax: "", currency: "", usWorkStates: "",
    usBenefitStates: "" }, programAnswers: {} },
});
type Document = ReturnType<typeof documentFor>;

function asAccount<T>(actor: string | null, fn: (tx: postgres.TransactionSql) => Promise<T>) {
  return sql.begin(async (tx) => {
    await tx`set local role authenticated`;
    if (actor) await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: actor, session_id: session(actor),
      role: "authenticated", exp: Math.floor(Date.now() / 1000) + 600 })}, true)`;
    return fn(tx);
  });
}
const save = (actor: string, id: string, revision: number, request: string, doc: Document) => asAccount(actor, async (tx) => {
  const [row] = await tx`select weave.save_initiative(${id}, ${revision}, ${request}, ${JSON.stringify(doc)}::text::jsonb) as result`;
  return row!.result as { id: string; revision: number };
});
const remove = (actor: string | null, id: string | null, revision: number | null, request: string | null) =>
  asAccount(actor, async (tx) => {
    const [row] = await tx`select weave.delete_initiative(${id}::uuid, ${revision}::integer, ${request}::uuid) as result`;
    return row!.result as { id: string; deleted: true; revision: number; removed: string[]; kept: number };
  });

/** A saved personal card at revision 2, with one need and one offer and two receipts. */
async function card(actor = owner, name = "Deletion fixture card") {
  // Fixtures save more often than the hourly save limit allows one person.
  await sql`delete from private.weave_save_limits`;
  const id = next(), doc = documentFor(name), first = next(), second = next();
  await save(actor, id, 0, first, doc);
  await save(actor, id, 1, second, { ...doc, initiative: { ...doc.initiative, description: "Revised" } });
  return { id, doc, first, second };
}

// Every table a cascade from weave.initiatives could reach, and those deletion reads or writes.
const TABLES: Record<string, string | null> = {
  "weave.accounts": null, "weave.initiatives": "id", "weave.needs": "initiative_id", "weave.offers": "initiative_id",
  "private.weave_save_requests": "initiative_id", "private.weave_save_limits": null,
  "private.weave_matching_reviews": "initiative_id", "private.weave_matching_requests": null,
  "private.weave_matching_leads": "initiative_id", "private.weave_matching_query_vectors": "initiative_id",
  "private.weave_deleted_initiatives": "id", "weave_workspace.project_links": null, "weave_workspace.access_grants": null,
  "weave_workspace.create_intents": "initiative_id", "weave_workspace.setup_requests": null, "weave_workspace.pending_invites": null,
  "weave_workspace.support_listings": null, "weave_workspace.support_reviews": null, "weave_workspace.support_requests": null,
};
/** Row counts and a content hash per table. With `excluding`, the target card's own rows are left out. */
async function snapshot(excluding?: string) {
  const result: Record<string, { rows: number; hash: string }> = {};
  for (const [table, column] of Object.entries(TABLES)) {
    const filter = excluding && column ? `where t.${column} is distinct from '${excluding}'::uuid` : "";
    const [row] = await sql.unsafe(`select count(*)::int as rows,
      md5(coalesce(string_agg(t::text, '|' order by t::text), '')) as hash from ${table} t ${filter}`);
    result[table] = { rows: row!.rows as number, hash: row!.hash as string };
  }
  return result;
}
async function unchangedAfter(action: () => Promise<unknown>, code: string, message?: string) {
  const before = await snapshot();
  await rejects(action(), code, message);
  assert.deepEqual(await snapshot(), before, "a refused deletion changes nothing");
}

const SETUPS_UNDER_WAY = ["prepared", "group_pending", "group_confirmed", "project_pending", "project_confirmed"] as const;
/** A project setup for the owner's card at `status`, with the columns each status requires. Returns the group's DID. */
async function setup(id: string, status: typeof SETUPS_UNDER_WAY[number] | "group_rejected", handle: string) {
  const group = `did:plc:setupgroup${++serial}`;
  const grouped = !["prepared", "group_pending", "group_rejected"].includes(status);
  const project = status === "project_confirmed" ? `at://${group}/org.hypercerts.collection/setup${serial}` : null;
  await sql`insert into weave_workspace.create_intents(actor_id, request_id, initiative_id, expected_revision, group_handle,
    project_rkey, created_at, title, description, status, group_reconcile_after, group_did, project_uri, cid)
    values(${owner}, ${next()}, ${id}, 2, ${`${handle}${serial}`}, ${`rkey${serial}`}, now(), 'Fixture', '', ${status},
    ${status === "prepared" ? null : new Date()}, ${grouped ? group : null}, ${project}, ${project ? "bafysetup" : null})`;
  return group;
}

integration("the inventory of foreign keys and triggers on initiatives, needs and offers is exactly what deletion handles", async () => {
  const keys = await sql`select c.conrelid::regclass::text as source, c.confrelid::regclass::text as target,
      (select string_agg(a.attname, ',' order by k.n) from unnest(c.conkey) with ordinality k(attnum, n)
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum) as columns, c.confdeltype as on_delete
    from pg_constraint c where c.contype = 'f'
      and c.confrelid in ('weave.initiatives'::regclass, 'weave.needs'::regclass, 'weave.offers'::regclass)
    order by 1, 3`;
  // A new reference must be added to private.weave_delete_initiative and to this list together. The function
  // is now the one in weave-initiative-deletion-stale-references.sql, whose header says how each is handled.
  assert.deepEqual(keys.map(k => `${k.source}(${k.columns}) -> ${k.target} ${k.on_delete}`).sort(), [
    "private.weave_matching_leads(initiative_id) -> weave.initiatives c",
    "private.weave_matching_query_vectors(initiative_id) -> weave.initiatives c",
    "private.weave_matching_reviews(initiative_id) -> weave.initiatives c",
    "private.weave_save_requests(initiative_id) -> weave.initiatives c",
    "weave.needs(initiative_id) -> weave.initiatives c",
    "weave.offers(initiative_id) -> weave.initiatives c",
    "weave_workspace.create_intents(initiative_id) -> weave.initiatives c",
    "weave_workspace.project_links(solo_initiative_id) -> weave.initiatives c",
  ]);
  const outward = await sql`select c.conname, c.confrelid::regclass::text as target from pg_constraint c
    where c.contype = 'f' and c.conrelid = 'weave.initiatives'::regclass order by 1`;
  assert.deepEqual(outward.map(k => k.target).sort(), ["weave.accounts", "weave_workspace.project_links"]);
  const triggers = await sql`select tgrelid::regclass::text as source, tgname from pg_trigger
    where not tgisinternal and tgrelid in ('weave.initiatives'::regclass, 'weave.needs'::regclass, 'weave.offers'::regclass)
    order by 1, 2`;
  assert.deepEqual(triggers.map(t => `${t.source}.${t.tgname}`).sort(), [
    "weave.initiatives.prune_matching_query_vectors", "weave.initiatives.support_lenses_changed",
    "weave.initiatives.weave_initiative_not_deleted",
    "weave.needs.prune_matching_query_vectors", "weave.needs.support_entry_changed",
    "weave.offers.prune_matching_query_vectors", "weave.offers.support_entry_changed",
  ]);
  const rules = await sql`select count(*)::int as n from pg_rules where schemaname = 'weave'`;
  assert.equal(rules[0]!.n, 0);
});

integration("the owner deletes the exact revision; only that card, its entries and its receipts go", async () => {
  const target = await card();
  const kept = await card(owner, "Kept card"), others = await card(other, "Another account's card");
  const before = await snapshot(target.id);
  const result = await remove(owner, target.id, 2, next());
  const keptCount = await sql`select count(*)::int as n from weave.initiatives where owner_id = ${owner}`;
  assert.deepEqual(result, { id: target.id, deleted: true, revision: 2, removed: [target.id], kept: keptCount[0]!.n });
  assert.deepEqual(await snapshot(target.id), before, "every other row of every reachable table is unchanged");
  for (const [table, column] of [["weave.initiatives", "id"], ["weave.needs", "initiative_id"], ["weave.offers", "initiative_id"],
    ["private.weave_save_requests", "initiative_id"]] as const) {
    const [row] = await sql.unsafe(`select count(*)::int as n from ${table} where ${column} = $1`, [target.id]);
    assert.equal(row!.n, 0, `${table} has no row for the deleted card`);
  }
  const [tombstone] = await sql`select owner_id, deleted_revision from private.weave_deleted_initiatives where id = ${target.id}`;
  assert.deepEqual({ ...tombstone }, { owner_id: owner, deleted_revision: 2 });
  for (const unrelated of [kept, others]) {
    const [row] = await sql`select revision from weave.initiatives where id = ${unrelated.id}`;
    assert.equal(row!.revision, 2);
  }
  assert.equal((await sql`select count(*)::int as n from private.weave_save_requests where initiative_id in ${sql([kept.id, others.id])}`)[0]!.n, 4);
});

integration("another account, a stale revision, a team document and bad sessions or inputs change nothing", async () => {
  const target = await card();
  await unchangedAfter(() => remove(other, target.id, 2, next()), "PT404", "not_found");
  await unchangedAfter(() => remove(owner, target.id, 1, next()), "PT409", "revision_conflict");
  await unchangedAfter(() => remove(owner, target.id, 3, next()), "PT409", "revision_conflict");
  await unchangedAfter(() => remove(owner, next(), 1, next()), "PT404", "not_found");
  await unchangedAfter(() => remove(null, target.id, 2, next()), "PT401", "sign_in_required");
  await unchangedAfter(() => remove(expired, target.id, 2, next()), "PT401", "sign_in_required");
  for (const [id, revision, request] of [[null, 2, next()], [target.id, null, next()], [target.id, 2, null],
    [target.id, 0, next()], [target.id, -1, next()], [target.id, 2147483647, next()]] as const)
    await unchangedAfter(() => remove(owner, id, revision, request), "PT400", "invalid_data");
  // A team document is never personal, even for one of its admins.
  const team = next(), repository = "did:plc:deletiongroup";
  await sql`insert into weave_workspace.project_links(id, project_uri, repository_did, group_did, cid, linked_by)
    values(${team}, ${`at://${repository}/org.hypercerts.collection/team${serial}`}, ${repository}, ${repository}, 'bafyteam', ${owner})`;
  await sql`insert into weave_workspace.access_grants(workspace_id, user_id, member_did, access_role, granted_by)
    values(${team}, ${owner}, ${did(owner)}, 'admin', ${owner})`;
  await sql`insert into weave.initiatives(id, owner_id, team_workspace_id, card, funding)
    values(${team}, null, ${team}, ${JSON.stringify(target.doc.initiative)}::text::jsonb, ${JSON.stringify(target.doc.funding)}::text::jsonb)`;
  await unchangedAfter(() => remove(owner, team, 1, next()), "PT404", "not_found");
});

integration("a card anything else refers to is refused before any row is removed", async () => {
  const references: [string, (id: string, doc: Document) => Promise<unknown>][] = [
    ["solo project link", id => sql`insert into weave_workspace.project_links(id, project_uri, repository_did, solo_initiative_id, cid, linked_by)
      values(${id}, ${`at://${did(owner)}/org.hypercerts.collection/solo${serial}`}, ${did(owner)}, ${id}, 'bafysolo', ${owner})`],
    ["support listing on a solo link", async (id, doc) => {
      await sql`insert into weave_workspace.project_links(id, project_uri, repository_did, solo_initiative_id, cid, linked_by)
        values(${id}, ${`at://${did(owner)}/org.hypercerts.collection/listed${serial}`}, ${did(owner)}, ${id}, 'bafylisted', ${owner})`;
      await sql`insert into weave_workspace.support_listings(workspace_id, kind, entry_id, rkey, operation_id, actor_id,
        entry_revision, record_value, status) values(${id}, 'need', ${doc.needs[0]!.id}, 'aaaaaaaaaaaaa', ${next()}, ${owner}, 1, '{}', 'published')`;
    }],
    // Every setup still under way reads the card again before it finishes, so each holds it.
    ...SETUPS_UNDER_WAY.map((status): [string, (id: string) => Promise<unknown>] => [`${status} project setup`, id => setup(id, status, "held")]),
    ["a new setup after a refused one", async id => { await setup(id, "group_rejected", "refused"); await setup(id, "prepared", "retry"); }],
    ["open matching review", id => sql`insert into private.weave_matching_reviews(initiative_id, initiative_revision, entries, expires_at, valid_until)
      values(${id}, 2, '[]', now() + interval '1 day', now() + interval '15 minutes')`],
    ["another account's matching receipt", id => sql`insert into private.weave_matching_requests(actor_id, request_id, command)
      values(${other}, ${next()}, jsonb_build_array(${id}::uuid, 'withdraw', null, '[]'::jsonb))`],
    ["another account's receipt", id => sql`insert into private.weave_save_requests(actor_id, request_id, initiative_id, expected_revision, response)
      values(${other}, ${next()}, ${id}, 0, '{}')`],
  ];
  for (const [name, refer] of references) {
    const target = await card(owner, `Referenced by ${name}`);
    await refer(target.id, target.doc);
    await unchangedAfter(() => remove(owner, target.id, 2, next()), "PT409", "initiative_referenced");
  }
  // A withdrawn share, an expired review and the owner's own matching receipts no longer hold
  // the card: they go with it, and every other receipt stays.
  const withdrawn = await card(owner, "Withdrawn share");
  await sql`update weave.needs set matching_audience = 'weave_users', matching_withdrawn = true where initiative_id = ${withdrawn.id}`;
  await sql`insert into private.weave_matching_reviews(initiative_id, initiative_revision, entries, expires_at, valid_until)
    values(${withdrawn.id}, 2, '[]', now() + interval '1 day', now() - interval '1 second')`;
  const unrelated = await card(owner, "Unrelated receipts");
  await sql`insert into private.weave_matching_requests(actor_id, request_id, command) values
    (${owner}, ${next()}, jsonb_build_array(${withdrawn.id}::uuid, 'withdraw', null, '[]'::jsonb)),
    (${owner}, ${next()}, jsonb_build_array(${unrelated.id}::uuid, 'withdraw', null, '[]'::jsonb))`;
  const before = await snapshot(withdrawn.id);
  assert.equal((await remove(owner, withdrawn.id, 2, next())).deleted, true);
  const after = await snapshot(withdrawn.id);
  const own = await sql`select count(*)::int as n from private.weave_matching_requests where command->>0 = ${withdrawn.id}`;
  assert.equal(own[0]!.n, 0, "the owner's receipts for the card are gone");
  const reviews = await sql`select count(*)::int as n from private.weave_matching_reviews where initiative_id = ${withdrawn.id}`;
  assert.equal(reviews[0]!.n, 0, "the expired review is gone");
  assert.equal(after["private.weave_matching_requests"]!.rows, before["private.weave_matching_requests"]!.rows - 1);
  assert.deepEqual({ ...after, "private.weave_matching_requests": null }, { ...before, "private.weave_matching_requests": null });
  assert.equal((await sql`select count(*)::int as n from private.weave_matching_requests where command->>0 = ${unrelated.id}`)[0]!.n, 1);
});

// A personal save can no longer reach matching (it serves project workspaces only), so it cannot withdraw
// its sharing or clear its saved and dismissed partners and query vectors first. A finished setup's project lives in its own
// workspace. None of these may hold the card (QA notes, 26 November 2026).
integration("a finished or refused setup and the card's own sharing, partners and query vectors go with it", async () => {
  const finished = await card(owner, "Finished project setup");
  const group = `did:plc:groupfixture${serial}`, workspace = next(), uri = `at://${group}/org.hypercerts.collection/finished${serial}`;
  await sql`insert into weave_workspace.project_links(id, project_uri, repository_did, group_did, cid, linked_by)
    values(${workspace}, ${uri}, ${group}, ${group}, 'bafygroup', ${owner})`;
  await sql`insert into weave_workspace.create_intents(actor_id, request_id, initiative_id, expected_revision, group_handle,
    project_rkey, created_at, title, description, status, group_reconcile_after, group_did, registration_did, project_uri, cid, workspace_id)
    values(${owner}, ${next()}, ${finished.id}, 2, ${`finished${serial}`}, ${`finished${serial}`}, now(), 'Fixture', '', 'linked',
    now(), ${group}, ${group}, ${uri}, 'bafygroup', ${workspace})`;
  const refused = await card(owner, "Refused project setup");
  await setup(refused.id, "group_rejected", "refused");
  const shared = await card(owner, "Shared for matching");
  await sql`update weave.needs set matching_audience = 'weave_users', matching_withdrawn = false where initiative_id = ${shared.id}`;
  await sql`update weave.offers set matching_audience = 'weave_users', matching_withdrawn = false where initiative_id = ${shared.id}`;
  const partnered = await card(owner, "Saved partners");
  await sql`insert into private.weave_matching_leads(initiative_id, kind, entry_id, candidate_id, disposition)
    values(${partnered.id}, 'need', ${partnered.doc.needs[0]!.id}, 'public:at://did:plc:x/org.hypercerts.collection/y', 'saved')`;
  const embedded = await card(owner, "Query vector");
  await sql`insert into private.weave_matching_query_vectors(initiative_id, kind, entry_id, revision, share_version, model_version,
    embedding) values(${embedded.id}, 'need', ${embedded.doc.needs[0]!.id}, 1, 1, private.weave_matching_embedding_model(),
    (array[1::real] || array_fill(0::real, array[255]))::extensions.vector)`;
  // Another account saved the shared need as a partner for its own offer.
  const theirs = await card(other, "Their card");
  const candidate = `weave:${shared.id}:need:${shared.doc.needs[0]!.id}`;
  await sql`insert into private.weave_matching_leads(initiative_id, kind, entry_id, candidate_id, disposition)
    values(${theirs.id}, 'offer', ${theirs.doc.offers[0]!.id}, ${candidate}, 'saved')`;
  const theirLeads = () => sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: other, session_id: session(other),
      role: "authenticated", exp: Math.floor(Date.now() / 1000) + 600 })}, true)`;
    const [row] = await tx`select private.weave_matching_leads(${theirs.id}) as result`;
    return (row!.result as { leads: { candidateId: string; evidenceStatus: string }[] }).leads;
  });

  // A personal card is never in matching (weave_matching_current needs a project link), so their partner
  // already reads as unavailable. Deleting the card must keep their row and change nothing they see.
  const unavailable = [{ candidateId: candidate, evidenceStatus: "unavailable" }];
  const seen = async () => (await theirLeads()).map(({ candidateId, evidenceStatus }) => ({ candidateId, evidenceStatus }));
  assert.deepEqual(await seen(), unavailable);
  for (const target of [finished, refused, shared, partnered, embedded]) {
    const before = await snapshot(target.id);
    assert.equal((await remove(owner, target.id, 2, next())).deleted, true);
    for (const [table, column] of Object.entries(TABLES)) {
      if (!column || table === "private.weave_deleted_initiatives") continue;
      const [row] = await sql.unsafe(`select count(*)::int as n from ${table} where ${column} = $1`, [target.id]);
      assert.equal(row!.n, 0, `${table} keeps nothing of the deleted card`);
    }
    // Every row that was not the card's own is unchanged: other cards' setups, the group's workspace, others' leads.
    assert.deepEqual(await snapshot(target.id), before);
  }
  const [link] = await sql`select count(*)::int as n from weave_workspace.project_links where id = ${workspace}`;
  assert.equal(link!.n, 1, "the finished setup's project workspace stays");
  assert.deepEqual(await seen(), unavailable, "the other account keeps its saved partner, and sees it as before");
});

integration("a retry repeats its result; any other call for a removed card is not found and nothing returns", async () => {
  const target = await card(), another = await card(), request = next();
  const first = await remove(owner, target.id, 2, request);
  const settled = await snapshot();
  assert.deepEqual(await remove(owner, target.id, 2, request), first);
  await rejects(remove(owner, target.id, 2, next()), "PT404", "not_found");
  await rejects(remove(owner, target.id, 1, request), "PT404", "not_found");
  await rejects(remove(other, target.id, 2, request), "PT404", "not_found");
  await rejects(remove(owner, another.id, 2, request), "PT409", "request_reused");
  // A stale client: a first save, its retried create, an old revision and its retried update all fail.
  await rejects(save(owner, target.id, 0, next(), target.doc), "PT409", "initiative_deleted");
  await rejects(save(owner, target.id, 0, target.first, target.doc), "PT409", "initiative_deleted");
  await rejects(save(owner, target.id, 2, next(), target.doc), "PT404", "not_found");
  await rejects(save(owner, target.id, 1, target.second, target.doc), "PT404", "not_found");
  await rejects(save(other, target.id, 0, next(), target.doc), "PT409", "initiative_deleted");
  assert.deepEqual(await snapshot(), settled, "no card, entry, receipt or counter changed after the deletion");
});

integration("a first save waiting on a concurrent deletion fails once the deletion commits", async () => {
  const target = await card();
  let release = () => {}, started = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; }), deleted = new Promise<void>(resolve => { started = resolve; });
  const deletion = sql.begin(async (tx) => {
    await tx`set local role authenticated`;
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: owner, session_id: session(owner),
      role: "authenticated", exp: Math.floor(Date.now() / 1000) + 600 })}, true)`;
    await tx`select weave.delete_initiative(${target.id}, 2, ${next()})`;
    started();
    await gate;
  });
  await deleted;
  const create = save(owner, target.id, 0, next(), target.doc);
  create.catch(() => {});
  for (let attempt = 0; ; attempt++) {
    const [row] = await sql`select count(*)::int as n from pg_stat_activity
      where wait_event_type = 'Lock' and query like '%save_initiative%'`;
    if (row!.n > 0) break;
    assert.ok(attempt < 100, "the create waits for the deletion's row");
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  release();
  await deletion;
  await rejects(create, "PT409", "initiative_deleted");
  assert.equal((await sql`select count(*)::int as n from weave.initiatives where id = ${target.id}`)[0]!.n, 0);
  // Two deliveries of one request racing each other both report the same deletion.
  const again = await card(), request = next();
  const results = await Promise.all([remove(owner, again.id, 2, request), remove(owner, again.id, 2, request)]);
  assert.deepEqual(results[0], results[1]);
});

integration("a project setup that starts while the card is being deleted fails and leaves no setup behind", async () => {
  const target = await card(owner, "Setup racing a deletion");
  let release = () => {}, started = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; }), deleted = new Promise<void>(resolve => { started = resolve; });
  const deletion = sql.begin(async (tx) => {
    await tx`set local role authenticated`;
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: owner, session_id: session(owner),
      role: "authenticated", exp: Math.floor(Date.now() / 1000) + 600 })}, true)`;
    await tx`select weave.delete_initiative(${target.id}, 2, ${next()})`;
    started();
    await gate;
  });
  await deleted;
  const begin = sql`select weave_workspace.creation(${owner}, ${did(owner)}, 'begin_create', ${sql.json({
    requestId: next(), initiativeId: target.id, expectedRevision: 2, groupHandle: `race${serial}.certified.test`,
    projectRkey: `race${serial}`, createdAt: new Date().toISOString(), publicProfile: { title: "Race fixture", description: "" },
  })}) as result`;
  begin.catch(() => {});
  for (let attempt = 0; ; attempt++) {
    const [row] = await sql`select count(*)::int as n from pg_stat_activity
      where wait_event_type = 'Lock' and query like '%weave_workspace.creation%'`;
    if (row!.n > 0) break;
    assert.ok(attempt < 100, "starting the setup waits for the deletion's lock on the card");
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  release();
  await deletion;
  await rejects(begin, "PT404", "not_found");
  assert.equal((await sql`select count(*)::int as n from weave_workspace.create_intents where initiative_id = ${target.id}`)[0]!.n, 0);
  assert.equal((await sql`select count(*)::int as n from private.weave_deleted_initiatives where id = ${target.id}`)[0]!.n, 1);
});

integration("a signed-in account cannot change initiatives or read removal records directly", async () => {
  const target = await card();
  for (const statement of [
    (tx: postgres.TransactionSql) => tx`delete from weave.initiatives where id = ${target.id}`,
    (tx: postgres.TransactionSql) => tx`delete from weave.needs where initiative_id = ${target.id}`,
    (tx: postgres.TransactionSql) => tx`update weave.initiatives set revision = 1 where id = ${target.id}`,
    (tx: postgres.TransactionSql) => tx`select * from private.weave_deleted_initiatives`,
    (tx: postgres.TransactionSql) => tx`insert into private.weave_deleted_initiatives(id, owner_id, deleted_revision, request_id, response)
      values(${next()}, ${owner}, 1, ${next()}, '{}')`,
    (tx: postgres.TransactionSql) => tx`delete from private.weave_save_requests`,
  ]) await unchangedAfter(() => asAccount(owner, statement), "42501");
  for (const role of ["anon", "service_role"])
    await unchangedAfter(() => sql.begin(async (tx) => {
      await tx.unsafe(`set local role ${role}`);
      await tx`select weave.delete_initiative(${target.id}, 2, ${next()})`;
    }), "42501");
});
