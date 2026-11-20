import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { after, before, test } from "node:test";
import postgres from "postgres";
import { parsePublicEvidenceSnapshot } from "./matching-contract.ts";
import { refreshAllPublicProjects, withdrawAllPublicProjects } from "./project-index-all-public.ts";
import { connectProjectIndex } from "./project-index-postgres.ts";
import { createHypercertsSource, extractCollection, PROJECT_EXTRACTION_VERSION, type ProjectRead } from "./project-index-source.ts";
import { refreshProjectIndex } from "./project-index.ts";
import { parsePublicProjectPage } from "./public-projects-contract.ts";
import { createPublicProjectsHandler } from "./public-projects-http.ts";
import { connectPublicProjectReader, type PublicProjectReader } from "./public-projects-store.ts";
import { projectDid, projectListing, projectName, projectUri, projectView } from "./test-data/public-projects.ts";

// A disposable loopback database only: this suite drops and recreates the private schema.
const database = process.env.WEAVE_INDEX_TEST_DATABASE_URL;
const candidate = (name: string) => readFile(new URL(`../../../supabase/candidates/${name}.sql`, import.meta.url), "utf8");
let admin: postgres.Sql;
let restricted: string;
let index: Awaited<ReturnType<typeof connectProjectIndex>>;
let reader: PublicProjectReader;

before(async () => {
  if (!database) return;
  const url = new URL(database);
  if (url.hostname !== "127.0.0.1" || url.pathname !== "/weave_index_all_public_test")
    throw Error("dedicated_loopback_index_test_database_required");
  admin = postgres(database, { max: 1, onnotice: () => undefined });
  await admin.unsafe(`
    do $$ begin
      if not exists(select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
      if not exists(select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
      if not exists(select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
      if not exists(select 1 from pg_roles where rolname = 'weave_workspace_runtime') then create role weave_workspace_runtime; end if;
      if not exists(select 1 from pg_roles where rolname = 'weave_all_public_index') then
        create role weave_all_public_index login nosuperuser nobypassrls nocreatedb nocreaterole noreplication;
      end if;
    end $$;
    drop schema if exists private cascade;
    create schema private;
    create schema if not exists extensions;`);
  await admin.unsafe(await candidate("weave-project-index"));
  await admin.unsafe(await candidate("weave-project-index-card-facts"));
  await admin.unsafe(await candidate("weave-public-evidence-snapshot"));
  const password = randomBytes(18).toString("base64url");
  await admin.unsafe(`alter role weave_all_public_index login password '${password}'`);
  await admin`grant weave_index_job to weave_all_public_index`;
  url.username = "weave_all_public_index";
  url.password = password;
  restricted = url.href;
  index = await connectProjectIndex(restricted);
  reader = await connectPublicProjectReader(restricted);
});
after(async () => {
  await reader?.close();
  await index?.close();
  await admin?.end();
});
const integration = (name: string, run: () => Promise<void>) => test(name, { skip: !database }, run);

// Forty projects over two pages of 25: one with only a title, one unlisted, one with an unsafe title.
const SAO = 7, RIVER = 9, ODD = 10, TITLE_ONLY = 37, UNLISTED = 38, INVALID = 39;
const views: unknown[] = Array.from({ length: 40 }, (_, n) => projectView(n, n === TITLE_ONLY ? { short: null }
  : n === UNLISTED ? { unlisted: "organization" } : n === INVALID ? { title: "Write to example@example.com" }
    : n === SAO ? { short: "Our São Paulo garden network shares seed. Neighbours keep the beds.",
      publisher: "Lagoa Seed Library", place: "São Paulo, Brazil", organizationTypes: ["nonprofit"] }
      : n === RIVER ? { publisher: "Riverkeepers", organizationTypes: ["Cooperative", "nonprofit"] }
        : n === ODD ? { publisher: "Write to someone@example.com", place: 7, organizationTypes: "nonprofit" } : {}));
