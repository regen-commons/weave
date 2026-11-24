// The fund ranking gate. A fixed set of initiatives is ranked on every path that orders funds for a person
// or an assistant, and the first five of each are kept in a committed snapshot. CI fails on any change to
// a first five until the snapshot is updated in the same pull request, so every ranking change is seen in
// review. Where a person has confirmed relevance labels, precision at 5 and NDCG at 10 are also held to a
// recorded baseline. Draft labels, including every label an agent wrote, never count.
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createLexicalIndex, rankFunds, validConditions } from "../../../dist/matching.mjs";
import { COUNTRIES, normalizeProject } from "../../../dist/storage.mjs";
import { catalogEntries, parseBundle } from "../src/funding/catalog.ts";
import type { Bundle } from "../src/funding/contracts.ts";
import { evaluateCatalog, type Project } from "../src/funding/engine.ts";
import { emptyFundingFilters, filterFunding } from "../src/funding/select.ts";
import { createAgentTools, type FundCatalog } from "../../api/src/agent-tools.ts";
import { parseAgentToolCall } from "../../api/src/agent-tools-contract.ts";

/** How many places of each path the snapshot keeps. */
export const SNAPSHOT_DEPTH = 5;
/** How many places the metrics read: precision at 5, NDCG at 10. */
const METRIC_DEPTH = 10;
/**
 * The rubric breaks ties by comparing names with `localeCompare`, so the snapshot is written under one
 * collation. Node resolves en-US under en_US, C and C.UTF-8 alike.
 */
export const SNAPSHOT_COLLATION = "en-US";

/** The paths that order funds, and what each one is. The snapshot keeps all three. */
export const RANKING_PATHS = {
  keyword:
    "Live site, keyword order: the shared rubric with keywords only and one result per fund, the order funding-commons shows unless a person turns on its optional model.",
  funding:
    "Weave Funding, Strongest fit: the order Funding opens in for an initiative. Thematic fit first, ties in the rubric's order, one result per program.",
  mcp: "MCP find_funds_for_initiative: strongest fit first, ties in the rubric's order, programs with no shared topic left out.",
} as const;
export type RankingPath = keyof typeof RANKING_PATHS;
export const PATH_NAMES = Object.keys(RANKING_PATHS) as RankingPath[];

const APPLICANT_TYPES = ["unknown", "nonprofit", "informal", "individual", "business", "university", "public-body"];
const LANGUAGES = ["en", "pt", "es", "fr", "sw"];

/**
 * One initiative as a card confirmed on the describe step holds it. It has no themes: the step has
 * offered none since DL-127, and the MCP call and the live site's form are given none either. The app
 * and the MCP tool add the catalog topics a Portuguese or Spanish description names (DL-142); the live
 * site ranks the description alone.
 */
export type RankingInitiative = {
  id: string;
  source: "certified" | "invented";
  sourceUri?: string;
  language: string;
  name: string;
  description: string;
  workCountries: string[];
  benefitCountries: string[];
  usWorkStates?: string[];
  usBenefitStates?: string[];
  applicantBaseCountry: string;
  registrationCountry: string;
  applicantType: string;
};
export type RankingSet = { version: 1; dataset: string; initiatives: RankingInitiative[] };

const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const codes = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((code) => typeof code === "string" && COUNTRIES.includes(code));

/** Rejects a set the gate could not rank the same way on every path. */
export function validateRankingSet(data: unknown): RankingSet {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw Error("invalid_ranking_set");
  const set = data as RankingSet;
  if (set.version !== 1 || !text(set.dataset) || !Array.isArray(set.initiatives) || !set.initiatives.length)
    throw Error("invalid_ranking_set");
  const ids = new Set<string>();
  for (const row of set.initiatives) {
    if (!row || typeof row !== "object" || !text(row.id) || ids.has(row.id)) throw Error("invalid_ranking_initiative");
    if (!["certified", "invented"].includes(row.source) || (row.source === "certified" && !text(row.sourceUri)))
      throw Error("invalid_ranking_source");
    if (!LANGUAGES.includes(row.language) || !text(row.name) || !text(row.description)) throw Error("invalid_ranking_initiative");
    // The MCP tool refuses a description under 40 characters, and every path must rank the same words.
    if (row.description.length < 40 || row.description.length > 800) throw Error("invalid_ranking_description");
    if ("themes" in row) throw Error("invalid_ranking_themes");
    if (!codes(row.workCountries) || !codes(row.benefitCountries)) throw Error("invalid_ranking_country");
    for (const single of [row.applicantBaseCountry, row.registrationCountry])
      if (typeof single !== "string" || (single && !COUNTRIES.includes(single))) throw Error("invalid_ranking_country");
    if (!APPLICANT_TYPES.includes(row.applicantType)) throw Error("invalid_ranking_initiative");
    ids.add(row.id);
  }
  return set;
}

