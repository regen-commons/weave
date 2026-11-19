import assert from "node:assert/strict";
import test from "node:test";
import {
  ALL_PUBLIC_REDISPLAY_MS, refreshAllPublicProjects, testEntryReason, withdrawAllPublicProjects, type AllPublicStore,
} from "./project-index-all-public.ts";
import { createAccountHostResolver, isCertifiedTestHost, type AccountHost } from "./project-index-hosts.ts";
import { createProjectIndexRefreshHandler } from "./project-index-refresh-http.ts";
import { createHypercertsSource } from "./project-index-source.ts";
import { traverseProjectNetwork } from "./project-index-traversal.ts";
import type { ProjectCheckpoint } from "./project-index.ts";
import { projectDid, projectListing, projectUri, projectView } from "./test-data/public-projects.ts";

const start = Date.parse("2026-11-15T04:00:00Z");
const noWait = async () => undefined;
/** Every account lives on certified.one unless a test names another answer for it. */
const accountHosts = (answers = new Map<string, AccountHost>()) => ({
  answers, lookups: 0,
  async resolve(did: string): Promise<AccountHost> { this.lookups++; return answers.get(did) ?? { status: "found", host: "certified.one" }; },
});

/** Mirrors the Postgres store's generation, compare-and-swap and withdrawal rules closely enough to test the run. */
function memoryStore(clock: () => number) {
  const data = {
    generation: 0, hash: "", revision: 0, offset: 0, opens: 0, commits: [] as string[], contendAfter: Infinity,
    sources: new Map<string, { status: string; until: number; checkedAt: string; passages: number }>(),
  };
  const checkpoint = (): ProjectCheckpoint => ({ revision: String(data.revision), offset: data.offset, retryAfter: null });
  const store: AllPublicStore = {
    async state() {
      return { generation: data.generation, projects: [...data.sources].map(([uri, source]) => ({
        uri, checkedAt: source.checkedAt, shown: source.status === "indexed" && source.until > clock() && source.passages > 0,
      })) };
    },
    async open(manifest, hash) {
      if (data.generation > manifest.generation || (data.generation === manifest.generation && data.hash !== hash))
        throw Error("obsolete_or_conflicting_manifest");
      if (data.generation === manifest.generation) return checkpoint();
      Object.assign(data, { generation: manifest.generation, hash, offset: 0, revision: data.revision + 1, opens: data.opens + 1 });
      const allowed = new Set(manifest.permissions.map(({ uri }) => uri));
      for (const [uri, source] of data.sources)
        if (!allowed.has(uri)) Object.assign(source, { status: "restricted", until: Math.min(source.until, clock()), passages: 0 });
      return checkpoint();
    },
    async commit({ checkpoint: expected, permission, read, nextOffset, checkedAt }) {
      if (expected.revision !== String(data.revision) || data.commits.length >= data.contendAfter) return null;
      Object.assign(data, { revision: data.revision + 1, offset: nextOffset });
      data.sources.set(permission.uri, { status: read.status, until: Date.parse(permission.redisplayUntil), checkedAt,
        passages: read.status === "indexed" ? read.passages.length : 0 });
      data.commits.push(permission.uri);
      return { ...checkpoint(), sourceStatus: read.status };
    },
  };
  return { store, data };
}

function setup(views: unknown[], fail?: Parameters<typeof projectListing>[0]["fail"]) {
  let now = start;
  const clock = () => now;
  const requests: { limit: number; cursor: string | null }[] = [];
  const listing = { views, fail, requests };
  const source = createHypercertsSource({ now: clock, wait: noWait, fetch: projectListing(listing) });
  const memory = memoryStore(clock);
  const hosts = accountHosts();
  const run = (options: Partial<Parameters<typeof refreshAllPublicProjects>[0]> = {}) =>
    refreshAllPublicProjects({ source, store: memory.store, hosts, deadline: now + 240_000, now: clock, wait: noWait, ...options });
  return { ...memory, listing, requests, run, hosts, advance: (ms: number) => { now += ms; }, clock };
}