const listing: Parameters<typeof projectListing>[0] = { views };
const source = createHypercertsSource({ wait: async () => undefined, fetch: projectListing(listing) });
/** Accounts named here live on Certified's development server; the rest on certified.one. */
const onDevServer = new Set<string>();
const hosts = { resolve: async (did: string) => ({ status: "found" as const, host: onDevServer.has(did) ? "dev.certified.app" : "certified.one" }) };
const refresh = (options: Partial<Parameters<typeof refreshAllPublicProjects>[0]> = {}) =>
  refreshAllPublicProjects({ source, store: index.store, hosts, deadline: Date.now() + 60_000, wait: async () => undefined, ...options });
/** One page through the public handler, from a fresh copy of the list. */
async function page(search = "", extra = "") {
  const handler = createPublicProjectsHandler({ reader: async () => reader });
  const response = await handler(new Request(`https://weave.example/api/public-projects?q=${encodeURIComponent(search)}${extra}`));
  const body = parsePublicProjectPage(await response.json());
  return { total: body.index.total, projects: body.projects };
}
const tables = () => admin`
  select s.project_uri, s.status, s.permission_until, s.cid, s.content_hash, s.checked_at, s.fetched_at, s.error_code,
    s.publisher_name, s.place_name, s.organization_types,
    (select coalesce(jsonb_agg(e.evidence order by e.id), '[]') from private.weave_project_index_evidence e where e.project_uri = s.project_uri) as evidence
  from private.weave_project_index_source s order by s.project_uri`;
/** Every shown project, following the handler's cursors seven at a time. */
async function collect() {
  const handler = createPublicProjectsHandler({ reader: async () => reader });
  const seen: string[] = [];
  let next: string | null = null;
  for (let request = 0; request < 20; request++) {
    const response = await handler(new Request(`https://weave.example/api/public-projects?limit=7${next ? `&cursor=${next}` : ""}`));
    const body = parsePublicProjectPage(await response.json());
    seen.push(...body.projects.map(({ uri }) => uri));
    next = body.next;
    if (!next) return seen;
  }
  throw Error("too_many_pages");
}
const evidenceCount = async (uri: string) =>
  (await admin<{ count: number }[]>`select count(*)::int as count from private.weave_project_index_evidence where project_uri = ${uri}`)[0]!.count;