/**
 * The card the app ranks: the shape `projectFrom` in src/funding/profile.ts gives a confirmed draft
 * with no kept needs or offers. The app's matcher (`evaluateCatalog`) adds the topics its words name.
 */
function appProject(row: RankingInitiative): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    tags: [],
    asks: [],
    workCountries: row.workCountries,
    benefitCountries: row.benefitCountries,
    applicantBaseCountry: row.applicantBaseCountry,
    registrationCountry: row.registrationCountry,
    applicantType: row.applicantType as Project["applicantType"],
    fundingInstruments: [],
    goalMin: null,
    goalMax: null,
    currency: "",
    usWorkStates: row.usWorkStates ?? [],
    usBenefitStates: row.usBenefitStates ?? [],
    programAnswers: {},
  };
}

/** One place on a path: the program's document ID and the name a reviewer reads. */
export type Ranked = { id: string; name: string };
export type Rankings = Record<RankingPath, Ranked[]>;

type CatalogFile = FundCatalog & { funds: (FundCatalog["funds"][number] & { enrichment?: { programs?: { id: string; name: string }[] } })[] };
export type RankingData = {
  catalog: CatalogFile;
  rules: unknown;
  conditions: unknown;
  bundle: Bundle;
  /**
   * Every path ranks as of the moment the catalog was compiled, so access and deadlines read as they
   * did then: the same on every run of one catalog, and moving on with the catalog itself.
   */
  now: Date;
  /** Each program's document ID, and each fund's, with the name a reviewer reads. */
  names: Map<string, string>;
};

const DATA = new URL("../../../dist/data/", import.meta.url);
const readJson = async (url: URL): Promise<unknown> => JSON.parse(await readFile(url, "utf8"));
const nameOf = (fund: { name: string; displayName?: string }, program?: { name: string } | null) =>
  `${fund.displayName || fund.name}${program ? `: ${program.name}` : ""}`;

/** The shipped catalog and screening data, read once and given to every path. */
export async function loadRankingData(): Promise<RankingData> {
  const [catalog, rules, conditions] = await Promise.all(
    ["funders.json", "eligibility-rules.json", "program-conditions.json"].map((name) => readJson(new URL(name, DATA))),
  );
  return rankingData(catalog as CatalogFile, rules, conditions);
}

export function rankingData(catalog: CatalogFile, rules: unknown, conditions: unknown): RankingData {
  const now = new Date(catalog.compiledAt);
  if (Number.isNaN(now.getTime())) throw Error("invalid_catalog_compiled_at");
  const names = new Map<string, string>();
  for (const fund of catalog.funds) {
    names.set(fund.id, nameOf(fund));
    for (const program of fund.enrichment?.programs ?? []) names.set(`${fund.id}::${program.id}`, nameOf(fund, program));
  }
  return { catalog, rules, conditions, bundle: parseBundle(catalog, rules, conditions), now, names };
}

