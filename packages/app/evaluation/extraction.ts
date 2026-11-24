// The extraction eval. Words a person types or says go through the app's own rules: on the describe step
// they fill Name, Where you work and About it, and on the needs and offers steps they become cards. Each
// case says what a careful person would want there. CI scores the development split and fails when any
// field's precision or recall falls below what it scored when the floor was recorded, or when a case that
// passed then fails now. The holdout, written blind by another agent, runs by hand.
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { newDraft, type DeviceDraft } from "../src/describe/contracts.ts";
import { changeSaid, fieldsForm, fillFields, saidText } from "../src/describe/fill.ts";
import { readKeywordSource } from "../src/describe/keywords.ts";
import { structureWords } from "../src/describe/structure.ts";
import { emptyAskStep, type AskKind } from "../src/intake/contracts.ts";
import { candidateChunks, chunksFrom, keywordExtraction } from "../src/intake/keywords.ts";
import { spokenList } from "../src/intake/spoken.ts";
import { answerStep, reconcile } from "../src/intake/state.ts";

export const FIELDS = ["name", "where", "about", "link", "cards"] as const;
export type Field = (typeof FIELDS)[number];
type DescribeExpected = {
  name: string;
  /** Other ways of writing the same name that are just as right, such as "Tech & Sun". */
  nameAlternatives?: string[];
  where: string[];
  about: { includes: string[]; excludes: string[] };
  /** Website or main link, scored only where the case names one ("" for none): "greengoods.app" matches "https://greengoods.app/". */
  link?: string;
};
type CardsExpected = { cards: string[] };
export type ExtractionCase = {
  id: string;
  split: "development" | "holdout";
  step: "describe" | "needs" | "offers";
  mode: "typed" | "spoken";
  language: "en" | "pt" | "es";
  source: string;
  text: string;
  expected: DescribeExpected | CardsExpected;
};
export type ExtractionCorpus = { version: 1; dataset: string; authoring: string; rubric?: string; cases: ExtractionCase[] };

const isText = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const isList = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === "string");
/** Letters and digits only, without accents or case, so "Medellín, Colombia" and "medellin colombia" are one place. */
export const fold = (text: string) =>
  text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
/** A value as a failure message shows it: in quotes, or "nothing" when empty. */
const quote = (value: string) => (value ? JSON.stringify(value) : "nothing");
/** Whether `phrase` is in `text` as whole words, after folding both. */
const holds = (text: string, phrase: string) => ` ${fold(text)} `.includes(` ${fold(phrase)} `);

/** Rejects a case that could be scored two ways, and the same words in both splits. */
export function validateCorpus(data: unknown, split: "development" | "holdout"): ExtractionCorpus {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw Error("invalid_extraction_corpus");
  const corpus = data as ExtractionCorpus;
  if (corpus.version !== 1 || !isText(corpus.dataset) || !isText(corpus.authoring) || !Array.isArray(corpus.cases) || !corpus.cases.length)
    throw Error("invalid_extraction_corpus");
  const ids = new Set<string>(), words = new Set<string>();
  for (const row of corpus.cases) {
    if (!row || typeof row !== "object" || !isText(row.id) || ids.has(row.id) || row.split !== split) throw Error("invalid_extraction_case");
    if (!["describe", "needs", "offers"].includes(row.step) || !["typed", "spoken"].includes(row.mode)) throw Error("invalid_extraction_case");
    if (!["en", "pt", "es"].includes(row.language) || !isText(row.source) || !isText(row.text)) throw Error("invalid_extraction_case");
    const expected = row.expected as Partial<DescribeExpected & CardsExpected>;
    if (row.step === "describe") {
      if (typeof expected.name !== "string" || !isList(expected.where) || !expected.about || !isList(expected.about.includes)
        || !expected.about.includes.length || !isList(expected.about.excludes)) throw Error("invalid_extraction_expected");
      if ((expected.link !== undefined && typeof expected.link !== "string") || (expected.nameAlternatives !== undefined && !isList(expected.nameAlternatives)))
        throw Error("invalid_extraction_expected");
      // A phrase the label asks for must be in the words, or no rule could ever find it.
      for (const phrase of [...expected.about.includes, ...expected.about.excludes])
        if (!holds(row.text, phrase)) throw Error(`phrase_not_in_text: ${row.id} "${phrase}"`);
    } else {
      if (!isList(expected.cards) || expected.cards.length > 4 || expected.cards.some((card) => !isText(card))) throw Error("invalid_extraction_expected");
      for (const card of expected.cards) if (!holds(row.text, card)) throw Error(`phrase_not_in_text: ${row.id} "${card}"`);
      // A key inside another key could never be met: the card holding the longer one holds both.
      for (const card of expected.cards)
        if (expected.cards.some((other) => other !== card && holds(other, card))) throw Error(`overlapping_keys: ${row.id} "${card}"`);
    }
    // One text may be read on all three steps, as a person can say it all once; never twice on one step.
    const key = `${row.step}\n${fold(row.text)}`;
    if (words.has(key)) throw Error(`duplicate_text: ${row.id}`);
    ids.add(row.id);
    words.add(key);
  }
  return corpus;
}

