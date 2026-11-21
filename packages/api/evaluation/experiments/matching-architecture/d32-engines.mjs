// The engines the partner-real-v2 holdout compares for D32, and the run that sets their cut-offs on development
// data. See ../../partner-real-v2-plan.md. Nothing in the app, the API or the live site imports this file.
//
//   node packages/api/evaluation/experiments/matching-architecture/d32-engines.mjs --fetch
//       downloads the pinned upstream model files into .cache/ and verifies them; nothing else
//   node packages/api/evaluation/experiments/matching-architecture/d32-engines.mjs [--offline] [--output <report.json>] [--write-manifest]
//       sets the cut-offs and, with --write-manifest, writes ../../partner-real-v2-engines.json
//   node packages/api/evaluation/experiments/matching-architecture/d32-engines.mjs --verify
//       checks the committed manifest against the code, model pins and lockfile on disk
//
// Engines, as the plan names them:
// 1. The current matcher (partner-concepts-v2): production's ranking over every passage, top five.
// 2. Multilingual MiniLM-L12 with keyword veto, and 3. multilingual-e5-small with keyword veto. Both load
//    upstream's own 8-bit files, pinned and hashed in models.mjs, and otherwise run exactly as retrieval-real.mjs
//    ran them on 19 November 2026: the same candidates, query text, keyword evidence, ordering and top five.
//
// Cut-off rule, written down in the plan and committed here before the first run with these model files:
// 1. Development data is partner-real-v1 with its frozen agent labels, scored on the full-corpus path with
//    matching-real's definitions, as retrieval-real.mjs scores it.
// 2. For each model, every pair of cut-offs on a grid: semantic z threshold from 0.0 to 6.0 and keyword veto z
//    from -2.0 to 4.0, both in steps of 0.1.
// 3. Keep the pairs whose recall at five is no lower than the current matcher's on the same data.
// 4. Choose the highest share of relevant suggestions among the top five. Ties go to higher recall at five, then
//    fewer no-match queries with a suggestion, then the lower semantic threshold, then the lower veto.
// 5. If no pair qualifies, the engine gets no cut-offs and does not go forward.
// Shown beside the choice and choosing nothing: v2 development scores at the chosen cut-offs, and the cut-offs
// the 19 November rule picks on v2 development with these files.
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { loadEvaluation } from "../../../scripts/matching-heldout.mjs";
import { agentLabels, evaluateReal, loadReal, projectEvidence, queryEntry } from "../../../scripts/matching-real.mjs";
import { PARTNER_CONCEPT_VERSION } from "../../../src/partner-concepts.ts";
import { PARTNER_ENGINE_VERSION, rankPartnerMatches } from "../../../src/partner-matcher.ts";
import { MODELS, createEmbedder, fetchUpstream } from "./models.mjs";
import { chooseThreshold, chooseVeto, fromV2, prepare, score, suggest } from "./retrieval-eval.mjs";
import { realDataset } from "./retrieval-real.mjs";

const root = new URL("../../../../../", import.meta.url);
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
export const MANIFEST = "packages/api/evaluation/partner-real-v2-engines.json";

/** The spec's window, and how many projects the keyword evidence may hold per query, as retrieval-real.mjs. */
export const WINDOW = 5;
export const KEYWORD_LIMIT = 10;
export const CURRENT = { name: "current", label: `Current matcher (${PARTNER_ENGINE_VERSION})` };
export const MODEL_ENGINES = [
  { name: "mminilm-l12-keywords-with-veto", model: "mminilm-l12-upstream", label: "multilingual MiniLM-L12, keywords with veto" },
  { name: "me5-small-keywords-with-veto", model: "me5-small-upstream", label: "multilingual-e5-small, keywords with veto" },
];
/** Every file the engines run or score with. The v2 runner refuses to score if any differs from the manifest. */
export const CODE_FILES = [
  "packages/api/evaluation/experiments/matching-architecture/d32-engines.mjs",
  "packages/api/evaluation/experiments/matching-architecture/models.mjs",
  "packages/api/evaluation/experiments/matching-architecture/retrieval-eval.mjs",
  "packages/api/evaluation/experiments/matching-architecture/retrieval-real.mjs",
  "packages/api/src/partner-matcher.ts",
  "packages/api/src/partner-concepts.ts",
  "packages/api/scripts/matching-real.mjs",
  "packages/api/scripts/matching-v3.mjs",
  "dist/semantic-config.mjs",
];
const tenths = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => Number(((from + i) / 10).toFixed(1)));
export const GRID = { semanticAtOrAboveZ: tenths(0, 60), vetoBelowZ: tenths(-20, 40) };
export const CUT_OFF_RULE = "On partner-real-v1 with agent labels, full-corpus path: the highest share of relevant suggestions among the "
  + "top five, with recall at five no lower than the current matcher's. Ties: higher recall, fewer no-match queries with a "
  + "suggestion, lower semantic threshold, lower veto. Grid: semantic z 0.0 to 6.0, veto z -2.0 to 4.0, steps of 0.1.";