test("a complete traversal becomes the permission set, and unlisted, removed and malformed projects are withdrawn", async () => {
  const views = Array.from({ length: 30 }, (_, n) => projectView(n));
  const index = setup(views);
  const first = await index.run();
  assert.equal(first.status, "complete");
  assert.equal(first.listed, 30);
  assert.equal(first.pages, 2);
  assert.equal(first.generation, 1);
  assert.equal(first.indexed, 30);
  assert.deepEqual(index.requests.map(({ limit }) => limit), [25, 25]);
  const until = index.data.sources.get(projectUri(0))!.until;
  assert.equal(until, start + ALL_PUBLIC_REDISPLAY_MS);

  index.advance(24 * 60 * 60 * 1000);
  views[3] = projectView(3, { unlisted: "organization" });
  views[4] = projectView(4, { unlisted: "legacy" });
  views[5] = projectView(5, { unlisted: "collection" });
  views[6] = projectView(6, { title: "Contact us at example@example.com" });
  views.splice(7, 1);
  const second = await index.run();
  assert.equal(second.status, "complete");
  assert.equal(second.generation, 2);
  assert.equal(second.listed, 25);
  assert.equal(second.unlisted, 3);
  assert.equal(second.invalid, 1);
  assert.equal(second.withdrawn, 5);
  const state = await index.store.state();
  const hidden = state.projects.filter(({ shown }) => !shown).map(({ uri }) => uri).sort();
  assert.deepEqual(hidden, [3, 4, 5, 6, 7].map(projectUri).sort());
  assert.doesNotMatch(JSON.stringify(second), /at:\/\/|wetlands|Watershed|example@/u);
});

test("an outage, a partial traversal or a cursor cycle changes nothing that is shown", async () => {
  const views = Array.from({ length: 60 }, (_, n) => projectView(n));
  const outage = setup(views);
  await outage.run();
  const before = JSON.stringify([...outage.data.sources]);
  outage.listing.fail = ({ page }) => page >= 4 ? Response.json({}, { status: 503 }) : null;
  const failed = await outage.run();
  assert.equal(failed.status, "not_replaced");
  assert.equal(failed.code, "source_unavailable");
  assert.equal(outage.data.generation, 1);
  assert.equal(JSON.stringify([...outage.data.sources]), before);

  outage.listing.fail = undefined;
  const partial = await outage.run({ maxPages: 2 });
  assert.equal(partial.status, "not_replaced");
  assert.equal(partial.code, "page_budget_exhausted");
  assert.equal(outage.data.opens, 1);

  outage.listing.fail = ({ cursor }) => cursor === "c25" ? Response.json({ collections: [projectView(0)], cursor: "c0" }) : null;
  const cycle = await outage.run();
  assert.equal(cycle.code, "source_cursor_cycle");
  assert.equal(outage.data.opens, 1);
  assert.equal(JSON.stringify([...outage.data.sources]), before);
});

test("a temporary outage is retried with backoff, but a refusal is not", async () => {
  const views = Array.from({ length: 10 }, (_, n) => projectView(n));
  let calls = 0;
  const waits: number[] = [];
  const source = createHypercertsSource({ now: () => start, wait: noWait, fetch: projectListing({ views,
    fail: () => ++calls <= 2 ? Response.json({}, { status: 503 }) : null }) });
  const pages: number[] = [];
  const result = await traverseProjectNetwork({ source, maxPages: 5, limit: 25, attempts: 3,
    wait: async (ms) => { waits.push(ms); }, onPage: (rows) => pages.push(rows.length) });
  assert.equal(result.status, "complete");
  assert.deepEqual(pages, [10]);
  // The source retries once itself; the traversal waits before its second attempt.
  assert.deepEqual(waits, [2000]);

  const refused = createHypercertsSource({ now: () => start, wait: noWait,
    fetch: async () => Response.json({}, { status: 403 }) });
  waits.length = 0;
  const denied = await traverseProjectNetwork({ source: refused, maxPages: 5, limit: 25, attempts: 3,
    wait: async (ms) => { waits.push(ms); }, onPage: () => undefined });
  assert.deepEqual([denied.status, denied.code, waits], ["failed", "source_access_denied", []]);

  const throttled = createHypercertsSource({ now: () => start, wait: noWait,
    fetch: async () => Response.json({}, { status: 429, headers: { "Retry-After": "120" } }) });
  const limited = await traverseProjectNetwork({ source: throttled, maxPages: 5, limit: 25, attempts: 3,
    wait: async (ms) => { waits.push(ms); }, onPage: () => undefined });
  assert.deepEqual([limited.status, limited.code, waits], ["failed", "source_rate_limited", []]);
  // A short Retry-After is honored, never undercut, and the page is read again, on a rate limit or an outage.
  for (const [status, retryAfter, expected] of [[429, "1", [2000]], [429, "20", [20_000]], [503, "10", [10_000]]] as const) {
    let calls = 0;
    const brief = createHypercertsSource({ now: () => start, wait: noWait, fetch: projectListing({ views,
      fail: () => ++calls === 1 ? Response.json({}, { status, headers: { "Retry-After": retryAfter } }) : null }) });
    waits.length = 0;
    const retried = await traverseProjectNetwork({ source: brief, maxPages: 5, limit: 25, attempts: 3,
      wait: async (ms) => { waits.push(ms); }, onPage: () => undefined });
    assert.deepEqual([retried.status, waits], ["complete", expected]);
  }
});

