// Checks for the offline prototype. Not part of `bun run --filter @weave/api test`; run with
//   node --test packages/api/evaluation/experiments/matching-architecture/prototype.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { catalogParties, loadCatalog, SAMPLE } from "./catalog-shape.mjs";
import { buildManifest, chooseCutOffs, GRID, passesFirstVersion, verifyManifest } from "./d32-engines.mjs";
import { allowed, assertedText, chooseThreshold, score } from "./retrieval-eval.mjs";
import { catalogCoverage } from "./shape.mjs";
import { loadFixtures, NOW, runExamples } from "./teams-demo.mjs";
import { createFundingEngine, suggestTeam } from "./teams.mjs";

const report = await runExamples();
const example = id => [...report.forward, ...report.reverse].find(e => e.id === id).result;
const text = value => JSON.stringify(value);

test("every worked example ends as its title says", () => {
  for (const e of [...report.forward, ...report.reverse]) if (e.expect) assert.equal(e.result.status, e.expect, e.id);
});

test("an unshared initiative never appears, by name, id or count", () => {
  for (const e of [...report.forward, ...report.reverse]) {
    assert.ok(!text(e.result).includes("quiet-ridge"), e.id);
    assert.ok(!text(e.result).includes("Quiet Ridge"), e.id);
  }
  // Its entry is word for word the one that covers the ask when shared, so only the sharing gate keeps it out.
  assert.equal(example("partial-public-lead").team.stillOpen[0].id, "ask:local-government");
});

test("the sharing gate is what keeps it out: once shared with the needed fact, the same entry covers the ask", async () => {
  const engine = createFundingEngine(await loadCatalog()), { initiatives, asksByProgram, byId } = await loadFixtures();
  const programKey = "rec9fBEyvIAOuPbVi::climate-smart-communities-initiative2027";
  const subject = { ...byId.riverbend, selfAnswers: { [programKey]: { "community-organization": "self" } } };
  const pool = shared => initiatives.filter(i => i.id !== "millcreek-county").map(i => i.id !== "quiet-ridge" ? i
    : { ...i, shared, sharedFacts: shared ? { applicantType: "public-body" } : {}, offers: i.offers.map(o => ({ ...o, shared })) });
  const run = shared => suggestTeam({ engine, subject, programKey, asks: asksByProgram[programKey].asks, initiatives: pool(shared), now: NOW });
  assert.equal(run(false).team.covered, 1);
  assert.equal(run(true).team.covered, 2);
  assert.ok(run(true).team.members.some(member => member.id === "quiet-ridge"));
});

test("public work is a lead to check and never covers an ask", () => {
  const result = example("partial-public-lead");
  assert.equal(result.leadsToCheck.length, 1);
  assert.equal(result.leadsToCheck[0].evidenceKind, "inferred_capability");
  assert.ok(result.leadsToCheck[0].unknowns.includes("availability"));
  assert.equal(result.team.covered, 1);
  assert.equal(result.team.total, 2);
  assert.ok(!text(result.team).includes("Public project A"));
});

test("a viewer who has shared nothing sees counts, never names or reasons", () => {
  const result = example("private-viewer");
  assert.deepEqual(result.team, { namesHidden: true, partners: 2, covered: 2, total: 2, leadIsYou: false });
  for (const name of ["Cascadia", "Mill Creek", "cascadia-practice", "millcreek-county"]) assert.ok(!text(result).includes(name), name);
  assert.equal(typeof result.leadsToCheck, "number");
});

test("a partner cannot change where the work happens or the applicant's own answers", () => {
  const result = example("wrong-country-of-work");
  assert.equal(result.team, null);
  assert.equal(result.gaps.blockers[0].field, "workCountries");
});

test("only a partner who shared the required fact can fill an ask that has a condition", () => {
  const partial = report.keywordOnlyCovers.find(row => row.id === "partial-public-lead");
  assert.ok(partial.differs && partial.keywordOnly.includes("Terra Aperta") && !partial.withConditions.includes("Terra Aperta"));
});

test("a changed applicant is said out loud, and no result claims eligibility", () => {
  const result = example("full-cover");
  assert.equal(result.team.leadIsYou, false);
  assert.match(result.reason, /would be the applicant/);
  for (const e of report.forward) {
    assert.match(e.result.caveat, /not an eligibility decision/);
    assert.ok(!/\b(?:eligible|qualif(?:y|ies))\b/i.test(text({ ...e.result, caveat: "", gaps: null, readiness: "" })), e.id);
  }
});

test("the reverse direction needs a confirmed fit between the two", () => {
  assert.equal(example("pair-without-fit").funds.length, 0);
  assert.ok(example("pair-with-fit").pairFit.length > 0);
});

test("the catalog maps into the shared shape and the sample programs exist", async () => {
  const catalog = await loadCatalog(), parties = catalogParties(catalog);
  const coverage = catalogCoverage(parties);
  assert.equal(coverage.programs, parties.length);
  assert.ok(parties.every(party => party.offers.length === 1 && party.offers[0].capitals[0] === "financial" && party.offers[0].evidence.kind === "researched"));
  assert.ok(coverage.asks.programsWithStructuredTeamAsk <= coverage.conditions.programsWithSourcedStatements);
  for (const [id] of SAMPLE) assert.ok(parties.some(party => party.id === id), id);
});

