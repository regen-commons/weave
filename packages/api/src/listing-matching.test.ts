import assert from "node:assert/strict";
import { test } from "node:test";
import { parseMatchingCommand, parseMatchingSearch, parsePublicEvidenceSnapshot, type MatchingSearch } from "./matching-contract.ts";
import { createMatchingProvider } from "./matching-provider.ts";
import { createMatchingHandlers } from "./matching.ts";
import { rankPartnerMatches, type ListingPartnerEntry, type PartnerEntry, type ProjectEvidence } from "./partner-matcher.ts";

/** A listing search through the provider, as the endpoint runs it. */
const listingSearch = async (payload: unknown) => await createMatchingProvider(async () => payload)
  .execute("", { action: "listing_search", initiativeId: workspace }) as MatchingSearch;

// DL-155, step 5: partners for a linked project's published listings. Synthetic projects and records only.
const workspace = "30000000-0000-4000-8000-000000000001";
const ownNeed = "40000000-0000-4000-8000-000000000001";
const anaProject = "at://did:plc:anaaaaaaaaaaaaaaaaaaaaaa/org.hypercerts.collection/3mlistingana1";
const benProject = "at://did:plc:benbbbbbbbbbbbbbbbbbbbbb/org.hypercerts.collection/3mlistingben1";
const cid = (letter: string) => `b${letter.repeat(58)}`;
const uri = (project: string, rkey: string) => `at://${project.split("/")[2]}/com.regencommons.weave.supportListing/${rkey}`;
const at = new Date(Date.now() - 60_000).toISOString().replace(/\.\d+Z$/u, ".000Z");
const listingRecord = (project: string, kind: "need" | "offer", title: string, extra: Record<string, unknown> = {}) => ({
  $type: "com.regencommons.weave.supportListing", projectUri: project, kind, title, capitalForms: ["social"],
  status: "open", createdAt: at, ...extra,
});
const candidate = (kind: "need" | "offer", title: string, rkey: string, extra: Record<string, unknown> = {}) => ({
  kind, uri: uri(benProject, rkey), cid: cid("d"), projectUri: benProject, projectName: "Ben's seed library",
  record: listingRecord(benProject, kind, title, extra),
});
const evidence = (project: string, passage: string): ProjectEvidence => ({
  id: `evidence-${project.length}-${passage.length}`, projectUri: project, projectName: "A public project", sourceUri: project,
  sourceUrl: "https://api.hypercerts.org/example", cid: "bafyfixture", contentHash: "hash", fieldPath: "description",
  passage, sourceCreatedAt: at, sourceIndexedAt: null, fetchedAt: at, extractionVersion: "fixture", kind: "work",
});
/** What content_command's listing_shortlist answers for Ana's workspace, with one need published. */
const shortlist = (candidates: unknown[], publicEvidence: unknown[] = []) => ({
  externalCoverage: { status: "bounded", corpusVersion: "certified-pilot:fixture:1", updatedAt: at },
  groups: [{
    listing: { kind: "need", entryId: ownNeed, uri: uri(anaProject, "3mlstaaaaaaaa"), cid: cid("a"),
      record: listingRecord(anaProject, "need", "Volunteers for our seed library", { description: "Weekend sorting of donated seed" }) },
    candidates, publicEvidence,
  }],
});

test("a listing search names only its workspace, and a draft's words cannot ride along", () => {
  assert.deepEqual(parseMatchingCommand({ action: "listing_search", initiativeId: workspace.toUpperCase() }),
    { action: "listing_search", initiativeId: workspace });
  for (const extra of [{ query: "private draft note" }, { entries: [] }, { title: "Volunteers" }])
    assert.throws(() => parseMatchingCommand({ action: "listing_search", initiativeId: workspace, ...extra }));
});

