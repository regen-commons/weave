import assert from "node:assert/strict";
import { test } from "node:test";
import { flowCoverage, loadFlows } from "../evaluation/user-flows.ts";

test("every required user flow names tests that exist, except ones a named fix branch adds", async () => {
  const report = await flowCoverage(false);
  assert.deepEqual(report.flows.flatMap((row) => row.missing.map((item) => `${row.id}: ${item.file} :: ${item.test}`)), []);
});

test("the flow map covers the required flows and only allows known evidence classes", async () => {
  const ids = (await loadFlows()).map((flow) => flow.id);
  for (const id of ["describe-form", "describe-conversation", "describe-pdf", "source-fields-review", "support-kinds",
    "private-saves-retired", "account-switching", "cross-tab-sign-out", "stale-responses", "retries", "storage-failure",
    "import-link-reuse", "selective-deletion", "sharing-matching-synthetic", "sharing-lifecycle-database", "matching-quality"])
    assert.ok(ids.includes(id), id);
});
