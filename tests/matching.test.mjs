import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  createLexicalIndex,
  rankFunds,
  checkEligibility,
  awardContext,
  fundText,
  corpusDocuments,
  documentId,
} from "../dist/matching.mjs";
import { normalizeProject, readSaved, emptySaved } from "../dist/storage.mjs";
import { LocalMatcher } from "../dist/matching-client.mjs";
const funds = JSON.parse(
  fs.readFileSync(new URL("../dist/data/funders.json", import.meta.url)),
).funds;
const rules = JSON.parse(
  fs.readFileSync(
    new URL("../dist/data/eligibility-rules.json", import.meta.url),
  ),
).rules;
const project = normalizeProject({
  id: "solar",
  name: "Solar hubs",
  description: "Renewable energy solar education and internet skills for youth",
  tags: ["energy access"],
  workCountries: ["NG"],
  applicantBaseCountry: "NG",
  applicantType: "nonprofit",
  goalMin: 10000,
  goalMax: 100000,
});
const index = createLexicalIndex(funds);
const at = new Date("2026-10-15T12:00:00Z");
test("baseline and semantic ranking preserve every ID, deterministic order and complete-method coverage", () => {
  const a = rankFunds(funds, project, index, rules, null, at);
  assert.equal(a.length, 699);
  assert.equal(new Set(a.map((m) => m.fund.id)).size, 699);
  assert.deepEqual(a, rankFunds(funds, project, index, rules, null, at));
  assert.ok(a.every((m) => m.method === "baseline"));
  assert.ok(a[0].shared.length > 0);
  const scores = Object.fromEntries(corpusDocuments(funds).map((d) => [d.id, 0.3]));
  const lead = a[0].fund;
  for (const d of corpusDocuments([lead])) scores[d.id] = 0.9;
  const semantic = rankFunds(funds, project, index, rules, scores, at);
  assert.ok(semantic.every((m) => m.method === "semantic"));
  assert.equal(semantic[0].fund.id, lead.id);
  delete scores[corpusDocuments(funds)[0].id];
  assert.ok(
    rankFunds(funds, project, index, rules, scores, at).every(
      (m) => m.method === "baseline",
    ),
  );
  scores[corpusDocuments(funds)[0].id] = NaN;
  assert.ok(
    rankFunds(funds, project, index, rules, scores, at).every(
      (m) => m.method === "baseline",
    ),
  );
});
test("Nigeria applicant base conflicts with Rapid Fund; unknown details and work location alone do not", () => {
  const fund = funds.find((f) => f.displayName === "Wikimedia Foundation");
  assert.equal(
    checkEligibility(project, fund, rules, "2026-10-15").status,
    "conflict",
  );
  assert.equal(
    checkEligibility(
      { ...project, applicantBaseCountry: "" },
      fund,
      rules,
      "2026-10-15",
    ).status,
    "needs_confirmation",
  );
  assert.equal(
    checkEligibility(
      { ...project, applicantBaseCountry: "US" },
      fund,
      rules,
      "2026-10-15",
    ).status,
    "needs_confirmation",
  );
  assert.equal(
    checkEligibility(project, fund, rules, "2027-10-15").status,
    "needs_confirmation",
  );
});
test("mixed-country scopes and unscreened programs are not blanket rejections", () => {
  const f = { id: "x", enrichment: { programs: [{ id: "one" }] } };
  const rule = {
    fundId: "x",
    programId: "one",
    field: "workCountries",
    operator: "only",
    values: ["GB"],
    checkedOn: "2026-10-15",
    reason: "England program",
  };
  assert.equal(
    checkEligibility(
      { ...project, workCountries: ["NG"] },
      f,
      [rule],
      "2026-10-15",
    ).status,
    "conflict",
  );
  assert.equal(
    checkEligibility(
      { ...project, workCountries: ["NG", "GB"] },
      f,
      [rule],
      "2026-10-15",
    ).status,
    "needs_confirmation",
  );
  f.enrichment.programs.push({ id: "two" });
  assert.equal(
    checkEligibility(
      { ...project, workCountries: ["NG"] },
      f,
      [rule],
      "2026-10-15",
    ).status,
    "needs_confirmation",
  );
});
test("registration and base are separate; compliant rules never assert eligibility", () => {
  const f = funds.find((f) => f.id === "rec1oGozP3IFZCnEP");
  const p = {
    ...project,
    registrationCountry: "US",
    applicantBaseCountry: "ES",
  };
  assert.equal(checkEligibility(p, f, rules, "2026-10-15").status, "conflict");
  assert.equal(
    checkEligibility(
      { ...p, registrationCountry: "ES" },
      f,
      rules,
      "2026-10-15",
    ).status,
    "needs_confirmation",
  );
  assert.equal(
    checkEligibility(project, { id: "no-rules" }, rules, "2026-10-15").status,
    "needs_confirmation",
  );
});
test("smaller grants can partially fund a goal; currencies and historical terms are not assumed comparable", () => {
  const f = {
    enrichment: {
      programs: [
        {
          award: {
            currency: "USD",
            basis: "current_offer",
            min: 500,
            max: 5000,
          },
        },
      ],
    },
  };
  assert.match(awardContext(project, f), /part of your total goal/);
  assert.match(
    awardContext({ ...project, currency: "NGN" }, f),
    /No currency conversion/,
  );
  f.enrichment.programs[0].award.basis = "historical";
  assert.match(awardContext(project, f), /not verified/);
});
test("profile upgrade preserves saved lists and validates country/type values", () => {
  const old = emptySaved();
  old.projects = [
    {
      id: "p",
      name: "Old",
      description: "Keep",
      tags: [],
      currency: "USD",
      goalMin: null,
      goalMax: null,
    },
  ];
  old.lists.p = ["keep"];
  const next = readSaved(JSON.stringify(old));
  assert.deepEqual(next.lists, old.lists);
  assert.deepEqual(next.projects[0].workCountries, []);
  assert.equal(next.projects[0].applicantType, "unknown");
  assert.throws(() => normalizeProject({ ...project, workCountries: ["XX"] }));
  assert.throws(() =>
    normalizeProject({ ...project, applicantType: "eligible" }),
  );
});
test("exclusion prose and private identity do not enter thematic corpus", () => {
  assert.equal(
    fundText({
      sectors: ["energy"],
      approaches: [],
      description: "No solar funding",
      enrichment: null,
    }),
    "energy",
  );
});

