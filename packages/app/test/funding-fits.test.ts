import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { catalogEntries, parseBundle } from "../src/funding/catalog.ts";
import { evaluateCatalog } from "../src/funding/engine.ts";
import { fundingFit } from "../src/funding/fit.ts";
import { projectFrom } from "../src/funding/profile.ts";
import { emptyFundingFilters, filterFunding, fundingFits, fundingFitsLine, fundingOrder } from "../src/funding/select.ts";
import { confirmDraft, EMPTY_INITIATIVE, newDraft, revise } from "../src/describe/contracts.ts";

const read = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../../../dist/data/${name}.json`, import.meta.url), "utf8"));
const bundle = parseBundle(read("funders"), read("eligibility-rules"), read("program-conditions"));
const entries = catalogEntries(bundle);
const now = new Date("2026-11-23T12:00:00Z");

// The walkthrough's kind of card: typed in step one, working in Kenya, with Strong and Good fits
// that each still need a check (an invitation route, a closed cycle, the geographic scope).
const card = (() => {
  const draft = confirmDraft(
    revise(newDraft(), {
      proposal: {
        ...EMPTY_INITIATIVE,
        name: "Seed Commons Valley",
        description:
          "We run regenerative agriculture and agroecology training for smallholder farmers, covering soil health, seed saving and food sovereignty.",
        themes: [],
      },
      proposalVersion: 0,
    }),
  );
  return revise(draft, { funding: { ...draft.funding, form: { ...draft.funding.form, workCountries: "KE" } } });
})();
const results = evaluateCatalog(bundle, projectFrom(card)!, now);
const level = (score: number | null) => fundingFit(score);

test("Matches shows the funds Funding ranks first for the same card, where it used to say nothing matched (DL-141)", () => {
  // Before: only the matcher's "research lead" group was shown, and this card has none.
  assert.equal(results.filter((result) => result.group === "lead").length, 0, "the old block was empty for this card");
  const fits = fundingFits(entries, results, now);
  assert.equal(fits.first.length, 2);
  // Funding's own list for a card it compares: its own order is fit (fundingOrder), no filter.
  const funding = filterFunding(entries, { ...emptyFundingFilters, sort: fundingOrder("", true) }, results, now);
  assert.deepEqual(
    fits.first.map(({ entry }) => entry.id),
    funding.slice(0, 2).map((entry) => entry.id),
    "the two cards are Funding's first two",
  );
  for (const { result } of fits.first) {
    assert.equal(level(result.thematicFit.score), "strong");
    assert.notEqual(result.group, "lead", "each still needs a check, which the old block hid");
    assert.ok(result.readiness.label.length > 0, "each card carries its caveat line");
  }
});

test("the count says how many may fit well, a scope check included, and never claims eligibility", () => {
  const all = fundingFits(entries, results, now, Number.POSITIVE_INFINITY);
  const strongOrGood = results.filter((result) => ["strong", "good"].includes(level(result.thematicFit.score) ?? ""));
  assert.equal(all.well, strongOrGood.length);
  assert.equal(all.possible, results.filter((result) => level(result.thematicFit.score) === "possible").length);
  assert.ok(
    all.first.slice(0, all.well).some(({ result }) => result.readiness.status === "geography"),
    "a Good fit that needs its geographic scope checked is counted",
  );
  assert.ok(all.first.every(({ result }) => level(result.thematicFit.score) !== "low"), "a fund with no shared topic is not a fit");
  const line = fundingFitsLine(all);
  assert.equal(line, `${all.well} funds may fit this card well. Each needs a check with the funder.`);
  assert.doesNotMatch(line, /eligib/iu);
});

test("the line says what is true in every case", () => {
  assert.equal(fundingFitsLine({ well: 3, possible: 9 }), "3 funds may fit this card well. Each needs a check with the funder.");
  assert.equal(fundingFitsLine({ well: 1, possible: 0 }), "1 fund may fit this card well. It needs a check with the funder.");
  assert.equal(fundingFitsLine({ well: 0, possible: 4 }), "4 funds share a topic with this card. Each needs a check with the funder.");
  assert.equal(fundingFitsLine({ well: 0, possible: 1 }), "1 fund shares a topic with this card. It needs a check with the funder.");
  assert.equal(fundingFitsLine({ well: 0, possible: 0 }), "No fund shares a topic with this card yet.");
});

test("the card page reads the ranking Funding sorts with, not the matcher's lead group", () => {
  const block = readFileSync(new URL("../src/ui/FirstFunding.tsx", import.meta.url), "utf8");
  assert.match(block, /fundingFits\(catalogEntries\(bundle\), results\)/u);
  assert.doesNotMatch(block, /group === "lead"/u);
  assert.doesNotMatch(block, /Nothing in the catalog matches/u);
  assert.match(block, /const waiting = loading \|\| ranking \|\| \(personalized && !results && !error\);/u, "no flash of a wrong line between the catalog and its ranking");
  // At the top of the Matches step, the block holds its count line's room while it loads.
  assert.match(
    block,
    /<CardGridSkeleton kind="funding" matched count=\{2\}[^>]*\/>\s*<p aria-hidden="true">\s*<span className="rc-skeleton" data-shape="hold">\s*\{fundingFitsLine\(/u,
  );
});
