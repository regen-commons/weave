import assert from "node:assert/strict";
import { test } from "node:test";
import {
  evaluateSupportKinds,
  loadSupportCorpus,
  validateSupportCorpus,
  type SupportCorpus,
} from "../evaluation/support-kinds.ts";
import { suggestKinds as baselineKinds } from "../evaluation/support-kinds-baseline-v1.ts";

// CI scores only the development split. The holdout runs by hand, once, after freezing a candidate.
test("the support-kind corpus and the released baseline are pinned by hash and validate", async () => {
  const { corpus } = await loadSupportCorpus();
  assert.ok(corpus.cases.some((row) => row.split === "holdout"));
  assert.equal(corpus.thresholds.exactMatchFloor, 0.8);
});

test("development keeps the 80% floor, every named regression and the person's own words", async () => {
  const { corpus } = await loadSupportCorpus();
  const result = evaluateSupportKinds(corpus, "development");
  assert.equal(result.gates.exactMatchFloor.passed, true, JSON.stringify(result.misses));
  assert.deepEqual(result.gates.namedRegressions.groups.filter((group) => group.failed.length), []);
  assert.deepEqual(result.gates.noInventedAmountOrTimeframe.violations, []);
  assert.deepEqual(result.regressions, [], "no case the released engine got right may break");
});

test("the soil finding failed on the released engine and passes on the candidate", async () => {
  const { corpus } = await loadSupportCorpus();
  const result = evaluateSupportKinds(corpus, "development");
  for (const id of ["prod-05", "prod-10"]) {
    const row = corpus.cases.find((entry) => entry.id === id)!;
    assert.deepEqual(baselineKinds(row.text), ["living", "intellectual"], "released engine added Living");
    assert.ok(result.fixes.includes(id), id);
  }
});

test("the validator rejects leakage, duplicates, unknown kinds and unscorable holdout labels", async () => {
  const { corpus } = await loadSupportCorpus();
  const clone = (): SupportCorpus => structuredClone(corpus);
  const first = () => corpus.cases[0]!;
  const reject = (change: (data: SupportCorpus) => void, code: string) => {
    const data = clone();
    change(data);
    assert.throws(() => validateSupportCorpus(data), { message: code });
  };
  reject((data) => data.cases.push({ ...first(), id: "copy" }), "split_leakage");
  reject((data) => data.cases.push({ ...first(), id: "moved", split: "holdout", named: [], judgment: "agreed",
    text: "A different sentence entirely" }), "split_leakage");
  reject((data) => { data.cases[0]!.expected = ["money" as never]; }, "invalid_support_judgment");
  reject((data) => { const row = data.cases.find((entry) => entry.split === "holdout")!; row.judgment = "single"; }, "invalid_holdout_case");
  reject((data) => {
    const row = data.cases.find((entry) => entry.split === "holdout" && entry.judgment === "agreed")!;
    row.judgeExpected = ["spiritual"];
  }, "invalid_support_judgment");
  reject((data) => { data.thresholds.exactMatchFloor = 0.5; }, "invalid_support_corpus");
});
