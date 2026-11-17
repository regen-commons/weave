import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { suggestKinds as candidateKinds } from "../src/intake/keywords.ts";
import { addEntry } from "../src/intake/entries.ts";
import { emptyAskStep } from "../src/intake/contracts.ts";
import { suggestKinds as baselineKinds } from "./support-kinds-baseline-v1.ts";

export const SUPPORT_KINDS = ["living", "material", "intellectual", "experiential", "social", "financial", "cultural", "spiritual"] as const;
export type SupportKind = (typeof SUPPORT_KINDS)[number];
const TAGS = new Set(["single-kind", "mixed", "negation", "amount", "non-money-number", "equipment", "living-resource",
  "data-about-living", "portuguese", "accents", "sparse", "colloquial", "decoy"]);
export type SupportCase = {
  id: string; family: string; split: "development" | "holdout"; source: string; named: string[];
  direction: "need" | "offer"; language: "en" | "pt"; text: string; expected: SupportKind[];
  judgeExpected?: SupportKind[]; tags: string[]; judgment: "agreed" | "single" | "uncertain"; annotators: string[];
};
export type SupportCorpus = {
  version: 1; dataset: string; annotationStatus: string; rubric: string;
  thresholds: { exactMatchFloor: number; namedRegressionsMustPass: boolean; noInventedAmountOrTimeframe: boolean; source: string };
  kinds: SupportKind[]; cases: SupportCase[];
};
type Engine = "baseline" | "candidate";
const ENGINES: Record<Engine, (text: string) => string[]> = { baseline: baselineKinds, candidate: candidateKinds };
const root = new URL("./", import.meta.url);
const isKind = (value: unknown): value is SupportKind => SUPPORT_KINDS.includes(value as SupportKind);
const normalize = (text: string) => text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

/** Rejects leakage between splits, duplicate wording, unknown kinds and labels that cannot be scored. */
export function validateSupportCorpus(data: unknown): SupportCorpus {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw Error("invalid_support_corpus");
  const corpus = data as SupportCorpus;
  if (corpus.version !== 1 || !Array.isArray(corpus.cases) || !corpus.cases.length
    || JSON.stringify(corpus.kinds) !== JSON.stringify(SUPPORT_KINDS)
    || !(corpus.thresholds?.exactMatchFloor >= 0.8) || corpus.thresholds.namedRegressionsMustPass !== true
    || corpus.thresholds.noInventedAmountOrTimeframe !== true) throw Error("invalid_support_corpus");
  const ids = new Set<string>(), families = new Map<string, string>(), wording = new Map<string, string>();
  for (const row of corpus.cases) {
    if (!row || typeof row !== "object" || !text(row.id) || ids.has(row.id) || !text(row.family)
      || !["development", "holdout"].includes(row.split) || !text(row.source) || !Array.isArray(row.named)
      || !["need", "offer"].includes(row.direction) || !["en", "pt"].includes(row.language) || !text(row.text)
      || !Array.isArray(row.annotators) || !row.annotators.length || !["agreed", "single", "uncertain"].includes(row.judgment))
      throw Error("invalid_support_case");
    if (!Array.isArray(row.expected) || !row.expected.every(isKind) || new Set(row.expected).size !== row.expected.length
      || (row.judgeExpected !== undefined && (!Array.isArray(row.judgeExpected) || !row.judgeExpected.every(isKind))))
      throw Error("invalid_support_judgment");
    if (!Array.isArray(row.tags) || !row.tags.every((tag) => TAGS.has(tag))) throw Error("invalid_support_tag");
    if (row.split === "holdout" && (row.judgment === "single" || row.named.length || row.annotators.length < 2
      || !Array.isArray(row.judgeExpected))) throw Error("invalid_holdout_case");
    // A holdout label counts only when two blind annotators gave the same kinds without doubt.
    if (row.judgment === "agreed" && row.judgeExpected
      && JSON.stringify([...row.judgeExpected].sort()) !== JSON.stringify([...row.expected].sort())) throw Error("invalid_support_judgment");
    const words = normalize(row.text);
    if (families.has(row.family) && families.get(row.family) !== row.split || wording.has(words)) throw Error("split_leakage");
    ids.add(row.id);
    families.set(row.family, row.split);
    wording.set(words, row.split);
  }
  return corpus;
}