/** Ranks one initiative on every path. Each list is complete except the MCP one, which stops at 10. */
export async function rankInitiative(data: RankingData, row: RankingInitiative): Promise<Rankings> {
  const named = (id: string): Ranked => ({ id, name: data.names.get(id) ?? id });

  // The live site ranks whole funds with the conditions only when they belong to this catalog (dist/app.js).
  const conditionList = (data.conditions as { conditions?: unknown[] }).conditions;
  const liveConditions = validConditions(data.conditions, data.catalog.funds) && Array.isArray(conditionList) ? conditionList : null;
  const live = rankFunds(
    data.catalog.funds,
    // The live site's own form, which defaults the currency to USD where the app leaves it blank. It
    // reads no topics into a card: its themes are only those a person types.
    normalizeProject({ ...appProject(row), currency: undefined }),
    createLexicalIndex(data.catalog.funds),
    (data.rules as { rules: unknown[] }).rules,
    null,
    data.now,
    liveConditions,
  ) as { documentId: string }[];

  const results = evaluateCatalog(data.bundle, appProject(row), data.now);
  const funding = filterFunding(catalogEntries(data.bundle), { ...emptyFundingFilters, sort: "fit" }, results, data.now);

  const tools = createAgentTools({
    catalog: async () => data.catalog,
    screening: async () => ({ rules: data.rules, conditions: data.conditions }),
    publicProjects: async () => new Response(null, { status: 503 }),
    findPublicProject: async () => "off",
    origin: "https://weave.example",
    now: () => data.now,
  });
  const call = parseAgentToolCall("find_funds_for_initiative", {
    description: row.description,
    work_countries: row.workCountries,
    benefit_countries: row.benefitCountries,
    applicant_base_country: row.applicantBaseCountry || undefined,
    registration_country: row.registrationCountry || undefined,
    applicant_type: row.applicantType,
    limit: METRIC_DEPTH,
  });
  const answer = (await tools(call)) as { programs: { id: string }[] };

  return {
    // A fund-level result names the program it was ranked on, so its place is that program's.
    keyword: live.map((match) => named(match.documentId)),
    funding: funding.map((entry) => named(entry.id)),
    mcp: answer.programs.map((program) => named(program.id)),
  };
}

export async function rankSet(data: RankingData, set: RankingSet): Promise<Map<string, Rankings>> {
  const ranked = new Map<string, Rankings>();
  for (const row of set.initiatives) ranked.set(row.id, await rankInitiative(data, row));
  return ranked;
}

// The snapshot ------------------------------------------------------------------------------------------

export type Snapshot = {
  version: 1;
  dataset: string;
  /** The catalog's compile time, which every path ranked as of. Informative: only places are compared. */
  rankedAt: string;
  depth: number;
  collation: string;
  paths: typeof RANKING_PATHS;
  initiatives: Record<string, { name: string } & Record<RankingPath, Ranked[]>>;
};

export function snapshotOf(set: RankingSet, data: RankingData, ranked: Map<string, Rankings>): Snapshot {
  return {
    version: 1,
    dataset: set.dataset,
    rankedAt: data.now.toISOString(),
    depth: SNAPSHOT_DEPTH,
    collation: new Intl.Collator().resolvedOptions().locale,
    paths: RANKING_PATHS,
    initiatives: Object.fromEntries(
      set.initiatives.map((row) => {
        const paths = ranked.get(row.id)!;
        return [row.id, { name: row.name, ...Object.fromEntries(PATH_NAMES.map((path) => [path, paths[path].slice(0, SNAPSHOT_DEPTH)])) }];
      }),
    ) as Snapshot["initiatives"],
  };
}

/** One entry per line, so a pull request's diff shows exactly which places moved. */
export function serializeSnapshot(snapshot: Snapshot): string {
  const lines = JSON.stringify({ ...snapshot, initiatives: {} }, null, 2).split("\n");
  lines.splice(-2, 2);
  lines.push('  "initiatives": {');
  const rows = Object.entries(snapshot.initiatives).map(([id, entry]) => {
    const paths = PATH_NAMES.map((path) => {
      const places = entry[path].map((place) => `        ${JSON.stringify(place)}`).join(",\n");
      return `      ${JSON.stringify(path)}: [${places ? `\n${places}\n      ` : ""}]`;
    });
    return `    ${JSON.stringify(id)}: {\n      "name": ${JSON.stringify(entry.name)},\n${paths.join(",\n")}\n    }`;
  });
  return `${lines.join("\n")}\n${rows.join(",\n")}\n  }\n}\n`;
}

export type SnapshotChange =
  | { kind: "added" | "removed"; initiative: string; name: string }
  | { kind: "moved"; initiative: string; name: string; path: RankingPath; before: Ranked[]; after: Ranked[]; full: Ranked[] };

