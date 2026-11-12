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

test("related wording supports public work without inventing an offer or availability", () => {
  const query = { ...need, value: { ...need.value, title: "Mapmaking tools" } };
  const evidence = { ...publicEvidence, passage: "We practice cartography for civic accessibility." };
  const input = { queries: [query], now, publicEvidenceByEntry: { "need:need": [evidence] } };
  const [match] = rankPartnerMatches(input);
  assert.equal(match?.evidenceKind, "inferred_capability");
  assert.equal(match?.evidence.passage, evidence.passage);
  assert.deepEqual(match?.reasons, [{ type: "related_terms", terms: ["mapmaking / cartography"] }]);
  assert.ok(match?.unknowns.includes("availability"));
  const [reverse] = rankPartnerMatches({ queries: [{ ...query, kind: "offer" }], publicEvidence: [evidence], now });
  assert.equal(reverse?.evidenceKind, "potential_use");
  assert.ok(reverse?.unknowns.includes("availability"));
});

test("open-ended confirmed offers remain matchable until closed and invalid confirmation stays excluded", () => {
  const openEnded = { ...offer, expiresAt: null };
  const [match] = rankPartnerMatches({ queries: [need], shared: [openEnded], now });
  assert.equal(match?.evidenceKind, "confirmed_offer");
  assert.ok(match?.evidence.type === "shared");
  assert.equal(match.evidence.expiresAt, null);
  for (const changed of [
    { ...openEnded, value: { ...openEnded.value, status: "met" } },
    { ...openEnded, confirmedAt: "invalid" },
    { ...openEnded, confirmedAt: new Date(now + 1).toISOString() },
  ]) assert.deepEqual(rankPartnerMatches({ queries: [need], shared: [changed], now }), []);
});

test("related phrases never override negation, requests, expiry, identity or explicit terms", () => {
  const query = { ...need, value: { ...need.value, title: "Mapmaking" } };
  for (const passage of [
    "We no longer practice cartography.", "We are seeking cartography.",
    "We practice cartography. Mapmaking is discontinued.", "We hope to start cartography.",
    "Our mapmaking exhibition presents other teams' work; we do not practice cartography.",
  ]) assert.deepEqual(rankPartnerMatches({ queries: [query], publicEvidence: [{ ...publicEvidence, passage }], now }), [], passage);
  const counterpart = { ...offer, value: { ...offer.value, title: "Cartography" } };
  assert.equal(rankPartnerMatches({ queries: [query], shared: [counterpart], now })[0]?.evidenceKind, "confirmed_offer");
  for (const changed of [
    { ...counterpart, initiativeId: query.initiativeId },
    { ...counterpart, expiresAt: new Date(now).toISOString() },
    { ...counterpart, value: { ...counterpart.value, exchangeTerms: ["paid"] } },
    { ...counterpart, value: { ...counterpart.value, status: "withdrawn" } },
  ]) assert.deepEqual(rankPartnerMatches({ queries: [query], shared: [changed], now }), []);
});

test("specific activities reject neighbouring topics and unknown language can abstain", () => {
  for (const [title, passage] of [
    ["Water quality testing", "We deliver water to neighbourhoods."],
    ["Application security", "We install security fencing."],
    ["Cartography", "We study cartographyfiction."],
    ["Mapmaking", "Nous faisons de la cartographie."],
  ] as const) assert.deepEqual(rankPartnerMatches({ queries: [{ ...need, value: { ...need.value, title } }],
    publicEvidence: [{ ...publicEvidence, passage }], now }), []);
  assert.equal(rankPartnerMatches({ queries: [need], publicEvidence: [{ ...publicEvidence,
    passage: "We practice cartography, but we cannot do bicycle repair." }], now }).length, 1);
});

test("related reasons round-trip through the response contract and malformed reasons fail", async () => {
  const { parseMatchingSearch } = await import("./matching-contract.ts");
  const id = crypto.randomUUID();
  const results = rankPartnerMatches({ queries: [{ ...need, entryId: id, value: { ...need.value, title: "Mapmaking" } }],
    publicEvidence: [{ ...publicEvidence, passage: "We practice cartography." }], now });
  const response = { initiativeId: id, results, coverage: { shared: "not_joined", external: "partial",
    corpusVersion: null, modelVersion: null, engineVersion: "partner-concepts-v2" } };
  assert.deepEqual(parseMatchingSearch(response).results[0]?.reasons, results[0]?.reasons);
  for (const reason of [{ type: "related_terms", terms: [42] }, { type: "imagined_fit", terms: ["mapping"] }])
    assert.throws(() => parseMatchingSearch({ ...response, results: results.map(r=>({ ...r, reasons: [reason] })) }));
});

test("recognized concepts preserve reordered literal evidence and independent activities", () => {
  const cases = [
    { title: "Water quality testing", description: "", passage: "Our lab provides testing of water quality." },
    { title: "Welding", description: "We also need bicycle repair.", passage: "Our workshop provides welding." },
    { title: "Welding and bicycle repair", description: "", passage: "Our workshop provides welding." },
    { title: "Welding, bicycle repair", description: "", passage: "Our workshop provides welding." },
    { title: "Welding / bicycle repair", description: "", passage: "Our workshop provides welding." },
  ];
  for (const { title, description, passage } of cases) {
    const query = { ...need, value: { ...need.value, title, description } };
    const [match] = rankPartnerMatches({ queries: [query], publicEvidence: [{ ...publicEvidence, passage }], now });
    assert.equal(match?.evidenceKind, "inferred_capability", title);
    assert.equal(match?.evidence.passage, passage);
    assert.ok(match?.reasons.some(reason => reason.type === "shared_terms"));
  }
});

test("unrelated source clauses and fields cannot manufacture an activity phrase", () => {
  const query = { ...need, value: { ...need.value, title: "Artwork restoration" } };
  for (const passage of [
    "We make art. Conservation of forests is our focus.",
    "We make art; conservation of forests is our focus.",
    "We make art, conservation of forests is our focus.",
    "We make art but conservation of forests is our focus.",
    "We make art but we study conservation of forests.",
  ]) assert.deepEqual(rankPartnerMatches({ queries: [query], publicEvidence: [{ ...publicEvidence, passage }], now }), [], passage);
  assert.deepEqual(rankPartnerMatches({ queries: [query], now, shared: [{ ...offer,
    value: { ...offer.value, title: "We make art", description: "Conservation of forests is our focus" } }] }), []);
  assert.deepEqual(rankPartnerMatches({ queries: [{ ...query, value: { ...query.value, title: "Art conservation" } }], now,
    publicEvidence: [{ ...publicEvidence, passage: "We make art; conservation of forests is our focus." }] }), []);
  assert.deepEqual(rankPartnerMatches({ queries: [{ ...query, value: { ...query.value, title: "Interactive charts" } }], now,
    publicEvidence: [{ ...publicEvidence, passage: "We collect data. Visualization of galaxies inspires us." }] }), []);
});

test("dependent but exceptions keep request and negation scope", () => {
  for (const passage of [
    "We are seeking help with everything but GIS mapping.",
    "We need expertise in everything but GIS mapping.",
    "We cannot do anything but GIS mapping.",
    "We need everything but our GIS mapping tools.",
  ]) assert.deepEqual(rankPartnerMatches({ queries: [need], publicEvidence: [{ ...publicEvidence, passage }], now }), [], passage);
  // Independent contrast clauses can still provide positive evidence.
  assert.equal(rankPartnerMatches({ queries: [need], publicEvidence: [{ ...publicEvidence,
    passage: "We practice cartography, but we cannot do bicycle repair." }], now }).length, 1);
});
