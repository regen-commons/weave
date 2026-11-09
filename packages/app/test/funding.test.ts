import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { z } from "zod";
import {
  awardLabel,
  parseBundle,
  catalogEntries,
  findEntry,
  opportunityHref,
  legacyFundingHref,
} from "../src/funding/catalog.ts";
import { evaluateCatalog } from "../src/funding/engine.ts";
import { EvaluationSchema, emptyFundingForm } from "../src/funding/contracts.ts";
import { projectFrom, keepFundingForm } from "../src/funding/profile.ts";
import { teamCoverage } from "../src/funding/team.ts";
import { filterFunding, emptyFundingFilters } from "../src/funding/select.ts";
import { fundingSourceUrl } from "../src/funding/source.ts";
import {
  DeviceDraftSchema,
  newDraft,
  revise,
  confirmDraft,
  EMPTY_INITIATIVE,
} from "../src/describe/contracts.ts";
import { createLexicalIndex, rankFunds } from "../../../dist/matching.mjs";
const read = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../../../dist/data/${name}.json`, import.meta.url), "utf8"));
const raw = read("funders"),
  rules = read("eligibility-rules"),
  conditions = read("program-conditions");
const bundle = parseBundle(raw, rules, conditions),
  entries = catalogEntries(bundle);
const at = new Date("2026-11-05T12:00:00Z");
test("funding comparison amounts preserve the distinction between current, past and unknown terms", () => {
  const award = { currency: "USD", min: 1_000, max: 5_000, basis: "current_offer", note: "Full award terms." };
  assert.equal(awardLabel(award), "USD 1,000 to 5,000");
  assert.equal(awardLabel({ ...award, min: null }), "Up to USD 5,000");
  assert.equal(awardLabel({ ...award, basis: "historical" }), "Past award terms");
  assert.equal(awardLabel({ ...award, currency: null }), "See award details");
});
const draft = () =>
  confirmDraft(
    revise(newDraft(), {
      proposal: {
        ...EMPTY_INITIATIVE,
        name: "Synthetic forest circle",
        description: "Forest restoration, water monitoring and agroecology research",
        themes: [],
      },
      proposalVersion: 0,
    }),
  );
test("the app retains the entire public release and all program identities, including unverified overview records", () => {
  assert.equal(bundle.catalog.funds.length, 699);
  assert.equal(entries.length, 768);
  assert.equal(entries.filter((entry) => entry.program).length, 727);
  assert.equal(entries.filter((entry) => !entry.program).length, 41);
  assert.equal(new Set(entries.map((entry) => entry.id)).size, entries.length);
  assert.deepEqual(bundle.catalog, raw);
  assert.ok(bundle.conditions, "The committed prerequisite and priority criteria load completely");
  for (const entry of entries)
    assert.equal(findEntry(entries, entry.fund.id, entry.program?.id ?? null)?.id, entry.id);
});
test("each program uses the unchanged rubric and full-corpus IDF; best results match the live engine", () => {
  const project = projectFrom(draft())!;
  const app = evaluateCatalog(bundle, project, at);
  const live = z
    .array(EvaluationSchema)
    .parse(
      rankFunds(
        bundle.catalog.funds,
        project,
        createLexicalIndex(bundle.catalog.funds),
        bundle.rules,
        null,
        at,
        bundle.conditions,
      ),
    );
  assert.equal(app.length, 768);
  for (const expected of live) {
    const actual = app.find((row) => row.documentId === expected.documentId)!;
    assert.deepEqual(actual, expected);
  }
  assert.ok(app.every((row) => Number.isFinite(row.score)));
});
test("missing condition data keeps screening unavailable rather than treating prerequisites as passed", () => {
  const partial = parseBundle(raw, rules, { version: 1, conditions: [{}] });
  assert.equal(partial.conditions, null);
  const results = evaluateCatalog(partial, projectFrom(draft())!, at);
  assert.ok(results.every((row) => row.score <= 29));
  assert.ok(results.some((row) => row.readiness.status === "screening"));
});
test("visitors keep the whole catalog with no synthetic fit; filtering distinguishes closed cycles and exact dates", () => {
  assert.equal(filterFunding(entries, emptyFundingFilters, null, at).length, 768);
  const closed = filterFunding(entries, { ...emptyFundingFilters, access: "closed" }, null, at);
  assert.ok(closed.length > 0);
  const soon = filterFunding(entries, { ...emptyFundingFilters, closing: "30" }, null, at);
  assert.ok(soon.length > 0);
  assert.ok(soon.every((entry) => !closed.includes(entry)));
  assert.equal(
    filterFunding(entries, { ...emptyFundingFilters, search: "a never matching fictional string" }, null, at)
      .length,
    0,
  );
});
test("exact program and legacy links retain catalog case and reject missing calls without substituting another program", () => {
  const entry = entries.find((value) => value.program)!;
  const href = opportunityHref(entry);
  assert.equal(legacyFundingHref(`?fund=${entry.fund.id}&program=${entry.program!.id}`), href);
  assert.equal(findEntry(entries, entry.fund.id, "missing-program"), undefined);
  for (const search of ["?fund=../bad", "?fund=okay&program=%2Fbad", "?fund=%3Cscript%3E"])
    assert.equal(legacyFundingHref(search), null);
});
test("legacy drafts gain blank optional funding details; typed place names never become eligibility facts", () => {
  const current = draft();
  const { funding: _funding, ...legacy } = current;
  const restored = DeviceDraftSchema.parse(legacy);
  assert.deepEqual(restored.funding.form, emptyFundingForm());
  const project = projectFrom(restored)!;
  assert.deepEqual(project.workCountries, []);
  assert.equal(project.applicantBaseCountry, "");
  assert.equal(project.currency, "");
  assert.equal(project.goalMin, null);
});
test("raw funding edits survive validation failures; Keep changes only funding details", () => {
  const current = draft();
  const changed = revise(current, {
    funding: { ...current.funding, editor: { ...emptyFundingForm(), goalMin: "12,", currency: "BR" } },
  });
  assert.throws(() => keepFundingForm(changed));
  assert.equal(changed.funding.editor!.goalMin, "12,");
  const valid = revise(changed, {
    funding: {
      ...changed.funding,
      editor: {
        ...emptyFundingForm(),
        workCountries: "br, CO, BR",
        goalMin: "12000",
        goalMax: "15000",
        currency: "brl",
      },
    },
  });
  const kept = revise(valid, { funding: keepFundingForm(valid) });
  assert.deepEqual(projectFrom(kept)!.workCountries, ["BR", "CO"]);
  assert.equal(projectFrom(kept)!.currency, "BRL");
  assert.equal(kept.inputVersion, current.inputVersion);
  assert.deepEqual(kept.confirmed, current.confirmed);
  assert.throws(() =>
    keepFundingForm(
      revise(kept, {
        funding: { ...kept.funding, editor: { ...emptyFundingForm(), workCountries: "Brazil" } },
      }),
    ),
  );
});
test("team coverage counts requirements separately and requests each selected initiative once", () => {
  const candidate = { id: "orchard", name: "Fictional orchard", reason: "Example" };
  const asks = [
    { id: "host", label: "A host", candidates: [candidate] },
    { id: "monitor", label: "A monitor", candidates: [candidate] },
    { id: "place", label: "A local partner", candidates: [] },
  ];
  assert.deepEqual(teamCoverage(asks, ["orchard", "orchard"]), { chosen: ["orchard"], covered: 2, total: 3 });
  assert.deepEqual(teamCoverage(asks, []), { chosen: [], covered: 0, total: 3 });
  assert.throws(() => teamCoverage(asks, ["private-stranger"]));
});
test("official source warnings and unsafe URLs remain blocked in the app", () => {
  const fund = bundle.catalog.funds[0]!;
  assert.equal(fundingSourceUrl(fund, "javascript:alert(1)"), "");
  assert.equal(fundingSourceUrl(fund, "https://user:secret@example.org"), "");
  assert.equal(
    fundingSourceUrl(
      { ...fund, sourceWarnings: [{ url: "https://example.org/old" }] },
      "https://example.org/new",
    ),
    "",
  );
  assert.equal(fundingSourceUrl(fund, "https://example.org/source"), "https://example.org/source");
});