/** What differs between the stored first fives and today's. Names are not compared, only places. */
export function compareSnapshot(stored: Snapshot, current: Snapshot, ranked: Map<string, Rankings>): SnapshotChange[] {
  const changes: SnapshotChange[] = [];
  for (const [id, entry] of Object.entries(stored.initiatives))
    if (!current.initiatives[id]) changes.push({ kind: "removed", initiative: id, name: entry.name });
  for (const [id, entry] of Object.entries(current.initiatives)) {
    const before = stored.initiatives[id];
    if (!before) {
      changes.push({ kind: "added", initiative: id, name: entry.name });
      continue;
    }
    for (const path of PATH_NAMES) {
      const was = (before[path] ?? []).map((place) => place.id).join("\n");
      if (was !== entry[path].map((place) => place.id).join("\n"))
        changes.push({ kind: "moved", initiative: id, name: entry.name, path, before: before[path] ?? [], after: entry[path], full: ranked.get(id)![path] });
    }
  }
  return changes;
}

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
export const UPDATE_COMMAND = "bun run --filter @weave/app eval:funds -- --update";
const fundOf = (id: string) => id.split("::")[0];

/** Where a program that left a first five went. The keyword path ranks whole funds, each under its best program. */
function whereNow(change: Extract<SnapshotChange, { kind: "moved" }>, gone: Ranked): string {
  const place = change.full.findIndex((now) => now.id === gone.id);
  if (place >= 0) return `now ${ordinal(place + 1)}`;
  if (change.path === "keyword") {
    const fund = change.full.findIndex((now) => fundOf(now.id) === fundOf(gone.id));
    if (fund >= 0) return `its fund now ${ordinal(fund + 1)}, under ${change.full[fund]!.name}`;
  }
  return change.path === "mcp" ? `not in the first ${METRIC_DEPTH}` : "no longer ranked";
}

/** A reviewer's account of every change: each path's old and new first five, and where the leavers went. */
export function describeChanges(changes: SnapshotChange[], options: { labels?: LabelLookup; collation?: { stored: string; current: string } } = {}): string {
  if (!changes.length) return "";
  const grade = (initiative: string, id: string) => {
    const found = options.labels?.(initiative, id);
    return found ? `  [${found}]` : "";
  };
  const initiatives = new Set(changes.map((change) => change.initiative));
  const out = [
    `Fund ranking changed for ${initiatives.size} initiative${initiatives.size === 1 ? "" : "s"} (${changes.length} path${changes.length === 1 ? "" : "s"}).`,
    `If the change is intended, run \`${UPDATE_COMMAND}\` and commit packages/app/evaluation/fund-ranking-v1.snapshot.json in the same pull request, so reviewers see the new order.`,
  ];
  const { collation } = options;
  if (collation && collation.stored !== collation.current)
    out.push(`This run compares names under ${collation.current}, and the snapshot was written under ${collation.stored}. Ties may order differently: run with LANG=en_US.UTF-8 before deciding.`);
  for (const change of changes) {
    if (change.kind !== "moved") {
      out.push("", `${change.initiative} ${change.name}: ${change.kind === "added" ? "is new and has no stored first five" : "is in the snapshot but no longer in the fixture"}.`);
      continue;
    }
    out.push("", `${change.initiative} ${change.name}, ${change.path}:`);
    const width = Math.max(6, ...change.before.map((place, i) => `${i + 1}. ${place.name}`.length));
    out.push(`  ${"before".padEnd(width)}   after`);
    for (let i = 0; i < Math.max(change.before.length, change.after.length); i++) {
      const was = change.before[i], now = change.after[i];
      const left = was ? `${i + 1}. ${was.name}` : "";
      const mark = !now ? "" : !change.before.some((place) => place.id === now.id) ? "  (new)" : was?.id === now.id ? "" : `  (was ${ordinal(change.before.findIndex((place) => place.id === now.id) + 1)})`;
      out.push(`  ${left.padEnd(width)}   ${now ? `${i + 1}. ${now.name}${mark}${grade(change.initiative, now.id)}` : ""}`);
    }
    for (const gone of change.before.filter((place) => !change.after.some((now) => now.id === place.id)))
      out.push(`  Left the first ${SNAPSHOT_DEPTH}: ${gone.name}, ${whereNow(change, gone)}.${grade(change.initiative, gone.id)}`);
  }
  return out.join("\n");
}

// Labels and metrics ------------------------------------------------------------------------------------