integration("the first refresh shows every listed public project with text, newest first and searchable", async () => {
  const report = await refresh();
  assert.deepEqual([report.status, report.generation, report.pages, report.listed, report.unlisted, report.invalid, report.withoutText],
    ["complete", 1, 2, 38, 1, 1, 1]);
  const all = await page("", "&limit=24");
  assert.equal(all.total, 37, "the title-only project is indexed but has nothing to show");
  const everything = await collect();
  assert.equal(everything.length, 37);
  assert.ok(everything.every((uri) => ![TITLE_ONLY, UNLISTED, INVALID].map(projectUri).includes(uri)));
  const order = all.projects.map(({ sharedAt, uri }) => [sharedAt, uri].join(" "));
  assert.deepEqual(order, [...order].sort().reverse());
  const sao = (await page("sao paulo")).projects;
  assert.deepEqual(sao.map(({ uri }) => uri), [projectUri(SAO)]);
  assert.deepEqual(sao[0]?.passages, ["Our São Paulo garden network shares seed.", "Neighbours keep the beds."]);
  assert.equal(sao[0]?.name, projectName(SAO));
  assert.match(sao[0]?.sourceUrl ?? "", /^https:\/\/api\.hypercerts\.dev\/xrpc\/org\.hypercerts\.collection\.getCollection\?uri=/u);
  assert.equal((await page("SÃO   garden")).total, 1);
  assert.equal((await page("wetlands volunteers")).total, 36);
  assert.equal((await page(projectName(3))).projects[0]?.uri, projectUri(3));
  assert.equal((await page("no such words anywhere")).total, 0);
  // Who shared it and where come from the source row, and a malformed one is simply left out.
  assert.deepEqual([sao[0]?.publisher, sao[0]?.place], ["Lagoa Seed Library", "São Paulo, Brazil"]);
  assert.deepEqual((await page("lagoa seed library")).projects.map(({ uri }) => uri), [projectUri(SAO)]);
  assert.deepEqual((await page("riverkeepers")).projects.map(({ uri, publisher, place }) => [uri, publisher, place]),
    [[projectUri(RIVER), "Riverkeepers", undefined]]);
  const odd = (await page(projectName(ODD))).projects[0];
  assert.deepEqual([odd?.uri, "publisher" in odd!, "place" in odd!], [projectUri(ODD), false, false]);
  const nonprofit = await page("", "&organizationType=nonprofit");
  assert.deepEqual(nonprofit.projects.map(({ uri }) => uri).sort(), [SAO, RIVER].map(projectUri).sort());
  assert.deepEqual((await page("", "&organizationType=cooperative")).projects.map(({ uri }) => uri), [projectUri(RIVER)]);
  const handler = createPublicProjectsHandler({ reader: async () => reader });
  const index = parsePublicProjectPage(await (await handler(new Request("https://weave.example/api/public-projects"))).json()).index;
  assert.deepEqual(index.organizationTypes, ["nonprofit", "cooperative"]);
  const [state] = await admin`select manifest_generation, next_offset, completed_at is not null as done from private.weave_project_index_checkpoint`;
  assert.deepEqual([state!.manifest_generation, state!.next_offset, state!.done], [1, 0, true]);
});

integration("pages follow the cursor without gaps or repeats", async () => {
  const seen = await collect();
  assert.equal(seen.length, 37);
  assert.equal(new Set(seen).size, 37);
});

integration("an unchanged refresh keeps the same evidence in a new generation", async () => {
  const before = await tables();
  const report = await refresh();
  assert.deepEqual([report.status, report.generation, report.withdrawn], ["complete", 2, 0]);
  const after = await tables();
  assert.deepEqual(after.map(({ project_uri, status, content_hash, evidence }) => [project_uri, status, content_hash, evidence]),
    before.map(({ project_uri, status, content_hash, evidence }) => [project_uri, status, content_hash, evidence]));
  assert.ok(after.every((row, n) => row.permission_until >= before[n]!.permission_until));
});

integration("an unlisted flip, a removal and a move to a test server withdraw the project and delete its evidence at once", async () => {
  // Project 4 had a publisher and place, which go with its words when it is withdrawn.
  await admin`update private.weave_project_index_source set publisher_name = 'Riverside Commons', place_name = 'Awka, Nigeria',
    organization_types = '{nonprofit}' where project_uri = ${projectUri(4)}`;
  views[3] = projectView(3, { unlisted: "legacy" });
  views.splice(4, 1);
  onDevServer.add(projectDid(8));
  const report = await refresh();
  assert.deepEqual([report.status, report.withdrawn, report.listed, report.testHosts], ["complete", 3, 36, 1]);
  for (const n of [3, 4, 8]) {
    const [row] = await admin`select status, error_code, permission_until <= now() as expired,
        publisher_name, place_name, organization_types
      from private.weave_project_index_source where project_uri = ${projectUri(n)}`;
    assert.deepEqual([row!.status, row!.error_code, row!.expired], ["restricted", "permission_removed", true]);
    assert.deepEqual([row!.publisher_name, row!.place_name, row!.organization_types], [null, null, []]);
    assert.equal(await evidenceCount(projectUri(n)), 0);
  }
  const shownNow = await collect();
  assert.equal(shownNow.length, 34);
  assert.ok([3, 4, 8].every((n) => !shownNow.includes(projectUri(n))));
  // The signed-in evidence snapshot reads the same rows and drops them too, and still parses.
  const [snapshot] = await admin`select private.weave_public_project_snapshot(${projectUri(0)}) as result`;
  const parsed = parsePublicEvidenceSnapshot({ ...snapshot!.result, workspaceId: "10000000-0000-4000-8000-000000000001" });
  const shown = new Set(parsed.evidence.map(({ projectUri: uri }) => uri));
  assert.equal(shown.size, 33);
  assert.ok([0, 3, 4, 8].every((n) => !shown.has(projectUri(n))));
});