test("a page over its byte budget is read again with fewer records, down to one", async () => {
  const views = Array.from({ length: 7 }, (_, n) => projectView(n));
  const requests: { limit: number; cursor: string | null }[] = [];
  const big = "x".repeat(2 * 1024 * 1024 + 1);
  const source = createHypercertsSource({ now: () => start, wait: noWait, fetch: projectListing({ views, requests,
    fail: ({ limit }) => limit === 25 ? new Response(big) : null }) });
  const rows: number[] = [];
  const result = await traverseProjectNetwork({ source, maxPages: 10, limit: 25, onPage: (page) => rows.push(page.length) });
  assert.equal(result.status, "complete");
  assert.deepEqual(rows, [5, 2]);
  assert.deepEqual(requests.map(({ limit }) => limit), [25, 5, 25, 5]);

  const huge = createHypercertsSource({ now: () => start, wait: noWait,
    fetch: async () => new Response("x".repeat(4 * 1024 * 1024 + 1)) });
  const failed = await traverseProjectNetwork({ source: huge, maxPages: 10, limit: 25, onPage: () => undefined });
  assert.deepEqual([failed.status, failed.code], ["failed", "source_response_too_large"]);
});

test("a listing that would hide more than half of the shown projects is refused unless an operator allows it", async () => {
  const views = Array.from({ length: 40 }, (_, n) => projectView(n));
  const index = setup(views);
  await index.run();
  index.listing.views = views.slice(0, 15);
  const refused = await index.run();
  assert.deepEqual([refused.status, refused.code, refused.shownBefore, refused.withdrawn], ["not_replaced", "suspicious_shrink", 40, 25]);
  assert.equal(index.data.generation, 1);
  // Unconfirmed projects still expire, so a lasting shrink is applied once nothing older is shown.
  index.advance(ALL_PUBLIC_REDISPLAY_MS + 1);
  const expired = await index.run();
  assert.deepEqual([expired.status, expired.listed, expired.shownBefore], ["complete", 15, 0]);

  // Replacing most shown projects with new ones keeps the count but is refused all the same.
  const swap = setup(Array.from({ length: 40 }, (_, n) => projectView(n)));
  await swap.run();
  swap.listing.views = Array.from({ length: 40 }, (_, n) => projectView(n < 10 ? n : n + 100));
  const swapped = await swap.run();
  assert.deepEqual([swapped.status, swapped.code, swapped.listed, swapped.withdrawn], ["not_replaced", "suspicious_shrink", 40, 30]);

  const operator = setup(Array.from({ length: 40 }, (_, n) => projectView(n)));
  await operator.run();
  operator.listing.views = [];
  const allowed = await operator.run({ allowShrink: true });
  assert.deepEqual([allowed.status, allowed.withdrawn], ["complete", 40]);
  assert.equal((await operator.store.state()).projects.filter(({ shown }) => shown).length, 0);
});

