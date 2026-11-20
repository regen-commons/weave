// Partner matching on real public Certified project passages (partner-real-v1).
//
//   node scripts/matching-real.mjs --write-worksheet <worksheet.jsonl> <key.jsonl>
//   node scripts/matching-real.mjs [--output report.json]                      agent-judged labels
//   node scripts/matching-real.mjs --human <reviewer-a.jsonl> <reviewer-b.jsonl> [--output report.json]
//
// The corpus, queries and agent labels are frozen by SHA-256 in partner-real-v1.sha256, as are the
// worksheet and its key once written. Scoring uses the spec's definitions, as the post-hoc v3 report does.
import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { rankPartnerMatches as baseline, partnerLexicalText } from "../evaluation/lexical-v1.ts";
import { rankPartnerMatches as improved, PARTNER_ENGINE_VERSION, partnerQueryProjection } from "../src/partner-matcher.ts";
import { expandPartnerText, PARTNER_CONCEPT_VERSION } from "../src/partner-concepts.ts";
import { explanationFailures, SCORING } from "./matching-v3.mjs";

const root = new URL("../evaluation/", import.meta.url);
export const FILES = { corpus: "partner-real-v1-corpus.json", queries: "partner-real-v1-queries.json",
  labels: "partner-real-v1-agent-labels.json", worksheet: "partner-real-v1-worksheet.jsonl", key: "partner-real-v1-worksheet-key.jsonl" };
export const DOMAINS = ["art", "software", "research", "place"];
export const EVIDENCE_TYPES = ["literal", "paraphrase", "sparse", "cross-language", "hard-negative", "no-match"];
export const LANGUAGES = ["en", "pt", "es"];
export const JUDGMENTS = ["relevant", "irrelevant", "uncertain"];
/** The app shows three suggestions per need or offer; the spec's window is five. */
export const APP_WINDOW = 3;
const NOW = Date.parse("2026-11-19T00:00:00Z");
const nonempty = value => typeof value === "string" && value.trim().length > 0;
const confirmed = new Set(["confirmed_offer", "confirmed_need"]);
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const ratio = (part, whole) => whole ? Number((part / whole).toFixed(4)) : null;
const mean = values => values.length ? Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(4)) : null;

export function validateCorpus(corpus) {
  if (!corpus || corpus.version !== 1 || !Array.isArray(corpus.projects) || !corpus.projects.length) throw Error("invalid_real_corpus");
  const ids = new Set(), uris = new Set();
  for (const project of corpus.projects) {
    if (!/^rp-\d{3}$/u.test(project?.id ?? "") || ids.has(project.id) || !nonempty(project.uri) || uris.has(project.uri)
      || !nonempty(project.name) || !Array.isArray(project.passages) || !project.passages.length || project.passages.length > 2
      || !project.passages.every(nonempty) || !nonempty(project.sharedAt) || !nonempty(project.collectedAt) || !nonempty(project.sourceUrl))
      throw Error("invalid_real_corpus_project");
    ids.add(project.id);
    uris.add(project.uri);
  }
  return corpus;
}

/** Rejects unknown ids, unscorable query types and labels that contradict a query's type. */
export function validateQueries(queries, labels, corpus) {
  const projects = new Set(corpus.projects.map(project => project.id));
  if (!queries || queries.version !== 1 || !Array.isArray(queries.queries) || queries.thresholds?.precisionAmongReturnedPerDomainDirection !== 0.8)
    throw Error("invalid_real_queries");
  const ids = new Set();
  for (const query of queries.queries) {
    if (!/^rq-[a-z]{2,3}-[no]\d{2}$/u.test(query?.id ?? "") || ids.has(query.id) || !DOMAINS.includes(query.domain)
      || !["need", "offer"].includes(query.direction) || !LANGUAGES.includes(query.language) || !EVIDENCE_TYPES.includes(query.evidenceType)
      || !nonempty(query.title) || typeof query.description !== "string") throw Error("invalid_real_query");
    ids.add(query.id);
  }
  if (!labels || labels.version !== 1 || !Array.isArray(labels.labels) || labels.labels.length !== ids.size) throw Error("invalid_real_labels");
  const seen = new Set();
  for (const label of labels.labels) {
    const query = queries.queries.find(row => row.id === label?.id);
    if (!query || seen.has(label.id)) throw Error("invalid_real_labels");
    seen.add(label.id);
    for (const field of ["authorRelevant", "authorDecoys", "judgeRelevant", "judgeUncertain"]) {
      const list = label[field];
      if (!Array.isArray(list) || new Set(list).size !== list.length || !list.every(id => projects.has(id))) throw Error("invalid_real_labels");
    }
    if (typeof label.authorDoubt !== "string") throw Error("invalid_real_labels");
    // The author's own type fixes whether the author found any fitting project.
    const empty = !label.authorRelevant.length;
    if ((query.evidenceType === "no-match" && !empty) || (!["no-match", "hard-negative"].includes(query.evidenceType) && empty))
      throw Error("invalid_real_labels");
    if (query.evidenceType === "hard-negative" && !label.authorDecoys.length) throw Error("invalid_real_labels");
    if (label.authorDecoys.some(id => label.authorRelevant.includes(id))) throw Error("invalid_real_labels");
  }
  return queries;
}

