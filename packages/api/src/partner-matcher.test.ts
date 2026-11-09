import assert from "node:assert/strict";
import test from "node:test";
import { rankPartnerMatches } from "./partner-matcher.ts";
import type { PartnerEntry, ProjectEvidence, SharedPartnerEntry } from "./partner-matcher.ts";

const now = Date.parse("2026-11-08T23:00:00Z");
const need: PartnerEntry = {
  initiativeId: "origin", entryId: "need", revision: 1, kind: "need",
  value: { title: "GIS mapping", status: "open", placeScope: "here", exchangeTerms: ["gift"], capitalForms: ["intellectual"] },
  summary: { name: "River volunteers", locations: ["Sacramento"] },
};
const offer: SharedPartnerEntry = {
  initiativeId: "counterpart", entryId: "offer", revision: 3, kind: "offer",
  value: { ...need.value, title: "We can provide GIS mapping" },
  summary: { name: "Mapping co-op", locations: ["Sacramento"] },
  confirmedAt: "2026-11-01T23:00:00Z", expiresAt: "2026-11-09T23:00:00Z",
};
const publicEvidence: ProjectEvidence = {
  id: "passage", projectUri: "at://did:web:example.com/org.hypercerts.collection/project", projectName: "River atlas",
  sourceUri: "at://did:web:example.com/org.hypercerts.collection/project",
  sourceUrl: "https://example.com/source", cid: "fixture-cid", contentHash: "hash", fieldPath: "$.shortDescription",
  passage: "We maintain GIS mapping tools for river restoration.", kind: "work",
  sourceCreatedAt: "2026-10-01T23:00:00Z", sourceIndexedAt: null,
  fetchedAt: "2026-11-07T23:00:00Z", extractionVersion: "fixture",
};

test("keeps owner confirmation and both directions of public work evidence distinct", () => {
  const queryOffer: PartnerEntry = { ...need, kind: "offer", entryId: "offer" };
  const result = rankPartnerMatches({ queries: [need, queryOffer], shared: [offer], publicEvidence: [publicEvidence], now });
  assert.deepEqual(result.map(({ evidenceKind }) => evidenceKind), ["confirmed_offer", "inferred_capability", "potential_use"]);
  assert.deepEqual(result.map(({ action }) => action), ["review_entry", "open_source", "open_source"]);
  assert.equal(result[0]?.candidateId, "weave:counterpart:offer:offer");
  assert.ok(result[1]?.unknowns.includes("availability"));
  assert.ok(result[1]?.unknowns.includes("place"));
  assert.ok(result.every(({ reciprocal }) => !reciprocal));
});

test("rejects negated, withdrawn, expired, noncomplementary and explicitly incompatible matches", () => {
  const shared: SharedPartnerEntry[] = [
    { ...offer, entryId: "negation", value: { ...offer.value, title: "We no longer offer GIS mapping" } },
    { ...offer, entryId: "request", value: { ...offer.value, title: "We need GIS mapping" } },
    { ...offer, entryId: "closed", value: { ...offer.value, status: "withdrawn" } },
    { ...offer, entryId: "expired", expiresAt: new Date(now).toISOString() },
    { ...offer, entryId: "incompatible-terms", value: { ...offer.value, exchangeTerms: ["paid"] } },
    { ...offer, entryId: "incompatible-place", summary: { ...offer.summary, locations: ["Toronto"] } },
    { ...offer, entryId: "incompatible-timing", value: { ...offer.value, timeframe: "2026-12-01 to 2026-12-05" } },
    { ...offer, entryId: "same-direction", kind: "need" },
    { ...offer, entryId: "own", initiativeId: need.initiativeId },
  ];
  assert.deepEqual(rankPartnerMatches({ queries: [{ ...need, value: { ...need.value, timeframe: "2026-11-10" } }],
    shared, now,
    publicEvidence: [
      { ...publicEvidence, passage: "We need a developer to build GIS mapping tools." },
      { ...publicEvidence, passage: "We never built GIS mapping tools." },
      { ...publicEvidence, passage: "We used to offer GIS mapping.", kind: "published_offer" },
      { ...publicEvidence, passage: "We need GIS mapping.", kind: "published_request" },
    ] }), []);
});

test("uses both supporting directions for reciprocity and isolates shortlist keys by kind", () => {
  const otherNeed: SharedPartnerEntry = { ...offer, kind: "need", value: { ...offer.value, title: "Seeking water sampling" } };
  const queryOffer: PartnerEntry = { ...need, kind: "offer", value: { ...need.value, title: "Water sampling" } };
  const results = rankPartnerMatches({
    queries: [need, queryOffer],
    sharedByEntry: { "need:need": [offer], "offer:need": [otherNeed] },
    now,
  });
  assert.deepEqual(results.map(({ evidenceKind }) => evidenceKind), ["confirmed_offer", "confirmed_need"]);
  assert.ok(results.every(({ reciprocal }) => reciprocal));
  assert.equal(results[1]?.candidateId, "weave:counterpart:need:offer");
});

test("deduplicates project passages by URI, retains distinct same-name projects and allows only direction-appropriate published claims", () => {
  const separate = { ...publicEvidence, projectUri: "at://did:web:another.example/org.hypercerts.collection/project" };
  const results = rankPartnerMatches({
    queries: [need],
    publicEvidence: [
      publicEvidence, { ...publicEvidence, id: "other-passage" }, separate,
      { ...publicEvidence, kind: "published_offer", passage: "Our public GIS mapping service is offered to volunteer groups." },
      { ...separate, kind: "published_request" },
    ],
    now,
  });
  assert.deepEqual(results.map(({ evidenceKind }) => evidenceKind), ["published_offer", "inferred_capability"]);
  assert.notEqual(results[0]?.candidateId, results[1]?.candidateId);
});

test("articles, prepositions and a shared initiative theme cannot establish evidence", () => {
  const query = { ...need, value: { ...need.value, title: "Microscopy for the public research program" },
    summary: { ...need.summary, themes: ["research"] } };
  const other = { ...offer, value: { ...offer.value, title: "Tea for the public" },
    summary: { ...offer.summary, themes: ["research"] } };
  const evidence = { ...publicEvidence, passage: "We run a public tea shop for the neighborhood." };
  assert.deepEqual(rankPartnerMatches({ queries: [query], shared: [other], publicEvidence: [evidence], now }), []);
});

test("retrieving a paraphrase does not replace supported overlap in the final evidence gate", () => {
  const query = { ...need, value: { ...need.value, title: "Mapmaking tools" } };
  const evidence = { ...publicEvidence, passage: "We practice cartography for civic accessibility." };
  const input = { queries: [query], now, publicEvidenceByEntry: { "need:need": [evidence] } };
  assert.deepEqual(rankPartnerMatches(input), []);
});
