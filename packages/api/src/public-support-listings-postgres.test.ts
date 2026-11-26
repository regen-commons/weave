import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import postgres from "postgres";
import { createPublicInitiative } from "./public-initiative.ts";
import { parsePublicInitiative, type PublicInitiative } from "./public-initiative-contract.ts";
import { connectPublicInitiativeReader, type PublicInitiativeReader } from "./public-initiative-store.ts";

// Separate database: this suite drops and recreates every Weave schema, so it must not share another suite's.
const database = process.env.WEAVE_PUBLIC_LISTINGS_TEST_DATABASE_URL;
const baseline = process.env.WEAVE_PUBLIC_LISTINGS_TEST_BASELINE;
let sql: postgres.Sql;
let reader: PublicInitiativeReader;
let serial = 100;
const uid = (n: number) => `61000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const next = () => uid(++serial);
const owner = uid(1), sid = uid(2);
// Synthetic accounts and records only.
const ownerDid = "did:plc:publiclistingsowneraaaaa";
const groupA = "did:plc:publiclistingsaaaaaaaaaa", groupB = "did:plc:publiclistingsbbbbbbbbbb";
const projectA = `at://${groupA}/org.hypercerts.collection/3m6bq4seedlib`;
const projectB = `at://${groupB}/org.hypercerts.collection/3m6bq4seedlib`;
const projectCid = `bafyrei${"p".repeat(52)}`;
const listingCid = (letter: string) => `b${letter.repeat(58)}`;
const listingUri = (repository: string, rkey: string) => `at://${repository}/com.regencommons.weave.supportListing/${rkey}`;
const candidate = (name: string) => readFile(new URL(`../../../supabase/candidates/${name}.sql`, import.meta.url), "utf8");
// The production order of the website migrations, then this candidate. It leaves out the later
// deletion candidate (weave-initiative-deletion-stale-references), which listings do not depend on.
const CANDIDATES = ["certified-private-access", "weave-matching", "weave-project-index", "weave-matching-vectors",
  "weave-project-oauth", "weave-project-workspaces", "weave-team-content", "weave-public-evidence-snapshot",
  "weave-project-discovery", "weave-workspace-invites", "weave-support-publication", "weave-open-ended-sharing",
  "weave-initiative-deletion", "weave-project-index-card-facts", "weave-project-index-work-scope",
  "weave-project-index-organization-description", "weave-public-support-listings"];

before(async () => {
  if (!database) return;
  const url = new URL(database);
  if (url.hostname !== "127.0.0.1" || url.pathname !== "/weave_public_listings_test" || !baseline)
    throw Error("dedicated_loopback_public_listings_test_database_and_baseline_required");
  sql = postgres(database, { max: 4, onnotice: () => {} });
  await sql.unsafe("drop schema if exists weave_workspace, weave_project_oauth, weave_auth, weave, auth, private, extensions cascade");
  await sql.unsafe(await readFile(new URL("../test-fixtures/weave-matching-postgres-setup.sql", import.meta.url), "utf8"));
  await sql`alter table auth.users add column email_confirmed_at timestamptz`;
  await sql.unsafe(await readFile(baseline, "utf8"));
  for (const name of CANDIDATES) await sql.unsafe(await candidate(name));
  await sql`insert into auth.users(id) values(${owner})`;
  await sql`insert into auth.sessions(id, user_id) values(${sid}, ${owner})`;
  await sql`insert into auth.identities values(${owner}, 'custom:certified', ${`https://certified.one|${ownerDid}`})`;
  // The public reader's own login: a member of weave_index_job and nothing else, as the deployment's is.
  const password = randomBytes(18).toString("base64url");
  await sql.unsafe(`do $$ begin
    if not exists(select 1 from pg_roles where rolname = 'weave_public_listings_reader') then
      create role weave_public_listings_reader login nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
    end if; end $$`);
  await sql.unsafe(`alter role weave_public_listings_reader login password '${password}'`);
  await sql`grant weave_index_job to weave_public_listings_reader`;
  const restricted = new URL(database);
  restricted.username = "weave_public_listings_reader";
  restricted.password = password;
  reader = await connectPublicInitiativeReader(restricted.href);
});
after(async () => {
  await reader?.close();
  if (sql) await sql.end();
});
const integration = (name: string, fn: () => Promise<void>) => test(name, { skip: !database, timeout: 60000 }, fn);