async function frozenHashes() {
  const lines = (await readFile(new URL("partner-real-v1.sha256", root), "utf8")).trim().split("\n");
  return new Map(lines.map(line => { const [hash, name] = line.trim().split(/\s+/u); return [name, hash]; }));
}

/** Loads every frozen file, refusing any whose bytes no longer match its recorded SHA-256. */
export async function loadReal({ requireWorksheet = true } = {}) {
  const hashes = await frozenHashes();
  const needed = requireWorksheet ? Object.values(FILES) : [FILES.corpus, FILES.queries, FILES.labels];
  const bytes = {};
  for (const name of needed) {
    if (!hashes.has(name)) throw Error(`partner_real_not_frozen:${name}`);
    bytes[name] = await readFile(new URL(name, root));
    if (sha256(bytes[name]) !== hashes.get(name)) throw Error(`partner_real_fixture_changed:${name}`);
  }
  const baselineHash = sha256(await readFile(new URL("lexical-v1.ts", root)));
  if (baselineHash !== (await readFile(new URL("lexical-v1.sha256", root), "utf8")).trim()) throw Error("evaluation_baseline_changed");
  const corpus = validateCorpus(JSON.parse(bytes[FILES.corpus]));
  const labels = JSON.parse(bytes[FILES.labels]);
  const queries = validateQueries(JSON.parse(bytes[FILES.queries]), labels, corpus);
  const jsonl = name => bytes[name] ? String(bytes[name]).trim().split("\n").map(line => JSON.parse(line)) : null;
  return { corpus, queries, labels, worksheet: jsonl(FILES.worksheet), key: jsonl(FILES.key),
    hashes: Object.fromEntries(needed.map(name => [name, hashes.get(name)])), baselineHash };
}

/** Each listed passage becomes one public evidence passage, as the index stores them. */
export function projectEvidence(project) {
  return project.passages.map((passage, index) => ({
    id: `${project.id}:${index}`, projectUri: project.uri, projectName: project.name, sourceUri: project.uri,
    sourceUrl: project.sourceUrl, cid: "not-shown-by-public-list", contentHash: sha256(passage), fieldPath: `$.passages[${index}]`,
    passage, kind: "work", sourceCreatedAt: project.sharedAt, sourceIndexedAt: null, fetchedAt: project.collectedAt,
    extractionVersion: "partner-real-v1" }));
}
export const queryEntry = query => ({ initiativeId: "evaluation-initiative", entryId: query.id, revision: 1, kind: query.direction,
  value: { title: query.title, description: query.description || null, status: "open", placeScope: "anywhere" }, summary: {} });
const terms = text => new Set(partnerLexicalText(text).split(" ").filter(Boolean));

