// A person's review of fund labels, through a spreadsheet. `--export` writes one row per initiative and
// program, with what both sides say, the agent's draft and any confirmation already made beside it (or
// neither, with `--blind`). "your grade" always starts blank. The person fills it in for the rows they
// judge, and `--import` confirms exactly those rows under their name. Rows left blank keep what they had,
// a draft or an earlier confirmation, and drafts count in no metric.
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { GRADES, LABEL_FILES, loadRankingData, loadRankingSet, rankSet, validateLabels, type FundLabel, type Grade, type LabelSet, type RankingData, type RankingSet } from "./fund-ranking.ts";

const HEADERS = [
  "initiative", "initiative name", "what the initiative does", "where it works",
  "program id", "program", "program focus", "who it serves", "program geography", "kind of funding",
  "Funding rank", "live site rank",
  "draft grade", "draft note", "confirmed grade", "confirmed by", "your grade", "your note",
] as const;
/** Columns a blind sheet leaves out: what Weave and anyone else said. */
const OTHERS = new Set<string>(["Funding rank", "live site rank", "draft grade", "draft note", "confirmed grade", "confirmed by"]);
/** Where Weave ranked each program for each initiative, on Funding and on the live site, from 1. */
export type Ranks = ReadonlyMap<string, ReadonlyMap<string, { funding?: number; keyword?: number }>>;
/** Excel writes and expects this mark at the start of a UTF-8 file, or it shows accents garbled. */
const BOM = "\uFEFF";

/**
 * One spreadsheet cell, quoted where it has to be (RFC 4180). Text that a spreadsheet would run as a
 * formula (starting with =, +, - or @) is opened with an apostrophe, which spreadsheets show as text.
 */
export const csvCell = (raw: string) => {
  const value = FORMULA.test(raw) ? `'${raw}` : raw;
  return /[",\n\r]/u.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
};

const FORMULA = /^[=+\-@\t\r]/u;
/** A cell as the person meant it: without the apostrophe the export put before text a spreadsheet would run. */
const unguard = (value: string) => (value.startsWith("'") && FORMULA.test(value.slice(1)) ? value.slice(1) : value);

/**
 * Reads RFC 4180 text: quoted cells may hold commas, quotes and line breaks. A leading byte order mark is
 * dropped, and a sheet saved with semicolons, as spreadsheets in some languages do, is read by its header.
 */
export function parseCsv(input: string): string[][] {
  const text = input.startsWith(BOM) ? input.slice(1) : input;
  const header = text.slice(0, text.search(/\r|\n|$/u));
  const separator = header.includes(";") && !header.includes(",") ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [], value = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { value += '"'; i++; }
      else if (c === '"') quoted = false;
      else value += c;
    } else if (c === '"' && value === "") quoted = true;
    else if (c === separator) { row.push(value); value = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(value); rows.push(row); row = []; value = "";
    } else value += c;
  }
  if (quoted) throw Error("csv_unclosed_quote");
  if (value !== "" || row.length) { row.push(value); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim()));
}

type ProgramView = { name: string; focus: string; serves: string; geography: string; kind: string };
function programViews(data: RankingData): Map<string, ProgramView> {
  const views = new Map<string, ProgramView>();
  for (const fund of data.catalog.funds) {
    const programs = (fund.enrichment?.programs ?? []) as { id: string; name: string; focus?: string[]; beneficiaries?: string[]; geography?: { scope?: string }; instrument?: string }[];
    for (const p of programs)
      views.set(`${fund.id}::${p.id}`, {
        name: data.names.get(`${fund.id}::${p.id}`) ?? p.name, focus: (p.focus ?? []).join("; "), serves: (p.beneficiaries ?? []).join("; "),
        geography: p.geography?.scope ?? "", kind: p.instrument ?? "",
      });
    if (!programs.length) views.set(fund.id, { name: data.names.get(fund.id) ?? fund.name, focus: fund.sectors.join("; "), serves: "", geography: fund.regions.join("; "), kind: "" });
  }
  return views;
}
/** Each program's name as a sheet shows it, so an import can tell a row whose program id was edited. */
export const programNames = (data: RankingData): Map<string, string> => new Map([...programViews(data)].map(([id, view]) => [id, view.name]));