type Kind = "need" | "offer";
const support = (title: string) => ({ title, description: `${title}, in public words`, capitalForms: ["social"], amount: null,
  timeframe: null, urgency: null, placeScope: "here", exchangeTerms: ["open"], purpose: "Private purpose", capacity: null,
  audience: null, status: "open" });
const document = (needs: string[], offers: string[]) => ({
  version: 1, initiative: { name: "Public listings fixture", description: "Private workspace summary", locations: [],
    isGlobal: false, links: [], stage: null, lenses: [], themes: [], beneficiaries: [], languages: [] },
  needs: needs.map((id, n) => ({ id, value: support(`Need ${n + 1}`) })),
  offers: offers.map((id, n) => ({ id, value: support(`Offer ${n + 1}`) })),
  funding: { form: { workCountries: "", benefitCountries: "", applicantBaseCountry: "", registrationCountry: "",
    applicantType: "unknown", fundingInstruments: [], goalMin: "", goalMax: "", currency: "", usWorkStates: "",
    usBenefitStates: "" }, programAnswers: {} },
});

/** A synthetic group workspace linked to a project, with the owner as admin and a saved card of needs and offers. */
async function workspace(group: string, project: string, needs: string[], offers: string[]) {
  const id = next();
  await sql`insert into weave_workspace.project_links(id, project_uri, repository_did, group_did, solo_initiative_id, cid, linked_by)
    values(${id}, ${project}, ${group}, ${group}, null, ${projectCid}, ${owner})`;
  await sql`insert into weave_workspace.access_grants(workspace_id, user_id, member_did, access_role, granted_by)
    values(${id}, ${owner}, ${ownerDid}, 'admin', ${owner})`;
  await sql.begin(async (tx) => {
    await tx`set local role weave_workspace_runtime`;
    await tx`select weave_workspace.content_command(${owner}, ${sid}, ${ownerDid}, ${id}, 'owner', null, 'team_save',
      ${JSON.stringify({ expectedRevision: 0, requestId: next(), document: document(needs, offers) })}::text::jsonb)`;
  });
  return id;
}
/** The existing support command, as the API calls it with the workspace runtime role. */
async function command(id: string, action: string, data: Record<string, unknown>) {
  return sql.begin(async (tx) => {
    await tx`set local role weave_workspace_runtime`;
    const [row] = await tx`select weave_workspace.support_command(${owner}, ${sid}, ${ownerDid}, ${id}, 'owner',
      ${projectCid}, ${action}, ${JSON.stringify(data)}::text::jsonb) as result`;
    return row!.result as { rkey: string; operationId: string; status: string; record: Record<string, unknown>; cid: string | null };
  });
}
/** Review and publish one entry: the publication is then `publish_pending`. */
async function publish(id: string, kind: Kind, entryId: string, expiresAt: string | null = null) {
  const [revisions] = await sql`select i.revision, e.matching_revision from weave.initiatives i
    join private.weave_matching_entries e on e.initiative_id = i.id where i.id = ${id} and e.id = ${entryId} and e.kind = ${kind}`;
  const review = await command(id, "support_review", { kind, entryId, expectedRevision: revisions!.revision,
    expectedEntryRevision: Number(revisions!.matching_revision), expiresAt }) as unknown as { reviewId: string };
  return command(id, "support_publish", { requestId: next(), reviewId: review.reviewId, audience: "public-atproto", confirmPublic: true });
}
const checkpoint = (id: string, kind: Kind, entryId: string, operationId: string, event: string, extra: Record<string, unknown> = {}) =>
  command(id, "support_checkpoint", { kind, entryId, operationId, event, ...extra });
