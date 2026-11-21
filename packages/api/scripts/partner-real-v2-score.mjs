// Scores the partner-real-v2 holdout once, after both reviewers have finished and every disagreement is settled.
// The plan is ../evaluation/partner-real-v2-plan.md. This script is sealed by hash with the holdout files before
// review starts, and it refuses to score if any of them, the engine manifest or itself differs from that seal.
//
//   node packages/api/scripts/partner-real-v2-score.mjs <private-dir> --a <packet.jsonl>... --b <packet.jsonl>...
//     --adjudication <file.jsonl> --output <report.json>
//
// Reviewer files are the four packets with judgment, rationale and reviewer filled in. An adjudication row is
// { pairId, judgment, how: "third person" | "joint discussion", note } for each pair the reviewers judged differently.
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { CURRENT, verifyManifest } from "../evaluation/experiments/matching-architecture/d32-engines.mjs";
import { assertedText } from "../evaluation/experiments/matching-architecture/retrieval-eval.mjs";
import { rankPartnerMatches } from "../src/partner-matcher.ts";
import { projectEvidence, queryEntry } from "./matching-real.mjs";
import { explanationFailures } from "./matching-v3.mjs";

export const SEAL = "packages/api/evaluation/partner-real-v2.sha256";
export const JUDGMENTS = ["relevant", "irrelevant", "uncertain"];
export const SETTLED_BY = ["third person", "joint discussion"];
/** The decision rule's margins, as the user confirmed on 21 November 2026. */
export const MARGINS = { seedRecall: 0.05, noMatchShare: 0.1 };
export const TARGET = 0.8;
const WINDOW = 5, APP_WINDOW = 3, DRAWS = 4000;
const root = new URL("../../../", import.meta.url);
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const round = value => value === null ? null : Number(value.toFixed(4));
const ratio = (part, whole) => whole ? round(part / whole) : null;
const mean = list => list.length ? round(list.reduce((a, b) => a + b, 0) / list.length) : null;

/** Every sealed file must match: a name with a slash is a repository path, any other a file in the private folder. */
export async function verifySeal(dir, sealText = null) {
  const text = sealText ?? await readFile(new URL(SEAL, root), "utf8");
  const differences = [];
  for (const line of text.trim().split("\n")) {
    const [hash, name] = line.trim().split(/\s+/u);
    const path = name.includes("/") ? new URL(name, root) : join(dir, name);
    const bytes = await readFile(path).catch(() => null);
    if (!bytes || sha256(bytes) !== hash) differences.push(name);
  }
  return differences;
}

/** Raw agreement and Cohen's kappa between the two reviewers, before adjudication. */
export function agreement(pairIds, a, b) {
  const both = pairIds.filter(id => a.has(id) && b.has(id));
  if (!both.length) return { pairs: 0, raw: null, kappa: null };
  const agreed = both.filter(id => a.get(id) === b.get(id)).length / both.length;
  const share = (map, judgment) => both.filter(id => map.get(id) === judgment).length / both.length;
  const chance = JUDGMENTS.reduce((sum, judgment) => sum + share(a, judgment) * share(b, judgment), 0);
  return { pairs: both.length, raw: round(agreed), kappa: chance === 1 ? null : round((agreed - chance) / (1 - chance)) };
}

/** One label per pair: the reviewers' shared judgment, or the recorded adjudication where they differ. */
export function finalLabels(key, aRows, bRows, adjudication) {
  const problems = [], warnings = [];
  const keyIds = new Set(key.map(row => row.pairId));
  const index = (rows, who) => {
    const map = new Map();
    for (const row of rows) {
      if (!keyIds.has(row.pairId)) problems.push(`unknown_pair:${who}:${row.pairId}`);
      else if (map.has(row.pairId)) problems.push(`duplicate:${who}:${row.pairId}`);
      else if (!JUDGMENTS.includes(row.judgment)) problems.push(`bad_judgment:${who}:${row.pairId}`);
      else {
        if (row.judgment !== "irrelevant" && !String(row.rationale ?? "").trim()) warnings.push(`no_rationale:${who}:${row.pairId}`);
        map.set(row.pairId, row.judgment);
      }
    }
    return map;
  };
  const a = index(aRows, "a"), b = index(bRows, "b");
  const settled = new Map(adjudication.map(row => [row.pairId, row]));
  const labels = new Map();
  for (const pairId of keyIds) {
    if (!a.has(pairId) || !b.has(pairId)) { problems.push(`unjudged:${pairId}`); continue; }
    if (a.get(pairId) === b.get(pairId)) { labels.set(pairId, a.get(pairId)); continue; }
    const row = settled.get(pairId);
    if (!row || !JUDGMENTS.includes(row.judgment) || !SETTLED_BY.includes(row.how)) { problems.push(`unadjudicated:${pairId}`); continue; }
    labels.set(pairId, row.judgment);
  }
  return { labels, problems, warnings, agreement: agreement([...keyIds], a, b) };
}