test("a sweep cut short by time resumes with the projects checked longest ago", async () => {
  const views = Array.from({ length: 30 }, (_, n) => projectView(n));
  const index = setup(views);
  // Time runs out once five projects are committed.
  const slow = () => start + (index.data.commits.length >= 5 ? 300_000 : 0);
  const cut = await refreshAllPublicProjects({ source: createHypercertsSource({ now: slow, wait: noWait,
    fetch: projectListing({ views }) }), store: index.store, hosts: accountHosts(), deadline: start + 240_000, now: slow, wait: noWait });
  assert.equal(cut.status, "partial");
  assert.equal(cut.code, "index_time_budget");
  const committed = new Set(index.data.commits);
  assert.equal(committed.size, 5);
  index.data.commits.length = 0;
  index.advance(24 * 60 * 60 * 1000);
  const next = await index.run();
  assert.equal(next.status, "complete");
  const unchecked = index.data.commits.slice(0, 30 - committed.size);
  assert.ok(unchecked.every((uri) => !committed.has(uri)), "projects never checked come first");
});

test("a run that loses the checkpoint to a newer run stops without finishing", async () => {
  const index = setup(Array.from({ length: 30 }, (_, n) => projectView(n)));
  index.data.contendAfter = 3;
  const result = await index.run();
  assert.deepEqual([result.status, result.code, result.scanned], ["contended", "index_contended", 3]);
});

test("accounts on Certified's development and test servers are left out, and a failed lookup changes nothing", async () => {
  const views = Array.from({ length: 30 }, (_, n) => projectView(n));
  const index = setup(views);
  await index.run();
  index.hosts.answers.set(projectDid(1), { status: "found", host: "dev.certified.app" });
  index.hosts.answers.set(projectDid(2), { status: "found", host: "pds1.test.certified.app" });
  index.hosts.answers.set(projectDid(3), { status: "unavailable" });
  index.hosts.answers.set(projectDid(4), { status: "found", host: "climateai.org" });
  const report = await index.run();
  assert.deepEqual([report.status, report.accounts, report.listed, report.testHosts, report.withoutHost, report.withdrawn],
    ["complete", 30, 30, 2, 1, 3]);
  const hidden = (await index.store.state()).projects.filter(({ shown }) => !shown).map(({ uri }) => uri).sort();
  assert.deepEqual(hidden, [1, 2, 3].map(projectUri).sort());

  const before = JSON.stringify([...index.data.sources]);
  index.hosts.answers.set(projectDid(5), { status: "failed" });
  const failed = await index.run();
  assert.deepEqual([failed.status, failed.code], ["not_replaced", "account_host_unavailable"]);
  assert.equal(JSON.stringify([...index.data.sources]), before);
  assert.equal(index.data.generation, 2);
});

test("an account's server comes from its DID document, and only a definite answer leaves it out", async () => {
  for (const [host, test] of [["dev.certified.app", true], ["pds1.test.certified.app", true], ["test.certified.app", true],
    ["DEV.Certified.App", true], ["certified.one", false], ["certified.app", false], ["notdev.certified.app", false],
    ["dev.certified.app.example", false], ["dev.certified.app.", true], ["pds1.test.certified.app.", true]] as const)
    assert.equal(isCertifiedTestHost(host), test, host);
  const did = projectDid(9);
  const document = (service: unknown, id = did) => Response.json({ id, service });
  const pds = (serviceEndpoint: string) => [{ id: "#atproto_pds", type: "AtprotoPersonalDataServer", serviceEndpoint }];
  const resolve = async (answer: () => Response | Promise<Response>) => {
    const urls: string[] = [];
    const resolver = createAccountHostResolver({ wait: noWait, fetch: async (url) => { urls.push(String(url)); return answer(); } });
    return { result: await resolver.resolve(did), urls };
  };
  const found = await resolve(() => document(pds("https://Dev.Certified.App")));
  assert.deepEqual(found, { result: { status: "found", host: "dev.certified.app" }, urls: [`https://plc.directory/${did}`] });
  assert.deepEqual((await resolve(() => document([{ ...pds("https://certified.one")[0], id: `${did}#atproto_pds` }]))).result,
    { status: "found", host: "certified.one" });
  for (const answer of [
    () => document(pds("http://certified.one")), () => document(pds("not a url")), () => document([]),
    () => new Response("{}", { status: 404 }), () => new Response("{}", { status: 410 }),
  ]) assert.deepEqual((await resolve(answer)).result, { status: "unavailable" });
  // Only this DID's own document is an answer. Anything else served with 200 is retried, then fails.
  for (const answer of [
    () => document(pds("https://certified.one"), projectDid(10)), () => Response.json({ message: "DID not registered" }),
    () => Response.json(null), () => Response.json([]),
  ]) assert.deepEqual(await resolve(answer).then(({ result, urls }) => [result, urls.length]), [{ status: "failed" }, 2]);
  // A body that is not a document is more likely an error page in the way than an answer.
  assert.deepEqual((await resolve(() => new Response("not json"))).result, { status: "failed" });
  const outage = await resolve(() => new Response("{}", { status: 503 }));
  assert.deepEqual([outage.result, outage.urls.length], [{ status: "failed" }, 2]);
  assert.deepEqual((await resolve(() => { throw Error("network"); })).result, { status: "failed" });
  assert.deepEqual((await resolve(() => new Response("x".repeat(70 * 1024)))).result, { status: "failed" });
  const web = createAccountHostResolver({ fetch: async () => { throw Error("did:web is never fetched"); } });
  assert.deepEqual(await web.resolve("did:web:projects.example.org"), { status: "found", host: "projects.example.org" });
  assert.deepEqual(await web.resolve("did:web:dev.certified.app"), { status: "found", host: "dev.certified.app" });
});

