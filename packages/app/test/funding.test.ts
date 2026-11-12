import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { z } from "zod";
import {
  accessSign,
  awardLabel,
  catalogEntries,
  findEntry,
  fundingEyebrow,
  legacyFundingHref,
  opportunityHref,
  parseBundle,
} from "../src/funding/catalog.ts";
import { evaluateCatalog } from "../src/funding/engine.ts";
import { EvaluationSchema, emptyFundingForm } from "../src/funding/contracts.ts";
import { projectFrom, keepFundingForm } from "../src/funding/profile.ts";
import { teamCoverage } from "../src/funding/team.ts";
import {
  FUNDING_KINDS,
  ROUTE_GROUPS,
  filterFunding,
  emptyFundingFilters,
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
import { CLOSING_SOON_DAYS, fundingPreviews } from "../src/home.ts";
import { fundingSourceUrl } from "../src/funding/source.ts";
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
  assert.ok(upcoming.length > 0 && upcoming.length <= 3);
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
  assert.equal(fundingSorts(true).at(-1)?.label, "Research priority", "a rank is not eligibility, so it is not called best fit");
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
  assert.equal(params.toString(), "fixture=shared&program=p1&sort=fit");
  assert.deepEqual(readFundingFilters(""), emptyFundingFilters);
  const odd = readFundingFilters("access=rolling&access=nonsense&access=open&kind=unknown&kind=prize&closing=soon&group=nope&sort=price&region=&region=Asia&region=Asia");
  assert.deepEqual(odd.access, ["open"], "an older address names one route, which opens its group once");
  assert.deepEqual(odd.kind, ["prize"]);
  assert.deepEqual(odd.region, ["Asia"]);
  assert.equal(odd.closing, "");
  assert.equal(odd.group, "");
  assert.equal(odd.sort, "fit");
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
