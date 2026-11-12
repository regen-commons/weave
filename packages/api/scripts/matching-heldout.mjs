import { createHash, randomUUID } from "node:crypto";
import { readFile, realpath, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { rankPartnerMatches as baseline, partnerLexicalText } from "../evaluation/lexical-v1.ts";
import { rankPartnerMatches as improved, PARTNER_ENGINE_VERSION } from "../src/partner-matcher.ts";
import { expandPartnerText, PARTNER_CONCEPT_VERSION } from "../src/partner-concepts.ts";

const root = new URL("../evaluation/", import.meta.url);
const normalize = text => text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const nonempty = value => typeof value === "string" && value.trim().length > 0;
export function validateEvaluation(data) {
  if (!data || typeof data !== "object" || !Array.isArray(data.projects) || !Array.isArray(data.queries)
    || !data.projects.length || !data.queries.length)
    throw Error("invalid_evaluation_dataset");
  const ids = new Set(), families = new Map(), texts = new Map();
  for (const [rows, field] of [[data.projects, "passage"], [data.queries, "title"]]) {
    for (const row of rows) {
      if (!row || typeof row !== "object" || Array.isArray(row) || !nonempty(row.id)
        || ids.has(row.id) || !nonempty(row.family)
        || !["development", "holdout"].includes(row.split)) throw Error("invalid_evaluation_identity");
      if (!["art", "software", "research", "place"].includes(row.domain)) throw Error("invalid_evaluation_domain");
      if (!nonempty(row[field]) || !normalize(row[field])) throw Error("invalid_evaluation_text");
      ids.add(row.id);
      // Check exactly the source field used for scoring; a display title cannot hide a duplicate passage.
      const text = normalize(row[field]);
      if (families.has(row.family) && families.get(row.family) !== row.split
        || texts.has(text) && texts.get(text) !== row.split) throw Error("split_leakage");
      families.set(row.family, row.split);
      texts.set(text, row.split);
    }
  }
  const projects = new Map(data.projects.map(project => [project.id, project]));
  for (const query of data.queries) {
    if (!["need", "offer"].includes(query.kind) || !Array.isArray(query.relevant)
      || new Set(query.relevant).size !== query.relevant.length) throw Error("invalid_judgment");
    for (const id of query.relevant) {
      const project = projects.get(id);
      if (!project || project.split !== query.split || project.family !== query.family) throw Error("invalid_judgment");
    }
  }
  return data;
}
export async function loadEvaluation() {
  const baselineHash = createHash("sha256").update(await readFile(new URL("lexical-v1.ts", root))).digest("hex");
  if (baselineHash !== (await readFile(new URL("lexical-v1.sha256", root), "utf8")).trim()) throw Error("evaluation_baseline_changed");
  const bytes = await readFile(new URL("matching-v2.json", root));
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== (await readFile(new URL("matching-v2.sha256", root), "utf8")).trim()) throw Error("evaluation_fixture_changed");
  return { data: validateEvaluation(JSON.parse(bytes)), digest, baselineHash };
}
const dated = "2026-11-11T00:00:00Z";
function evidence(project) {
  const uri = `at://did:web:fixture.example/org.hypercerts.collection/${project.id}`;
  return { id: project.id, projectUri: uri, projectName: project.id, sourceUri: uri,
    sourceUrl: "https://fixture.example", cid: "fixture", contentHash: "fixture",
    fieldPath: "$.shortDescription", passage: project.passage, kind: "work",
    sourceCreatedAt: dated, sourceIndexedAt: dated, fetchedAt: dated, extractionVersion: "evaluation-v2" };
}
const mean = values => values.length ? values.reduce((a,b) => a+b, 0)/values.length : null;
const round = value => value === null ? null : Number(value.toFixed(4));
export function summarize(rows) {
  return { queries: rows.length, families: new Set(rows.map(r=>r.family)).size,
    returned: rows.reduce((n,r)=>n+r.returned,0), relevantReturned: rows.reduce((n,r)=>n+r.correct,0),
    // Empty result sets are abstentions, not perfect precision. Recall includes them as zero.
    precisionAmongReturnedAt5: round(mean(rows.filter(r=>r.precision!==null).map(r=>r.precision))),
    candidateRecallAt80: round(mean(rows.filter(r=>r.relevant).map(r=>r.candidateRecall))),
    finalRecallAt5: round(mean(rows.filter(r=>r.relevant).map(r=>r.finalRecall))),
    positiveQueryAbstentions: rows.filter(r=>r.relevant && !r.returned).length,
    noMatchQueries: rows.filter(r=>!r.relevant).length,
    noMatchFalsePositives: rows.filter(r=>r.falsePositiveNoMatch).length,
    unsupportedConfirmations: rows.filter(r=>r.unsupportedConfirmation).length,
    rankingP95Ms: round(rows.map(r=>r.durationMs).sort((a,b)=>a-b)[Math.ceil(rows.length*.95)-1] ?? null) };
}
export function evaluate(data, split, useConcepts, path = "indexed") {
  if (!["indexed", "device", "full-corpus"].includes(path)) throw Error("invalid_evaluation_path");
  const projects = data.projects.filter(project => project.split === split);
  const rank = useConcepts ? improved : baseline;
  const documents = projects.map(project => ({ project,
    terms: new Set(partnerLexicalText(useConcepts ? expandPartnerText(project.passage) : project.passage).split(" ").filter(Boolean)) }));
  const rows = data.queries.filter(query => query.split === split).map(query => {
    // Only public documents are expanded, as in the index writer. Never expand or send private queries.
    const terms = new Set(partnerLexicalText(query.title).split(" ").filter(Boolean));
    const candidates = path === "full-corpus" ? projects : path === "device" ? projects.slice(0,80)
      : documents.map(({project,terms:document}) => ({ project, score: [...document].filter(term => terms.has(term)).length }))
        .filter(row => row.score > 0).sort((a,b) => b.score-a.score || a.project.id.localeCompare(b.project.id))
        .slice(0,80).map(row => row.project);
    const entry = { initiativeId: "evaluation", entryId: query.id, revision: 1, kind: query.kind,
      summary: {}, value: { title: query.title, status: "open", placeScope: "anywhere" } };
    const start = performance.now();
    const results = rank({ queries: [entry], publicEvidence: candidates.map(evidence), limitPerEntryAndKind: 5 });
    const durationMs = performance.now()-start;
    const ids = results.map(match => match.evidence.id);
    const correct = ids.filter(id => query.relevant.includes(id)).length, relevant = query.relevant.length;
    return { id: query.id, domain: query.domain, direction: query.kind, family: query.family,
      relevant, returned: ids.length, correct, candidateRecall: relevant ? candidates.filter(p => query.relevant.includes(p.id)).length/relevant : null,
      finalRecall: relevant ? correct/relevant : null, precision: ids.length ? correct/ids.length : null,
      falsePositiveNoMatch: relevant === 0 && ids.length > 0,
      unsupportedConfirmation: results.some(m => m.evidenceKind !== (query.kind === "need" ? "inferred_capability" : "potential_use")
        || !m.unknowns.includes("availability")), results: ids, durationMs };
  });
  return { engine: useConcepts ? PARTNER_ENGINE_VERSION : "partner-lexical-v1", path, summary: summarize(rows),
    byDomainAndDirection: Object.fromEntries([...new Set(rows.map(r=>`${r.domain}/${r.direction}`))]
      .map(key => [key,summarize(rows.filter(r=>`${r.domain}/${r.direction}`===key))])), rows };
}