const sha256 = async (name: string) => createHash("sha256").update(await readFile(new URL(name, root))).digest("hex");
const pinned = async (name: string) => (await readFile(new URL(name, root), "utf8")).trim();
export async function loadSupportCorpus() {
  const baselineSha256 = await sha256("support-kinds-baseline-v1.ts");
  if (baselineSha256 !== await pinned("support-kinds-baseline-v1.sha256")) throw Error("support_baseline_changed");
  const corpusSha256 = await sha256("support-kinds-v1.json");
  if (corpusSha256 !== await pinned("support-kinds-v1.sha256")) throw Error("support_corpus_changed");
  const engineSha256 = createHash("sha256").update(await readFile(new URL("../src/intake/keywords.ts", root))).digest("hex");
  const corpus = validateSupportCorpus(JSON.parse(await readFile(new URL("support-kinds-v1.json", root), "utf8")));
  return { corpus, corpusSha256, baselineSha256, engineSha256 };
}

const ratio = (part: number, whole: number) => whole ? Number((part / whole).toFixed(4)) : null;
type Row = { id: string; expected: string[]; observed: string[]; exact: boolean; falsePositive: string[]; falseNegative: string[] };
function score(cases: SupportCase[], engine: Engine): Row[] {
  return cases.map((row) => {
    const observed = ENGINES[engine](row.text);
    const falsePositive = observed.filter((kind) => !row.expected.includes(kind as SupportKind));
    const falseNegative = row.expected.filter((kind) => !observed.includes(kind));
    return { id: row.id, expected: [...row.expected].sort(), observed: [...observed].sort(),
      exact: !falsePositive.length && !falseNegative.length, falsePositive, falseNegative };
  });
}
function summary(cases: SupportCase[], rows: Row[]) {
  const exact = rows.filter((row) => row.exact).length;
  const perKind = Object.fromEntries(SUPPORT_KINDS.map((kind) => {
    const tp = rows.filter((row) => row.expected.includes(kind) && row.observed.includes(kind)).length;
    const fp = rows.filter((row) => !row.expected.includes(kind) && row.observed.includes(kind)).length;
    const fn = rows.filter((row) => row.expected.includes(kind) && !row.observed.includes(kind)).length;
    return [kind, { support: tp + fn, truePositive: tp, falsePositive: fp, falseNegative: fn,
      precision: ratio(tp, tp + fp), recall: ratio(tp, tp + fn) }];
  }));
  const group = (key: (row: SupportCase) => string[]) => {
    const keys = [...new Set(cases.flatMap(key))].sort();
    return Object.fromEntries(keys.map((name) => {
      const ids = new Set(cases.filter((row) => key(row).includes(name)).map((row) => row.id));
      const subset = rows.filter((row) => ids.has(row.id));
      return [name, { cases: subset.length, exact: subset.filter((row) => row.exact).length,
        exactRate: ratio(subset.filter((row) => row.exact).length, subset.length) }];
    }));
  };
  return { cases: rows.length, families: new Set(cases.map((row) => row.family)).size, exact, exactRate: ratio(exact, rows.length),
    perKind, byDirection: group((row) => [row.direction]), byLanguage: group((row) => [row.language]),
    byTag: group((row) => row.tags), bySource: group((row) => [row.source]) };
}

/** The person's typed entry path: the words stay, kinds are proposals, and no amount or timeframe is invented. */
function inventedFields(cases: SupportCase[]) {
  return cases.flatMap((row) => {
    const value = addEntry(emptyAskStep(), row.text).items[0]!.value;
    return value.amount === null && value.timeframe === null && value.title === row.text.trim().replace(/\s+/gu, " ")
      ? [] : [{ id: row.id, amount: value.amount, timeframe: value.timeframe, title: value.title }];
  });
}