/** Each query's keyword evidence: the projects the production matcher accepts over every passage, best first. */
export function keywordEvidence(projects, queries, now) {
  const evidence = projects.flatMap(projectEvidence);
  const byUri = new Map(projects.map(project => [project.uri, project.id]));
  return new Map(queries.map(query => [query.id,
    rankPartnerMatches({ queries: [queryEntry(query)], publicEvidence: evidence, limitPerEntryAndKind: KEYWORD_LIMIT, now })
      .map(match => byUri.get(match.evidence.projectUri))]));
}

/** Engine 1: production's own top five over every passage. */
export function currentPicks(projects, queries, now) {
  const evidence = projects.flatMap(projectEvidence);
  const byUri = new Map(projects.map(project => [project.uri, project.id]));
  return new Map(queries.map(query => [query.id,
    rankPartnerMatches({ queries: [queryEntry(query)], publicEvidence: evidence, limitPerEntryAndKind: WINDOW, now })
      .slice(0, WINDOW).map(match => ({ id: byUri.get(match.evidence.projectUri), path: "lexicalOnly" }))]));
}

/** Embeds every project and query once for one model; rows feed `modelPicks` at any cut-offs. */
export async function prepareModel(projects, queries, embedder, keywords) {
  return prepare(realDataset({ projects }, { queries }), embedder, query => keywords.get(query.id));
}

/** Engines 2 and 3: a model's top five at its cut-offs. */
export const modelPicks = (rows, cutOffs) => new Map(rows.map(row => [row.query.id,
  suggest(row, "hybrid", cutOffs.semanticAtOrAboveZ, "relative", cutOffs.vetoBelowZ)]));

/** Points 3 to 5 of the rule, over a sweep of { semanticAtOrAboveZ, vetoBelowZ, relevantAmongReturnedAt5, finalRecallAt5, noMatchFalsePositives }. */
export function chooseCutOffs(sweep, recallFloor) {
  const qualifying = sweep.filter(point => point.relevantAmongReturnedAt5 !== null && point.finalRecallAt5 !== null
    && point.finalRecallAt5 >= recallFloor);
  qualifying.sort((a, b) => b.relevantAmongReturnedAt5 - a.relevantAmongReturnedAt5 || b.finalRecallAt5 - a.finalRecallAt5
    || a.noMatchFalsePositives - b.noMatchFalsePositives || a.semanticAtOrAboveZ - b.semanticAtOrAboveZ || a.vetoBelowZ - b.vetoBelowZ);
  const best = qualifying[0];
  return best ? { semanticAtOrAboveZ: best.semanticAtOrAboveZ, vetoBelowZ: best.vetoBelowZ } : null;
}

const KEPT = ["positiveQueries", "noMatchQueries", "unresolvedQueries", "suggestionsAt5", "unresolvedSuggestionsAt5", "relevantSuggestionsAt5",
  "relevantAmongReturnedAt5", "relevantAmongReturnedAt3", "finalRecallAt5", "positiveQueriesWithARelevantSuggestion",
  "positiveQueryAbstentions", "noMatchFalsePositives", "decoySuggestions"];
const brief = summary => Object.fromEntries(KEPT.map(key => [key, summary[key]]));
const scoreOnV1 = (v1, picks) => evaluateReal(v1.corpus, v1.queries, v1.labelMap, true, "full-corpus",
  (_, query) => ({ pool: v1.everyProject, matches: [], ids: picks.get(query.id).map(pick => pick.id) }));

/** Points 2 to 5 for one model's prepared v1 rows. */
export function setCutOffs(v1, rows, recallFloor) {
  const sweep = [];
  for (const semanticAtOrAboveZ of GRID.semanticAtOrAboveZ) for (const vetoBelowZ of GRID.vetoBelowZ) {
    const summary = scoreOnV1(v1, modelPicks(rows, { semanticAtOrAboveZ, vetoBelowZ })).summary;
    sweep.push({ semanticAtOrAboveZ, vetoBelowZ, relevantAmongReturnedAt5: summary.relevantAmongReturnedAt5,
      finalRecallAt5: summary.finalRecallAt5, noMatchFalsePositives: summary.noMatchFalsePositives });
  }
  return { cutOffs: chooseCutOffs(sweep, recallFloor), pairsTried: sweep.length,
    pairsMeetingRecallFloor: sweep.filter(point => point.finalRecallAt5 !== null && point.finalRecallAt5 >= recallFloor).length };
}

