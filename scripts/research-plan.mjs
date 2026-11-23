#!/usr/bin/env node
// Says what a catalog routine should cover next, from the committed records alone, so
// two runs on the same commit plan the same work.
//
//   node scripts/research-plan.mjs discovery [--as-of YYYY-MM-DD] [--json]
//   node scripts/research-plan.mjs freshness [--as-of YYYY-MM-DD] [--json]
//
// discovery: registry sources due for a sweep and the coverage cells due for a search.
// freshness: programs to recheck first, then the oldest-due records.
// It reads files and prints a plan. It never fetches a source or writes the catalog.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const DAY = 86_400_000;
const read = (root, path) => JSON.parse(readFileSync(new URL(path, root), "utf8"));
const addDays = (date, days) => new Date(Date.parse(date) + days * DAY).toISOString().slice(0, 10);
// Never-covered work sorts first, then oldest, then a fixed tiebreak, so the order is deterministic.
const oldestFirst = (dateOf, tiebreak = (a, b) => a.id.localeCompare(b.id)) => (a, b) => (dateOf(a) ?? "").localeCompare(dateOf(b) ?? "") || tiebreak(a, b);

/** Sources and theme-by-place cells a discovery run should cover as of a date. */
export function discoveryPlan({ registry, coverage, asOf }) {
  const sources = registry.sources
    .filter((source) => source.cadenceDays > 0 && source.status !== "retired" && source.access.cost !== "paid")
    .map((source) => ({ id: source.id, name: source.name, status: source.status, lastUsedOn: source.lastUsed?.on ?? null, dueOn: source.lastUsed ? addDays(source.lastUsed.on, source.cadenceDays) : null }))
    .filter((source) => !source.dueOn || source.dueOn <= asOf)
    .sort(oldestFirst((source) => source.dueOn));

  const searched = new Map(coverage.cells.map((cell) => [cell.id, cell]));
  const nonFinancial = coverage.formsOfCapital.filter((form) => form !== "financial");
  const cells = coverage.themes
    .flatMap((theme, themeIndex) => coverage.places.map((place, placeIndex) => ({ theme, place, themeIndex, placeIndex })))
    .map(({ theme, place, themeIndex, placeIndex }) => {
      const id = `${theme.id}/${place.id}`;
      const record = searched.get(id);
      const forms = record?.forms ?? {};
      // Every search covers money; one other form of capital rotates in, least recent first.
      const rotating = [...nonFinancial].sort((a, b) => (forms[a] ?? "").localeCompare(forms[b] ?? "") || nonFinancial.indexOf(a) - nonFinancial.indexOf(b))[0];
      const lastSearchedOn = record?.lastSearchedOn ?? null;
      // Walk the grid diagonally, so cells equally overdue spread across themes and places.
      const turn = ((placeIndex - themeIndex) % coverage.places.length + coverage.places.length) % coverage.places.length * coverage.themes.length + themeIndex;
      return { id, turn, theme: theme.id, place: place.id, languages: place.languages, formsOfCapital: ["financial", rotating], lastSearchedOn, dueOn: lastSearchedOn ? addDays(lastSearchedOn, coverage.cadenceDays) : null };
    })
    .filter((cell) => !cell.dueOn || cell.dueOn <= asOf)
    .sort(oldestFirst((cell) => cell.lastSearchedOn, (a, b) => a.turn - b.turn))
    .map(({ turn, ...cell }) => cell);

  return { asOf, sources, cells: cells.slice(0, coverage.cellsPerRun), cellsDue: cells.length, cellsTotal: coverage.themes.length * coverage.places.length };
}

const keyOf = (fundId, programId) => `${fundId}::${programId ?? "@source"}`;

function reviewHistory(log) {
  const history = new Map();
  for (const entry of log.entries) {
    if (!entry.fundId) continue;
    const key = keyOf(entry.fundId, entry.programId);
    if (!history.has(key)) history.set(key, []);
    history.get(key).push(entry);
  }
  for (const entries of history.values()) entries.sort((a, b) => (a.attemptedOn ?? "").localeCompare(b.attemptedOn ?? ""));
  return history;
}

const latest = (dates) => dates.filter(Boolean).sort().at(-1) ?? null;