export type Described = { name: string; where: string[]; about: string; link: string };

/**
 * The describe step's fill, as Fill In The Fields runs it (pages/Describe.tsx), with the keyword rules
 * alone: the browser's own model, which the page also tries where it has one, is not measured here.
 */
export async function readDescribe(text: string): Promise<Described> {
  const draft: DeviceDraft = changeSaid(newDraft(), text);
  const result = await structureWords(draft, new AbortController().signal, { keywords: (source) => readKeywordSource(source), engines: [] });
  const form = fieldsForm(fillFields(draft, result.suggestion, result.lastBuild, saidText(draft)).draft);
  return {
    name: form.name.trim(), where: form.where.split(/;\s*/u).map((place) => place.trim()).filter(Boolean),
    about: form.about.trim(), link: form.links.trim(),
  };
}

/** A needs or offers list, as the step makes it: a recording is first split into one line per item. */
export function readCards(text: string, kind: AskKind, mode: "typed" | "spoken"): string[] {
  const step = answerStep(emptyAskStep(), kind, mode === "spoken" ? spokenList(text) : text, mode === "spoken" ? "voice" : "typed");
  const turn = step.turns[0]!;
  return reconcile(step, keywordExtraction(candidateChunks(chunksFrom(turn.text, turn.id), step), kind)).items.map((item) => item.value.title);
}

/** Counts for one field: true positives, false positives and false negatives. */
type Count = { tp: number; fp: number; fn: number };
export type CaseResult = {
  id: string; step: ExtractionCase["step"]; mode: ExtractionCase["mode"]; language: ExtractionCase["language"];
  /** Each scored field, whether it was right, and what the rules gave. */
  fields: Partial<Record<Field, { passed: boolean; expected: string; observed: string; count: Count }>>;
};

/** Where the words go. Tests pass their own, so the scoring is proven apart from what the rules do today. */
export type Readers = { describe(text: string): Promise<Described>; cards(text: string, kind: AskKind, mode: "typed" | "spoken"): Promise<string[]> | string[] };
export const APP_READERS: Readers = { describe: readDescribe, cards: readCards };

/** One to one: each expected item takes at most one observed item, the first unused one `matches` accepts. */
function pair<T>(expected: readonly T[], observed: readonly string[], matches: (seen: string, want: T) => boolean): number {
  const used = new Set<number>();
  for (const want of expected) {
    const at = observed.findIndex((seen, i) => !used.has(i) && matches(seen, want));
    if (at >= 0) used.add(at);
  }
  return used.size;
}