async function codeHashes() {
  return Object.fromEntries(await Promise.all(CODE_FILES.map(async path => [path, sha256(await readFile(new URL(path, root)))])));
}
async function runtime() {
  const transformers = JSON.parse(await readFile(new URL("node_modules/@huggingface/transformers/package.json", root), "utf8"));
  return { "@huggingface/transformers": transformers.version, "onnxruntime-node": transformers.dependencies["onnxruntime-node"],
    "bun.lock": sha256(await readFile(new URL("bun.lock", root))), node: process.version.split(".")[0] };
}
const modelPin = key => { const spec = MODELS[key];
  return { id: spec.id, revision: spec.revision, modelFileName: spec.modelFileName, licence: spec.licence, queryPrefix: spec.queryPrefix,
    passagePrefix: spec.passagePrefix, pooling: "mean, then unit length", files: spec.files }; };

export async function buildManifest(cutOffs, frozenOn) {
  return {
    name: "partner-real-v2 engines",
    status: "Frozen before any partner-real-v2 query was written. The v2 runner scores only with these engines and refuses to score if any hash differs.",
    frozenOn, plan: "packages/api/evaluation/partner-real-v2-plan.md",
    engines: [
      { name: CURRENT.name, label: CURRENT.label, engineVersion: PARTNER_ENGINE_VERSION, conceptVersion: PARTNER_CONCEPT_VERSION },
      ...MODEL_ENGINES.map(engine => ({ name: engine.name, label: engine.label, model: engine.model, cutOffs: cutOffs[engine.model],
        cutOffRule: CUT_OFF_RULE })),
    ],
    settings: { window: WINDOW, keywordEvidenceLimit: KEYWORD_LIMIT,
      keywordEvidenceDate: "the date the partner-real-v2 corpus is frozen, as matching-real.mjs uses partner-real-v1's",
      candidates: "one per project; its passages joined as clauses through retrieval-eval.mjs assertedText; the name is not used",
      queryText: "title, then description, joined as retrieval-real.mjs realDataset joins them, with each model's prefix",
      ordering: "retrieval-eval.mjs suggest, engine hybrid, relative (z-score) threshold, keyword veto" },
    models: Object.fromEntries(MODEL_ENGINES.map(engine => [engine.model, modelPin(engine.model)])),
    code: await codeHashes(),
    runtime: await runtime(),
  };
}

