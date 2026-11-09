import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  validateResearch,
  validateSnapshot,
  validateFollowup,
} from "../scripts/research-validation.mjs";
const root = new URL("../", import.meta.url);
const schema = JSON.parse(
  fs.readFileSync(new URL("dist/data/enrichment.schema.json", root), "utf8"),
);
const data = JSON.parse(
  fs.readFileSync(new URL("dist/data/funders.json", root), "utf8"),
);
const pilot = data.funds.filter((f) => f.isPilot);
test("all 593 original identities plus 106 supplemental funders, original30 pilot identities and field evidence validate", () => {
  assert.equal(validateSnapshot(root).funds.length, 699);
  assert.equal(new Set(pilot.map((f) => f.enrichment.sourceRecordId)).size, 30);
  assert.ok(new Set(pilot.flatMap((f) => f.enrichment.regions)).size >= 6);
  for (const f of pilot) assert.equal(f.descriptionBasis, "primary");
});
test("unknown amounts remain null; annual caps and pooled budgets cannot become per-award maxima", () => {
  for (const name of [
    "Acento (Acción Local)",
    "Women’s Fund Fiji",
    "Wellcome (Trust)",
  ]) {
    const p = pilot.find((f) => f.name === name).enrichment.programs[0];
    assert.equal(p.award.max, null, name);
  }
  const closed = pilot.filter((f) => f.access === "closed");
  assert.ok(closed.length > 0);
  const award = closed.find(
    (f) => f.enrichment.programs[0].award.basis === "current_offer",
  );
  assert.ok(award);
});
test("schema and evidence validation rejects fabricated range shapes, unsafe URLs and missing evidence", () => {
  const valid = pilot[0].enrichment;
  for (const mutate of [
    (r) => (r.programs[0].award.max = -1),
    (r) => (r.sources[0].url = "javascript:alert(1)"),
    (r) => (r.programs[0].evidence = []),
    (r) => (r.programs[0].application.closesOn = "2026-02-30"),
    (r) => (r.programs[0].award.currency = "ZZ"),
    (r) => (r.programs[0].evidence[0].fields = ["invented.field"]),
  ]) {
    const r = structuredClone(valid);
    mutate(r);
    assert.throws(() => validateResearch(r, schema));
  }
});
test("evidence preserves geographic exceptions and known source conflicts", () => {
  const a = pilot.find((f) => f.name === "A Team Foundation (UK)").enrichment
    .programs[0];
  assert.ok(a.geography.scope.includes("international"));
  const b = pilot.find((f) => f.name === "Acento (Acción Local)").enrichment
    .programs[0];
  assert.ok(b.geography.workCountries.includes("MX"));
  const c = pilot.find((f) => f.displayName === "Wellcome (Trust)").enrichment
    .programs[0];
  assert.ok(c.geography.scope.includes("October 29"));
});

test("full research coverage distinguishes program terms, source overviews and failed checks", () => {
  assert.equal(data.enrichedCount, 699);
  assert.equal(data.funds.filter((f) => f.enrichment).length, 699);
  const counts = {};
  for (const f of data.funds) {
    const r = f.enrichment;
    counts[r.reviewStatus] = (counts[r.reviewStatus] || 0) + 1;
    if (r.reviewStatus === "program_reviewed") assert.ok(r.programs.length > 0);
    if (r.reviewStatus === "source_reviewed")
      assert.equal(r.programs.length, 0);
    if (["unresolved", "unreachable"].includes(r.reviewStatus))
      assert.equal(r.focus.length, 0);
  }
  assert.deepEqual(counts, data.researchCounts);
  const coverage = JSON.parse(
    fs.readFileSync(new URL("dist/data/research-coverage.json", root)),
  );
  assert.equal(coverage.records.length, 699);
  assert.deepEqual(coverage.researchCounts, counts);
});
test("failed source checks cannot masquerade as reviewed program terms", () => {
  const valid = structuredClone(pilot[0].enrichment);
  valid.reviewStatus = "source_reviewed";
  assert.throws(() => validateResearch(valid, schema));
  valid.reviewStatus = "program_reviewed";
  valid.programs = [];
  assert.throws(() => validateResearch(valid, schema));
  valid.reviewStatus = "unresolved";
  valid.focus = ["invented focus"];
  assert.throws(() => validateResearch(valid, schema));
});

test("follow-up audit requires every original target exactly once and honest final dispositions", () => {
  const baseline = {
    passId: "test-pass",
    checkedOn: "2026-10-15",
    targetCount: 2,
    researchCounts: { source_reviewed: 1, unresolved: 1 },
    records: [
      { sourceRecordId: "one", previousStatus: "source_reviewed" },
      { sourceRecordId: "two", previousStatus: "unresolved" },
    ],
  };
  const rows = [
    {
      sourceRecordId: "one",
      previousStatus: "source_reviewed",
      outcome: "program_terms_added",
      sources: [
        {
          url: "https://example.org/criteria",
          title: "Criteria",
          outcome: "policy",
        },
      ],
      notes: "Published nonprofit criteria; intake remains by invitation.",
      remainingGaps: ["award", "deadline"],
    },
    {
      sourceRecordId: "two",
      previousStatus: "unresolved",
      outcome: "identity_unresolved",
      sources: [],
      notes:
        "Exact-name searches found two different institutions; neither can be selected.",
      remainingGaps: ["eligibility", "award", "deadline"],
    },
  ];
  const audit = {
    version: 1,
    passId: baseline.passId,
    checkedOn: baseline.checkedOn,
    records: rows,
  };
  const records = new Map([
    ["one", { reviewStatus: "program_reviewed" }],
    ["two", { reviewStatus: "unresolved" }],
  ]);
  assert.equal(validateFollowup(baseline, [audit], records).length, 2);
  for (const mutate of [
    (a) => a.records.pop(),
    (a) => (a.records[1] = structuredClone(a.records[0])),
    (a) => (a.records[1].outcome = "program_terms_added"),
    (a) => (a.records[0].sources[0].url = "javascript:alert(1)"),
    (a) => (a.passId = "another-pass"),
  ]) {
    const invalid = structuredClone(audit);
    mutate(invalid);
    assert.throws(() => validateFollowup(baseline, [invalid], records));
  }
});