/** How a person judged one program for one initiative. "doesnt" is "doesn't fit". */
export const GRADES = { fits: 2, maybe: 1, doesnt: 0 } as const;
export type Grade = keyof typeof GRADES;
/** Who wrote a draft that no person has confirmed: an agent signs as "agent: <name>". */
const AGENT = /^agent:/iu;
export type FundLabel = {
  initiative: string;
  documentId: string;
  grade: Grade;
  /** Only a person can confirm a label. An agent's label is a draft, whoever wrote it. */
  status: "draft" | "confirmed";
  /** Who wrote the label, or for a confirmed one the person who confirmed it. */
  by: string;
  /** The day a person confirmed it. */
  confirmedOn?: string;
  note?: string;
};
export type LabelSet = { version: 1; dataset: string; initiatives: string; labels: FundLabel[] };
export type LabelLookup = (initiative: string, documentId: string) => string | undefined;

/**
 * Rejects a label file that could be read two ways, such as one pair judged twice, a program the
 * catalog does not hold, or a confirmation an agent signed.
 */
export function validateLabels(data: unknown, set: RankingSet, documents?: ReadonlySet<string>): LabelSet {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw Error("invalid_labels");
  const file = data as LabelSet;
  if (file.version !== 1 || !text(file.dataset) || file.initiatives !== set.dataset || !Array.isArray(file.labels)) throw Error("invalid_labels");
  const ids = new Set(set.initiatives.map((row) => row.id));
  const pairs = new Set<string>();
  const unknown: string[] = [];
  for (const label of file.labels) {
    if (!label || typeof label !== "object" || !ids.has(label.initiative) || !text(label.documentId)) throw Error("invalid_label");
    if (!Object.hasOwn(GRADES, label.grade) || !["draft", "confirmed"].includes(label.status) || !text(label.by)) throw Error("invalid_label");
    if (label.status === "confirmed" && (AGENT.test(label.by) || !/^\d{4}-\d{2}-\d{2}$/u.test(label.confirmedOn ?? "")))
      throw Error("invalid_confirmation");
    if (documents && !documents.has(label.documentId)) unknown.push(label.documentId);
    const pair = `${label.initiative}\n${label.documentId}`;
    if (pairs.has(pair)) throw Error("duplicate_label");
    pairs.add(pair);
  }
  // A program the catalog dropped or renamed would count as never ranked and quietly lower NDCG.
  if (unknown.length) throw Error(`unknown_document: ${[...new Set(unknown)].join(", ")}`);
  return file;
}

/** The confirmed grades only. Drafts are left out entirely, never scored as unknown or as zero. */
export function confirmedGrades(labels: LabelSet): Map<string, Map<string, Grade>> {
  const out = new Map<string, Map<string, Grade>>();
  for (const label of labels.labels) {
    if (label.status !== "confirmed") continue;
    if (!out.has(label.initiative)) out.set(label.initiative, new Map());
    out.get(label.initiative)!.set(label.documentId, label.grade);
  }
  return out;
}

/** Share of the first five that a person said fit. A place nobody judged counts as not fitting. */
export function precisionAt5(ranked: string[], grades: Map<string, Grade>): number {
  return ranked.slice(0, 5).filter((id) => grades.get(id) === "fits").length / 5;
}

/** NDCG at 10 with gain 2^grade - 1 (fits 3, maybe 1, doesn't 0); the ideal order uses every confirmed grade. */
export function ndcgAt10(ranked: string[], grades: Map<string, Grade>): number | null {
  const dcg = (gains: number[]) => gains.slice(0, METRIC_DEPTH).reduce((sum, gain, i) => sum + (2 ** gain - 1) / Math.log2(i + 2), 0);
  const ideal = dcg([...grades.values()].map((grade) => GRADES[grade]).sort((a, b) => b - a));
  if (!ideal) return null;
  return dcg(ranked.map((id) => GRADES[grades.get(id) ?? "doesnt"])) / ideal;
}

type Scores = { precisionAt5: number; ndcgAt10: number };
export type PathMetrics = Scores & {
  /** Initiatives with at least one confirmed "fits": the ones precision and NDCG are averaged over. */
  initiatives: number;
  /** Share of the first five places that carry a confirmed label, so a reader sees how much is judged. */
  judgedAt5: number;
  perInitiative: Record<string, Scores>;
};
export type MetricReport = { labels: string; confirmed: number; drafts: number; labelsHash: string; paths: Record<RankingPath, PathMetrics> | null };

const round = (value: number) => Math.round(value * 10000) / 10000;