/** Per-query rows for one engine's picks, scored with the final labels. */
export function scoreRows(picks, context) {
  const { queries, slots, labelOf, pooled, v1Projects } = context;
  return queries.map(query => {
    const slot = slots.get(query.id);
    const ids = (picks[query.id] ?? []).slice(0, WINDOW).map(pick => pick.id);
    const inPool = pooled.get(query.id);
    const relevantPool = [...inPool].filter(id => labelOf(query.id, id) === "relevant");
    const cls = relevantPool.length ? "positive" : [...inPool].some(id => labelOf(query.id, id) === "uncertain") ? "unresolved" : "no-match";
    const count = (list, label) => list.filter(id => labelOf(query.id, id) === label).length;
    const top3 = ids.slice(0, APP_WINDOW);
    const origin = list => ({ v1: list.filter(id => v1Projects.has(id)), fresh: list.filter(id => !v1Projects.has(id)) });
    const byOrigin = origin(ids);
    const seedFits = slot.kind === "seeded" && labelOf(query.id, slot.seed) === "relevant";
    return { id: query.id, domain: query.domain, direction: query.direction, language: query.language, kind: slot.kind, class: cls,
      returned: ids.length, relevant: count(ids, "relevant"), irrelevant: count(ids, "irrelevant"),
      returned3: top3.length, relevant3: count(top3, "relevant"), irrelevant3: count(top3, "irrelevant"),
      v1Relevant: count(byOrigin.v1, "relevant"), v1Irrelevant: count(byOrigin.v1, "irrelevant"),
      freshRelevant: count(byOrigin.fresh, "relevant"), freshIrrelevant: count(byOrigin.fresh, "irrelevant"),
      recall: relevantPool.length ? relevantPool.filter(id => ids.includes(id)).length / relevantPool.length : null,
      seedHit: seedFits ? Number(ids.includes(slot.seed)) : null };
  });
}

/** The plan's measures over a set of rows; relevance shares leave uncertain pairs out, as the rubric does. */
export function summarize(rows) {
  const positive = rows.filter(row => row.class === "positive"), empty = rows.filter(row => row.class === "no-match");
  const sum = (list, field) => list.reduce((n, row) => n + row[field], 0);
  const seeded = rows.filter(row => row.seedHit !== null);
  return {
    queries: rows.length, positiveQueries: positive.length, noMatchQueries: empty.length,
    unresolvedQueries: rows.filter(row => row.class === "unresolved").length,
    suggestionsAt5: sum(positive, "returned"), relevantSuggestionsAt5: sum(positive, "relevant"),
    relevantAmongReturnedAt5: ratio(sum(positive, "relevant"), sum(positive, "relevant") + sum(positive, "irrelevant")),
    relevantAmongReturnedAt3: ratio(sum(positive, "relevant3"), sum(positive, "relevant3") + sum(positive, "irrelevant3")),
    relevantAmongReturnedToV1Projects: ratio(sum(positive, "v1Relevant"), sum(positive, "v1Relevant") + sum(positive, "v1Irrelevant")),
    relevantAmongReturnedToNewProjects: ratio(sum(positive, "freshRelevant"), sum(positive, "freshRelevant") + sum(positive, "freshIrrelevant")),
    finalRecallAt5: mean(positive.map(row => row.recall)),
    seededQueriesWithAFittingSeed: seeded.length, seedRecall: mean(seeded.map(row => row.seedHit)),
    positiveQueriesWithARelevantSuggestion: positive.filter(row => row.relevant).length,
    positiveQueryAbstentions: positive.filter(row => !row.returned).length,
    noMatchQueriesWithASuggestion: empty.filter(row => row.returned).length,
    noMatchShare: ratio(empty.filter(row => row.returned).length, empty.length),
  };
}
const groups = (rows, key) => Object.fromEntries(Object.entries(Object.groupBy(rows, key)).sort().map(([name, list]) => [name, summarize(list)]));

