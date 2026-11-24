import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { z } from "../src/validation.ts";
import {
  accessSign,
  awardLabel,
  catalogEntries,
  findEntry,
  fundingEyebrow,
  legacyFundingHref,
  opportunityHref,
  parseBundle,
  researchSnapshotDate,
} from "../src/funding/catalog.ts";
import { evaluateCatalog } from "../src/funding/engine.ts";
import { EvaluationSchema, FundSchema, emptyFundingForm } from "../src/funding/contracts.ts";
import { projectFrom, keepFundingForm } from "../src/funding/profile.ts";
import { teamCoverage } from "../src/funding/team.ts";
import {
  FUNDING_KINDS,
  ROUTE_GROUPS,
  filterFunding,
  emptyFundingFilters,
  fundingListSearch,
  readFundingFilters,
  routeGroupOf,
  timeToClose,
  writeFundingFilters,
} from "../src/funding/select.ts";
import {
  COMMON_THEMES,
  applyFundingFacet,
  fundingFacets,
  fundingSorts,
  fundingVocabulary,
} from "../src/funding/facets.ts";
import { fundingSearch } from "../src/funding/catalog.ts";
import { CLOSING_SOON_DAYS, fundingPreviews, FUNDING_PREVIEW_COUNT } from "../src/home.ts";
import { fundingSourceUrl } from "../src/funding/source.ts";
import { closingDay, deadlineSign } from "../src/funding/deadline.ts";
import {
  DeviceDraftSchema,
  newDraft,
  revise,
  confirmDraft,
  EMPTY_INITIATIVE,
} from "../src/describe/contracts.ts";
import { createLexicalIndex, programFund, rankFunds } from "../../../dist/matching.mjs";
import { ACCESS, effectiveAccess } from "../../../dist/domain.mjs";
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
test("a funding card names the kind of funding and adds only an award the source currently states", () => {
  const award = { currency: "USD", min: 1_000, max: 5_000, basis: "current_offer", note: "Full award terms." };
  assert.equal(fundingEyebrow({ instrument: "grant", award }), "Grant, USD 1,000 to 5,000");
  assert.equal(fundingEyebrow({ instrument: "prize", award: { ...award, min: null } }), "Prize, up to USD 5,000");
  assert.equal(fundingEyebrow({ instrument: "grant", award: { ...award, basis: "historical" } }), "Grant");
  assert.equal(fundingEyebrow({ instrument: "fellowship", award: { ...award, currency: null } }), "Fellowship");
  assert.equal(fundingEyebrow({ instrument: "unknown", award }), "Funding, USD 1,000 to 5,000");
  assert.equal(fundingEyebrow(undefined), "Funding");
});
test("a way in keeps the catalog's label and repeats its tone with an icon, never colour alone", () => {
  assert.deepEqual(accessSign("open"), { label: "Open call", icon: "check", tone: "success" });
  assert.deepEqual(accessSign("relationship"), { label: "By relationship", icon: "people", tone: "info" });
  assert.deepEqual(accessSign("closed"), { label: "Intake closed", icon: "lock", tone: undefined });
  assert.deepEqual(accessSign("not-a-route"), {
    label: "Application route needs checking",
    icon: "info",
    tone: undefined,
  });
  for (const entry of entries) {
    const fund = entry.fund as { access?: string };
    assert.ok(accessSign(fund.access ?? "").label, "every catalog route has words");
  }
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
  assert.equal(entries.length, 771);
  assert.equal(entries.filter((entry) => entry.program).length, 730);
  assert.equal(entries.filter((entry) => !entry.program).length, 41);
  assert.equal(new Set(entries.map((entry) => entry.id)).size, entries.length);
  assert.deepEqual(bundle.catalog, raw);
  assert.ok(bundle.conditions, "The committed prerequisite and priority criteria load completely");
  for (const entry of entries)
    assert.equal(findEntry(entries, entry.fund.id, entry.program?.id ?? null)?.id, entry.id);
});
test("the research snapshot date follows the latest dated source check, not the whole-record research date", () => {
  const catalog = bundle.catalog;
  // Partial reviews and journaled revisions date their evidence without moving researchCheckedOn.
  const haymarket = catalog.funds.find((fund) => fund.id === "recTQMgGnvmEseTmT")!;
  assert.ok(haymarket.enrichment.programs[0]!.evidence.some((evidence) => evidence.checkedOn === "2026-11-16"));
  assert.equal(catalog.researchCheckedOn, "2026-10-29");
  assert.ok(researchSnapshotDate(catalog)! >= "2026-11-16");
  for (const page of ["Funding", "Opportunity"]) {
    const source = readFileSync(new URL(`../src/pages/${page}.tsx`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /researchCheckedOn/, `${page} shows the derived date`);
    assert.match(source, /researchSnapshotDate\(/, page);
    assert.match(source, /check date unknown\./, `${page} says when the date is unknown`);
    assert.doesNotMatch(source, /(?:Research|Catalog) snapshot/, `${page} names the date as the latest check, not a whole-catalog snapshot`);
  }
});
test("a snapshot with no usable research date says so instead of inventing one", () => {
  const sample = structuredClone(bundle.catalog.funds.find((fund) => fund.enrichment.programs.length)!);
  const snapshot = (compiledAt: string, days: { researchCheckedOn?: string; source?: string; evidence: string }) => {
    const fund = structuredClone(sample);
    fund.verifiedOn = null;
    fund.enrichment.sources = [{ url: "https://example.org", ...(days.source ? { checkedOn: days.source } : {}) }];
    fund.enrichment.programs = fund.enrichment.programs
      .slice(0, 1)
      .map((program) => ({ ...program, evidence: [{ url: "https://example.org", checkedOn: days.evidence }] }));
    const { researchCheckedOn } = days;
    return parseBundle({ funds: [fund], compiledAt, ...(researchCheckedOn ? { researchCheckedOn } : {}) }, rules, conditions)
      .catalog;
  };
  assert.equal(researchSnapshotDate(snapshot("2026-11-17T00:30:00Z", { evidence: "" })), null);
  assert.equal(researchSnapshotDate(snapshot("2026-11-17T00:30:00Z", { evidence: "2026-02-30" })), null);
  assert.equal(researchSnapshotDate(snapshot("2026-11-17T00:30:00Z", { evidence: "16 November" })), null);
  // A day after compilation cannot be in the snapshot; a local date a day ahead of UTC can.
  assert.equal(researchSnapshotDate(snapshot("2026-11-17T00:30:00Z", { evidence: "2062-11-16" })), null);
  assert.equal(researchSnapshotDate(snapshot("2026-11-16T23:00:00Z", { evidence: "2026-11-17" })), "2026-11-17");
  assert.equal(
    researchSnapshotDate(
      snapshot("2026-11-17T00:30:00Z", { researchCheckedOn: "2026-10-29", source: "2026-11-15", evidence: "2026-11-09" }),
    ),
    "2026-11-15",
  );
});
test("each program uses the unchanged rubric and full-corpus IDF; every result but fit matches the live engine (DL-143)", () => {
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
  assert.equal(app.length, 771);
  for (const expected of live) {
    const actual = app.find((row) => row.documentId === expected.documentId)!;
    // Readiness, research priority and screening are the rubric's own; only fit is Funding's.
    const { thematicFit, ...rest } = actual;
    const { thematicFit: rubricFit, ...rubricRest } = expected;
    assert.deepEqual(rest, rubricRest);
    assert.equal(thematicFit.score === null, rubricFit.score === null, "a program the rubric cannot assess stays unassessed");
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
  assert.equal(filterFunding(entries, emptyFundingFilters, null, at).length, 771);
  const closed = entries.filter((entry) => effectiveAccess(programFund(entry.fund, entry.program), at) === "closed");
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
test("on the real catalog, Home previews the soonest open calls and counts the Funding page's closing list", () => {
  const { upcoming, closingSoon } = fundingPreviews(entries, at);
  const listed = filterFunding(entries, { ...emptyFundingFilters, closing: String(CLOSING_SOON_DAYS) }, null, at);
  assert.equal(closingSoon, listed.length);
  assert.ok(upcoming.length > 0 && upcoming.length <= FUNDING_PREVIEW_COUNT);
  const left = upcoming.map((entry) => timeToClose(entry, at));
  assert.ok(left.every((time) => time >= 0), "only calls still open");
  assert.deepEqual(left, [...left].sort((a, b) => a - b), "soonest first");
  const others = entries.filter((entry) => !upcoming.includes(entry)).map((entry) => timeToClose(entry, at));
  assert.ok(others.every((time) => !(time >= 0) || time >= left.at(-1)!), "no open call closes sooner than those shown");
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

const routeOf = (entry: (typeof entries)[number]) => effectiveAccess(programFund(entry.fund, entry.program), at);
test("How to apply offers three groups, and every route the catalog knows is in one or is a research note (DL-062)", () => {
  const notes = ["unverified", "unconfirmed", "mismatch", "conflicting"];
  const grouped = Object.values(ROUTE_GROUPS).flatMap((group) => [...group.routes]);
  assert.equal(new Set(grouped).size, grouped.length, "no route sits in two groups");
  assert.deepEqual([...grouped, ...notes].sort(), Object.keys(ACCESS).sort(), "a new catalog state must be placed on purpose");
  for (const note of notes) assert.equal(routeGroupOf(note), null);
  assert.equal(routeGroupOf("rolling"), "open");
  assert.equal(routeGroupOf("restricted"), "invitation");
  assert.equal(routeGroupOf("future"), "closed");
});
test("on the real catalog each route group lists only its routes, and a program under a research note is never hidden by default", () => {
  const all = filterFunding(entries, emptyFundingFilters, null, at);
  let listed = 0;
  for (const [group, { routes }] of Object.entries(ROUTE_GROUPS)) {
    const chosen = filterFunding(entries, { ...emptyFundingFilters, access: [group] }, null, at);
    assert.ok(chosen.length > 0, group);
    assert.ok(chosen.every((entry) => (routes as readonly string[]).includes(routeOf(entry))), group);
    listed += chosen.length;
  }
  const ungrouped = all.filter((entry) => routeGroupOf(routeOf(entry)) === null);
  assert.ok(ungrouped.length > 0, "the catalog holds unconfirmed routes");
  assert.equal(listed + ungrouped.length, all.length);
  const both = filterFunding(entries, { ...emptyFundingFilters, access: ["open", "invitation"] }, null, at);
  assert.ok(both.every((entry) => ["open", "invitation"].includes(routeGroupOf(routeOf(entry)) ?? "")));
});
test("region, theme and kind of funding each keep any chosen value, and every filter applies at once", () => {
  const vocabulary = fundingVocabulary(entries);
  const [region, other] = vocabulary.regions as [string, string];
  const one = filterFunding(entries, { ...emptyFundingFilters, region: [region] }, null, at);
  assert.ok(one.length > 0 && one.every((entry) => entry.fund.regions.includes(region)));
  const either = filterFunding(entries, { ...emptyFundingFilters, region: [region, other] }, null, at);
  assert.ok(either.length >= one.length);
  assert.ok(either.every((entry) => entry.fund.regions.includes(region) || entry.fund.regions.includes(other)));
  const theme = vocabulary.themes[0]!;
  const themed = filterFunding(entries, { ...emptyFundingFilters, theme: [theme] }, null, at);
  assert.ok(themed.length > 0 && themed.every((entry) => entry.fund.sectors.includes(theme)));
  const prizes = filterFunding(entries, { ...emptyFundingFilters, kind: ["prize"] }, null, at);
  assert.ok(prizes.length > 0 && prizes.every((entry) => entry.program?.instrument === "prize"));
  assert.ok(entries.some((entry) => !entry.program), "the catalog holds overview records");
  const narrowed = filterFunding(entries, { ...emptyFundingFilters, region: [region], theme: [theme], kind: ["grant"] }, null, at);
  assert.ok(narrowed.length <= Math.min(one.length, themed.length));
  assert.ok(narrowed.every((entry) => entry.fund.regions.includes(region) && entry.fund.sectors.includes(theme) && entry.program?.instrument === "grant"));
  assert.equal(filterFunding(entries, { ...emptyFundingFilters, region: ["Atlantis"] }, null, at).length, 0);
});
test("the catalog's regions, its most named themes and the kinds it holds are what Funding offers", () => {
  const vocabulary = fundingVocabulary(entries);
  assert.equal(vocabulary.regions.length, 7);
  assert.deepEqual(vocabulary.regions, [...vocabulary.regions].sort((a, b) => a.localeCompare(b)));
  assert.equal(vocabulary.themes.length, COMMON_THEMES);
  const funds = [...new Map(entries.map((entry) => [entry.fund.id, entry.fund])).values()];
  const uses = (theme: string) => funds.filter((fund) => fund.sectors.includes(theme)).length;
  const least = Math.min(...vocabulary.themes.map(uses));
  const rest = [...new Set(funds.flatMap((fund) => fund.sectors))].filter((theme) => !vocabulary.themes.includes(theme));
  assert.ok(rest.length > 100, "most of the catalog's themes are left to search");
  assert.ok(rest.every((theme) => uses(theme) <= least), "no theme left out is named by more funders than one offered");
  assert.ok(vocabulary.themes.includes("Climate & environment") && vocabulary.themes.includes("Food & agriculture"));
  assert.ok(vocabulary.kinds.length > 0 && vocabulary.kinds.every((kind) => Object.hasOwn(FUNDING_KINDS, kind)));
  assert.ok(!vocabulary.kinds.includes("unknown"));
  assert.deepEqual(fundingVocabulary(entries, 3).themes.length, 3);
});
test("Funding's filters come in a fixed order, keep a value an address chose and add the priority group only with a card", () => {
  const vocabulary = fundingVocabulary(entries);
  const visitor = fundingFacets(vocabulary, emptyFundingFilters, false);
  assert.deepEqual(visitor.map((facet) => facet.label), ["Closing", "How to apply", "Region", "Kind of funding", "Theme"]);
  assert.deepEqual(visitor.map((facet) => facet.chosen.length), [0, 0, 0, 0, 0]);
  assert.deepEqual(visitor[1]!.options.map((option) => option.label), ["Open now", "By invitation or relationship", "Not open now"]);
  const ranked = fundingFacets(vocabulary, emptyFundingFilters, true);
  assert.deepEqual(ranked.map((facet) => facet.label), ["Closing", "How to apply", "Region", "Kind of funding", "Priority group", "Theme"]);
  const linked = fundingFacets(vocabulary, { ...emptyFundingFilters, closing: "14", theme: ["Open source"], region: ["Atlantis"] }, false);
  assert.deepEqual(linked[0]!.options.at(-1), { value: "14", label: "Within 14 days" });
  assert.ok(linked[2]!.options.some((option) => option.value === "Atlantis"));
  assert.ok(linked[4]!.options.some((option) => option.value === "Open source"));
  assert.deepEqual(fundingSorts(false).map((sort) => sort.label), ["Closing soon", "Name A to Z", "Recently checked"]);
  assert.deepEqual(
    fundingSorts(true).map((sort) => sort.label),
    ["Strongest fit", "Closing soon", "Name A to Z", "Recently checked"],
    "with an initiative compared, the list can be ordered by fit, which is about topics and never eligibility (DL-129)",
  );
});
test("changing one filter leaves the others alone", () => {
  const start = { ...emptyFundingFilters, search: "water", region: ["Africa"], closing: "30" };
  assert.deepEqual(applyFundingFacet(start, "theme", ["Water & sanitation"]), { ...start, theme: ["Water & sanitation"] });
  assert.deepEqual(applyFundingFacet(start, "closing", []), { ...start, closing: "" });
  assert.deepEqual(applyFundingFacet(start, "access", ["open", "closed"]), { ...start, access: ["open", "closed"] });
  assert.deepEqual(applyFundingFacet(start, "group", ["lead"]), { ...start, group: "lead" });
  assert.equal(applyFundingFacet(start, "not-a-filter", ["x"]), start);
});
test("an address carries every chosen value, and one it could not mean is left out", () => {
  const filters = {
    ...emptyFundingFilters,
    search: "seed bank",
    access: ["open", "invitation"],
    region: ["Latin America & Caribbean", "Africa"],
    theme: ["Food & agriculture"],
    kind: ["grant", "prize"],
    closing: "30",
    sort: "closing",
  };
  const params = new URLSearchParams("fixture=shared&access=closed&program=p1");
  writeFundingFilters(filters, params);
  assert.equal(params.get("fixture"), "shared", "the rest of the address stays");
  assert.equal(params.get("program"), "p1");
  assert.deepEqual(params.getAll("region"), ["Latin America & Caribbean", "Africa"]);
  assert.deepEqual(params.getAll("access"), ["open", "invitation"], "the old value is replaced, never added to");
  assert.deepEqual(readFundingFilters(params.toString()), filters);
  writeFundingFilters(emptyFundingFilters, params);
  assert.equal(params.toString(), "fixture=shared&program=p1", "the list's own order is not written");
  assert.deepEqual(readFundingFilters(""), emptyFundingFilters);
  const odd = readFundingFilters("access=rolling&access=nonsense&access=open&kind=unknown&kind=prize&closing=soon&group=nope&sort=price&region=&region=Asia&region=Asia");
  assert.deepEqual(odd.access, ["open"], "an older address names one route, which opens its group once");
  assert.deepEqual(odd.kind, ["prize"]);
  assert.deepEqual(odd.region, ["Asia"]);
  assert.equal(odd.closing, "");
  assert.equal(odd.group, "");
  assert.equal(odd.sort, "", "an order it cannot mean leaves the list's own");
  assert.equal(readFundingFilters("closing=30&sort=closing").closing, "30", "Home's link to funds closing soon");
});
test("a record opened from a filtered list keeps every filter for the way back", () => {
  const search = "?q=river&region=Africa&region=Asia&kind=grant&sort=closing&fixture=shared";
  const kept = fundingSearch(search);
  assert.deepEqual(kept.getAll("region"), ["Africa", "Asia"]);
  assert.equal(kept.get("fixture"), null, "only the funding filters travel");
  const href = opportunityHref(entries.find((entry) => entry.program)!, search);
  const query = new URLSearchParams(href.split("?")[1]);
  assert.deepEqual(query.getAll("region"), ["Africa", "Asia"]);
  assert.equal(query.get("kind"), "grant");
  assert.ok(query.get("program"));
});
// Found on production, 23 November 2026: just after a chip was removed, a card's link still carried
// it (`&access=open`), because cards read the window's address, which the list writes after drawing.
test("a card's link drops a removed chip in the same drawing, from the choices in force", () => {
  const entry = entries.find((item) => item.program)!;
  const before = "?access=open&region=Africa&initiative=none&fixture=shared";
  const chosen = readFundingFilters(before);
  const removed = { ...chosen, access: [] };
  // The window's address still has the chip; the list's own address for its choices does not.
  const search = fundingListSearch(before, removed, true);
  const query = new URLSearchParams(opportunityHref(entry, search).split("?")[1]);
  assert.deepEqual(query.getAll("access"), [], "the removed chip is gone from the card's link");
  assert.deepEqual(query.getAll("region"), ["Africa"], "the chips still in force stay");
  assert.equal(query.get("initiative"), "none", "and so does browsing with no initiative");
  assert.equal(new URLSearchParams(search).get("fixture"), "shared", "the rest of the address stays");
  assert.equal(fundingListSearch(before, removed, false).includes("initiative"), false);
  const page = readFileSync(new URL("../src/pages/Funding.tsx", import.meta.url), "utf8");
  assert.match(page, /const listSearch = fundingListSearch\(routeSearch\(\), filters, browsing\);/u);
  assert.match(page, /<OpportunityCard\s+entry=\{entry\}\s+search=\{listSearch\}/u, "the list's cards take its address, not the window's");
});

// Defect 4 of the Funding QA (21 November 2026): at 23:15 Pacific on a closing day a card read
// "Open call" beside "Ended". The card's access sign, its deadline tag, the Closing filter and the
// rubric must give one answer at every moment, wherever the browser's clock is set.
test("a call ends at one moment for its access sign, deadline tag, Closing filter and score, in every time zone", () => {
  const zones = ["America/Los_Angeles", "UTC", "Africa/Nairobi", "Pacific/Kiritimati"];
  const cases = [
    // A source date with no stated time ends with its UTC day (DL-103).
    { id: "rec9fBEyvIAOuPbVi::climate-smart-communities-initiative2027", at: "2026-11-20T21:30:00Z", closed: false },
    { id: "rec9fBEyvIAOuPbVi::climate-smart-communities-initiative2027", at: "2026-11-20T23:59:59.999Z", closed: false },
    { id: "rec9fBEyvIAOuPbVi::climate-smart-communities-initiative2027", at: "2026-11-21T00:00:00Z", closed: true },
    { id: "rec9fBEyvIAOuPbVi::climate-smart-communities-initiative2027", at: "2026-11-21T07:15:00Z", closed: true },
    // An exact closing moment on the UTC day after its source date: 23:59 Pacific on 20 November.
    { id: "local-mozilla::mozilla-human-scale-ai", at: "2026-11-21T03:00:00Z", closed: false },
    { id: "local-mozilla::mozilla-human-scale-ai", at: "2026-11-21T07:58:59Z", closed: false },
    { id: "local-mozilla::mozilla-human-scale-ai", at: "2026-11-21T07:59:01Z", closed: true },
  ];
  const project = projectFrom(draft())!;
  const before = process.env.TZ;
  try {
    for (const zone of zones) {
      process.env.TZ = zone;
      for (const { id, at: moment, closed } of cases) {
        const now = new Date(moment);
        const where = `${id} at ${moment} in ${zone}`;
        const entry = entries.find((candidate) => candidate.id === id)!;
        const fund = FundSchema.parse(programFund(entry.fund, entry.program));
        const access = effectiveAccess(fund, now);
        assert.equal(access === "closed", closed, `access sign: ${where}`);
        const tag = deadlineSign(closingDay(fund.deadlineDate!, fund.deadlineInstant), access === "closed", now);
        assert.equal(tag.label === "Ended", closed, `deadline tag "${tag.label}": ${where}`);
        const closing = filterFunding([entry], { ...emptyFundingFilters, closing: "7" }, null, now);
        assert.equal(closing.length, closed ? 0 : 1, `Closing filter: ${where}`);
        const one = { ...bundle, catalog: { ...bundle.catalog, funds: [{ ...entry.fund, enrichment: { ...entry.fund.enrichment, programs: [entry.program!] } }] } };
        const scored = evaluateCatalog(one, project, now).find((row) => row.documentId === id)!;
        assert.equal(scored.access, access, `rubric: ${where}`);
      }
    }
  } finally {
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  }
});
test("Closing soon lists calls still open by their closing day, and ones whose day has passed at the end", () => {
  const listed = filterFunding(entries, { ...emptyFundingFilters, sort: "closing" }, null, at);
  const open = listed.filter((entry) => timeToClose(entry, at) >= 0);
  assert.ok(open.length > 10, "the catalog has calls still open on the test day");
  assert.deepEqual(listed.slice(0, open.length).map((entry) => entry.id), open.map((entry) => entry.id), "every open call comes first");
  const days = open.map((entry) => closingDay(entry.program!.application.closesOn!, entry.program!.application.deadlineInstant));
  assert.deepEqual(days, [...days].sort(), "soonest first");
  const ended = entries.find((entry) => entry.program?.application.closesOn && timeToClose(entry, at) < 0 && effectiveAccess(programFund(entry.fund, entry.program), at) !== "closed");
  assert.ok(ended, "the catalog has a call whose day has passed but whose intake is not confirmed closed");
  assert.ok(listed.indexOf(ended) >= open.length, "it is not listed among the calls closing soon");
});