/** Metrics on confirmed labels. With no confirmed fit, paths is null: nothing is measured and nothing is gated. */
export function measure(labels: LabelSet, ranked: Map<string, Rankings>): MetricReport {
  const grades = confirmedGrades(labels);
  const confirmed = labels.labels.filter((label) => label.status === "confirmed");
  const labelsHash = createHash("sha256")
    .update(JSON.stringify(confirmed.map((l) => [l.initiative, l.documentId, l.grade]).sort()))
    .digest("hex");
  const base = { labels: labels.dataset, confirmed: confirmed.length, drafts: labels.labels.length - confirmed.length, labelsHash };
  const scored = [...grades].filter(([id, map]) => ranked.has(id) && [...map.values()].includes("fits"));
  if (!scored.length) return { ...base, paths: null };
  const paths = Object.fromEntries(PATH_NAMES.map((path) => {
    const perInitiative: PathMetrics["perInitiative"] = {};
    let judged = 0;
    for (const [id, map] of scored) {
      const order = ranked.get(id)![path].map((place) => place.id);
      perInitiative[id] = { precisionAt5: round(precisionAt5(order, map)), ndcgAt10: round(ndcgAt10(order, map) ?? 0) };
      judged += order.slice(0, 5).filter((place) => map.has(place)).length;
    }
    const values = Object.values(perInitiative);
    const mean = (pick: (v: Scores) => number) => round(values.reduce((sum, v) => sum + pick(v), 0) / values.length);
    return [path, { initiatives: values.length, precisionAt5: mean((v) => v.precisionAt5), ndcgAt10: mean((v) => v.ndcgAt10), judgedAt5: round(judged / (values.length * 5)), perInitiative }];
  })) as Record<RankingPath, PathMetrics>;
  return { ...base, paths };
}

/** The metrics recorded for one label file. The baseline file holds one per label file. */
export type MetricBaseline = { labelsHash: string; recordedAt: string; paths: Record<RankingPath, PathMetrics> };
export type BaselineFile = { version: 1; labelSets: Record<string, MetricBaseline> };
export const BASELINE_COMMAND = "bun run --filter @weave/app eval:funds -- --record-baseline";

/** Whether today's metrics hold the baseline. Every drop is named with its path, metric and initiatives. */
export function gateMetrics(report: MetricReport, baseline: MetricBaseline | null): { passed: boolean; gated: boolean; message: string } {
  if (!report.paths)
    return {
      passed: true, gated: false,
      message: report.confirmed
        ? `${report.labels}: ${report.confirmed} confirmed labels but none says a program fits, so precision and NDCG are not gated.`
        : `${report.labels}: no confirmed labels yet (${report.drafts} drafts), so precision and NDCG are not gated.`,
    };
  if (!baseline || baseline.labelsHash !== report.labelsHash)
    return {
      passed: false, gated: true,
      message: `${report.labels}: the confirmed labels are new or changed (${report.confirmed} confirmed), so the stored baseline no longer applies. Run \`${BASELINE_COMMAND}\` and commit fund-ranking-baseline.json in the same pull request.`,
    };
  const drops: string[] = [];
  for (const path of PATH_NAMES) {
    const now = report.paths[path], was = baseline.paths[path];
    for (const metric of ["precisionAt5", "ndcgAt10"] as const) {
      if (now[metric] + 1e-9 >= was[metric]) continue;
      const worse = Object.entries(now.perInitiative)
        .filter(([id, value]) => value[metric] + 1e-9 < (was.perInitiative[id]?.[metric] ?? 0))
        .map(([id, value]) => `${id} ${was.perInitiative[id]?.[metric]} to ${value[metric]}`);
      drops.push(`${path} ${metric === "precisionAt5" ? "precision at 5" : "NDCG at 10"} fell from ${was[metric]} to ${now[metric]} (${worse.join(", ")}).`);
    }
  }
  return drops.length
    ? { passed: false, gated: true, message: `${report.labels}: ranking quality fell on confirmed labels.\n${drops.join("\n")}\nFix the ranking, or if the drop is accepted, run \`${BASELINE_COMMAND}\` and say why in the pull request.` }
    : { passed: true, gated: true, message: `${report.labels}: every path holds its baseline on ${report.confirmed} confirmed labels.` };
}

// Files and the command ---------------------------------------------------------------------------------