/** The spreadsheet a person reviews, one row per label, in the file's order (each initiative's pool in ranking order). */
export function exportCsv(labels: LabelSet, set: RankingSet, data: RankingData, options: { blind?: boolean; initiatives?: ReadonlySet<string>; ranks?: Ranks } = {}): string {
  const rows = new Map(set.initiatives.map((row) => [row.id, row]));
  const views = programViews(data);
  const columns = HEADERS.filter((h) => !options.blind || !OTHERS.has(h));
  const lines = [columns.map(csvCell).join(",")];
  for (const label of labels.labels) {
    if (options.initiatives && !options.initiatives.has(label.initiative)) continue;
    const initiative = rows.get(label.initiative)!, program = views.get(label.documentId);
    const rank = options.ranks?.get(label.initiative)?.get(label.documentId);
    const confirmed = label.status === "confirmed";
    const draft = confirmed ? label.draft : { grade: label.grade, note: label.note };
    const cells: Record<(typeof HEADERS)[number], string> = {
      "initiative": label.initiative, "initiative name": initiative.name, "what the initiative does": initiative.description,
      "where it works": initiative.where ?? (initiative.workCountries.join(" ") || "not stated"),
      "program id": label.documentId, "program": program?.name ?? label.documentId, "program focus": program?.focus ?? "",
      "who it serves": program?.serves ?? "", "program geography": program?.geography ?? "", "kind of funding": program?.kind ?? "",
      "Funding rank": rank?.funding ? String(rank.funding) : "", "live site rank": rank?.keyword ? String(rank.keyword) : "",
      "draft grade": draft?.grade ?? "", "draft note": draft?.note ?? "",
      "confirmed grade": confirmed ? label.grade ?? "" : "", "confirmed by": confirmed ? `${label.by}, ${label.confirmedOn}` : "",
      // Always blank: a grade written here is this reviewer's, never one carried over from someone else.
      "your grade": "", "your note": "",
    };
    lines.push(columns.map((column) => csvCell(cells[column])).join(","));
  }
  return `${BOM}${lines.join("\n")}\n`;
}

/**
 * A reviewer's word for a grade: strong, possible or wrong, as the review asks, or fits, maybe and
 * doesn't. A blank cell is no judgment.
 */