test("verified focus supersedes directory tags and every named program has award context", () => {
  const f = {
    sectors: ["obsolete theme"],
    approaches: [],
    enrichment: {
      focus: ["renewable energy"],
      programs: [
        {
          name: "Small grants",
          focus: [],
          beneficiaries: [],
          award: {
            min: 1000,
            max: 5000,
            currency: "USD",
            basis: "current_offer",
          },
        },
        {
          name: "Research",
          focus: ["education"],
          beneficiaries: [],
          award: {
            min: null,
            max: 20000,
            currency: "GBP",
            basis: "current_offer",
          },
        },
      ],
    },
  };
  assert.match(fundText(f), /renewable energy/);
  assert.equal(fundText(f).includes("obsolete theme"), false);
  assert.match(
    awardContext(project, f),
    /Small grants: Published award may fund part/,
  );
  assert.match(awardContext(project, f), /Research: Award is in GBP/);
});

test("funding resources follow grantmakers while all records remain available", () => {
  const sample = [
    {
      id: "resource",
      name: "Resource",
      sectors: ["solar energy education"],
      approaches: [],
      enrichment: { reviewStatus: "not_a_funder", focus: [], programs: [] },
    },
    {
      id: "grantmaker",
      name: "Grantmaker",
      sectors: ["youth"],
      approaches: [],
      enrichment: { reviewStatus: "source_reviewed", focus: [], programs: [] },
    },
  ];
  const result = rankFunds(
    sample,
    project,
    createLexicalIndex(sample),
    [],
    null,
    at,
  );
  assert.deepEqual(
    result.map((m) => m.fund.id),
    ["grantmaker", "resource"],
  );
});
function fakeWorker() {
  return {
    postMessage(data) {
      this.last = data;
    },
    terminate() {
      this.terminated = true;
    },
  };
}
test("worker opt-in, cancellation, stale result suppression and failure recovery", () => {
  const workers = [];
  const matcher = new LocalMatcher(
    () => {},
    () => {
      const w = fakeWorker();
      workers.push(w);
      return w;
    },
  );
  assert.equal(workers.length, 0);
  matcher.match("solar", "corpus");
  const first = workers[0];
  const oldId = first.last.requestId;
  matcher.match("culture", "corpus");
  const id = first.last.requestId;
  first.onmessage({
    data: { type: "result", requestId: oldId, scores: { stale: 1 } },
  });
  assert.equal(matcher.state.status, "loading");
  assert.equal(matcher.state.scores, null);
  first.onmessage({
    data: { type: "error", requestId: id, detail: "missing asset" },
  });
  assert.equal(matcher.state.status, "error");
  assert.ok(first.terminated);
  matcher.match("culture", "corpus");
  assert.equal(workers.length, 2);
  first.onerror();
  assert.equal(matcher.state.status, "loading");
  first.onmessage({ data: { type: "progress", message: "stale download" } });
  assert.notEqual(matcher.state.message, "stale download");
  workers[1].onmessage({
    data: {
      type: "result",
      requestId: workers[1].last.requestId,
      scores: { fresh: 1 },
    },
  });
  assert.equal(matcher.state.status, "ready");
  assert.deepEqual(matcher.state.scores, { fresh: 1 });
  matcher.cancel();
  assert.ok(workers[1].terminated);
  assert.equal(matcher.state.scores, null);
  first.onmessage({
    data: { type: "result", requestId: id, scores: { late: 1 } },
  });
  assert.equal(matcher.state.scores, null);
});