// Invented names and text in the shapes seen on 19 November 2026. None is a real project.
const realText = ["We restore wetlands along the river with volunteers each season."];
test("a project whose name or own words declare it a QA or test entry is recognised, and why", () => {
  // A name leads with "QA", holds nothing but test words and numbering, or carries a label set apart from it.
  for (const name of ["QA Wizard Project 7", "QA Test Project B", "QA Riverside Repair Cafe", "Test project", "test",
    "Tests", "Seed library tutorial (test)", "Pollinator count - TEST", "Testing", "Testing project 2", "testing 123",
    "Test project v2", "qa test", "Test A", "[TEST] Seed swap", "TEST: Seed swap", "Garden map (QA)"])
    assert.equal(testEntryReason(name, realText), "test_named", name);
  // A sentence says nothing else, opens with the label in capitals, names a QA entry, or says it is not real.
  for (const passage of ["TEST PROJECT", "This is a test project.", "It is only a test entry!",
    "TEST PROJECT made to check the publishing wizard.", "Automated QA project created by the release suite.",
    "QA test story about a community garden.", "QA story for the organisation page.",
    "An automated QA entry with sample text.", "We plant trees here. It is not a real project.",
    "It's not a real initiative, only sample text.", "A test project created on staging to check images.",
    "Ignore this one, it is a QA project made for testing."])
    assert.equal(testEntryReason("Riverside Commons", [realText[0]!, passage]), "test_described", passage);
  // The name is checked first, so a project that both names and describes itself as a test counts once, by name.
  assert.equal(testEntryReason("QA Garden 3", ["TEST PROJECT for the garden form."]), "test_named");
});

test("real projects that only mention testing, contests, demos or staging are never taken for test entries", () => {
  for (const name of ["Attested Wetland Restoration", "Soil Testing Cooperative", "Testing Grounds Farm", "Coastal Contest for Clean Beaches",
    "Latest Harvest Collective", "Protest Garden", "QAnat Water Revival", "Qanat Keepers", "Test-bed Agroforestry Trust",
    "Demonstration Plot Network", "Demo Farm Collective", "Tutorial Forest School", "Staging Ground Community Kitchen",
    "Water Testing for Every Village", "Qa Valley Seeds", "Retest Lab Cooperative", "Testament Orchard", ""])
    assert.equal(testEntryReason(name, realText), null, name);
  for (const passage of ["Our fields are testing grounds for our tools and seed varieties.",
    "We run soil testing for smallholder farms across the valley.", "Members attested each planting with photos.",
    "The demonstration plot opened in spring with forty families.", "A tutorial for new volunteers runs monthly.",
    "We are staging a community harvest festival in June.", "We tested drip irrigation last season and kept it.",
    "This is a real project with real people behind it.", "Our latest contest drew forty entries from schools.",
    "Qanat project restores an old water channel.", "Test plots across three villages show yield gains.",
    "Testing project outcomes with the community each season keeps us honest.", "The staging area holds tools.",
    "We are not a charity but a cooperative.", "Demo days show the test results of our compost trials."])
    assert.equal(testEntryReason("Riverside Commons", [passage]), null, passage);
});