export function readGrade(value: string): Grade | null {
  const word = value.trim().toLowerCase().replace(/[’']/gu, "");
  if (!word) return null;
  if (["strong", "fits", "fit", "yes"].includes(word)) return "fits";
  if (["possible", "maybe", "unsure"].includes(word)) return "maybe";
  if (["wrong", "doesnt", "doesnt fit", "no"].includes(word)) return "doesnt";
  throw Error(`unknown_grade: ${value}`);
}

/**
 * Confirms the rows a person graded, under their name and the day. A row left blank keeps what it had.
 * A row for a pair the file does not hold is refused, so a sheet for another file cannot be imported, and
 * so is a pair graded twice. Changing another person's confirmation needs `replace`, and its note then
 * says whose grade it replaced. Grading one's own confirmation the same way again changes nothing. Given the
 * programs' names, a graded row whose "program" cell is not its program id's name is refused too: an edited id
 * would otherwise move the grade to another pair the file holds.
 */
export function importCsv(
  labels: LabelSet, csv: string, reviewer: string, on: string, options: { replace?: boolean; programs?: ReadonlyMap<string, string> } = {},
): { labels: LabelSet; confirmed: number } {
  const person = reviewer.trim();
  if (!person || /^agent:/iu.test(person)) throw Error("reviewer_must_be_a_person");
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(on)) throw Error("invalid_date");
  const [header, ...rows] = parseCsv(csv);
  const at = (name: (typeof HEADERS)[number]) => header?.indexOf(name) ?? -1;
  const [initiative, program, grade, note] = [at("initiative"), at("program id"), at("your grade"), at("your note")];
  if (initiative < 0 || program < 0 || grade < 0 || note < 0) throw Error("csv_missing_columns");
  const programName = at("program");
  const index = new Map(labels.labels.map((label, i) => [`${label.initiative}\n${label.documentId}`, i]));
  const next: FundLabel[] = labels.labels.map((label) => ({ ...label }));
  const seen = new Set<number>();
  let confirmed = 0;
  for (const row of rows) {
    const read = (column: number) => unguard(row[column] ?? "");
    const i = index.get(`${read(initiative)}\n${read(program)}`);
    if (i === undefined) throw Error(`unknown_pair: ${read(initiative)} ${read(program)}`);
    const judged = readGrade(read(grade));
    if (!judged) continue;
    if (options.programs && programName >= 0) {
      const named = (options.programs.get(read(program)) ?? read(program)).trim(), shown = read(programName).trim();
      if (shown !== named)
        throw Error(`program_changed: ${read(initiative)} ${read(program)} is "${named}", but the row says "${shown}"; fix the row, or if the catalog renamed it since the sheet was made, import with --renamed`);
    }
    if (seen.has(i)) throw Error(`pair_graded_twice: ${read(initiative)} ${read(program)}`);
    seen.add(i);
    const before = next[i]!, words = read(note).trim();
    if (before.status === "confirmed") {
      if (before.by === person && before.grade === judged && (before.note ?? "") === (words || (before.note ?? ""))) continue;
      if (before.by !== person && !options.replace)
        throw Error(`confirmed_by_someone_else: ${before.initiative} ${before.documentId} (${before.by}); import with --replace to change it`);
    }
    const replaced = before.status === "confirmed" && before.by !== person ? ` Replaces ${before.by}'s ${before.grade} of ${before.confirmedOn}.` : "";
    // The draft a confirmation answered stays beside it, so agreeing with a draft is always visible.
    const draft = before.status === "draft"
      ? (before.grade ? { grade: before.grade, by: before.by, ...(before.note ? { note: before.note } : {}) } : undefined)
      : before.draft;
    next[i] = {
      initiative: before.initiative, documentId: before.documentId, grade: judged, status: "confirmed", by: person, confirmedOn: on,
      ...(words || replaced ? { note: `${words}${replaced}`.trim() } : {}), ...(draft ? { draft } : {}),
    };
    confirmed++;
  }
  return { labels: { ...labels, labels: next }, confirmed };
}

/** How deep each path's pool goes: Funding's first 20 and the live site's first 10. */
export const POOL = { funding: 20, keyword: 10 } as const;

/**
 * Adds every program now in an initiative's pool that the file does not hold yet, as an ungraded draft,
 * so a ranking change never leaves a first five with programs nobody can grade. Existing labels stay.
 */
export function addPool(labels: LabelSet, ranked: ReadonlyMap<string, { funding: { id: string }[]; keyword: { id: string }[] }>, on: string): { labels: LabelSet; added: number } {
  const held = new Set(labels.labels.map((label) => `${label.initiative}\n${label.documentId}`));
  const added: FundLabel[] = [];
  for (const [initiative, paths] of ranked)
    for (const place of [...paths.funding.slice(0, POOL.funding), ...paths.keyword.slice(0, POOL.keyword)]) {
      const key = `${initiative}\n${place.id}`;
      if (held.has(key)) continue;
      held.add(key);
      added.push({ initiative, documentId: place.id, grade: null, status: "draft", by: "agent: pool", note: `In the pool from ${on}.` });
    }
  return { labels: { ...labels, labels: [...labels.labels, ...added] }, added: added.length };
}

/**
 * Adds named programs to one initiative's pool as ungraded drafts, such as funds a person expects to fit
 * that Weave does not rank, so their absence from the first five can be counted. Held pairs stay.
 */
export function addPrograms(labels: LabelSet, initiative: string, documentIds: readonly string[], note: string): { labels: LabelSet; added: number } {
  const held = new Set(labels.labels.filter((label) => label.initiative === initiative).map((label) => label.documentId));
  const added = [...new Set(documentIds)].filter((id) => !held.has(id))
    .map((documentId): FundLabel => ({ initiative, documentId, grade: null, status: "draft", by: "agent: pool", note }));
  return { labels: { ...labels, labels: [...labels.labels, ...added] }, added: added.length };
}

/** One label per line, so a pull request's diff shows each confirmation. */
export function serializeLabels(labels: LabelSet): string {
  const { labels: list, ...rest } = labels;
  const head = JSON.stringify(rest, null, 2).replace(/\n\}$/u, "");
  return `${head},\n  "labels": [\n${list.map((label) => `    ${JSON.stringify(label)}`).join(",\n")}\n  ]\n}\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const option = (name: string) => {
    const at = process.argv.indexOf(name);
    return at >= 0 ? process.argv[at + 1] : undefined;
  };
  // --labels picks a label file by its dataset name; the first is the default.
  const wanted = option("--labels");
  const files = await Promise.all(LABEL_FILES.map(async (url) => ({ url, raw: JSON.parse(await readFile(url, "utf8")) as LabelSet })));
  const chosen = wanted ? files.find(({ raw }) => raw.dataset === wanted) : files[0];
  if (!chosen) throw Error(`No label file named ${wanted}; there are ${files.map(({ raw }) => raw.dataset).join(", ")}.`);
  const { url: file, raw } = chosen;
  const [data, set] = await Promise.all([loadRankingData(), loadRankingSet(raw.initiatives)]);
  const labels = validateLabels(raw, set, new Set(data.names.keys()));
  const exportTo = option("--export"), importFrom = option("--import");
  if (exportTo) {
    const blind = process.argv.includes("--blind");
    const only = option("--initiatives");
    const initiatives = only ? new Set(only.split(",")) : undefined;
    // A sheet that is not blind shows where Weave ranked each program, on Funding and on the live site.
    let ranks: Ranks | undefined;
    if (!blind) {
      const ranked = await rankSet(data, initiatives ? { ...set, initiatives: set.initiatives.filter((row) => initiatives.has(row.id)) } : set);
      ranks = new Map([...ranked].map(([id, paths]) => {
        const at = new Map<string, { funding?: number; keyword?: number }>();
        paths.funding.forEach((place, i) => at.set(place.id, { ...at.get(place.id), funding: i + 1 }));
        paths.keyword.forEach((place, i) => at.set(place.id, { ...at.get(place.id), keyword: i + 1 }));
        return [id, at];
      }));
    }
    const csv = exportCsv(labels, set, data, { blind, initiatives, ranks });
    await writeFile(exportTo, csv);
    console.log(`Wrote ${csv.trim().split("\n").length - 1} rows to ${exportTo}. Fill in "your grade" (strong, possible or wrong) for the rows you judge, then import it.`);
  } else if (process.argv.includes("--add-pool")) {
    const result = addPool(labels, await rankSet(data, set), new Date().toLocaleDateString("sv-SE"));
    validateLabels(result.labels, set, new Set(data.names.keys()));
    await writeFile(file, serializeLabels(result.labels));
    console.log(`Added ${result.added} pairs as ungraded drafts to ${labels.dataset}; it now holds ${result.labels.labels.length}.`);
  } else if (importFrom) {
    const reviewer = option("--reviewer");
    if (!reviewer) throw Error("--import needs --reviewer \"Your Name\"");
    const result = importCsv(labels, await readFile(importFrom, "utf8"), reviewer, option("--on") ?? new Date().toLocaleDateString("sv-SE"), {
      replace: process.argv.includes("--replace"), programs: process.argv.includes("--renamed") ? undefined : programNames(data),
    });
    validateLabels(result.labels, set, new Set(data.names.keys()));
    await writeFile(file, serializeLabels(result.labels));
    const total = result.labels.labels.filter((label) => label.status === "confirmed").length;
    console.log(`Confirmed ${result.confirmed} labels as ${reviewer}; ${total} of ${result.labels.labels.length} are now confirmed. Run \`bun run --filter @weave/app eval:funds -- --record-baseline\` and commit both files.`);
  } else {
    const counts = Object.fromEntries(Object.keys(GRADES).map((grade) => [grade, labels.labels.filter((label) => label.grade === grade).length]));
    console.log(`${labels.dataset}: ${labels.labels.length} labels, ${labels.labels.filter((l) => l.status === "confirmed").length} confirmed; grades ${JSON.stringify(counts)}.`);
    console.log("Use [--labels <dataset>] with --export <file.csv> [--blind] [--initiatives a,b] to review, --import <file.csv> --reviewer \"Your Name\" to confirm, and --add-pool to add new candidates.");
  }
}