/** The projects an engine suggests for one query, best first, at most five. */
export function suggest(corpus, query, useConcepts, path = "full-corpus") {
  const queryTerms = terms(partnerQueryProjection(queryEntry(query)));
  const pool = path === "full-corpus" ? corpus.projects : corpus.projects.filter(project => project.passages
    .some(passage => [...terms(useConcepts ? expandPartnerText(passage) : passage)].some(term => queryTerms.has(term))));
  const byUri = new Map(corpus.projects.map(project => [project.uri, project.id]));
  const matches = (useConcepts ? improved : baseline)({ queries: [queryEntry(query)], publicEvidence: pool.flatMap(projectEvidence),
    limitPerEntryAndKind: SCORING.window, now: NOW }).slice(0, SCORING.window);
  return { pool: new Set(pool.map(project => project.id)), matches, ids: matches.map(match => byUri.get(match.evidence.projectUri)) };
}

/**
 * Turns two independent judgments of each pair into one label: relevant when both say relevant,
 * irrelevant when both say irrelevant, otherwise unresolved. Unresolved pairs never count as
 * relevant or as errors; they are reported beside every score.
 */
export function combine(first, second) {
  if (first === "relevant" && second === "relevant") return "relevant";
  if (first === "irrelevant" && second === "irrelevant") return "irrelevant";
  return "unresolved";
}

/** The author names any project it doubts, either way, in its free-text doubt. */
export const doubtedProjects = label => new Set(label.authorDoubt.match(/rp-\d{3}/gu) ?? []);

/** Agent labels: the author's and the judge's sets for every query, over the whole corpus. */
export function agentLabels(queries, labels, corpus) {
  return new Map(queries.queries.map(query => {
    const label = labels.labels.find(row => row.id === query.id);
    const doubted = doubtedProjects(label);
    const author = id => doubted.has(id) ? "uncertain" : label.authorRelevant.includes(id) ? "relevant" : "irrelevant";
    const judge = id => label.judgeUncertain.includes(id) ? "uncertain" : label.judgeRelevant.includes(id) ? "relevant" : "irrelevant";
    const pairs = new Map(corpus.projects.map(({ id }) => [id, combine(author(id), judge(id))]));
    return [query.id, { pairs, judgedAll: true, decoys: new Set(label.authorDecoys) }];
  }));
}

/** Human labels: two completed copies of the worksheet, joined to queries and projects by the key. */
export function humanLabels(queries, labels, key, first, second) {
  const byPair = new Map(key.map(row => [row.pairId, row]));
  const reviewer = rows => {
    const names = new Set(rows.map(row => row.reviewer));
    if (names.size !== 1 || !nonempty([...names][0])) throw Error("worksheet_requires_one_named_reviewer");
    // The right count of known pairs is not enough: a repeated row would stand in for a missing one.
    if (rows.length !== key.length || new Set(rows.map(row => row.pairId)).size !== rows.length
      || rows.some(row => !byPair.has(row.pairId) || !JUDGMENTS.includes(row.judgment)))
      throw Error("worksheet_incomplete");
    return [[...names][0], new Map(rows.map(row => [row.pairId, row.judgment]))];
  };
  const [nameA, a] = reviewer(first), [nameB, b] = reviewer(second);
  if (nameA === nameB) throw Error("worksheets_require_two_reviewers");
  const result = new Map(queries.queries.map(query => {
    const label = labels.labels.find(row => row.id === query.id);
    return [query.id, { pairs: new Map(), judgedAll: false, decoys: new Set(label.authorDecoys) }];
  }));
  for (const row of key) result.get(row.queryId).pairs.set(row.projectId, combine(a.get(row.pairId), b.get(row.pairId)));
  return { reviewers: [nameA, nameB], labels: result };
}

export function agreement(labelMap) {
  const counts = { pairs: 0, relevant: 0, irrelevant: 0, unresolved: 0 };
  for (const { pairs } of labelMap.values()) for (const value of pairs.values()) { counts.pairs++; counts[value]++; }
  return counts;
}