test("a place or a phrase with Test or QA in its name, a pilot called a test project and an informal group stay shown", () => {
  // "Test" is a river and a valley in England, and "test" is an ordinary verb and noun in a name.
  for (const name of ["Test Valley Rewilding", "River Test Restoration", "Test the Waters", "Litmus Test Garden",
    "TEST YOUR SOIL", "Stress Test Collective", "Tests of Time Orchard", "Beta Test Kitchen", "Qatar Mangroves QA",
    "Water Quality - Testing", "Community QA Lab"])
    assert.equal(testEntryReason(name, realText), null, name);
  // Every sentence of a description is read, so one that mentions a pilot or an informal group must not count.
  for (const passage of ["A test project in two villages showed strong results.",
    "Test project sites in three villages show yield gains.", "Test project for regenerative grazing in the Karoo.",
    "This is a test project for our new composting method, run with forty farmers.",
    "It is a test project of the municipality to trial shared solar.", "Our work began as a test project in 2019.",
    "We are not a real organisation, just neighbours who plant trees.",
    "We are not an actual organization but an informal network of growers.",
    "QA project for water quality assurance in rural clinics.",
    "A test project made for testing drought-resistant seed varieties."])
    assert.equal(testEntryReason("Riverside Commons", [realText[0]!, passage]), null, passage);
  // Worded like a real pilot, so a test entry that says only this is shown: hiding real work is the worse mistake.
  assert.equal(testEntryReason("Riverside Commons", ["This is a test project for the upload form."]), null);
});

test("a test entry is skipped on first sight, withdrawn if shown, and counted without its name", async () => {
  const views = Array.from({ length: 30 }, (_, n) => projectView(n));
  const index = setup(views);
  await index.run();
  index.advance(24 * 60 * 60 * 1000);
  views[1] = projectView(1, { title: "QA Wizard Project 1" });
  views[2] = projectView(2, { short: "TEST PROJECT made to check the publishing wizard. Please ignore it." });
  // A test server is the first reason, so this project is counted once, as a test host.
  views[3] = projectView(3, { title: "QA Wizard Project 3" });
  index.hosts.answers.set(projectDid(3), { status: "found", host: "dev.certified.app" });
  views.push(projectView(40, { title: "Test project" }), projectView(41, { title: "Soil Testing Cooperative",
    short: "Our fields are testing grounds for our tools. Members attested each planting." }));
  const report = await index.run();
  assert.deepEqual([report.status, report.listed, report.testHosts, report.testNamed, report.testDescribed, report.withdrawn],
    ["complete", 32, 1, 2, 1, 3]);
  const state = await index.store.state();
  assert.deepEqual(state.projects.filter(({ shown }) => !shown).map(({ uri }) => uri).sort(), [1, 2, 3].map(projectUri).sort());
  assert.equal(index.data.sources.has(projectUri(40)), false);
  assert.equal(state.projects.find(({ uri }) => uri === projectUri(41))?.shown, true);
  assert.doesNotMatch(JSON.stringify(report), /at:\/\/|QA Wizard|Test project|TEST PROJECT|Soil Testing/u);
});

test("a date or text Postgres cannot store makes the record or passage invalid instead of reaching the index", async () => {
  const views = [projectView(0), projectView(1, { createdAt: "2026-10-01T12:00:00+20:00" }),
    projectView(2, { createdAt: "0000-01-01T00:00:00Z" }), projectView(3, { indexedAt: "2026-11-14T00:00:00-16:00" }),
    projectView(4, { createdAt: "2026-10-01T12:00:00+15:59" }), projectView(5, { title: "Lone \ud800 surrogate" }),
    projectView(6, { short: "A lone \udc00 surrogate is dropped. The rest of the description stays." })];
  const index = setup(views);
  const report = await index.run();
  assert.deepEqual([report.status, report.invalid, report.listed], ["complete", 4, 3]);
  assert.deepEqual([...index.data.sources.keys()].sort(), [0, 4, 6].map(projectUri).sort());
  assert.equal(index.data.sources.get(projectUri(6))?.passages, 1);
});