/** Scores one case. A card matches a key only when no other key of the case is in it too: two items in one card is a miss. */
export async function scoreCase(row: ExtractionCase, read: Readers = APP_READERS): Promise<CaseResult> {
  const result: CaseResult = { id: row.id, step: row.step, mode: row.mode, language: row.language, fields: {} };
  if (row.step === "describe") {
    const expected = row.expected as DescribeExpected;
    const got = await read.describe(row.text);
    const named = !!got.name, wanted = !!expected.name;
    const same = [expected.name, ...(expected.nameAlternatives ?? [])].some((name) => fold(got.name) === fold(name));
    result.fields.name = {
      passed: same, expected: quote(expected.name), observed: quote(got.name),
      count: { tp: named && wanted && same ? 1 : 0, fp: named && !(wanted && same) ? 1 : 0, fn: wanted && !(named && same) ? 1 : 0 },
    };
    const want = expected.where.map(fold), have = got.where.map(fold);
    const hit = pair(want, have, (seen, place) => seen === place);
    result.fields.where = {
      passed: hit === want.length && hit === have.length, expected: quote(expected.where.join("; ")), observed: quote(got.where.join("; ")),
      count: { tp: hit, fp: have.length - hit, fn: want.length - hit },
    };
    const good = !!got.about && expected.about.includes.every((phrase) => holds(got.about, phrase))
      && !expected.about.excludes.some((phrase) => holds(got.about, phrase));
    result.fields.about = {
      passed: good,
      expected: `includes ${expected.about.includes.map((p) => `"${p}"`).join(", ")}${expected.about.excludes.length ? `, leaves out ${expected.about.excludes.map((p) => `"${p}"`).join(", ")}` : ""}`,
      observed: quote(got.about),
      count: { tp: good ? 1 : 0, fp: got.about && !good ? 1 : 0, fn: good ? 0 : 1 },
    };
    if (expected.link !== undefined) {
      const site = (link: string) => link.toLowerCase().replace(/^https?:\/\//u, "").replace(/^www\./u, "").replace(/\/+$/u, "");
      const has = !!got.link, wants = !!expected.link, match = site(got.link) === site(expected.link);
      result.fields.link = {
        passed: match, expected: quote(expected.link), observed: quote(got.link),
        count: { tp: has && wants && match ? 1 : 0, fp: has && !(wants && match) ? 1 : 0, fn: wants && !(has && match) ? 1 : 0 },
      };
    }
  } else {
    const keys = (row.expected as CardsExpected).cards;
    const cards = await read.cards(row.text, row.step, row.mode);
    const tp = pair(keys, cards, (card, key) => holds(card, key) && !keys.some((other) => fold(other) !== fold(key) && holds(card, other)));
    result.fields.cards = {
      passed: tp === keys.length && cards.length === keys.length,
      expected: keys.length ? keys.map(quote).join(", ") : "no cards", observed: cards.length ? cards.map(quote).join(", ") : "no cards",
      count: { tp, fp: cards.length - tp, fn: keys.length - tp },
    };
  }
  return result;
}

export type Rates = { precision: number | null; recall: number | null; cases: number; passed: number };
const round = (value: number) => Math.round(value * 10000) / 10000;
function rates(rows: CaseResult[], field: Field): Rates {
  const scored = rows.flatMap((row) => (row.fields[field] ? [row.fields[field]] : []));
  const sum = scored.reduce((all, { count }) => ({ tp: all.tp + count.tp, fp: all.fp + count.fp, fn: all.fn + count.fn }), { tp: 0, fp: 0, fn: 0 });
  return {
    precision: sum.tp + sum.fp ? round(sum.tp / (sum.tp + sum.fp)) : null,
    recall: sum.tp + sum.fn ? round(sum.tp / (sum.tp + sum.fn)) : null,
    cases: scored.length,
    passed: scored.filter((field) => field.passed).length,
  };
}
export type Summary = Record<Field, Rates>;
const summarize = (rows: CaseResult[]): Summary => Object.fromEntries(FIELDS.map((field) => [field, rates(rows, field)])) as Summary;

export async function evaluate(corpus: ExtractionCorpus, read: Readers = APP_READERS) {
  const rows: CaseResult[] = [];
  for (const row of corpus.cases) rows.push(await scoreCase(row, read));
  const by = <K extends "mode" | "language" | "step">(key: K) =>
    Object.fromEntries([...new Set(rows.map((row) => row[key]))].sort().map((value) => [value, summarize(rows.filter((row) => row[key] === value))]));
  return { dataset: corpus.dataset, cases: rows.length, summary: summarize(rows), byMode: by("mode"), byLanguage: by("language"), byStep: by("step"), rows };
}
export type Evaluation = Awaited<ReturnType<typeof evaluate>>;

// The floor ---------------------------------------------------------------------------------------------

/**
 * What the development split scored when the floor was recorded: the rates, which fields of which cases
 * passed, and each field's counts, so a case that gets worse is named even while it still fails.
 */
export type Floor = {
  dataset: string; recordedOn: string; corpusHash: string; summary: Summary;
  passing: Record<string, Field[]>;
  errors: Record<string, Partial<Record<Field, { fp: number; fn: number }>>>;
};
export const RECORD_COMMAND = "bun run --filter @weave/app eval:extraction -- --record";
const hashOf = (corpus: ExtractionCorpus) => createHash("sha256").update(JSON.stringify(corpus.cases)).digest("hex");

export function floorOf(corpus: ExtractionCorpus, result: Evaluation, recordedOn: string): Floor {
  return {
    dataset: corpus.dataset, recordedOn, corpusHash: hashOf(corpus), summary: structuredClone(result.summary),
    passing: Object.fromEntries(result.rows.map((row) => [row.id, FIELDS.filter((field) => row.fields[field]?.passed)])),
    errors: Object.fromEntries(result.rows.map((row) => [row.id, Object.fromEntries(
      FIELDS.flatMap((field) => (row.fields[field] ? [[field, { fp: row.fields[field].count.fp, fn: row.fields[field].count.fn }]] : [])),
    )])),
  };
}

const show = (value: number | null) => (value === null ? "none" : value.toFixed(3));

/** Whether the development split holds its floor. A failure names each rate that fell and each case that broke. */
export function gate(corpus: ExtractionCorpus, result: Evaluation, floor: Floor | null): { passed: boolean; message: string; improved: string[] } {
  if (!floor || floor.dataset !== corpus.dataset)
    return { passed: false, improved: [], message: `No floor is recorded for ${corpus.dataset}. Run \`${RECORD_COMMAND}\` and commit extraction-v1-floor.json.` };
  const fell: string[] = [];
  for (const field of FIELDS)
    for (const rate of ["precision", "recall"] as const) {
      // A field the floor was recorded without has nothing to hold yet.
      const was = floor.summary[field]?.[rate] ?? null, now = result.summary[field][rate];
      if (was !== null && (now ?? 0) + 1e-9 < was) fell.push(`${field} ${rate} fell from ${show(was)} to ${show(now)}.`);
    }
  const broke: string[] = [], improved: string[] = [];
  for (const row of result.rows)
    for (const field of FIELDS) {
      const now = row.fields[field];
      if (!now) continue;
      const before = floor.passing[row.id]?.includes(field) ?? false;
      const was = floor.errors[row.id]?.[field];
      // Passing to failing, or more wrong or missing items than before, even in a case that already failed.
      const worse = (before && !now.passed) || (!!was && (now.count.fp > was.fp || now.count.fn > was.fn));
      if (worse) broke.push(`  ${row.id} ${field} (${row.mode}, ${row.language}): wanted ${now.expected}; got ${now.observed}.`);
      if (!before && now.passed && row.id in floor.passing) improved.push(`${row.id} ${field}`);
    }
  // Cases added since the floor was recorded have no "before"; their rates still count in the summary.
  const stale = floor.corpusHash !== hashOf(corpus);
  if (!fell.length && !broke.length)
    return {
      passed: true, improved,
      message: `${corpus.dataset}: every rate holds its floor${improved.length ? `, and ${improved.length} field${improved.length === 1 ? "" : "s"} now pass that did not (${improved.join(", ")}); run \`${RECORD_COMMAND}\` to raise the floor` : ""}.${stale ? ` The cases changed since the floor was recorded; run \`${RECORD_COMMAND}\` so new cases are held too.` : ""}`,
    };
  return {
    passed: false, improved,
    message: [
      `Extraction got worse on ${corpus.dataset}.`,
      ...fell,
      ...(broke.length ? ["Cases that are worse than when the floor was recorded:", ...broke] : []),
      `Fix the rules, or if the change is accepted, run \`${RECORD_COMMAND}\` and say why in the pull request.`,
    ].join("\n"),
  };
}