/** Publish, send and confirm by read-back, as the adapter does: the publication is then `published` with its CID. */
async function confirmed(id: string, kind: Kind, entryId: string, cid: string, expiresAt: string | null = null) {
  const pending = await publish(id, kind, entryId, expiresAt);
  await checkpoint(id, kind, entryId, pending.operationId, "sending");
  const published = await checkpoint(id, kind, entryId, pending.operationId, "published", { cid });
  assert.equal(published.status, "published");
  return published;
}
const withdraw = (id: string, kind: Kind, entryId: string) => command(id, "support_withdraw", { kind, entryId, requestId: next() });

type Listed = { kind: string; rkey: string; uri: string; cid: string; record: Record<string, unknown> };
/** What the public reader's login gets from the function. */
const listed = (project: string) => sql.begin(async (tx) => {
  await tx`set local role weave_public_listings_reader`;
  return [...await tx<Listed[]>`select * from private.weave_public_support_listings(${project})`];
});
const stored = async (id: string, entryId: string) =>
  (await sql`select record_value, cid, rkey, status from weave_workspace.support_listings where workspace_id = ${id} and entry_id = ${entryId}`)[0]!;

/** A shown index row for a project, as the daily refresh writes one, with two passages in reading order. */
async function indexed(project: string, name: string) {
  await sql`insert into private.weave_project_index_source(project_uri, status, permission_until, cid, content_hash,
      extraction_version, checked_at, fetched_at, source_indexed_at, publisher_name, place_name, organization_types, work_scope)
    values(${project}, 'indexed', now() + interval '2 days', ${projectCid}, 'hash', 'fixture', now(), now(),
      now() - interval '1 day', 'Lagoa Seed Library', 'São Paulo, Brazil', ${["nonprofit"]}, ${["seed-saving"]})`;
  for (const [position, passage] of ["We keep heirloom seed in a shared library.", "Neighbours borrow seed in spring."].entries())
    await sql`insert into private.weave_project_index_evidence(id, project_uri, evidence, lexical_text)
      values(${`${project}#${position}`}, ${project}, ${sql.json({ projectUri: project, cid: projectCid, projectName: name, passage, position,
        sourceUrl: `https://api.hypercerts.dev/xrpc/org.hypercerts.collection.getCollection?uri=${encodeURIComponent(project)}`,
        sourceCreatedAt: "2026-09-02T10:00:00.000Z", sourceIndexedAt: "2026-09-02T10:05:00.000Z" })}, ${passage})`;
}

const needs = Array.from({ length: 5 }, next), offers = Array.from({ length: 5 }, next);
const [current, pending, withdrawing, expiring, elsewhere] = needs as [string, string, string, string, string];
const [currentOffer, withdrawn, conflicting, matchingOnly] = offers as [string, string, string, string, string];
const otherNeed = next();
let a: string, b: string;

integration("only project A's confirmed, open and unexpired listings come back, exactly as read back, until one expires", async () => {
  a = await workspace(groupA, projectA, needs, offers);
  b = await workspace(groupB, projectB, [otherNeed], []);
  // Through the support command flow: confirmed, pending, withdrawing, withdrawn and conflicting publications.
  const need = await confirmed(a, "need", current, listingCid("c"));
  const offer = await confirmed(a, "offer", currentOffer, listingCid("d"));
  assert.equal((await publish(a, "need", pending)).status, "publish_pending");
  await confirmed(a, "need", withdrawing, listingCid("e"));
  assert.equal((await withdraw(a, "need", withdrawing)).status, "withdrawal_pending");
  const gone = await confirmed(a, "offer", withdrawn, listingCid("f"));
  await withdraw(a, "offer", withdrawn);
  assert.equal((await checkpoint(a, "offer", withdrawn, gone.operationId, "withdrawn")).status, "withdrawn");
  const changed = await confirmed(a, "offer", conflicting, listingCid("g"));
  assert.equal((await checkpoint(a, "offer", conflicting, changed.operationId, "conflict")).status, "conflict");
  await confirmed(b, "need", otherNeed, listingCid("h"));
  // Direct writes as the table owner, for states the command flow cannot reach: a confirmed record that names
  // another project, and an entry shared only for matching (its share needs a matching review flow).
  await confirmed(a, "need", elsewhere, listingCid("i"));
  await sql`update weave_workspace.support_listings set record_value = jsonb_set(record_value, '{projectUri}', to_jsonb(${projectB}::text))
    where workspace_id = ${a} and entry_id = ${elsewhere}`;
  await sql`update weave.offers set matching_audience = 'weave_users', matching_withdrawn = false,
    matching_reviewed_revision = matching_revision, matching_reviewed_summary_revision = 1,
    matching_expires_at = now() + interval '1 day' where initiative_id = ${a} and id = ${matchingOnly}`;
  const [shared] = await sql`select count(*)::int as n from private.weave_matching_entries
    where initiative_id = ${a} and matching_audience = 'weave_users' and not matching_withdrawn`;
  assert.equal(shared!.n, 1, "one entry is shared for matching and was never published");
  // A listing that expires in three seconds, published through the flow while it is still current.
  const expiresAt = new Date(Date.now() + 3000).toISOString();
  const soon = await confirmed(a, "need", expiring, listingCid("j"), expiresAt);

  const expected = (row: { rkey: string; record: Record<string, unknown> }, kind: Kind, cid: string) =>
    ({ kind, rkey: row.rkey, uri: listingUri(groupA, row.rkey), cid, record: row.record });
  const first = await listed(projectA);
  const order = (x: Listed, y: Listed) => x.kind < y.kind ? -1 : x.kind > y.kind ? 1 : x.rkey < y.rkey ? -1 : x.rkey > y.rkey ? 1 : 0;
  assert.deepEqual(first, [expected(need, "need", listingCid("c")), expected(soon, "need", listingCid("j")),
    expected(offer, "offer", listingCid("d"))].sort(order), "by kind, then record key");
  for (const row of first) {
    const entry = row.kind === "need" ? (row.rkey === need.rkey ? current : expiring) : currentOffer;
    const saved = await stored(a, entry);
    assert.deepEqual([row.record, row.cid, row.rkey, saved.status], [saved.record_value, saved.cid, saved.rkey, "published"],
      "the stored, read-back record and CID, nothing else");
    assert.deepEqual(Object.keys(row).sort(), ["cid", "kind", "record", "rkey", "uri"]);
  }
  assert.equal(first[0]!.record.purpose, undefined, "private details never enter the public record");
  const late = Date.parse(soon.record.expiresAt as string) - Date.now();
  await new Promise((resolve) => setTimeout(resolve, Math.max(0, late) + 200));
  const afterExpiry = await listed(projectA);
  assert.deepEqual(afterExpiry, [expected(need, "need", listingCid("c")), expected(offer, "offer", listingCid("d"))]);
  assert.equal((await stored(a, expiring)).status, "published", "expiry hides a listing without a status change");
  // Project B sees only its own listing; an unknown project and a null address see none.
  const other = await listed(projectB);
  assert.deepEqual(other.map(({ uri, cid }) => [uri, cid]), [[listingUri(groupB, (await stored(b, otherNeed)).rkey as string), listingCid("h")]]);
  assert.deepEqual(await listed(`at://${groupA}/org.hypercerts.collection/3m6bq4otherpp`), []);
  assert.deepEqual([...await sql`select * from private.weave_public_support_listings(null)`], []);
});