/** Rule 1 for the current matcher: its matches, rerun, must equal the sealed run; then confirmations and explanations. */
export function currentGate(corpus, queries, runs) {
  const evidence = corpus.projects.flatMap(projectEvidence);
  const byUri = new Map(corpus.projects.map(project => [project.uri, project.id]));
  const now = Date.parse(runs.engineDate);
  let unsupportedConfirmations = 0;
  const failures = [];
  for (const query of queries) {
    const matches = rankPartnerMatches({ queries: [queryEntry(query)], publicEvidence: evidence, limitPerEntryAndKind: WINDOW, now }).slice(0, WINDOW);
    const ids = matches.map(match => byUri.get(match.evidence.projectUri));
    if (JSON.stringify(ids) !== JSON.stringify((runs.engines[CURRENT.name][query.id] ?? []).map(pick => pick.id)))
      throw Error(`current_run_differs:${query.id}`);
    unsupportedConfirmations += matches.filter(match => match.evidenceKind === "confirmed_offer" || match.evidenceKind === "confirmed_need").length;
    for (const match of matches) for (const reason of explanationFailures(query, match)) failures.push({ query: query.id, reason });
  }
  return { unsupportedConfirmations, explanationOrProvenanceFailures: failures.length, failures, explanation: "checked" };
}

/** Rule 1 for a model engine, provenance only (decided 21 November 2026): each pick is a public project's passages. */
export function modelGate(corpus, picks) {
  const byId = new Map(corpus.projects.map(project => [project.id, project]));
  const failures = [];
  for (const [queryId, list] of Object.entries(picks)) for (const pick of list) {
    const project = byId.get(pick.id);
    if (!project) { failures.push({ query: queryId, reason: `not_in_corpus:${pick.id}` }); continue; }
    if (!["lexicalOnly", "semanticOnly", "both"].includes(pick.path)) failures.push({ query: queryId, reason: `unknown_path:${pick.id}` });
    if (pick.path !== "lexicalOnly" && !assertedText({ cls: "public", kind: "work", text: project.passages.join("\n") }))
      failures.push({ query: queryId, reason: `no_asserted_text:${pick.id}` });
    for (const passage of projectEvidence(project)) for (const field of ["sourceUri", "cid", "fieldPath", "passage", "fetchedAt", "projectUri"])
      if (typeof passage[field] !== "string" || !passage[field].trim()) failures.push({ query: queryId, reason: `missing_provenance:${field}:${pick.id}` });
  }
  return { unsupportedConfirmations: 0, explanationOrProvenanceFailures: failures.length, failures,
    explanation: "not built: the engine returns no explanation; one must be designed before any model ships" };
}

