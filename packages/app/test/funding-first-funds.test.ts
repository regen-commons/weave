import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { effectiveAccess } from "../../../dist/domain.mjs";
import { programFund } from "../../../dist/matching.mjs";
import { firstFunds, FIRST_FUNDS_MODULE } from "../dev/first-funds.ts";
import { accessSign, catalogEntries, fundingEyebrow, parseBundle } from "../src/funding/catalog.ts";
import { FundSchema, type Entry } from "../src/funding/contracts.ts";
import { closingDay, deadlineSign } from "../src/funding/deadline.ts";
import {
  FIRST_FUNDS_KEPT,
  FIRST_FUNDS_SHOWN,
  firstEntry,
  firstFundsFile,
  firstPage,
  isFirstView,
} from "../src/funding/first-funds.ts";
import { emptyFundingFilters, filterFunding, timeToClose } from "../src/funding/select.ts";

const read = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../../../dist/data/${name}.json`, import.meta.url), "utf8"));
const bundle = parseBundle(read("funders"), read("eligibility-rules"), read("program-conditions"));
const entries = catalogEntries(bundle);
const built = new Date("2026-11-23T08:00:00Z");
const file = firstFundsFile(bundle, built);
const days = (count: number) => new Date(built.getTime() + count * 86_400_000);
const fullList = (now: Date) => filterFunding(entries, { ...emptyFundingFilters, sort: "closing" }, null, now);

test("the build keeps the list's own first funds, each with only its one program and no source history", () => {
  assert.equal(file.asOf, built.toISOString());
  assert.equal(file.funds.length, FIRST_FUNDS_KEPT);
  assert.deepEqual(file.funds.map((fund) => fund.id), fullList(built).slice(0, FIRST_FUNDS_KEPT).map((entry) => entry.id));
  for (const kept of file.funds) {
    assert.ok(kept.fund.enrichment.programs.length <= 1);
    assert.deepEqual(kept.fund.enrichment.sources, []);
  }
  assert.ok(JSON.stringify(file).length < 120_000, "small enough to travel with the page");
});

test("a first card draws exactly what the catalog's card for the same entry draws", () => {
  const full = new Map(entries.map((entry) => [entry.id, entry]));
  // What OpportunityCard reads and shows.
  const card = (entry: Entry, now: Date) => {
    const fund = FundSchema.parse(programFund(entry.fund, entry.program));
    const access = effectiveAccess(fund, now);
    return {
      eyebrow: fundingEyebrow(entry.program),
      title: entry.program?.name ?? fund.displayName,
      funder: fund.displayName,
      access: accessSign(access),
      deadline: fund.deadlineDate ? deadlineSign(closingDay(fund.deadlineDate, fund.deadlineInstant), access === "closed", now) : null,
      deadlineDate: fund.deadlineDate,
      summary: entry.program?.focus.join(", ") || fund.description,
      verifiedOn: fund.verifiedOn,
      closes: timeToClose(entry, now),
    };
  };
  for (const kept of file.funds) assert.deepEqual(card(firstEntry(kept), built), card(full.get(kept.id)!, built), kept.id);
});

test("on the build day and days later, the first cards are the start of the full list, so the catalog moves none (no reorder)", () => {
  for (const now of [built, days(1), days(7), days(14)]) {
    const shown = firstPage(file, now);
    assert.ok(shown.length > 0, `cards on day ${now.toISOString().slice(0, 10)}`);
    assert.ok(shown.length <= FIRST_FUNDS_SHOWN);
    assert.deepEqual(
      shown.map((entry) => entry.id),
      fullList(now).slice(0, shown.length).map((entry) => entry.id),
      `day ${now.toISOString().slice(0, 10)}`,
    );
    assert.ok(shown.every((entry) => timeToClose(entry, now) >= 0), "a call that has closed is never shown first");
  }
  assert.equal(firstPage(file, built).length, FIRST_FUNDS_SHOWN, "a fresh build fills whole rows");
  assert.deepEqual(firstPage(file, days(400)), [], "with every kept call closed, the page waits for the catalog");
});

test("only the list's own first view takes the first cards", () => {
  assert.ok(isFirstView(emptyFundingFilters));
  assert.ok(isFirstView({ ...emptyFundingFilters, sort: "closing" }));
  assert.ok(!isFirstView({ ...emptyFundingFilters, search: "water" }));
  assert.ok(!isFirstView({ ...emptyFundingFilters, region: ["Africa"] }));
  assert.ok(!isFirstView({ ...emptyFundingFilters, closing: "30" }));
  assert.ok(!isFirstView({ ...emptyFundingFilters, sort: "name" }));
});

test("the build serves the first cards as a module the page imports", () => {
  const plugin = firstFunds();
  const configResolved = plugin.configResolved as (config: { root: string }) => void;
  configResolved({ root: fileURLToPath(new URL("..", import.meta.url)) });
  const resolveId = plugin.resolveId as (id: string) => string | undefined;
  const id = resolveId(FIRST_FUNDS_MODULE)!;
  assert.ok(id.startsWith("\0"));
  assert.equal(resolveId("./other.ts"), undefined);
  const watched: string[] = [];
  const load = plugin.load as (this: { addWatchFile(file: string): void }, id: string) => string | undefined;
  const code = load.call({ addWatchFile: (file) => watched.push(file) }, id)!;
  const literal = /^export default JSON\.parse\((".*")\);$/su.exec(code)?.[1];
  assert.ok(literal, "a single JSON string, the fastest form for the browser to read");
  const served = JSON.parse(JSON.parse(literal));
  assert.equal(served.funds.length, FIRST_FUNDS_KEPT);
  assert.ok(watched.some((file) => file.endsWith("funders.json")), "a catalog change rebuilds it in development");
});

test("Funding shows the first cards while the catalog loads, and holds a fit list's shape for its ranking", () => {
  const page = readFileSync(new URL("../src/pages/Funding.tsx", import.meta.url), "utf8");
  assert.match(page, /\{early \? \(\s*(?:\/\/[^\n]*\n\s*)*<>\s*<CardGrid>\{early\.map\(card\)\}<\/CardGrid>\s*<ListEndHold things=\{THINGS\} \/>/u);
  assert.match(page, /<CardGrid>\{selected\.slice\(0, limit\)\.map\(card\)\}<\/CardGrid>/u, "the same grid and cards once the catalog is here");
  assert.match(page, /<CardGridSkeleton kind="funding" matched=\{awaitingFit \|\| expectsFit\} count=\{BATCH\} \/>/u);
  assert.match(page, /loading && catalog\.subjectKnown && !expectsFit && !failed && isFirstView\(visibleFilters\)/u);
});