// Files and the command ---------------------------------------------------------------------------------

const HERE = new URL("./", import.meta.url);
export const FILES = {
  development: new URL("extraction-v1.json", HERE),
  holdout: new URL("extraction-v1-holdout.json", HERE),
  holdoutHash: new URL("extraction-v1-holdout.sha256", HERE),
  floor: new URL("extraction-v1-floor.json", HERE),
};
const readJson = async (url: URL): Promise<unknown> => JSON.parse(await readFile(url, "utf8"));

export async function loadCorpus(split: "development" | "holdout"): Promise<ExtractionCorpus> {
  const raw = await readFile(split === "development" ? FILES.development : FILES.holdout, "utf8");
  if (split === "holdout") {
    // The holdout was frozen before its first scored run. A changed file is not the same holdout.
    const frozen = (await readFile(FILES.holdoutHash, "utf8")).trim().split(/\s+/u)[0];
    if (createHash("sha256").update(raw).digest("hex") !== frozen) throw Error("holdout_changed_after_freeze");
  }
  return validateCorpus(JSON.parse(raw), split);
}
export async function loadFloor(): Promise<Floor | null> {
  try { return (await readJson(FILES.floor)) as Floor; } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** A table of rates for a person to read. */
export function table(result: Evaluation): string {
  const line = (label: string, summary: Summary) =>
    `${label.padEnd(12)} ${FIELDS.map((field) => {
      const r = summary[field];
      return r.cases ? `${field} P ${show(r.precision)} R ${show(r.recall)} (${r.passed}/${r.cases})` : "";
    }).filter(Boolean).join("   ")}`;
  return [
    line("all", result.summary),
    ...Object.entries(result.byMode).map(([mode, summary]) => line(mode, summary)),
    ...Object.entries(result.byLanguage).map(([language, summary]) => line(language, summary)),
  ].join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const holdout = process.argv.includes("--split") && process.argv[process.argv.indexOf("--split") + 1] === "holdout";
  const corpus = await loadCorpus(holdout ? "holdout" : "development");
  const result = await evaluate(corpus);
  console.log(`${corpus.dataset}, ${result.cases} cases\n${table(result)}`);
  const misses = result.rows.flatMap((row) => FIELDS.flatMap((field) => {
    const f = row.fields[field];
    return f && !f.passed ? [`  ${row.id} ${field} (${row.mode}, ${row.language}): wanted ${f.expected}; got ${f.observed}.`] : [];
  }));
  if (misses.length) console.log(`Misses:\n${misses.join("\n")}`);
  const output = process.argv.indexOf("--output");
  if (output >= 0) {
    const path = process.argv[output + 1];
    if (!path) throw Error("--output needs a file path");
    await writeFile(path, `${JSON.stringify(result, null, 2)}\n`);
  }
  if (holdout) {
    console.log("Holdout: reported only. It is never a floor, and a rule tuned to its misses makes it development data.");
  } else if (process.argv.includes("--record")) {
    // The day where it was recorded, as a person reads a date.
    await writeFile(FILES.floor, `${JSON.stringify(floorOf(corpus, result, new Date().toLocaleDateString("sv-SE")), null, 2)}\n`);
    console.log(`Recorded the floor in ${FILES.floor.pathname}.`);
  } else {
    const verdict = gate(corpus, result, await loadFloor());
    console.log(verdict.message);
    process.exitCode = verdict.passed ? 0 : 1;
  }
}