test("the endpoint passes a listing search to the database with nothing but the workspace", async () => {
  const calls: [string, unknown][] = [];
  const provider = createMatchingProvider(async (action, data) => {
    calls.push([action, data]);
    return shortlist([candidate("offer", "Weekend volunteers for a seed library", "3mlstdaaaaaaa")]);
  });
  const origin = "https://weave.example.test";
  const response = await createMatchingHandlers({ provider, origin }).POST(new Request(`${origin}/api/matching`, {
    method: "POST", body: JSON.stringify({ action: "listing_search", initiativeId: workspace }),
    headers: { origin, "content-type": "application/json", cookie: "__Host-weave_account=fixture.token.signature" },
  }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.deepEqual(calls, [["listing_shortlist", {}]]);
  const body = parseMatchingSearch(await response.json());
  assert.equal(body.initiativeId, workspace);
  assert.equal(body.results.length, 1);
});

test("another project's published offer is a direct fit for a published need, under its own address", async () => {
  const provider = createMatchingProvider(async () => shortlist([
    candidate("offer", "Weekend volunteers for a seed library", "3mlstdaaaaaaa"),
    candidate("offer", "Bike repair", "3mlstnaaaaaaa", { description: "Fix a flat" }),
  ], [evidence(anaProject, "Our own seed library volunteers sort donated seed."),
    evidence(benProject, "Volunteers sort donated seed for the seed library every weekend.")]));
  const result = await provider.execute("", { action: "listing_search", initiativeId: workspace }) as MatchingSearch;
  const listing = result.results.find(({ evidence }) => evidence.type === "listing");
  assert.ok(listing);
  assert.equal(listing.candidateId, `listing:${uri(benProject, "3mlstdaaaaaaa")}`);
  assert.equal(listing.evidenceKind, "confirmed_offer");
  assert.equal(listing.action, "open_listing");
  assert.deepEqual(listing.counterpart, { id: benProject, name: "Ben's seed library" });
  assert.deepEqual(listing.query, { kind: "need", entryId: ownNeed, revision: 0 });
  assert.ok(!result.results.some(({ evidence }) => evidence.type === "listing" && evidence.title === "Bike repair"),
    "a listing that shares no words must not be offered");
  assert.equal(result.coverage.shared, "available");
  assert.equal(result.coverage.external, "available");
});

test("the project's own public evidence is never its own partner; another project's can be", async () => {
  const payload = {
    externalCoverage: { status: "bounded", corpusVersion: "certified-pilot:fixture:1", updatedAt: at },
    groups: [{
      listing: { kind: "offer", entryId: ownNeed, uri: uri(anaProject, "3mlstbaaaaaaa"), cid: cid("b"),
        record: listingRecord(anaProject, "offer", "Compost training for neighbours", { description: "Hands-on compost training" }) },
      candidates: [],
      publicEvidence: [evidence(anaProject, "The team runs compost training for neighbours."),
        evidence(benProject, "The school garden hosts compost training for neighbours.")],
    }],
  };
  const result = await listingSearch(payload);
  assert.deepEqual(result.results.map(({ counterpart }) => counterpart.id), [benProject]);
});

test("a damaged listing from another project hides only itself; a damaged own listing fails the search", async () => {
  const good = candidate("offer", "Weekend volunteers for a seed library", "3mlstdaaaaaaa");
  const damaged = [
    { ...good, uri: uri(anaProject, "3mlstdaaaaaaa") },
    { ...good, record: { ...good.record, status: "met" } },
    { ...good, record: { ...good.record, projectUri: anaProject } },
    { ...good, kind: "need" },
    { ...good, cid: "not-a-cid" },
    { ...good, record: { ...good.record, title: "   " } },
  ];
  const provider = createMatchingProvider(async () => shortlist([...damaged, good]));
  const result = await provider.execute("", { action: "listing_search", initiativeId: workspace }) as MatchingSearch;
  assert.deepEqual(result.results.filter(({ evidence }) => evidence.type === "listing").map(({ candidateId }) => candidateId),
    [`listing:${uri(benProject, "3mlstdaaaaaaa")}`]);

  const broken = shortlist([good]);
  broken.groups[0]!.listing.record = { ...broken.groups[0]!.listing.record, projectUri: benProject };
  await assert.rejects(createMatchingProvider(async () => broken).execute("", { action: "listing_search", initiativeId: workspace }),
    { code: "matching_unavailable" });
});

test("kinds of support a reader does not know are ignored, not refused", () => {
  const snapshot = parsePublicEvidenceSnapshot({
    workspaceId: workspace, corpusVersion: "certified-pilot:fixture:1", status: "bounded", indexedAt: at,
    availableUntil: new Date(Date.now() + 60_000).toISOString(), truncated: false, evidence: [],
    listings: [candidate("offer", "Seed library volunteers", "3mlstdaaaaaaa", { capitalForms: ["social", "future-kind"] })],
    listingsTruncated: false,
  });
  assert.equal(snapshot.listings.length, 1);
  assert.deepEqual(snapshot.listings[0]!.capitalForms, ["social"]);
});

test("a snapshot from a Platform without listings still parses, with none", () => {
  const snapshot = parsePublicEvidenceSnapshot({
    workspaceId: workspace, corpusVersion: "certified-pilot:fixture:1", status: "bounded", indexedAt: at,
    availableUntil: new Date(Date.now() + 60_000).toISOString(), truncated: false, evidence: [],
  });
  assert.deepEqual(snapshot.listings, []);
  assert.equal(snapshot.listingsTruncated, false);
});

test("a search result keeps each kind of evidence to its own address and action", () => {
  const listingUri = uri(benProject, "3mlstdaaaaaaa");
  const result = {
    query: { kind: "need", entryId: ownNeed, revision: 0 }, candidateId: `listing:${listingUri}`,
    counterpart: { id: benProject, name: "Ben's seed library" }, evidenceKind: "confirmed_offer", action: "open_listing",
    reciprocal: false, reasons: [], unknowns: ["terms"],
    evidence: { type: "listing", uri: listingUri, cid: cid("d"), title: "Weekend volunteers", passage: "Weekend volunteers",
      createdAt: at, expiresAt: null },
  };
  const coverage = { shared: "available", external: "available", corpusVersion: null, modelVersion: null, engineVersion: "fixture" };
  const parse = (item: unknown) => parseMatchingSearch({ initiativeId: workspace, coverage, results: [item] });
  assert.equal(parse(result).results[0]!.evidence.type, "listing");
  for (const wrong of [
    { ...result, action: "review_entry" },
    { ...result, action: "open_source" },
    { ...result, evidenceKind: "inferred_capability" },
    { ...result, candidateId: `public:${benProject}` },
    { ...result, candidateId: `listing:${uri(benProject, "3mlsteaaaaaaa")}` },
    { ...result, evidence: { ...result.evidence, uri: "at://did:plc:benbbbbbbbbbbbbbbbbbbbbb/org.hypercerts.collection/3mlstdaaaaaaa" } },
  ]) assert.throws(() => parse(wrong), JSON.stringify(wrong).slice(0, 80));
});

test("the matcher leaves out expired listings, same-kind listings and the query's own project", () => {
  const query: PartnerEntry = { initiativeId: anaProject, entryId: ownNeed, revision: 0, kind: "need",
    value: { title: "Volunteers for our seed library", description: "", capitalForms: ["social"], status: "open" },
    summary: { name: "", locations: [] } };
  const listing = (extra: Partial<ListingPartnerEntry>): ListingPartnerEntry => ({
    uri: uri(benProject, "3mlstdaaaaaaa"), cid: cid("d"), projectUri: benProject, projectName: "Ben's seed library",
    kind: "offer", title: "Weekend volunteers for a seed library", description: "", capitalForms: ["social"],
    createdAt: at, expiresAt: null, ...extra,
  });
  const found = (listings: ListingPartnerEntry[]) => rankPartnerMatches({ queries: [query], listings }).map(({ candidateId }) => candidateId);
  assert.deepEqual(found([listing({})]), [`listing:${uri(benProject, "3mlstdaaaaaaa")}`]);
  assert.deepEqual(found([listing({ expiresAt: new Date(Date.now() - 1000).toISOString() })]), []);
  assert.deepEqual(found([listing({ kind: "need" })]), []);
  assert.deepEqual(found([listing({ projectUri: anaProject })]), []);
  assert.deepEqual(found([listing({ createdAt: new Date(Date.now() + 60_000).toISOString() })]), []);
});

test("the listing search leaves out exactly the words the partner matcher treats as too common", async () => {
  const { readFile } = await import("node:fs/promises");
  const { PARTNER_GENERIC_TERMS } = await import("./partner-matcher.ts");
  const sql = await readFile(new URL("../../../supabase/candidates/weave-matching-published-listings.sql", import.meta.url), "utf8");
  const list = /lexeme <> all \(array\[([^\]]*)\]\)/u.exec(sql)?.[1];
  assert.ok(list, "the candidate must list its common words");
  const words = [...list.matchAll(/'([a-z]+)'/gu)].map(([, word]) => word);
  assert.equal(new Set(words).size, words.length, "no word may be listed twice");
  assert.deepEqual([...words].sort(), [...PARTNER_GENERIC_TERMS].sort());
});