export function evaluateSupportKinds(corpus: SupportCorpus, split: "development" | "holdout") {
  const all = corpus.cases.filter((row) => row.split === split);
  // Uncertain labels are reported, never scored, so a disputed label cannot raise or lower a rate.
  const scored = all.filter((row) => row.judgment !== "uncertain"), uncertain = all.filter((row) => row.judgment === "uncertain");
  const engines = Object.fromEntries((["baseline", "candidate"] as const).map((engine) => {
    const rows = score(scored, engine);
    return [engine, { summary: summary(scored, rows), rows }];
  })) as Record<Engine, { summary: ReturnType<typeof summary>; rows: Row[] }>;
  const byId = (engine: Engine) => new Map(engines[engine].rows.map((row) => [row.id, row]));
  const base = byId("baseline"), next = byId("candidate");
  const named = [...new Set(scored.flatMap((row) => row.named))].sort().map((name) => {
    const members = scored.filter((row) => row.named.includes(name));
    return { name, cases: members.length, failed: members.filter((row) => !next.get(row.id)!.exact).map((row) => row.id) };
  });
  const invented = inventedFields(all);
  const t = corpus.thresholds;
  const regressions = scored.filter((row) => base.get(row.id)!.exact && !next.get(row.id)!.exact).map((row) => row.id);
  const gates = {
    exactMatchFloor: { threshold: t.exactMatchFloor, observed: engines.candidate.summary.exactRate,
      passed: (engines.candidate.summary.exactRate ?? 0) >= t.exactMatchFloor },
    namedRegressions: { passed: named.every((group) => !group.failed.length), groups: named },
    noInventedAmountOrTimeframe: { passed: !invented.length, violations: invented },
    noRegressionFromBaseline: { passed: !regressions.length, regressions },
  };
  return {
    split, gates, passed: Object.values(gates).every((gate) => gate.passed),
    baseline: engines.baseline.summary, candidate: engines.candidate.summary,
    // Every miss, false positive and regression is listed, even when the aggregate passes.
    misses: engines.candidate.rows.filter((row) => !row.exact),
    regressions,
    fixes: scored.filter((row) => !base.get(row.id)!.exact && next.get(row.id)!.exact).map((row) => row.id),
    subgroupsBelowFloor: Object.entries({ ...engines.candidate.summary.byDirection, ...engines.candidate.summary.byLanguage,
      ...engines.candidate.summary.byTag, ...engines.candidate.summary.bySource }).filter(([, value]) => (value.exactRate ?? 1) < t.exactMatchFloor)
      .map(([name, value]) => ({ name, ...value })),
    uncertain: uncertain.map((row) => ({ id: row.id, authorExpected: row.expected, judgeExpected: row.judgeExpected ?? null,
      observed: [...candidateKinds(row.text)].sort() })),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argument = (name: string) => {
    const index = process.argv.indexOf(name);
    if (index < 0) return undefined;
    const value = process.argv[index + 1];
    if (!value || value.startsWith("--")) throw Error(`missing_argument:${name}`);
    return value;
  };
  const split = argument("--split");
  if (split !== "development" && split !== "holdout") throw Error("choose_explicit_split");
  const { corpus, corpusSha256, baselineSha256, engineSha256 } = await loadSupportCorpus();
  const result = evaluateSupportKinds(corpus, split);
  const report = { dataset: corpus.dataset, corpusSha256, baselineSha256, engineSha256,
    evaluationStatus: process.argv.includes("--post-hoc") ? "post-review-rerun-of-the-examined-holdout-regression-evidence"
      : split === "holdout" ? "holdout-run" : "development-regression",
    baselineEngine: "support-kinds released at 921d236", candidateEngine: "packages/app/src/intake/keywords.ts",
    node: process.version, annotationStatus: corpus.annotationStatus, thresholds: corpus.thresholds,
    limits: ["Synthetic text. No real initiative wording and no human annotation.",
      "Holdout author and judge are separate agent instances of one model family; their agreement is correlated.",
      "Development cases include the tuned production sample and a single annotator's cases; they are regression evidence.",
      "The keyword suggestion is a proposal the person reviews, so exact match measures proposal quality, not saved data.",
      ...(split === "holdout" ? ["Run once after freezing the candidate; a rerun after examining misses is regression evidence."] : [])],
    ...result };
  const compact = process.argv.includes("--compact")
    ? { ...report, baseline: { exactRate: result.baseline.exactRate, exact: result.baseline.exact, cases: result.baseline.cases } }
    : report;
  const output = argument("--output");
  if (output) await writeFile(output, JSON.stringify(compact, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ split, passed: result.passed, gates: result.gates,
    baselineExactRate: result.baseline.exactRate, candidateExactRate: result.candidate.exactRate,
    misses: result.misses.length, regressions: result.regressions, fixes: result.fixes,
    subgroupsBelowFloor: result.subgroupsBelowFloor, uncertain: result.uncertain.length }, null, 2));
  process.exitCode = result.passed ? 0 : 1;
}