test("withdrawing everything empties the list in a new generation", async () => {
  const index = setup(Array.from({ length: 5 }, (_, n) => projectView(n)));
  await index.run();
  const result = await withdrawAllPublicProjects({ store: index.store, now: index.clock });
  assert.deepEqual([result.status, result.withdrawn, result.generation], ["complete", 5, 2]);
  assert.equal((await index.store.state()).projects.filter(({ shown }) => shown).length, 0);
});

test("the cron handler needs its secret, its switch and its database, and logs counts only", async () => {
  const views = [...Array.from({ length: 3 }, (_, n) => projectView(n)), projectView(3, { title: "QA Wizard Project 3" })];
  const lines: string[] = [];
  const memory = memoryStore(() => start);
  let closed = 0;
  const env: Record<string, string | undefined> = {
    CRON_SECRET: "fixture-cron-secret-0123456789", WEAVE_INDEX_REFRESH: "all-public",
    WEAVE_INDEX_DATABASE_URL: "postgres://fixture@127.0.0.1:1/never", WEAVE_DATABASE_CA_PEM: "fixture-ca",
  };
  const cas: (string | undefined)[] = [];
  const handler = createProjectIndexRefreshHandler({
    env, now: () => start, wait: noWait, log: (line) => lines.push(line),
    source: createHypercertsSource({ now: () => start, wait: noWait, fetch: projectListing({ views }) }),
    hosts: accountHosts(),
    connect: async (_url, ca) => { cas.push(ca); return { store: memory.store, close: async () => { closed++; } }; },
  });
  const call = (authorization?: string, method = "GET") => handler(new Request("https://weave.example/api/project-index-refresh",
    { method, headers: authorization ? { authorization } : {} }));
  const body = async (response: Response) => [response.status, response.headers.get("cache-control"), await response.json()];

  assert.deepEqual(await body(await call(undefined, "POST")), [405, "no-store", { error: "method_not_allowed" }]);
  assert.deepEqual(await body(await call()), [401, "no-store", { error: "unauthorized" }]);
  assert.deepEqual(await body(await call("Bearer wrong")), [401, "no-store", { error: "unauthorized" }]);
  env.WEAVE_INDEX_REFRESH = "manifest";
  assert.deepEqual(await body(await call(`Bearer ${env.CRON_SECRET}`)), [503, "no-store", { error: "project_index_refresh_disabled" }]);
  env.WEAVE_INDEX_REFRESH = "all-public";
  const ok = await call(`Bearer ${env.CRON_SECRET}`);
  assert.equal(ok.status, 200);
  const report = await ok.json() as { status: string; listed: number; testNamed: number };
  assert.deepEqual([report.status, report.listed, report.testNamed, closed, cas], ["complete", 4, 1, 1, ["fixture-ca"]]);
  assert.equal(lines.length, 1);
  assert.equal(JSON.parse(lines[0]!).testNamed, 1);
  assert.doesNotMatch(lines.join("\n") + JSON.stringify(report), /at:\/\/|wetlands|Watershed|QA Wizard|fixture-cron-secret|fixture@/u);

  env.CRON_SECRET = "short";
  assert.deepEqual(await body(await call("Bearer short")), [503, "no-store", { error: "project_index_refresh_unavailable" }]);
  env.CRON_SECRET = "fixture-cron-secret-0123456789";
  const broken = createProjectIndexRefreshHandler({ env, now: () => start, log: (line) => lines.push(line),
    connect: async () => { throw Error("password authentication failed for fixture@db"); } });
  const failure = await broken(new Request("https://weave.example/", { headers: { authorization: `Bearer ${env.CRON_SECRET}` } }));
  assert.deepEqual([failure.status, await failure.json()], [503, { error: "project_index_refresh_failed" }]);
  assert.doesNotMatch(lines.at(-1) ?? "", /password|fixture@/u);
  delete env.WEAVE_INDEX_DATABASE_URL;
  assert.deepEqual(await body(await call(`Bearer ${env.CRON_SECRET}`)), [503, "no-store", { error: "project_index_refresh_unavailable" }]);
});