integration("a withdrawal removes a listing from the next call, before and after it is confirmed", async () => {
  const live = await stored(a, current);
  assert.ok((await listed(projectA)).some(({ rkey }) => rkey === live.rkey));
  const queued = await withdraw(a, "need", current);
  assert.equal(queued.status, "withdrawal_pending");
  assert.ok(!(await listed(projectA)).some(({ rkey }) => rkey === live.rkey), "gone as soon as withdrawal is queued");
  await checkpoint(a, "need", current, queued.operationId, "withdrawn");
  assert.equal((await stored(a, current)).status, "withdrawn");
  assert.deepEqual((await listed(projectA)).map(({ kind }) => kind), ["offer"]);
  // Confirmed unlisting of project B pauses its link and queues its withdrawals: none show on the next call.
  await command(b, "support_project_ineligible", {});
  assert.deepEqual(await listed(projectB), []);
});

integration("only the public reader's role may call the function, and no one reaches the workspace tables through it", async () => {
  const denied = async (role: string, query: string) => assert.rejects(sql.begin(async (tx) => {
    await tx.unsafe(`set local role ${role}`);
    await tx.unsafe(query);
  }), { code: "42501" }, `${role}: ${query}`);
  const call = `select * from private.weave_public_support_listings('${projectA}')`;
  for (const role of ["anon", "authenticated", "service_role", "weave_workspace_runtime"]) await denied(role, call);
  for (const role of ["anon", "authenticated", "service_role", "weave_index_job", "weave_public_listings_reader"])
    for (const table of ["support_listings", "project_links", "support_reviews", "support_requests"])
      await denied(role, `select * from weave_workspace.${table}`);
  const [grants] = await sql`select
      has_function_privilege('weave_index_job', 'private.weave_public_support_listings(text)', 'execute') as job,
      has_function_privilege('public', 'private.weave_public_support_listings(text)', 'execute') as everyone,
      p.prosecdef as definer, p.provolatile as volatility, p.proconfig as config
    from pg_proc p where p.oid = 'private.weave_public_support_listings(text)'::regprocedure`;
  assert.deepEqual({ ...grants }, { job: true, everyone: false, definer: true, volatility: "s", config: ['search_path=""'] });
});