integration("an outage or a partial traversal leaves every row as it was", async () => {
  const before = await tables();
  const [checkpoint] = await admin`select revision, manifest_generation from private.weave_project_index_checkpoint`;
  listing.fail = ({ cursor }) => cursor ? Response.json({}, { status: 502 }) : null;
  const outage = await refresh();
  assert.deepEqual([outage.status, outage.code], ["not_replaced", "source_unavailable"]);
  listing.fail = undefined;
  const partial = await refresh({ maxPages: 1 });
  assert.deepEqual([partial.status, partial.code], ["not_replaced", "page_budget_exhausted"]);
  assert.deepEqual(await tables(), before);
  const [unchanged] = await admin`select revision, manifest_generation from private.weave_project_index_checkpoint`;
  assert.deepEqual(unchanged, checkpoint);
});

integration("a project listed again is shown again, and expiry or stale reads hide a project without a refresh", async () => {
  views[3] = projectView(3);
  onDevServer.delete(projectDid(8));
  const report = await refresh();
  assert.deepEqual([report.status, report.listed], ["complete", 37]);
  assert.ok((await evidenceCount(projectUri(3))) > 0);
  assert.equal((await page()).total, 36);
  await admin`update private.weave_project_index_source set permission_until = now() - interval '1 second' where project_uri = ${projectUri(5)}`;
  await admin`update private.weave_project_index_source set fetched_at = now() - interval '8 days' where project_uri = ${projectUri(6)}`;
  const hidden = await collect();
  assert.equal(hidden.length, 34);
  assert.ok(!hidden.includes(projectUri(5)) && !hidden.includes(projectUri(6)));
  // Unlisted and unsafe projects were never stored; the removed, expired, stale and title-only ones are not shown.
  const state = await index.store.state();
  assert.deepEqual(state.projects.filter(({ shown }) => !shown).map(({ uri }) => uri).sort(),
    [4, 5, 6, TITLE_ONLY].map(projectUri).sort());
});

integration("two runs at once leave one consistent permission set", async () => {
  const results = await Promise.allSettled([refresh(), refresh()]);
  const outcomes = results.map((result) => result.status === "fulfilled" ? result.value.status : (result.reason as Error).message);
  assert.ok(outcomes.includes("complete"), outcomes.join(", "));
  assert.ok(outcomes.every((outcome) => ["complete", "contended", "obsolete_or_conflicting_manifest"].includes(outcome)), outcomes.join(", "));
  assert.equal((await page()).total, 36, "the refresh confirms the expired and stale projects again");
});

/** The card's facts as stored for one project. */
const stored = async (n: number) => (await admin<{ publisher: string | null; place: string | null; types: string[] }[]>`
  select publisher_name as publisher, place_name as place, organization_types as types
  from private.weave_project_index_source where project_uri = ${projectUri(n)}`)[0];