function summarize(rows) {
  const positive = rows.filter(row => row.class === "positive");
  const sum = (list, field) => list.reduce((n, row) => n + row[field], 0);
  const suggested = sum(positive, "returned"), relevant = sum(positive, "correct"), unresolved = sum(positive, "unresolved");
  const suggested3 = sum(positive, "returned3"), relevant3 = sum(positive, "correct3"), unresolved3 = sum(positive, "unresolved3");
  const empty = rows.filter(row => row.class === "no-match");
  return { queries: rows.length, positiveQueries: positive.length, noMatchQueries: empty.length,
    unresolvedQueries: rows.filter(row => row.class === "unresolved").length,
    suggestionsAt5: suggested, relevantSuggestionsAt5: relevant, unresolvedSuggestionsAt5: unresolved,
    unjudgedSuggestionsAt5: sum(positive, "unjudged"),
    // The spec's measure: relevant among the top five returned, counted over suggestions whose label is resolved.
    relevantAmongReturnedAt5: ratio(relevant, suggested - unresolved),
    relevantAmongReturnedAt3: ratio(relevant3, suggested3 - unresolved3),
    candidateRecall: mean(positive.map(row => row.candidateRecall)),
    finalRecallAt5: mean(positive.map(row => row.finalRecallAt5)),
    positiveQueriesWithARelevantSuggestion: positive.filter(row => row.correct).length,
    positiveQueryAbstentions: positive.filter(row => !row.returned).length,
    noMatchFalsePositives: empty.filter(row => row.returned).length,
    decoySuggestions: rows.reduce((n, row) => n + row.decoys, 0),
    unsupportedConfirmations: sum(rows, "unsupportedConfirmations"),
    explanationOrProvenanceFailures: rows.reduce((n, row) => n + row.explanationFailures.length, 0) };
}
const groupBy = (rows, key) => Object.fromEntries([...new Set(rows.map(key))].sort().map(name => [name, summarize(rows.filter(row => key(row) === name))]));

/**
 * Paths: "full-corpus" gives both engines every corpus passage, isolating ranking on the same candidates.
 * "retrieval" first keeps projects sharing a term with the query (on expanded text for the current
 * engine), an upper bound for the SQL shortlist, then ranks. `suggestFor` lets an offline experiment
 * score its own suggestions with these definitions; it returns what `suggest` returns.
 */
export function evaluateReal(corpus, queries, labelMap, useConcepts, path, suggestFor = suggest) {
  if (!["full-corpus", "retrieval"].includes(path)) throw Error("invalid_evaluation_path");
  const rows = queries.queries.map(query => {
    const { pairs, judgedAll, decoys } = labelMap.get(query.id);
    const label = id => pairs.get(id) ?? (judgedAll ? "irrelevant" : "unjudged");
    const relevant = [...pairs].filter(([, value]) => value === "relevant").map(([id]) => id);
    const anyUnresolved = [...pairs.values()].includes("unresolved");
    const { pool, matches, ids } = suggestFor(corpus, query, useConcepts, path);
    const top3 = ids.slice(0, APP_WINDOW);
    const count = (list, value) => list.filter(id => label(id) === value).length;
    return { id: query.id, domain: query.domain, direction: query.direction, language: query.language, evidenceType: query.evidenceType,
      class: relevant.length ? "positive" : anyUnresolved ? "unresolved" : "no-match",
      relevant: relevant.length, returned: ids.length, correct: count(ids, "relevant"), unresolved: count(ids, "unresolved"),
      unjudged: count(ids, "unjudged"), returned3: top3.length, correct3: count(top3, "relevant"), unresolved3: count(top3, "unresolved"),
      decoys: ids.filter(id => decoys.has(id)).length,
      candidateRecall: relevant.length ? relevant.filter(id => pool.has(id)).length / relevant.length : null,
      finalRecallAt5: relevant.length ? relevant.filter(id => ids.includes(id)).length / relevant.length : null,
      unsupportedConfirmations: matches.filter(match => confirmed.has(match.evidenceKind)).length,
      explanationFailures: matches.flatMap(match => explanationFailures(query, match).map(reason => ({ candidate: match.evidence.projectUri, reason }))),
      evidenceKinds: matches.map(match => match.evidenceKind),
      results: ids, missed: relevant.filter(id => !ids.includes(id)), notRelevant: ids.filter(id => label(id) === "irrelevant") };
  });
  const kinds = [...new Set(rows.flatMap(row => row.evidenceKinds))].sort();
  return { engine: useConcepts ? PARTNER_ENGINE_VERSION : "partner-lexical-v1", path, summary: summarize(rows),
    byDirection: groupBy(rows, row => row.direction), byDomain: groupBy(rows, row => row.domain),
    byDomainAndDirection: groupBy(rows, row => `${row.domain}/${row.direction}`), byLanguage: groupBy(rows, row => row.language),
    byEvidenceType: groupBy(rows, row => row.evidenceType),
    // Every candidate here is public work, so the evidence kind follows the direction; kept to show it.
    bySuggestionEvidenceKind: Object.fromEntries(kinds.map(kind => [kind, rows.reduce((n, row) => n + row.evidenceKinds.filter(k => k === kind).length, 0)])),
    rows };
}

