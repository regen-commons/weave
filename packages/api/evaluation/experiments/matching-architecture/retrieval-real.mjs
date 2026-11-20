// This experiment's retrieval options, run once and untuned on the real-project set partner-real-v1.
// Reads frozen fixtures and production modules; nothing imports this file.
//
//   node packages/api/evaluation/experiments/matching-architecture/retrieval-real.mjs [--offline] [--output <file>]
//
// Settings, fixed and committed before the first scored run on partner-real-v1, 19 November 2026:
// 1. Engines. The current matcher (partner-concepts-v2), exactly as scripts/matching-real.mjs runs it on the full
//    corpus. Then three rows of reports/2026-11-19.md: multilingual MiniLM-L12 "keywords with veto" and "meaning
//    only", and multilingual-e5-small "with veto". Each model also gets one diagnostic row with no threshold, its
//    five most similar projects for every query, which shows ranking alone and is not an engine to ship.
// 2. Cut-offs. Each model's relative (z-score) threshold and keyword veto from reports/2026-11-19-retrieval.json,
//    chosen there on v2 development: MiniLM-L12 z >= 2.9 with keywords vetoed below z 2.02; e5-small z >= 2.1
//    with keywords vetoed below z 1.77. They are recomputed from v2 development here, and the run stops before
//    scoring if either the committed report or the recomputation differs. Nothing is chosen on this set.
// 3. Candidates. One per project; every project is allowed, since all are public work. Its text is its passages,
//    one clause each, through the experiment's assertedText. The project name is not used, as production does
//    not use it.
// 4. Keyword evidence. The projects the production matcher accepts over every passage, at most ten per query as
//    the experiment allows, on matching-real's date. Their first five must equal matching-real's suggestions for
//    every query, or the run stops before scoring.
// 5. Query text. Title, then description, joined as the experiment joins them, with each model's prefixes.
// 6. Ordering and the top five. The experiment's `suggest`, unchanged.
// 7. Scoring. matching-real's evaluateReal with the frozen agent labels and the full-corpus path, unchanged. Also
//    counted, as the experiment does: which evidence let in each suggestion both agents call irrelevant, over
//    positive and no-match queries.
// Changed to run at all: the experiment's candidates hold one passage and its keyword evidence is per passage.
// Projects here hold up to two passages, so points 3 and 4 apply. Nothing else differs from the experiment.
// The current matcher's results on this set had been read before this run, so every number is regression
// evidence on an examined set, not an independent result. Do not tune against it.
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { loadEvaluation } from "../../../scripts/matching-heldout.mjs";
import { agentLabels, evaluateReal, loadReal, projectEvidence, queryEntry, suggest as currentSuggestions } from "../../../scripts/matching-real.mjs";
import { PARTNER_ENGINE_VERSION, rankPartnerMatches } from "../../../src/partner-matcher.ts";
import { MODELS, createEmbedder } from "./models.mjs";
import { assertedText, chooseThreshold, chooseVeto, fromV2, prepare, suggest } from "./retrieval-eval.mjs";

/** matching-real.mjs's date; point 4 proves the two agree on every query. */
const REAL_DATE = Date.parse("2026-11-19T00:00:00Z");
/** As retrieval-eval.mjs's lexicalAccepted. */
const KEYWORD_LIMIT = 10;
export const CUT_OFFS = { "mminilm-l12": { semanticAtOrAboveZ: 2.9, vetoBelowZ: 2.02 }, "me5-small": { semanticAtOrAboveZ: 2.1, vetoBelowZ: 1.77 } };
export const ENGINES = [
  { name: "mminilm-l12-keywords-with-veto", model: "mminilm-l12", label: "multilingual MiniLM-L12, keywords with veto", engine: "hybrid", veto: true },
  { name: "mminilm-l12-meaning-only", model: "mminilm-l12", label: "multilingual MiniLM-L12, meaning only", engine: "semantic", veto: false },
  { name: "me5-small-keywords-with-veto", model: "me5-small", label: "multilingual-e5-small, keywords with veto", engine: "hybrid", veto: true },
  { name: "mminilm-l12-top-five-no-threshold", model: "mminilm-l12", label: "multilingual MiniLM-L12, five most similar, no threshold (diagnostic)", engine: "top-five" },
  { name: "me5-small-top-five-no-threshold", model: "me5-small", label: "multilingual-e5-small, five most similar, no threshold (diagnostic)", engine: "top-five" },
];
const LIMITS = [
  "Labels are the frozen agent labels: per domain, the author agent and a separate judge agent. No person has judged these pairs. The agents disagreed on 271 pairs, against 276 they agreed were relevant.",
  "This set had been examined before this run: the current matcher's results and misses were read on 19 November 2026. Every number here is regression evidence on an examined set, not an independent result.",
  "The corpus is 140 public projects with at most two passages of at most 600 characters each, mostly English land and ecology work, with thirteen Spanish projects and one Portuguese.",
  "Every candidate is public work. Shared needs and offers, the device's 80-project snapshot, PostgreSQL ranking and phone performance are not exercised.",
  "The cut-offs come from the synthetic v2 development split and were not changed. Nothing here is grounds for choosing a threshold or shipping a model.",
  "Language groups are small: 93 English, 23 Spanish and 19 Portuguese positive queries, and the no-match queries are 7 English and 1 Portuguese.",
];
const KEPT = ["positiveQueries", "noMatchQueries", "unresolvedQueries", "suggestionsAt5", "unresolvedSuggestionsAt5", "relevantSuggestionsAt5",
  "relevantAmongReturnedAt5", "relevantAmongReturnedAt3", "finalRecallAt5", "positiveQueriesWithARelevantSuggestion",
  "positiveQueryAbstentions", "noMatchFalsePositives", "decoySuggestions"];