integration("the store reads one shown project and its listings as the restricted login, and the handler answers them", async () => {
  await indexed(projectA, "Community seed library");
  const loaded = await reader.load(projectA);
  assert.ok(loaded);
  assert.deepEqual(loaded.project, {
    uri: projectA, name: "Community seed library",
    passages: ["We keep heirloom seed in a shared library.", "Neighbours borrow seed in spring."],
    sourceUrl: `https://api.hypercerts.dev/xrpc/org.hypercerts.collection.getCollection?uri=${encodeURIComponent(projectA)}`,
    organizationTypes: ["nonprofit"], workScopes: ["seed-saving"], publisher: "Lagoa Seed Library", place: "São Paulo, Brazil",
    sharedAt: "2026-09-02T10:00:00.000000Z", checkedAt: (loaded.project as { checkedAt: string }).checkedAt,
  });
  const offer = await stored(a, currentOffer);
  assert.deepEqual(loaded.listings, [{ kind: "offer", uri: listingUri(groupA, offer.rkey as string), cid: listingCid("d"),
    record: offer.record_value }]);
  // A project the list does not show has no page, and its listings are not read.
  assert.equal(await reader.load(projectB), null);
  await indexed(projectB, "Other project");
  await sql`update private.weave_project_index_source set permission_until = now() - interval '1 second' where project_uri = ${projectB}`;
  assert.equal(await reader.load(projectB), null);

  const handle = createPublicInitiative({ reader: async () => reader, links: () => null });
  const response = await handle(new Request(`https://weave.example/api/public-initiative?uri=${encodeURIComponent(projectA)}`));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = parsePublicInitiative(await response.json()) as PublicInitiative;
  assert.deepEqual(body.needs, []);
  assert.deepEqual(body.offers.map(({ uri, cid, title }) => [uri, cid, title]),
    [[listingUri(groupA, offer.rkey as string), listingCid("d"), "Offer 1"]]);
  assert.deepEqual(body.project.description, ["We keep heirloom seed in a shared library.", "Neighbours borrow seed in spring."]);
  await withdraw(a, "offer", currentOffer);
  const after = parsePublicInitiative(await (await handle(new Request(
    `https://weave.example/api/public-initiative?uri=${encodeURIComponent(projectA)}`))).json()) as PublicInitiative;
  assert.deepEqual([after.needs, after.offers], [[], []], "the withdrawal is gone from the next answer");
  const missing = await handle(new Request(`https://weave.example/api/public-initiative?uri=${encodeURIComponent(projectB)}`));
  assert.equal(missing.status, 404);
});
