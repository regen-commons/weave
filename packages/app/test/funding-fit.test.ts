import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { THEMATIC_FIT_RUBRIC } from "../../../dist/matching.mjs";
import { catalogEntries, fundingSearch, opportunityHref, parseBundle } from "../src/funding/catalog.ts";
import { evaluateCatalog } from "../src/funding/engine.ts";
import { compareFit, FIT_FLOORS, fitExplanation, fundingFit } from "../src/funding/fit.ts";
import { projectFrom } from "../src/funding/profile.ts";
import {
  emptyFundingFilters,
  filterFunding,
  fundingOrder,
  readBrowsing,
  writeBrowsing,
} from "../src/funding/select.ts";
import { confirmDraft, EMPTY_INITIATIVE, newDraft, revise } from "../src/describe/contracts.ts";

const read = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../../../dist/data/${name}.json`, import.meta.url), "utf8"));
const bundle = parseBundle(read("funders"), read("eligibility-rules"), read("program-conditions"));
const entries = catalogEntries(bundle);
const at = new Date("2026-11-05T12:00:00Z");
const project = (description: string) =>
  projectFrom(
    confirmDraft(
      revise(newDraft(), {
        proposal: { ...EMPTY_INITIATIVE, name: "Synthetic forest circle", description, themes: [] },
        proposalVersion: 0,
      }),
    ),
  )!;

test("fit has four levels, each starting at its own floor, and a score the rubric could not give has none", () => {
  const cases: [number | null, string | null][] = [
    [100, "strong"], [60, "strong"], [59, "good"], [40, "good"], [39, "possible"], [20, "possible"],
    [19, "low"], [0, "low"], [null, null], [Number.NaN, null],
  ];
  for (const [score, level] of cases) assert.equal(fundingFit(score), level, String(score));
  assert.deepEqual(FIT_FLOORS, { strong: 60, good: 40, possible: 20, low: 0 });
});

test("with keywords, a level is a count of shared topics: three or more, two, one or none (DL-129)", () => {
  // The rubric's grade for 0, 1, 2, 3, 4, 5 and 6 or more distinct specific shared topics. If the
  // rubric's grades move, the floors must be measured again.
  const grades = THEMATIC_FIT_RUBRIC.sharedTermGrades;
  assert.deepEqual(grades, [0, 30, 50, 65, 75, 80, 85]);
  assert.deepEqual(grades.map(fundingFit), ["low", "possible", "good", "strong", "strong", "strong", "strong"]);
  // A grade capped for want of specific purpose evidence (59) never reads as strong.
  assert.equal(fundingFit(59), "good");
});

test("the fit order puts the strongest first, unassessed fit after, no result last, and keeps priority on a tie", () => {
  const places = [
    { name: "unassessed", place: { score: null, priority: 0 } },
    { name: "two topics, later priority", place: { score: 50, priority: 7 } },
    { name: "missing", place: undefined },
    { name: "strong", place: { score: 65, priority: 9 } },
    { name: "two topics, earlier priority", place: { score: 50, priority: 2 } },
    { name: "none", place: { score: 0, priority: 1 } },
  ];
  assert.deepEqual(
    [...places].sort((a, b) => compareFit(a.place, b.place)).map(({ name }) => name),
    ["strong", "two topics, earlier priority", "two topics, later priority", "none", "unassessed", "missing"],
  );
});

test("Funding ordered by fit runs from the strongest fit to the weakest for the initiative compared", () => {
  const description =
    "Regenerative agriculture and agroecology training for smallholder farmers, soil health, seed saving and food sovereignty";
  const results = evaluateCatalog(bundle, project(description), at);
  const byId = new Map(results.map((result, priority) => [result.documentId, { result, priority }]));
  const listed = filterFunding(entries, { ...emptyFundingFilters, sort: "fit" }, results, at);
  assert.equal(listed.length, entries.length, "ordering hides nothing");
  const scores = listed.map((entry) => byId.get(entry.id)!.result.thematicFit.score ?? -1);
  for (let i = 1; i < scores.length; i++) assert.ok(scores[i - 1]! >= scores[i]!, `card ${i} is not stronger than the one before`);
  const levels = new Set(listed.map((entry) => fundingFit(byId.get(entry.id)!.result.thematicFit.score)));
  assert.ok(levels.has("strong") && levels.has("good") && levels.has("possible") && levels.has("low"), "the sample reaches every level");
  // Within one score, research priority keeps its order.
  for (let i = 1; i < listed.length; i++) {
    const before = byId.get(listed[i - 1]!.id)!, after = byId.get(listed[i]!.id)!;
    if (before.result.thematicFit.score === after.result.thematicFit.score) assert.ok(before.priority < after.priority);
  }
  // Filters still narrow an ordered list, and keep its order.
  const grants = filterFunding(entries, { ...emptyFundingFilters, sort: "fit", kind: ["grant"] }, results, at);
  assert.deepEqual(grants.map((entry) => entry.id), listed.filter((entry) => entry.program?.instrument === "grant").map((entry) => entry.id));
});

test("without an initiative compared, Funding is never ordered by fit", () => {
  assert.equal(fundingOrder("", true), "fit", "fit is the list's own order while an initiative is compared");
  assert.equal(fundingOrder("", false), "closing");
  assert.equal(fundingOrder("fit", false), "closing", "an address asking for fit while browsing gets the closing order");
  assert.equal(fundingOrder("name", true), "name");
  assert.equal(fundingOrder("recent", false), "recent");
  // With no results there is no fit to order by, whatever the filters say.
  const unranked = filterFunding(entries, { ...emptyFundingFilters, sort: "fit" }, null, at);
  const byName = filterFunding(entries, { ...emptyFundingFilters, sort: "name" }, null, at);
  assert.deepEqual(unranked.map((entry) => entry.id), byName.map((entry) => entry.id));
});

test("a fit line names the shared topics it rests on, says where it was worked out and that it is not eligibility", () => {
  const shared = fitExplanation({
    thematicFit: { score: 65, band: "relevant", label: "Relevant themes", evidenceTerms: ["forest", "water", "agroecology"] },
  });
  assert.equal(shared, "Shared topics: forest, water, agroecology. Worked out on this device from keywords. Fit is not eligibility.");
  const none = fitExplanation({ thematicFit: { score: 0, band: "limited", label: "Limited thematic overlap", evidenceTerms: [] } });
  assert.match(none, /^No specific topics in common with your description\./u);
  assert.match(none, /Fit is not eligibility\.$/u);
});

test("browsing with no initiative is kept in the address, to a fund and back, and Clear Filters does not touch it", () => {
  const params = new URLSearchParams("q=river&sort=closing");
  writeBrowsing(true, params);
  assert.equal(params.toString(), "q=river&sort=closing&initiative=none");
  assert.ok(readBrowsing(params.toString()));
  assert.equal(readBrowsing("initiative=other"), false, "only the one word means browsing");
  assert.equal(fundingSearch(`?${params}`).get("initiative"), "none", "the way back keeps it");
  assert.match(opportunityHref(entries[0]!, `?${params}`), /initiative=none/u, "and so does the fund it opens");
  assert.equal(fundingSearch("?q=river").get("initiative"), null);
  writeBrowsing(false, params);
  assert.equal(params.toString(), "q=river&sort=closing");
  assert.ok(!("initiative" in emptyFundingFilters), "it is not a filter");
});