const brief = summary => Object.fromEntries(KEPT.map(key => [key, summary[key]]));
const briefGroups = groups => Object.fromEntries(Object.entries(groups).map(([name, summary]) => [name, brief(summary)]));

/** The real set in the experiment's dataset shape: point 3 for candidates, point 5 for queries. */
export function realDataset(corpus, queries) {
  return { name: "partner-real-v1",
    candidates: corpus.projects.map(project => ({ id: project.id, cls: "public", kind: "work", text: project.passages.join("\n") })),
    queries: queries.queries.map(query => ({ id: query.id, direction: query.direction, language: query.language, evidenceType: query.evidenceType,
      title: query.title, description: query.description, text: [query.title, query.description].filter(Boolean).join(". ") })) };
}

/** Point 4: the projects the production matcher accepts for each query, best first, checked against matching-real. */
export function keywordEvidence(corpus, queries) {
  const evidence = corpus.projects.flatMap(projectEvidence);
  const byUri = new Map(corpus.projects.map(project => [project.uri, project.id]));
  return new Map(queries.queries.map(query => {
    const ids = rankPartnerMatches({ queries: [queryEntry(query)], publicEvidence: evidence, limitPerEntryAndKind: KEYWORD_LIMIT, now: REAL_DATE })
      .map(match => byUri.get(match.evidence.projectUri));
    if (!isDeepStrictEqual(ids.slice(0, 5), currentSuggestions(corpus, query, true).ids)) throw Error(`keyword_evidence_differs:${query.id}`);
    return [query.id, ids];
  }));
}

function picksFor(rows, spec, cutOff) {
  const pick = row => spec.engine === "top-five" ? suggest(row, "semantic", -Infinity, "cosine")
    : suggest(row, spec.engine, cutOff.semanticAtOrAboveZ, "relative", spec.veto ? cutOff.vetoBelowZ : null);
  return new Map(rows.map(row => [row.query.id, pick(row)]));
}

