// Checks for the offline prototype. Not part of `bun run --filter @weave/api test`; run with
//   node --test packages/api/evaluation/experiments/matching-architecture/prototype.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { catalogParties, loadCatalog, SAMPLE } from "./catalog-shape.mjs";
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