function mulberry32(seed) {
  return () => { let t = seed += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
/** 95% percentile intervals of candidate minus current, resampling queries with their pairs kept together. */
export function pairedIntervals(currentRows, candidateRows, draws = DRAWS) {
  const random = mulberry32(20261121), n = currentRows.length;
  const stat = { relevance: [], seedRecall: [], seedRecallPt: [], seedRecallEs: [], noMatchShare: [] };
  const pick = (rows, sample) => sample.map(i => rows[i]);
  const diff = (field, filter = () => true) => sample => {
    const c = summarize(pick(currentRows, sample).filter(filter)), m = summarize(pick(candidateRows, sample).filter(filter));
    return c[field] === null || m[field] === null ? null : m[field] - c[field];
  };
  const measures = { relevance: diff("relevantAmongReturnedAt5"), seedRecall: diff("seedRecall"),
    seedRecallPt: diff("seedRecall", row => row.language === "pt"), seedRecallEs: diff("seedRecall", row => row.language === "es"),
    noMatchShare: diff("noMatchShare") };
  for (let draw = 0; draw < draws; draw++) {
    const sample = Array.from({ length: n }, () => Math.floor(random() * n));
    for (const [name, measure] of Object.entries(measures)) { const value = measure(sample); if (value !== null) stat[name].push(value); }
  }
  const interval = values => { const sorted = values.sort((a, b) => a - b);
    return sorted.length ? [round(sorted[Math.floor(sorted.length * 0.025)]), round(sorted[Math.floor(sorted.length * 0.975)])] : null; };
  return Object.fromEntries(Object.entries(stat).map(([name, values]) => [name, interval(values)]));
}

/** Rules 1 to 5 of the decision rule; rule 6, the host budget, comes from the separate host measurement. */
export function decide(current, candidate, intervals, gate) {
  const atMost = (value, limit) => value !== null && limit !== null && Math.round(value * 10_000) <= Math.round(limit * 10_000);
  const above = (a, b) => a !== null && b !== null && Math.round(a * 10_000) > Math.round(b * 10_000);
  const rules = {
    hardGate: gate.unsupportedConfirmations === 0 && gate.explanationOrProvenanceFailures === 0,
    relevance: above(candidate.relevantAmongReturnedAt5, current.relevantAmongReturnedAt5) && intervals.relevance !== null && intervals.relevance[0] > 0,
    recallFloor: current.seedRecall !== null && atMost(current.seedRecall - MARGINS.seedRecall, candidate.seedRecall),
    languages: above(candidate.byLanguage.pt?.seedRecall ?? null, current.byLanguage.pt?.seedRecall ?? null)
      && above(candidate.byLanguage.es?.seedRecall ?? null, current.byLanguage.es?.seedRecall ?? null),
    quietWhenNothingFits: atMost(candidate.noMatchShare, current.noMatchShare === null ? null : current.noMatchShare + MARGINS.noMatchShare),
  };
  return { rules, hostBudget: "measured separately; see the plan's host measurement",
    passesRulesOneToFive: Object.values(rules).every(Boolean) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [dir, ...rest] = process.argv.slice(2);
  const values = flag => { const out = []; let on = false;
    for (const arg of rest) { if (arg.startsWith("--")) on = arg === flag; else if (on) out.push(arg); } return out; };
  const [output] = values("--output"), [adjudicationPath] = values("--adjudication");
  if (!dir || !values("--a").length || !values("--b").length || !adjudicationPath || !output) throw Error("usage: <private-dir> --a ... --b ... --adjudication <file> --output <file>");
  const sealed = await verifySeal(dir);
  if (sealed.length) throw Error(`sealed_files_differ:${sealed.join(",")}`);
  const { differences } = await verifyManifest();
  if (differences.length) throw Error(`engine_manifest_differs:${differences.join(",")}`);

  const json = async path => JSON.parse(await readFile(path, "utf8"));
  const jsonl = async paths => (await Promise.all(paths.map(async path => (await readFile(path, "utf8")).trim().split("\n").filter(Boolean).map(line => JSON.parse(line))))).flat();
  const corpus = await json(join(dir, "partner-real-v2-corpus.json")), { queries } = await json(join(dir, "partner-real-v2-queries.json"));
  const slots = new Map((await json(join(dir, "partner-real-v2-slots.json"))).slots.map(slot => [slot.id, slot]));
  const runs = await json(join(dir, "partner-real-v2-runs.json"));
  const key = await jsonl([join(dir, "partner-real-v2-worksheet-key.jsonl")]);
  const final = finalLabels(key, await jsonl(values("--a")), await jsonl(values("--b")), await jsonl([adjudicationPath]));
  if (final.problems.length) throw Error(`labels_incomplete:${final.problems.slice(0, 20).join(",")}${final.problems.length > 20 ? ",..." : ""}`);

  const pairOf = new Map(key.map(row => [`${row.queryId}:${row.projectId}`, row.pairId]));
  const pooled = new Map(queries.map(query => [query.id, new Set(key.filter(row => row.queryId === query.id).map(row => row.projectId))]));
  const context = { queries, slots, pooled, v1Projects: new Set(corpus.projects.filter(project => project.v1Id).map(project => project.id)),
    labelOf: (queryId, projectId) => final.labels.get(pairOf.get(`${queryId}:${projectId}`)) };
  const engines = {};
  for (const [name, picks] of Object.entries(runs.engines)) {
    const rows = scoreRows(picks, context);
    engines[name] = { ...summarize(rows), byDomain: groups(rows, row => row.domain), byDirection: groups(rows, row => row.direction),
      byLanguage: groups(rows, row => row.language), byKind: groups(rows, row => row.kind),
      byDomainAndDirection: groups(rows, row => `${row.domain}/${row.direction}`), rows };
  }
  const gates = { [CURRENT.name]: currentGate(corpus, queries, runs) };
  const candidates = Object.keys(runs.engines).filter(name => name !== CURRENT.name);
  const decisions = {};
  for (const name of candidates) {
    gates[name] = modelGate(corpus, runs.engines[name]);
    const intervals = pairedIntervals(engines[CURRENT.name].rows, engines[name].rows);
    decisions[name] = { intervals, ...decide(engines[CURRENT.name], engines[name], intervals, gates[name]) };
  }
  const report = { dataset: "partner-real-v2", scoredOn: new Date().toISOString(), labelSource: "two reviewers, adjudicated",
    agreement: final.agreement, rationaleWarnings: final.warnings.length, margins: MARGINS, target: TARGET,
    labels: Object.fromEntries(JUDGMENTS.map(judgment => [judgment, [...final.labels.values()].filter(label => label === judgment).length])),
    engines: Object.fromEntries(Object.entries(engines).map(([name, { rows, ...rest }]) => [name, rest])), gates, decisions };
  await writeFile(output, JSON.stringify(report, null, 1) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ agreement: report.agreement, labels: report.labels,
    decisions: Object.fromEntries(Object.entries(decisions).map(([name, d]) => [name, { ...d.rules, passesRulesOneToFive: d.passesRulesOneToFive }])) }, null, 1));
}