export function gatesReal(thresholds, result) {
  const groups = Object.entries(result.byDomainAndDirection).map(([key, value]) => {
    const resolved = value.suggestionsAt5 - value.unresolvedSuggestionsAt5;
    return { key, relevantAmongReturnedAt5: value.relevantAmongReturnedAt5, resolvedSuggestions: resolved,
      positiveQueries: value.positiveQueries, abstentions: value.positiveQueryAbstentions,
      // Returning almost nothing cannot pass: too few resolved suggestions leave the group undecided.
      passed: resolved < SCORING.minSuggestions ? null : value.relevantAmongReturnedAt5 >= thresholds.precisionAmongReturnedPerDomainDirection };
  });
  const decided = groups.filter(group => group.passed !== null);
  return {
    precisionPerDomainDirection: { threshold: thresholds.precisionAmongReturnedPerDomainDirection, definition: SCORING, groups,
      passed: groups.some(group => group.passed === false) ? false : decided.length === groups.length ? true : null },
    unsupportedConfirmations: { observed: result.summary.unsupportedConfirmations, passed: result.summary.unsupportedConfirmations === 0 },
    explanationOrProvenance: { observed: result.summary.explanationOrProvenanceFailures, passed: result.summary.explanationOrProvenanceFailures === 0 },
    recall: { floor: thresholds.recallFloor, observed: result.summary.finalRecallAt5, passed: null, note: "No recall floor is agreed; reported only." },
    noMatchFalsePositives: { observed: result.summary.noMatchFalsePositives, of: result.summary.noMatchQueries },
  };
}

/**
 * The blind worksheet pools, for each query, every project either agent labelled relevant, uncertain or
 * a decoy, both engines' top five, and two seeded controls. Rows carry only the query and project text;
 * the key that joins them back is a separate file.
 */
export function worksheetPairs(corpus, queries, labels) {
  const rows = [];
  for (const query of queries.queries) {
    const label = labels.labels.find(row => row.id === query.id);
    const pool = new Set([...label.authorRelevant, ...label.authorDecoys, ...doubtedProjects(label), ...label.judgeRelevant,
      ...label.judgeUncertain, ...suggest(corpus, query, true).ids, ...suggest(corpus, query, false).ids]);
    const controls = corpus.projects.filter(project => !pool.has(project.id))
      .sort((a, b) => sha256(`${query.id}:${a.id}`).localeCompare(sha256(`${query.id}:${b.id}`))).slice(0, 2);
    for (const project of controls) pool.add(project.id);
    for (const projectId of pool) {
      const project = corpus.projects.find(row => row.id === projectId);
      const pairId = randomUUID();
      rows.push({ pair: { pairId, direction: query.direction, queryTitle: query.title, queryDescription: query.description,
        projectName: project.name, projectPassages: project.passages, judgment: null, rationale: "", reviewer: "" },
      key: { pairId, queryId: query.id, projectId } });
    }
  }
  rows.sort((a, b) => a.pair.pairId.localeCompare(b.pair.pairId));
  return { pairs: rows.map(row => row.pair), key: rows.map(row => row.key) };
}