test("all executable checks refer to retained fund/program evidence and keep registration separate", () => {
  assert.ok(rules.length >= 15);
  const allowedFields = new Set([
    "workCountries",
    "benefitCountries",
    "applicantBaseCountry",
    "registrationCountry",
    "applicantType", "usWorkStates", "usBenefitStates",
  ]);
  for (const rule of rules) {
    const fund = funds.find((f) => f.id === rule.fundId);
    assert.ok(fund);
    assert.ok(allowedFields.has(rule.field));
    assert.match(rule.sourceUrl, /^https:\/\//);
    assert.match(rule.checkedOn, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(fund.enrichment?.programs.some((p) => p.id === rule.programId));
    assert.ok(fund.enrichment.sources.some((s) => s.url === rule.sourceUrl));
  }
  assert.equal(
    rules.find((r) => r.fundId === "rec1oGozP3IFZCnEP").field,
    "registrationCountry",
  );
});

test("records without focus data cannot gain relevance from a placeholder embedding", () => {
  const scores = Object.fromEntries(corpusDocuments(funds).map((d) => [d.id, 0.9]));
  const ranked = rankFunds(funds, project, index, rules, scores, at);
  const noFocus = ranked.filter((m) => !m.focusAvailable);
  assert.ok(noFocus.length > 0);
  assert.ok(
    noFocus.every(
      (m) =>
        m.score === 0 &&
        m.label === "Focus not specified" &&
        m.shared.length === 0,
    ),
  );
});

test("direct benefit is independent from work location and unknown facts remain unknown", () => {
  const esmee = funds.find((f) => f.id === "recpzyMJ7OnKydVWE");
  const p = { ...project, workCountries: ["US"], benefitCountries: ["US"] };
  assert.equal(checkEligibility(p, esmee, rules, "2026-10-16").status, "conflict");
  assert.equal(checkEligibility({ ...p, benefitCountries: [] }, esmee, rules, "2026-10-16").status, "needs_confirmation");
  const mixed = checkEligibility({ ...p, benefitCountries: ["US", "GB"] }, esmee, rules, "2026-10-16");
  assert.equal(mixed.status, "needs_confirmation");
  assert.ok(mixed.programs[0].checks.some((c) => c.partial));
  assert.equal(checkEligibility({ ...p, benefitCountries: ["GB"] }, esmee, rules, "2026-10-16").status, "needs_confirmation");
  assert.deepEqual(normalizeProject({ id: "old", name: "Old project", workCountries: ["US"] }).benefitCountries, []);
});

test("Kenyan portfolio check screens Nigeria-only work even when applicant base is unknown", () => {
  const kcdf = funds.find((f) => f.id === "recNRkQyG1uiWaBKN");
  const checked = checkEligibility({ ...project, applicantBaseCountry: "" }, kcdf, rules, "2026-10-16");
  assert.equal(checked.status, "conflict");
  assert.ok(checked.programs[0].checks.find((c) => c.field === "applicantBaseCountry").missing);
});

test("program ranking never borrows a sibling program's focus, award, route or eligibility", () => {
  const template = structuredClone(funds.find((f) => f.enrichment.programs.length));
  template.id = "program-fixture";
  const source = template.enrichment.programs[0];
  const program = (id, focus, route, max) => ({ ...structuredClone(source), id, name: id, focus: [focus], beneficiaries: [], award: { currency: "USD", min: 1000, max, basis: "current_offer" }, application: { route, note: id + " application", opensOn: null, closesOn: null, deadlineInstant: null, url: "https://example.org/" + id } });
  template.enrichment.programs = [program("solar", "solar energy", "inquiry", 5000), program("arts", "arts", "open", 50000)];
  const fs = [template], idx = createLexicalIndex(fs);
  const scores = { [documentId(template, template.enrichment.programs[0])]: 0.9, [documentId(template, template.enrichment.programs[1])]: 0.1 };
  const rule = { fundId: template.id, programId: "arts", field: "workCountries", operator: "only", values: ["US"], checkedOn: "2026-10-16" };
  const match = rankFunds(fs, project, idx, [rule], scores, at)[0];
  assert.equal(match.fund.program, "solar");
  assert.equal(match.access, "inquiry");
  assert.match(match.fund.amount, /5,000/);
  assert.equal(match.fund.evidenceUrl, "https://example.org/solar");
  assert.deepEqual(match.eligibility.programs.map((p) => p.programId), ["solar"]);
  assert.equal(match.eligibility.status, "needs_confirmation");
  assert.equal(match.alternatives[0].eligibility, "conflict");
  assert.equal(match.breakdown.access, 8);
  assert.ok(match.score <= match.rawScore && match.score <= 100);
  // An incomplete program-vector result cannot be mistaken for complete inference.
  delete scores[documentId(template, template.enrichment.programs[1])];
  assert.equal(rankFunds(fs, project, idx, [], scores, at)[0].method, "baseline");
});

test("equal thematic fit prefers open programs over inquiries and expired calls", () => {
  const template = structuredClone(funds.find((f) => f.enrichment.programs.length));
  template.id = "access-fixture";
  const source = template.enrichment.programs[0];
  template.enrichment.programs = ["closed", "inquiry", "open"].map((route) => ({ ...structuredClone(source), id: route, name: route, focus: ["solar energy"], beneficiaries: [], application: { route, note: route, opensOn: null, closesOn: null, deadlineInstant: null, url: "https://example.org/" } }));
  const scores = Object.fromEntries(corpusDocuments([template]).map((d) => [d.id, 0.8]));
  const best = rankFunds([template], project, createLexicalIndex([template]), [], scores, at)[0];
  assert.equal(best.program.id, "open");
  assert.deepEqual(best.alternatives.map((p) => p.access), ["inquiry", "closed"]);
  template.enrichment.programs[2].application.closesOn = "2026-01-01";
  assert.equal(rankFunds([template], project, createLexicalIndex([template]), [], scores, at)[0].program.id, "inquiry");
});

test("alternative geographic conditions require both mismatches before rejecting", () => {
  const fund = funds.find((f) => f.id === "recYn5utG7XAVs30n");
  const p = { ...project, applicantBaseCountry: "US", workCountries: ["US"] };
  assert.equal(checkEligibility(p, fund, rules, "2026-10-16").status, "conflict");
  for (const allowed of [{ applicantBaseCountry: "EG" }, { workCountries: ["EG"] }, { applicantBaseCountry: "" }, { workCountries: [] }])
    assert.equal(checkEligibility({ ...p, ...allowed }, fund, rules, "2026-10-16").status, "needs_confirmation");
});

test("scope uncertainty affects ranking without converting priority-country mentions into exclusions", () => {
  const fund = structuredClone(funds.find((f) => f.enrichment.programs.length));
  fund.enrichment.programs = [fund.enrichment.programs[0]];
  fund.enrichment.programs[0].geography.workCountries = ["CA"];
  const match = rankFunds([fund], project, createLexicalIndex([fund]), [], null, at)[0];
  assert.equal(match.eligibility.status, "needs_confirmation");
  assert.equal(match.geographic.points, 2);
  assert.match(match.geographic.reasons.join(" "), /not an exclusion/);
  assert.equal(match.rawScore, Object.values(match.breakdown).reduce((sum, n) => sum + n, 0));
  const same = rankFunds([fund], { ...project, workCountries: ["CA"] }, createLexicalIndex([fund]), [], null, at)[0];
  assert.equal(same.geographic.points, 2); // Mere country mentions do not earn verified geographic credit.
});

test("source-backed restricted and inquiry routes do not masquerade as open applications", () => {
  const findProgram = (id, pid) => funds.find((f) => f.id === id).enrichment.programs.find((p) => p.id === pid);
  assert.equal(findProgram("recwNYbgyirnLcv6X", "development-fund-phaseii").application.route, "restricted");
  assert.equal(findProgram("recjbh1I6Fav4CHcG", "oilwatch-ggf-small-grants-programme-2026").application.route, "restricted");
  assert.equal(findProgram("recKkrUEyYu4JTxvZ", "general-project-grants-year-round-letter-of-intent").application.route, "inquiry");
  const iCS = funds.find((f) => f.id === "recKkrUEyYu4JTxvZ");
  const p = { ...project, benefitCountries: ["NG"] };
  const m = rankFunds([iCS], p, createLexicalIndex([iCS]), rules, null, at)[0];
  assert.equal(m.eligibility.status, "conflict");
});