/** Differences between the committed manifest and what is on disk now; empty when they agree. */
export async function verifyManifest() {
  const manifest = JSON.parse(await readFile(new URL(MANIFEST, root), "utf8"));
  const differences = [];
  const code = await codeHashes();
  for (const path of new Set([...Object.keys(manifest.code), ...CODE_FILES])) if (manifest.code[path] !== code[path]) differences.push(`code:${path}`);
  for (const engine of MODEL_ENGINES) if (!isDeepStrictEqual(manifest.models[engine.model], modelPin(engine.model))) differences.push(`model:${engine.model}`);
  const now = await runtime();
  for (const [name, value] of Object.entries(now)) if (manifest.runtime[name] !== value) differences.push(`runtime:${name}`);
  return { manifest, differences };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const flag = name => { const index = process.argv.indexOf(name); return index > 0 ? process.argv[index + 1] : null; };
  const offline = process.argv.includes("--offline");
  if (process.argv.includes("--fetch")) {
    for (const engine of MODEL_ENGINES) console.log(`${engine.model}: verified in ${await fetchUpstream(engine.model)}`);
    process.exit(0);
  }
  if (process.argv.includes("--verify")) {
    const { differences } = await verifyManifest();
    if (differences.length) { console.error(`Manifest differs: ${differences.join(", ")}`); process.exit(1); }
    console.log("Manifest matches the code, model pins and lockfile on disk.");
    process.exit(0);
  }

  // Point 1: partner-real-v1 as development data, with the date matching-real.mjs scores it on.
  const V1_DATE = Date.parse("2026-11-19T00:00:00Z");
  const { corpus, queries, labels, hashes } = await loadReal();
  const v1 = { corpus, queries, labelMap: agentLabels(queries, labels, corpus), everyProject: new Set(corpus.projects.map(project => project.id)) };
  const current = evaluateReal(corpus, queries, v1.labelMap, true, "full-corpus");
  const ownCurrent = currentPicks(corpus.projects, queries.queries, V1_DATE);
  if (!isDeepStrictEqual(current.rows.map(row => row.results), queries.queries.map(query => ownCurrent.get(query.id).map(pick => pick.id))))
    throw Error("current_engine_differs_from_matching_real");
  const recallFloor = current.summary.finalRecallAt5;
  const keywords = keywordEvidence(corpus.projects, queries.queries, V1_DATE);
  const development = fromV2((await loadEvaluation()).data, "development");

  const report = {
    reportDate: new Date().toISOString().slice(0, 10), dataset: "partner-real-v1 (development data)", labelSource: "agent-judged-provisional",
    rule: CUT_OFF_RULE, fixtureSha256: hashes, recallFloor,
    current: { label: CURRENT.label, ...brief(current.summary), byLanguage: Object.fromEntries(Object.entries(current.byLanguage).map(([k, v]) => [k, brief(v)])) },
    models: {},
  };
  const cutOffs = {};
  for (const engine of MODEL_ENGINES) {
    const embedder = await createEmbedder(engine.model, { offline });
    const rows = await prepareModel(corpus.projects, queries.queries, embedder, keywords);
    const developmentRows = await prepare(development, embedder);
    await embedder.close();
    const chosen = setCutOffs(v1, rows, recallFloor);
    cutOffs[engine.model] = chosen.cutOffs;
    const atChosen = chosen.cutOffs && scoreOnV1(v1, modelPicks(rows, chosen.cutOffs));
    const oldRule = { semanticAtOrAboveZ: chooseThreshold(developmentRows, "relative").threshold, vetoBelowZ: chooseVeto(developmentRows) };
    const oldRuleOnV1 = oldRule.semanticAtOrAboveZ !== null && oldRule.vetoBelowZ !== null
      ? brief(scoreOnV1(v1, modelPicks(rows, oldRule)).summary) : null;
    report.models[engine.model] = {
      engine: engine.name, label: engine.label, model: modelPin(engine.model), timing: embedder.timing(),
      cutOffs: chosen.cutOffs, pairsTried: chosen.pairsTried, pairsMeetingRecallFloor: chosen.pairsMeetingRecallFloor,
      v1AtCutOffs: atChosen && { ...brief(atChosen.summary),
        byLanguage: Object.fromEntries(Object.entries(atChosen.byLanguage).map(([k, v]) => [k, brief(v)])) },
      v2DevelopmentAtCutOffs: chosen.cutOffs && score(developmentRows, "hybrid", chosen.cutOffs.semanticAtOrAboveZ, "relative", chosen.cutOffs.vetoBelowZ).summary,
      nineteenNovemberRuleOnV2Development: { cutOffs: oldRule, v1: oldRuleOnV1 },
    };
  }

  const output = flag("--output");
  if (output) await writeFile(output, JSON.stringify(report, null, 1) + "\n", { flag: "wx" });
  if (process.argv.includes("--write-manifest")) {
    if (Object.values(cutOffs).some(value => !value)) throw Error("an_engine_has_no_cut_offs");
    await writeFile(new URL(MANIFEST, root), JSON.stringify(await buildManifest(cutOffs, report.reportDate), null, 1) + "\n", { flag: "wx" });
  }

  const percent = value => value === null || value === undefined ? "n/a" : `${Math.round(value * 100)}%`;
  const line = (name, s) => `${name.padEnd(48)} relevant ${percent(s.relevantAmongReturnedAt5).padEnd(5)} recall ${percent(s.finalRecallAt5).padEnd(5)} silent ${String(s.positiveQueryAbstentions).padEnd(4)} no-match hits ${s.noMatchFalsePositives}/${s.noMatchQueries}`;
  console.log(`partner-real-v1 as development data, agent labels; recall floor ${recallFloor}`);
  console.log(line(CURRENT.label, report.current));
  for (const value of Object.values(report.models)) {
    console.log(`${value.label}: cut-offs ${JSON.stringify(value.cutOffs)}, ${value.pairsMeetingRecallFloor} of ${value.pairsTried} pairs meet the floor`);
    if (value.v1AtCutOffs) console.log(line("  at those cut-offs", value.v1AtCutOffs));
    if (value.nineteenNovemberRuleOnV2Development.v1) console.log(line(`  19 Nov rule ${JSON.stringify(value.nineteenNovemberRuleOnV2Development.cutOffs)}`, value.nineteenNovemberRuleOnV2Development.v1));
  }
}