integration("a publisher that renames itself keeps its project shown under the same CID, with the new name", async () => {
  const at = views.findIndex((view) => (view as { uri: string }).uri === projectUri(RIVER));
  const [before] = await admin`select cid, content_hash, extraction_version from private.weave_project_index_source where project_uri = ${projectUri(RIVER)}`;
  views[at] = projectView(RIVER, { publisher: "River Keepers Awka", place: "Awka, Nigeria", organizationTypes: ["cooperative"] });
  assert.equal((await refresh()).status, "complete");
  const [after] = await admin`select status, cid, content_hash, extraction_version from private.weave_project_index_source where project_uri = ${projectUri(RIVER)}`;
  // The same CID with a new hash would be refused as a divergent projection; the facts are outside the hash.
  assert.deepEqual(after, { status: "indexed", ...before });
  assert.equal(before!.extraction_version, PROJECT_EXTRACTION_VERSION);
  assert.deepEqual(await stored(RIVER), { publisher: "River Keepers Awka", place: "Awka, Nigeria", types: ["cooperative"] });
  assert.deepEqual((await page("river keepers awka")).projects.map(({ uri, place }) => [uri, place]), [[projectUri(RIVER), "Awka, Nigeria"]]);
});

integration("withdrawing everything empties the public list", async () => {
  const report = await withdrawAllPublicProjects({ store: index.store });
  assert.equal(report.status, "complete");
  assert.equal((await page()).total, 0);
  assert.equal(await admin<{ count: number }[]>`select count(*)::int as count from private.weave_project_index_evidence`
    .then(([row]) => row!.count), 0);
});

integration("a project whose data Postgres refuses is recorded as malformed and the sweep goes on", async () => {
  const { generation } = await index.store.state();
  const fetchedAt = new Date().toISOString();
  const read = (n: number) => {
    const result = extractCollection(projectView(n, { version: 9 }), projectUri(n), fetchedAt);
    if (result.status !== "indexed") throw Error("expected an indexed fixture");
    return result;
  };
  // Built by hand: extraction rejects a lone surrogate, but the store must still survive one.
  const broken = read(51);
  const poison = { ...broken, passages: broken.passages.map((passage) => ({ ...passage, passage: "Broken \ud800 text." })) };
  const reads = new Map([[projectUri(51), poison], [projectUri(52), read(52)]]);
  const redisplayUntil = new Date(Date.now() + 3_600_000).toISOString();
  const report = await refreshProjectIndex({
    manifest: { generation: generation + 1, permissions: [51, 52].map((n) => ({ uri: projectUri(n), redisplayUntil })) },
    store: index.store, source: { get: async ({ uri }) => reads.get(uri)! }, batchSize: 5,
  });
  assert.deepEqual([report.indexed, report.failed, report.swept], [1, 1, true]);
  const rows = await admin`select status, error_code from private.weave_project_index_source
    where project_uri in (${projectUri(51)}, ${projectUri(52)}) order by project_uri`;
  assert.deepEqual(rows.map(({ status, error_code }) => [status, error_code]), [["failed", "invalid_source_record"], ["indexed", null]]);
  assert.equal(await evidenceCount(projectUri(51)), 0);
  assert.ok(await evidenceCount(projectUri(52)) > 0);
});

integration("a temporary failure keeps a project's card facts with its words, and a malformed record clears both", async () => {
  const redisplayUntil = new Date(Date.now() + 3_600_000).toISOString();
  const run = async (read: ProjectRead) => {
    const { generation } = await index.store.state();
    return refreshProjectIndex({ manifest: { generation: generation + 1, permissions: [{ uri: projectUri(53), redisplayUntil }] },
      store: index.store, source: { get: async () => read }, batchSize: 1, readsInHand: true });
  };
  const facts = { publisher: "Lagoa Seed Library", place: "São Paulo, Brazil", types: ["nonprofit"] };
  await run(extractCollection(projectView(53, { publisher: facts.publisher, place: facts.place, organizationTypes: facts.types }),
    projectUri(53), new Date().toISOString()));
  assert.deepEqual(await stored(53), facts);
  assert.equal((await run({ status: "failed", code: "source_unavailable" })).failed, 1);
  assert.deepEqual(await stored(53), facts);
  assert.ok(await evidenceCount(projectUri(53)) > 0);
  await run({ status: "failed", code: "invalid_source_record" });
  assert.deepEqual(await stored(53), { publisher: null, place: null, types: [] });
  assert.equal(await evidenceCount(projectUri(53)), 0);
});
