import assert from "node:assert/strict";
import { test } from "node:test";
import {
  compareSnapshot,
  describeChanges,
  gateMetrics,
  loadRankingSet,
  measure,
  ndcgAt10,
  precisionAt5,
  runGate,
  serializeSnapshot,
  UPDATE_COMMAND,
  validateLabels,
  validateRankingSet,
  type Grade,
  type LabelSet,
  type Rankings,
  type RankingSet,
  type Snapshot,
} from "../evaluation/fund-ranking.ts";

// Ranks the fixed initiatives on all three paths once, and every test below reads that run.
const gate = runGate();

test("every first five on every path matches the committed snapshot", async () => {
  const result = await gate;
  assert.equal(result.missingSnapshot, false, `Run \`${UPDATE_COMMAND}\` to write the snapshot.`);
  const collation = { stored: result.stored!.snapshot.collation, current: result.current.collation };
  if (result.changes.length) assert.fail(describeChanges(result.changes, { collation }));
});

test("the snapshot file is laid out the way the update command writes it", async () => {
  const { stored } = await gate;
  // Names are not gated, so a renamed program passes. A hand edit that breaks the layout would make the next diff unreadable.
  assert.equal(stored!.raw, serializeSnapshot(stored!.snapshot), `Run \`${UPDATE_COMMAND}\` instead of editing the snapshot by hand.`);
});

test("the MCP tool ranks every initiative in the same order as Funding", async () => {
  const { ranked } = await gate;
  for (const [id, paths] of ranked) {
    const funding = paths.funding.slice(0, paths.mcp.length).map((place) => place.id);
    assert.deepEqual(paths.mcp.map((place) => place.id), funding, id);
  }
});

test("labels from the gate's label files are validated and draft labels gate nothing", async () => {
  const { metrics } = await gate;
  for (const { gate: verdict } of metrics) assert.equal(verdict.passed, true, verdict.message);
});

test("a changed first five names the initiative, the path, what entered and where the leaver went", async () => {
  const { current, ranked } = await gate;
  const stored = (await gate).stored!.snapshot;
  const moved: Snapshot = structuredClone(stored);
  const entry = moved.initiatives["fr-03"]!;
  const full = ranked.get("fr-03")!.funding;
  // Pretend the snapshot had the eighth program in fifth place.
  entry.funding = [...entry.funding.slice(0, 4), full[7]!];
  const changes = compareSnapshot(moved, current, ranked);
  assert.equal(changes.length, 1);
  const message = describeChanges(changes, { labels: (initiative, id) => (initiative === "fr-03" && id === full[4]!.id ? "fits" : undefined) });
  assert.match(message, /Fund ranking changed for 1 initiative \(1 path\)/u);
  assert.match(message, /fr-03 Youth-Led Restoration Along Lake Victoria, funding:/u);
  assert.ok(message.includes(`5. ${full[4]!.name}  (new)  [fits]`), message);
  assert.ok(message.includes(`Left the first 5: ${full[7]!.name}, now 8th.`), message);
  assert.match(message, /eval:funds -- --update/u);
  assert.match(describeChanges(changes, { collation: { stored: "en-US", current: "sv-SE" } }), /under sv-SE, and the snapshot was written under en-US/u);
  // A name the catalog changed is not a ranking change.
  const renamed: Snapshot = structuredClone(stored);
  renamed.initiatives["fr-01"]!.keyword[0]!.name = "Old name";
  assert.deepEqual(compareSnapshot(renamed, current, ranked), []);
  const extra: Snapshot = structuredClone(stored);
  extra.initiatives["fr-99"] = { ...structuredClone(stored.initiatives["fr-01"]!), name: "Gone" };
  assert.match(describeChanges(compareSnapshot(extra, current, ranked)), /fr-99 Gone: is in the snapshot but no longer in the fixture/u);
});

test("the fixture rejects what one of the paths could not rank", async () => {
  const set = await loadRankingSet();
  const reject = (change: (data: RankingSet) => void, code: string) => {
    const data = structuredClone(set);
    change(data);
    assert.throws(() => validateRankingSet(data), { message: code });
  };
  reject((data) => data.initiatives.push(structuredClone(data.initiatives[0]!)), "invalid_ranking_initiative");
  reject((data) => { data.initiatives[0]!.description = "Too short for the MCP tool."; }, "invalid_ranking_description");
  reject((data) => { data.initiatives[0]!.workCountries = ["Nigeria"]; }, "invalid_ranking_country");
  reject((data) => { delete data.initiatives[0]!.sourceUri; }, "invalid_ranking_source");
  // A card confirmed on the describe step holds no themes, so the fixture may not add them.
  reject((data) => { Object.assign(data.initiatives[0]!, { themes: ["water"] }); }, "invalid_ranking_themes");
  assert.ok(set.initiatives.some((row) => row.language === "pt") && set.initiatives.some((row) => row.language === "es"));
});