test("retrieval gates: kinds, negation and requests", () => {
  const work = { cls: "public", kind: "work", text: "We no longer do wall art. We are seeking mural painters. We run pottery classes." };
  assert.equal(assertedText(work), "We run pottery classes");
  assert.ok(allowed("need", work) && allowed("offer", work));
  assert.ok(!allowed("need", { cls: "public", kind: "published_request" }) && !allowed("offer", { cls: "public", kind: "published_offer" }));
  assert.ok(!allowed("need", { cls: "shared", kind: "need" }) && allowed("need", { cls: "shared", kind: "offer" }));
});

test("the threshold rule picks the lowest cut-off that meets the target, and none when nothing does", () => {
  const row = (id, relevant, values) => ({ query: { id, relevant: new Set(relevant), language: "en", evidenceType: "t", direction: "need" }, accepted: [],
    candidates: values.map(([candidate, cosine]) => ({ candidate: { id: candidate, cls: "public", kind: "work" }, lexicalRank: null, keyword: 0, cosine, relative: cosine })) });
  const rows = [row("q1", ["a"], [["a", 0.9], ["b", 0.5]]), row("q2", [], [["c", 0.6]])];
  assert.equal(chooseThreshold(rows).threshold, 0.61);
  assert.equal(score(rows, "semantic", 0.61).summary.noMatchQueriesWithSuggestion, 0);
  assert.equal(chooseThreshold([row("q3", [], [["d", 0.99]])]).threshold, null);
});

test("the D32 cut-off rule applies the holdout's gates, takes the most relevant, then breaks ties in its stated order", () => {
  const floor = { finalRecallAt5: 0.3, recallByLanguage: { en: 0.4, pt: 0.05, es: 0.3 }, noMatchShare: 0.25, noMatchFalsePositives: 2 };
  const point = (z, veto, relevant, recall, { pt = 0.1, es = 0.35, noMatch = 2 } = {}) => ({ semanticAtOrAboveZ: z, vetoBelowZ: veto,
    relevantAmongReturnedAt5: relevant, finalRecallAt5: recall, recallByLanguage: { en: 0.4, pt, es }, noMatchFalsePositives: noMatch,
    noMatchShare: noMatch / 8 });
  const cut = (semanticAtOrAboveZ, vetoBelowZ) => ({ semanticAtOrAboveZ, vetoBelowZ });
  // The most relevant pair is below the recall floor; recall exactly at the floor qualifies.
  assert.deepEqual(chooseCutOffs([point(5, 3, 0.9, 0.29), point(2, 1, 0.6, 0.3), point(1, 1, 0.5, 0.4)], floor), cut(2, 1));
  // Each language must be above the current matcher's, not level with it.
  assert.deepEqual(chooseCutOffs([point(5, 3, 0.9, 0.4, { es: 0.3 }), point(4, 3, 0.8, 0.4, { pt: 0.05 }), point(2, 1, 0.6, 0.3)], floor), cut(2, 1));
  // No-match share: 10 points above the current matcher's passes, more does not (3 of 8 is 12.5 points above).
  assert.deepEqual(chooseCutOffs([point(5, 3, 0.9, 0.4, { noMatch: 3 }), point(2, 1, 0.6, 0.3, { noMatch: 2.8 })], floor), cut(2, 1));
  // Ties: higher recall, then fewer no-match hits, then the lower threshold, then the lower veto.
  assert.deepEqual(chooseCutOffs([point(2, 1, 0.6, 0.31), point(3, 1, 0.6, 0.35, { noMatch: 0 })], floor), cut(3, 1));
  assert.deepEqual(chooseCutOffs([point(3, 1, 0.6, 0.35, { noMatch: 2 }), point(4, 1, 0.6, 0.35, { noMatch: 1 })], floor), cut(4, 1));
  assert.deepEqual(chooseCutOffs([point(4, 2, 0.6, 0.35), point(3, 2, 0.6, 0.35), point(3, 1.5, 0.6, 0.35)], floor), cut(3, 1.5));
  // No suggestions, or nothing passing, gives no cut-offs: that engine does not go forward.
  assert.equal(chooseCutOffs([point(6, 4, null, 0.4), point(1, 0, 0.5, 0.2), point(1, 1, 0.5, 0.4, { pt: 0.05 })], floor), null);
  // The first version kept only the recall floor.
  assert.deepEqual(chooseCutOffs([point(5, 3, 0.9, 0.4, { es: 0.3 }), point(2, 1, 0.6, 0.3)], floor, passesFirstVersion), cut(5, 3));
  assert.deepEqual([GRID.semanticAtOrAboveZ.length, GRID.semanticAtOrAboveZ[0], GRID.semanticAtOrAboveZ.at(-1)], [61, 0, 6]);
  assert.deepEqual([GRID.vetoBelowZ.length, GRID.vetoBelowZ[0], GRID.vetoBelowZ.at(-1), GRID.vetoBelowZ[21]], [61, -2, 4, 0.1]);
});

test("the D32 manifest check names each code file, model pin and runtime that differs", async () => {
  const onDisk = await buildManifest({ "mminilm-l12-upstream": { semanticAtOrAboveZ: 3.5, vetoBelowZ: 1.8 } }, "2026-11-21");
  assert.deepEqual((await verifyManifest(onDisk)).differences, []);
  const changed = structuredClone(onDisk);
  changed.code["packages/api/src/partner-matcher.ts"] = "0".repeat(64);
  changed.models["mminilm-l12-upstream"].files["tokenizer.json"] = "0".repeat(64);
  changed.runtime["@huggingface/transformers"] = "4.1.0";
  delete changed.code["dist/semantic-config.mjs"];
  assert.deepEqual((await verifyManifest(changed)).differences, ["code:packages/api/src/partner-matcher.ts", "code:dist/semantic-config.mjs",
    "model:mminilm-l12-upstream", "runtime:@huggingface/transformers"]);
});