/** Keep the mapping separate: source IDs encode synthetic families and expected labels. */
export function reviewPairs(data, split) {
  const entries = data.queries.filter(query => query.split === split).flatMap(query => data.projects.filter(p=>p.split===split)
    .map(project => {
      const pairId = randomUUID();
      return { pair: { pairId, direction: query.kind, query: query.title,
        passage: project.passage, relevant: null, rationale: "", reviewer: "" },
      key: { pairId, queryId: query.id, projectId: project.id } };
    })).sort((a,b) => a.pair.pairId.localeCompare(b.pair.pairId));
  return { pairs: entries.map(({pair})=>pair), key: entries.map(({key})=>key) };
}

/** Preserve every failed query, including false positives with perfect recall. */
export function compactReport(report) {
  return { ...report, paths: Object.fromEntries(Object.entries(report.paths).map(([path, engines]) => [path,
    Object.fromEntries(Object.entries(engines).map(([engine, result]) => {
      const { rows, ...metadata } = result;
      return [engine, { ...metadata, misses: rows.filter(row => row.correct < row.relevant
        || row.correct < row.returned || row.unsupportedConfirmation).map(({ durationMs, ...row })=>row) }];
    })),
  ])) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argument = name => {
    const index = process.argv.indexOf(name);
    if (index < 0) return undefined;
    const value = process.argv[index+1];
    if (!value || value.startsWith("--")) throw Error(`missing_argument:${name}`);
    return value;
  };
  const split = argument("--split");
  if (!["development","holdout"].includes(split)) throw Error("choose_explicit_split");
  const worksheet = argument("--review-output"), reviewKey = argument("--review-key-output");
  if (reviewKey && !worksheet) throw Error("review_key_requires_worksheet");
  if (reviewKey) {
    const target = async file => resolve(await realpath(dirname(resolve(file))),basename(file));
    if (await target(reviewKey) === await target(worksheet)) throw Error("review_key_requires_separate_file");
  }
  const { data, digest, baselineHash } = await loadEvaluation();
  if (worksheet) {
    const { pairs, key } = reviewPairs(data,split);
    // Exclusive creation also rejects aliases/symlinks to the worksheet and preserves older review keys.
    if (reviewKey) await writeFile(reviewKey, key.map(row=>JSON.stringify(row)).join("\n")+"\n", { flag: "wx" });
    await writeFile(worksheet, pairs.map(row=>JSON.stringify(row)).join("\n")+"\n");
    console.log(JSON.stringify({ fixtureSha256: digest, split, reviewPairs: pairs.length }));
  } else {
    const engineSha256 = createHash("sha256").update(await readFile(new URL("../src/partner-matcher.ts", import.meta.url)))
      .update(await readFile(new URL("../src/partner-concepts.ts", import.meta.url))).digest("hex");
    const report = { fixtureSha256: digest, baselineSha256: baselineHash, engineSha256, split,
      evaluationStatus: split === "holdout" ? "reviewed-holdout-regression" : "development-regression",
      annotationStatus: data.annotationStatus,
      conceptVersion: PARTNER_CONCEPT_VERSION, queryCount: data.queries.length, projectCount: data.projects.length,
      limits: ["Synthetic agent-authored judgments; not blind or human validated.",
        "Vocabulary and fixture author are shared; scores are regression evidence, not unbiased quality estimates.",
        "Template variants are correlated; families are the sampling unit.",
        "Indexed retrieval simulates token overlap, not PostgreSQL ranking. It assumes a refreshed public index.",
        "Device path uses the first 80 fixture projects, not a representative production snapshot.",
        "No network, model inference, database, real-user or hosted validation; timings cover ranking only.",
        ...(split === "holdout" ? ["This holdout has already been reviewed; reruns are regression evidence, not independent held-out validation."] : [])],
      paths: Object.fromEntries(["indexed","device","full-corpus"].map(path => [path, {
        baseline: evaluate(data,split,false,path), improved: evaluate(data,split,true,path) }])) };
    const output = argument("--output");
    const recorded = process.argv.includes("--compact") ? compactReport(report) : report;
    if (output) await writeFile(output,JSON.stringify(recorded,null,2)+"\n");
    console.log(JSON.stringify(process.argv.includes("--compact") ? recorded : { ...report, paths: Object.fromEntries(Object.entries(report.paths).map(([path,value]) => [path, {
      baseline:value.baseline.summary,improved:value.improved.summary,
      byDomainAndDirection:value.improved.byDomainAndDirection }])) },null,2));
  }
}