/** Scores ordered picks with matching-real's definitions, and counts which evidence let in each irrelevant suggestion. */
function scoreWith(context, picks) {
  const { corpus, queries, labelMap, everyProject } = context;
  const result = evaluateReal(corpus, queries, labelMap, true, "full-corpus",
    (_, query) => ({ pool: everyProject, matches: [], ids: picks.get(query.id).map(pick => pick.id) }));
  const wrongSuggestionsByEvidence = { lexicalOnly: 0, semanticOnly: 0, both: 0 };
  for (const row of result.rows.filter(row => row.class !== "unresolved")) {
    const path = new Map(picks.get(row.id).map(pick => [pick.id, pick.path]));
    for (const id of row.notRelevant) wrongSuggestionsByEvidence[path.get(id)]++;
  }
  return { ...brief(result.summary), wrongSuggestionsByEvidence, byLanguage: briefGroups(result.byLanguage),
    byDirection: briefGroups(result.byDirection), byEvidenceType: briefGroups(result.byEvidenceType),
    rows: result.rows.map(row => ({ id: row.id, class: row.class, suggestions: row.results })) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const flag = name => { const index = process.argv.indexOf(name); return index > 0 ? process.argv[index + 1] : null; };
  const offline = process.argv.includes("--offline");
  const here = new URL("./", import.meta.url);
  const committed = {
    experiment: JSON.parse(await readFile(new URL("reports/2026-11-19-retrieval.json", here), "utf8")),
    real: JSON.parse(await readFile(new URL("../../reports/2026-11-19-partner-real-v1-agent.json", here), "utf8")),
  };
  for (const [key, cutOff] of Object.entries(CUT_OFFS)) {
    const recorded = committed.experiment.models[key].semanticVeto;
    if (recorded.semanticAtOrAboveZ !== cutOff.semanticAtOrAboveZ || recorded.vetoBelowZ !== cutOff.vetoBelowZ) throw Error(`cut_offs_not_committed:${key}`);
  }

  const { corpus, queries, labels, hashes } = await loadReal();
  const labelMap = agentLabels(queries, labels, corpus);
  const context = { corpus, queries, labelMap, everyProject: new Set(corpus.projects.map(project => project.id)) };
  const real = realDataset(corpus, queries);
  const keywords = keywordEvidence(corpus, queries);
  const development = fromV2((await loadEvaluation()).data, "development");

  // Point 1: the current matcher must reproduce the committed real-set report before anything else is scored.
  const current = evaluateReal(corpus, queries, labelMap, true, "full-corpus");
  if (!isDeepStrictEqual(current.summary, committed.real.paths["full-corpus"].improved.summary)) throw Error("current_matcher_differs_from_committed_report");
  const currentPicks = new Map(current.rows.map(row => [row.id, row.results.map(id => ({ id, path: "lexicalOnly" }))]));

  const models = {}, prepared = {};
  for (const key of Object.keys(CUT_OFFS)) {
    const embedder = await createEmbedder(key, { offline });
    const developmentRows = await prepare(development, embedder);
    const recomputed = { semanticAtOrAboveZ: chooseThreshold(developmentRows, "relative").threshold, vetoBelowZ: chooseVeto(developmentRows) };
    if (!isDeepStrictEqual(recomputed, CUT_OFFS[key])) {
      await embedder.close();
      throw Error(`cut_offs_differ_on_v2_development:${key}:${JSON.stringify(recomputed)}`);
    }
    prepared[key] = await prepare(real, embedder, query => keywords.get(query.id));
    await embedder.close();
    const spec = MODELS[key];
    models[key] = { id: spec.id, revision: spec.revision, dtype: spec.dtype, dimensions: spec.dimensions, languages: spec.languages,
      licence: spec.licence, cutOffs: CUT_OFFS[key], cutOffsRecomputedOnV2Development: true };
  }

  const engines = { current: { label: `Current matcher (${PARTNER_ENGINE_VERSION})`, model: null, ...scoreWith(context, currentPicks) } };
  for (const spec of ENGINES) engines[spec.name] = { label: spec.label, model: spec.model, ...scoreWith(context, picksFor(prepared[spec.model], spec, CUT_OFFS[spec.model])) };

  const report = {
    reportDate: "2026-11-19", dataset: "partner-real-v1", labelSource: "agent-judged-provisional",
    status: "one untuned run of the experiment's retrieval options on an examined set; regression evidence, agent labels only",
    fixtureSha256: hashes, engineVersion: PARTNER_ENGINE_VERSION, node: process.version,
    settings: { cutOffsFrom: "experiments/matching-architecture/reports/2026-11-19-retrieval.json (v2 development)", keywordEvidenceLimit: KEYWORD_LIMIT,
      keywordEvidenceDate: new Date(REAL_DATE).toISOString(), candidates: "one per project; passages as clauses through assertedText; name not used",
      scoring: "scripts/matching-real.mjs evaluateReal, full-corpus path, frozen agent labels" },
    models,
    counts: { projects: corpus.projects.length, projectsWithNoAssertedText: real.candidates.filter(candidate => !assertedText(candidate)).length,
      queries: queries.queries.length, positiveQueries: current.summary.positiveQueries, noMatchQueries: current.summary.noMatchQueries,
      unresolvedQueries: current.summary.unresolvedQueries },
    engines, limits: LIMITS,
  };
  const output = flag("--output");
  if (output) await writeFile(output, JSON.stringify(report, null, 1) + "\n", { flag: "wx" });

  const percent = value => value === null ? "n/a" : `${Math.round(value * 100)}%`;
  const line = (name, s) => `${name.padEnd(72)} relevant ${`${s.relevantSuggestionsAt5}/${s.suggestionsAt5 - s.unresolvedSuggestionsAt5}`.padEnd(8)} ${percent(s.relevantAmongReturnedAt5).padEnd(5)} recall ${percent(s.finalRecallAt5).padEnd(5)} silent ${String(s.positiveQueryAbstentions).padEnd(4)} no-match hits ${s.noMatchFalsePositives}/${s.noMatchQueries}`;
  console.log(`partner-real-v1, ${report.counts.positiveQueries} positive and ${report.counts.noMatchQueries} no-match queries, agent labels`);
  for (const value of Object.values(engines)) {
    console.log(line(value.label, value));
    for (const [language, s] of Object.entries(value.byLanguage)) console.log(line(`  ${language}, ${s.positiveQueries} positive`, s));
  }
}
