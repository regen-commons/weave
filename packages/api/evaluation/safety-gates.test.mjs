import assert from "node:assert/strict";
import test from "node:test";
import { rankPartnerMatches } from "../src/partner-matcher.ts";
import { evaluateV3, gatesV3, loadMatchingV3, projectEvidence, sharedEntry, validateMatchingV3 } from "../scripts/matching-v3.mjs";

// Hard safety gates for the final matcher. Private, withdrawn-by-flag and unauthorized entries are
// excluded before ranking by the SQL view and the workspace command; the opt-in PostgreSQL suites
// prove those. These cases prove the matcher itself never relaxes a gate it receives.
const now = Date.parse("2026-11-16T00:00:00Z");
const need = { initiativeId: "own", entryId: "need-1", revision: 3, kind: "need", summary: {},
  value: { title: "Bicycle repair for our cargo bikes", status: "open", placeScope: "anywhere" } };
const offer = { ...need, entryId: "offer-1", kind: "offer",
  value: { title: "Bicycle repair training for volunteers", status: "open", placeScope: "anywhere" } };
const shared = (id, kind, title, change = {}) => ({ ...sharedEntry({ id, kind, title, description: "" }), ...change,
  value: { ...sharedEntry({ id, kind, title, description: "" }).value, ...(change.value ?? {}) } });
const project = (id, evidenceKind, passage) => projectEvidence({ id, name: id, evidenceKind, passage });
const ids = (results) => results.map((m) => m.evidence.type === "public" ? m.evidence.id : m.evidence.entryId);

test("only open, confirmed, unexpired entries of the other kind from another initiative are matched", () => {
  const candidates = [
    shared("ok", "offer", "Bicycle repair for neighbours"),
    shared("closed", "offer", "Bicycle repair clinic", { value: { status: "closed" } }),
    shared("withdrawn", "offer", "Bicycle repair stand", { value: { status: "withdrawn" } }),
    shared("expired", "offer", "Bicycle repair evenings", { expiresAt: "2026-11-15T00:00:00Z" }),
    shared("future", "offer", "Bicycle repair mornings", { confirmedAt: "2026-11-17T00:00:00Z" }),
    shared("own", "offer", "Bicycle repair at home", { initiativeId: "own" }),
    shared("same-kind", "need", "Bicycle repair needed"),
  ];
  assert.deepEqual(ids(rankPartnerMatches({ queries: [need], shared: candidates, now })), ["ok"]);
});

test("a closed or withdrawn query of the person's own is never matched", () => {
  for (const status of ["closed", "withdrawn"])
    assert.deepEqual(rankPartnerMatches({ queries: [{ ...need, value: { ...need.value, status } }],
      shared: [shared("ok", "offer", "Bicycle repair for neighbours")], now }), []);
});

test("public work never becomes a confirmed need or offer and never implies availability", () => {
  const evidence = [project("work", "work", "We run bicycle repair for cargo bikes."),
    project("request", "published_request", "We are looking for bicycle repair help."),
    project("published", "published_offer", "We offer bicycle repair for cargo bikes.")];
  const forNeed = rankPartnerMatches({ queries: [need], publicEvidence: evidence, now });
  assert.deepEqual(ids(forNeed).sort(), ["published", "work"], "a published request cannot serve a need");
  const forOffer = rankPartnerMatches({ queries: [offer], publicEvidence: evidence, now });
  assert.ok(!ids(forOffer).includes("published"), "a published offer cannot use an offer");
  for (const match of [...forNeed, ...forOffer]) {
    assert.ok(!["confirmed_offer", "confirmed_need"].includes(match.evidenceKind));
    assert.ok(match.unknowns.includes("availability"));
    assert.equal(match.action, "open_source");
    for (const field of ["sourceUri", "cid", "fieldPath", "passage", "fetchedAt"]) assert.ok(match.evidence[field], field);
  }
  assert.equal(forNeed.find((m) => m.evidence.id === "work").evidenceKind, "inferred_capability");
});

test("an explicitly shared offer ranks before inferred public capability and says it was confirmed", () => {
  const results = rankPartnerMatches({ queries: [need], now,
    shared: [shared("ok", "offer", "Bicycle repair for cargo bikes")],
    publicEvidence: [project("work", "work", "We run bicycle repair for cargo bikes.")] });
  assert.deepEqual(results.map((m) => m.evidenceKind), ["confirmed_offer", "inferred_capability"]);
  assert.equal(results[0].action, "review_entry");
  assert.ok(results[0].evidence.confirmedAt);
});

test("the independent matching holdout is pinned, validates and rejects unscorable judgments", async () => {
  const { data } = await loadMatchingV3();
  const clone = () => structuredClone(data);
  const reject = (change, code) => { const bad = clone(); change(bad); assert.throws(() => validateMatchingV3(bad), code); };
  reject((bad) => { const q = bad.queries.find((q) => q.direction === "need");
    q.relevantShared = [bad.shared.find((s) => s.domain === q.domain && s.kind === "need").id]; }, /invalid_matching_v3_judgment/);
  reject((bad) => { const q = bad.queries[0]; q.relevantProjects = [bad.projects.find((p) => p.domain !== q.domain).id]; }, /invalid_matching_v3_judgment/);
  reject((bad) => { const q = bad.queries.find((q) => q.judgment === "agreed"); q.judgeRelevantProjects = []; q.judgeRelevantShared = ["x"]; }, /invalid_matching_v3_judgment/);
  reject((bad) => { bad.thresholds.precisionAmongReturnedPerDomainDirection = 0.5; }, /invalid_matching_v3/);
});

test("every holdout result keeps its explanation and provenance; scores are not asserted in CI", async () => {
  const { data } = await loadMatchingV3();
  for (const path of ["retrieval", "full-domain"]) {
    const result = evaluateV3(data, true, path);
    const gates = gatesV3(data, result);
    assert.equal(gates.unsupportedConfirmations.passed, true);
    assert.deepEqual(result.rows.flatMap((row) => row.explanationFailures), []);
  }
});