// Metric plumbing, on a small labelled example, so it is proven before any person's labels exist.
const SET: RankingSet = {
  version: 1, dataset: "example",
  initiatives: ["a", "b"].map((id) => ({ id, source: "invented", language: "en", name: id, description: "x".repeat(40), workCountries: [], benefitCountries: [], applicantBaseCountry: "", registrationCountry: "", applicantType: "unknown" })),
};
const order = (...ids: string[]) => ids.map((id) => ({ id, name: id }));
const rankings = (a: string[], b: string[]) => new Map<string, Rankings>([
  ["a", { keyword: order(...a), funding: order(...a), mcp: order(...a) }],
  ["b", { keyword: order(...b), funding: order(...b), mcp: order(...b) }],
]);
const labels = (status: "draft" | "confirmed", by = status === "draft" ? "agent: drafter" : "A person"): LabelSet => ({
  version: 1, dataset: "example-labels", initiatives: "example",
  labels: ([["a", "p1", "fits"], ["a", "p2", "maybe"], ["a", "p3", "doesnt"], ["a", "p9", "fits"], ["b", "q1", "fits"]] as const)
    .map(([initiative, documentId, grade]) => ({ initiative, documentId, grade, status, by, ...(status === "confirmed" ? { confirmedOn: "2026-11-24" } : {}) })),
});

test("precision at 5 counts confirmed fits, and NDCG at 10 rewards putting them first", () => {
  const grades = new Map<string, Grade>([["p1", "fits"], ["p2", "maybe"], ["p3", "doesnt"], ["p9", "fits"]]);
  assert.equal(precisionAt5(["p1", "p2", "p3", "p4", "p5"], grades), 0.2);
  assert.equal(precisionAt5(["p1", "p9", "p2"], grades), 0.4);
  // Ideal: fits, fits, maybe. Gains 3, 3, 1.
  const ideal = 3 + 3 / Math.log2(3) + 1 / Math.log2(4);
  assert.equal(ndcgAt10(["p1", "p9", "p2"], grades), 1);
  assert.ok(Math.abs(ndcgAt10(["p1", "p2", "p9"], grades)! - (3 + 1 / Math.log2(3) + 3 / Math.log2(4)) / ideal) < 1e-12);
  assert.equal(ndcgAt10(["p4"], new Map([["p3", "doesnt"]])), null);
});

test("draft labels are never measured or gated, and an agent cannot confirm one", () => {
  const drafts = measure(validateLabels(labels("draft"), SET), rankings(["p1", "p2"], ["q1"]));
  assert.equal(drafts.paths, null);
  assert.equal(drafts.drafts, 5);
  assert.deepEqual(gateMetrics(drafts, null), { passed: true, gated: false, message: "example-labels: no confirmed labels yet (5 drafts), so precision and NDCG are not gated." });
  assert.throws(() => validateLabels(labels("confirmed", "agent: drafter"), SET), { message: "invalid_confirmation" });
  const undated = labels("confirmed");
  delete undated.labels[0]!.confirmedOn;
  assert.throws(() => validateLabels(undated, SET), { message: "invalid_confirmation" });
  // A person may be called Claude; only an agent's own signature marks a draft.
  assert.doesNotThrow(() => validateLabels(labels("confirmed", "Claude Dubois"), SET));
  // A label for a program the catalog no longer holds is named, not quietly scored as never ranked.
  assert.throws(() => validateLabels(labels("confirmed"), SET, new Set(["p1", "p2", "p3", "q1"])), { message: "unknown_document: p9" });
  const noFits = { ...labels("confirmed"), labels: labels("confirmed").labels.map((l) => ({ ...l, grade: "maybe" as const })) };
  assert.match(gateMetrics(measure(validateLabels(noFits, SET), rankings(["p1"], ["q1"])), null).message, /none says a program fits/u);
  const twice = labels("confirmed");
  twice.labels.push({ ...twice.labels[0]!, grade: "doesnt" });
  assert.throws(() => validateLabels(twice, SET), { message: "duplicate_label" });
});

test("the gate names every path, metric and initiative that fell below the baseline", () => {
  const confirmed = validateLabels(labels("confirmed"), SET);
  const good = measure(confirmed, rankings(["p1", "p9", "p2"], ["q1"]));
  assert.equal(good.paths!.funding.precisionAt5, 0.3);
  assert.equal(good.paths!.funding.judgedAt5, 0.4);
  // New labels with no baseline fail until one is recorded, so the first numbers are seen in review.
  assert.equal(gateMetrics(good, null).passed, false);
  assert.match(gateMetrics(good, null).message, /--record-baseline/u);
  const baseline = { labelsHash: good.labelsHash, recordedAt: "", paths: good.paths! };
  assert.equal(gateMetrics(good, baseline).passed, true);
  const worse = gateMetrics(measure(confirmed, rankings(["p3", "p2", "p1"], ["q1"])), baseline);
  assert.equal(worse.passed, false);
  assert.match(worse.message, /funding precision at 5 fell from 0\.3 to 0\.2 \(a 0\.4 to 0\.2\)/u);
  assert.match(worse.message, /mcp NDCG at 10 fell from 1 to/u);
  // Changing a confirmed label voids the baseline instead of quietly moving the target.
  const relabelled = validateLabels({ ...labels("confirmed"), labels: labels("confirmed").labels.map((l) => (l.documentId === "q1" ? { ...l, grade: "maybe" as const } : l)) }, SET);
  assert.match(gateMetrics(measure(relabelled, rankings(["p1", "p9", "p2"], ["q1"])), baseline).message, /new or changed/u);
});