/** Program and source-only records a freshness run should recheck as of a date. */
export function freshnessPlan({ catalog, log, intervals, asOf }) {
  const history = reviewHistory(log);
  const closingBy = addDays(asOf, intervals.closingWindowDays);
  const records = [];
  for (const fund of catalog.funds) {
    const enrichment = fund.enrichment ?? {};
    const programs = enrichment.programs?.length ? enrichment.programs : [null];
    for (const program of programs) {
      const key = keyOf(fund.id, program?.id);
      const entries = history.get(key) ?? [];
      const application = program?.application ?? {};
      const route = program ? application.route : "source-only";
      // A whole-record review, else the newest dated evidence the catalog itself holds.
      const lastVerifiedOn = latest(entries.map((entry) => entry.verifiedOn)) ?? latest((program?.evidence ?? []).map((item) => item.checkedOn)) ?? enrichment.researchedOn ?? fund.verifiedOn ?? null;
      const lastFieldCheckOn = latest([lastVerifiedOn, ...entries.map((entry) => entry.fieldVerifiedOn)]);
      const failedRun = entries.length - 1 - entries.findLastIndex((entry) => entry.result !== "failed");
      const targetDays = intervals.routeDays[route] ?? intervals.routeDays.unverified;
      const reasons = [];
      const active = route === "open" || route === "rolling";
      if (active && application.closesOn >= asOf && application.closesOn <= closingBy && (!lastFieldCheckOn || addDays(lastFieldCheckOn, intervals.closingRecheckDays) <= asOf)) reasons.push("closing-soon");
      if (active && application.closesOn && application.closesOn < asOf) reasons.push("cutoff-passed-still-open");
      if (route === "future" && application.opensOn && application.opensOn <= closingBy) reasons.push("expected-opening");
      // A run may ask for an earlier look than the interval gives, never a later one.
      const byInterval = lastVerifiedOn ? addDays(lastVerifiedOn, targetDays) : null;
      const scheduled = entries.at(-1)?.nextReviewOn ?? null;
      const dueOn = byInterval && scheduled && scheduled < byInterval ? scheduled : byInterval;
      if (failedRun >= intervals.failedRetrievalsBeforeFlag) reasons.push("repeated-failed-retrieval");
      records.push({ id: key, fundId: fund.id, programId: program?.id ?? null, name: fund.displayName ?? fund.name, programName: program?.name ?? null, route, closesOn: application.closesOn ?? null, lastVerifiedOn, lastFieldCheckOn, targetDays, dueOn, reasons });
    }
  }
  const priority = records.filter((record) => record.reasons.length).sort(oldestFirst((record) => record.closesOn ?? record.lastVerifiedOn));
  const prioritized = new Set(priority.map((record) => record.id));
  const due = records.filter((record) => !prioritized.has(record.id) && (!record.dueOn || record.dueOn <= asOf)).sort(oldestFirst((record) => record.lastVerifiedOn));
  return { asOf, records: records.length, priority, oldestDue: due.slice(0, intervals.oldestDuePerRun), overdue: due.length, neverVerified: records.filter((record) => !record.lastVerifiedOn).length };
}

function print(plan, mode) {
  const row = (cells) => console.log(cells.map((cell) => cell ?? "never").join("\t"));
  if (mode === "discovery") {
    console.log(`Discovery plan as of ${plan.asOf}\n\nSources due (${plan.sources.length}): id, status, last used`);
    for (const source of plan.sources) row([source.id, source.status, source.lastUsedOn]);
    console.log(`\nCells this run (${plan.cells.length} of ${plan.cellsDue} due, ${plan.cellsTotal} in all): cell, languages, forms of capital, last searched`);
    for (const cell of plan.cells) row([cell.id, cell.languages.join(","), cell.formsOfCapital.join(","), cell.lastSearchedOn]);
    return;
  }
  console.log(`Freshness plan as of ${plan.asOf}: ${plan.records} records, ${plan.priority.length} priority, ${plan.overdue} more overdue, ${plan.neverVerified} never verified\n\nPriority: record, route, closes, last verified, reasons`);
  for (const record of plan.priority) row([record.id, record.route, record.closesOn ?? "-", record.lastVerifiedOn, record.reasons.join(",")]);
  console.log(`\nOldest due (${plan.oldestDue.length}): record, route, last verified, due`);
  for (const record of plan.oldestDue) row([record.id, record.route, record.lastVerifiedOn, record.dueOn]);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [mode, ...flags] = process.argv.slice(2);
  const asOfFlag = flags.indexOf("--as-of");
  const asOf = asOfFlag >= 0 ? flags[asOfFlag + 1] : new Date().toISOString().slice(0, 10);
  if (!["discovery", "freshness"].includes(mode) || !/^\d{4}-\d{2}-\d{2}$/.test(asOf ?? "")) {
    console.error("Usage: node scripts/research-plan.mjs discovery|freshness [--as-of YYYY-MM-DD] [--json]");
    process.exit(2);
  }
  const root = new URL("../", import.meta.url);
  const plan = mode === "discovery"
    ? discoveryPlan({ registry: read(root, "research/discovery-sources.json"), coverage: read(root, "research/search-coverage.json"), asOf })
    : freshnessPlan({ catalog: read(root, "dist/data/funders.json"), log: read(root, "research/maintenance-review-log.json"), intervals: read(root, "research/review-intervals.json"), asOf });
  if (flags.includes("--json")) console.log(JSON.stringify(plan, null, 2));
  else print(plan, mode);
}