const LIMITS = [
  "Labels come from agents unless --human is given: one agent instance per domain wrote the queries and its labels, and a separate instance judged every query against the whole corpus without seeing them. Both were blind to the matcher and its vocabulary. This is a provisional baseline, not the human gate.",
  "A pair counts as relevant only when both judges say so and as irrelevant only when both say not; any disagreement or doubt leaves it unresolved, excluded from precision and reported beside it.",
  "The corpus is a 140-project sample of what the public list shows: at most two passages of at most 600 characters per project, often a heading and a subtitle. The production index can hold more passages per project, so these runs may understate what the matcher sees.",
  "Every candidate is public work; there are no shared needs or offers, so shared-entry ranking and its evidence kinds are not exercised.",
  "The listing is overwhelmingly English-language ecological and land work; only one sampled project is written in Portuguese and thirteen in Spanish, so Portuguese queries are mostly cross-language by necessity.",
  "Domains classify the query's subject. Art and software projects are scarce in the listing, so their queries lean on a few projects each.",
  "Retrieval simulates token overlap with no shortlist cap; it is an upper bound, not PostgreSQL ranking or the device's 80-project snapshot.",
  "Once its misses are examined, a rerun is regression evidence, not a new independent result. Do not tune against this set.",
];

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argument = (name, count = 1) => {
    const index = process.argv.indexOf(name);
    if (index < 0) return null;
    const values = process.argv.slice(index + 1, index + 1 + count);
    if (values.length !== count || values.some(value => !value || value.startsWith("--"))) throw Error(`missing_argument:${name}`);
    return values;
  };
  const sheet = argument("--write-worksheet", 2);
  if (sheet) {
    const { corpus, queries, labels } = await loadReal({ requireWorksheet: false });
    const { pairs, key } = worksheetPairs(corpus, queries, labels);
    await writeFile(sheet[0], pairs.map(row => JSON.stringify(row)).join("\n") + "\n", { flag: "wx" });
    await writeFile(sheet[1], key.map(row => JSON.stringify(row)).join("\n") + "\n", { flag: "wx" });
    console.log(JSON.stringify({ pairs: pairs.length, queries: queries.queries.length }));
  } else {
    const { corpus, queries, labels, key, hashes, baselineHash } = await loadReal();
    const human = argument("--human", 2);
    let labelMap, labelSource, reviewers = null;
    if (human) {
      const read = async file => (await readFile(file, "utf8")).trim().split("\n").map(line => JSON.parse(line));
      ({ labels: labelMap, reviewers } = humanLabels(queries, labels, key, await read(human[0]), await read(human[1])));
      labelSource = "human-two-reviewers";
    } else {
      labelMap = agentLabels(queries, labels, corpus);
      labelSource = "agent-judged-provisional";
    }
    const engineSha256 = createHash("sha256").update(await readFile(new URL("../src/partner-matcher.ts", import.meta.url)))
      .update(await readFile(new URL("../src/partner-concepts.ts", import.meta.url))).digest("hex");
    const paths = Object.fromEntries(["full-corpus", "retrieval"].map(path => {
      const candidate = evaluateReal(corpus, queries, labelMap, true, path);
      return [path, { baseline: evaluateReal(corpus, queries, labelMap, false, path), improved: candidate,
        gates: gatesReal(queries.thresholds, candidate) }];
    }));
    const count = (field, value) => queries.queries.filter(query => query[field] === value).length;
    const report = { dataset: "partner-real-v1", labelSource, reviewers, fixtureSha256: hashes, baselineSha256: baselineHash, engineSha256,
      engineVersion: PARTNER_ENGINE_VERSION, conceptVersion: PARTNER_CONCEPT_VERSION, node: process.version, scoring: { ...SCORING, appWindow: APP_WINDOW },
      thresholds: queries.thresholds, source: corpus.source, exclusions: corpus.exclusions,
      counts: { projects: corpus.projects.length, queries: queries.queries.length,
        byDirection: { need: count("direction", "need"), offer: count("direction", "offer") },
        byLanguage: Object.fromEntries(LANGUAGES.map(language => [language, count("language", language)])),
        byEvidenceType: Object.fromEntries(EVIDENCE_TYPES.map(type => [type, count("evidenceType", type)])),
        labels: agreement(labelMap) },
      limits: LIMITS, paths };
    const output = argument("--output");
    if (output) await writeFile(output[0], JSON.stringify(report, null, 1) + "\n", { flag: "wx" });
    console.log(JSON.stringify(Object.fromEntries(Object.entries(paths).map(([path, value]) => [path, {
      baseline: value.baseline.summary, improved: value.improved.summary, gates: value.gates.precisionPerDomainDirection.groups }])), null, 1));
  }
}