const HERE = new URL("./", import.meta.url);
export const FILES = {
  set: new URL("fund-ranking-v1.json", HERE),
  snapshot: new URL("fund-ranking-v1.snapshot.json", HERE),
  baseline: new URL("fund-ranking-baseline.json", HERE),
};
/** Label files the gate reads. A person's confirmations in them are what the metrics count. */
export const LABEL_FILES: URL[] = [];

/** A file that is not there reads as null; one that is there and does not parse is an error, never "missing". */
async function readOptional(url: URL): Promise<unknown> {
  let raw: string;
  try {
    raw = await readFile(url, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  return JSON.parse(raw);
}

export async function loadRankingSet(): Promise<RankingSet> {
  return validateRankingSet(await readJson(FILES.set));
}
export async function loadSnapshot(): Promise<{ snapshot: Snapshot; raw: string } | null> {
  const snapshot = (await readOptional(FILES.snapshot)) as Snapshot | null;
  return snapshot && { snapshot, raw: await readFile(FILES.snapshot, "utf8") };
}
export async function loadBaselines(): Promise<BaselineFile> {
  return ((await readOptional(FILES.baseline)) as BaselineFile | null) ?? { version: 1, labelSets: {} };
}

/** The whole gate: the snapshot, then each label file. */
export async function runGate(options: { update?: boolean; recordBaseline?: boolean } = {}) {
  const [set, data, stored, baselines] = await Promise.all([loadRankingSet(), loadRankingData(), loadSnapshot(), loadBaselines()]);
  const ranked = await rankSet(data, set);
  const current = snapshotOf(set, data, ranked);
  if (options.update && current.collation !== SNAPSHOT_COLLATION)
    throw Error(`The snapshot is written under ${SNAPSHOT_COLLATION} and this run compares names under ${current.collation}. Run with LANG=en_US.UTF-8.`);
  const changes = stored && !options.update ? compareSnapshot(stored.snapshot, current, ranked) : [];
  if (options.update) await writeFile(FILES.snapshot, serializeSnapshot(current));
  const metrics = [];
  const documents = new Set(data.names.keys());
  for (const file of LABEL_FILES) {
    const labels = validateLabels(await readJson(file), set, documents);
    const report = measure(labels, ranked);
    if (options.recordBaseline && report.paths)
      baselines.labelSets[report.labels] = { labelsHash: report.labelsHash, recordedAt: new Date().toISOString(), paths: report.paths };
    metrics.push({ report, gate: gateMetrics(report, baselines.labelSets[report.labels] ?? null) });
  }
  if (options.recordBaseline) await writeFile(FILES.baseline, `${JSON.stringify(baselines, null, 2)}\n`);
  return { set, current, ranked, stored, changes, missingSnapshot: !stored && !options.update, metrics };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const update = process.argv.includes("--update");
  const result = await runGate({ update, recordBaseline: process.argv.includes("--record-baseline") });
  const output = process.argv.indexOf("--output");
  if (output >= 0) {
    const path = process.argv[output + 1];
    if (!path) throw Error("--output needs a file path");
    const full = Object.fromEntries([...result.ranked].map(([id, paths]) => [id, Object.fromEntries(PATH_NAMES.map((p) => [p, paths[p].slice(0, METRIC_DEPTH)]))]));
    await writeFile(path, `${JSON.stringify({ rankedAt: result.current.rankedAt, paths: RANKING_PATHS, top10: full, metrics: result.metrics }, null, 2)}\n`);
  }
  const collation = result.stored && { stored: result.stored.snapshot.collation, current: result.current.collation };
  if (update) console.log(`Wrote ${FILES.snapshot.pathname} for ${result.set.initiatives.length} initiatives.`);
  else if (result.missingSnapshot) console.log(`No snapshot yet. Run \`${UPDATE_COMMAND}\`.`);
  else console.log(result.changes.length ? describeChanges(result.changes, { collation: collation ?? undefined }) : `The first ${SNAPSHOT_DEPTH} of every path match the snapshot for all ${result.set.initiatives.length} initiatives.`);
  for (const { gate } of result.metrics) console.log(gate.message);
  if (!LABEL_FILES.length) console.log("No label files yet, so precision and NDCG are not gated.");
  process.exitCode = result.changes.length || result.missingSnapshot || result.metrics.some(({ gate }) => !gate.passed) ? 1 : 0;
}
