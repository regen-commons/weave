// Offline retrieval comparison for the matching-architecture proposal (question 3).
// Compares the production partner matcher with hybrid variants on the frozen fixtures.
// Reads fixtures and production modules; nothing imports this file.
//
//   node packages/api/evaluation/experiments/matching-architecture/retrieval-eval.mjs \
//     [--models mxbai-xsmall-en,me5-small,mminilm-l12] [--offline] [--output <file>]
//
// Method, fixed before the first scored run:
// 1. Gate. A need may be served by a shared offer, public work or a published offer; an offer by
//    a shared need, public work or a published request. Negated clauses are dropped, and so are
//    requests inside text offered as experience (the production matcher's clause rules, copied).
// 2. Retrieve. Lexical evidence is whatever the production matcher accepts. Semantic evidence is
//    cosine similarity of the query and the candidate's remaining text at or above a threshold.
// 3. The threshold for each model is chosen on the v2 development split only: the lowest value
//    at which semantic-only suggestions there are at least 80% relevant (the spec's target) and no
//    no-match query gets a suggestion. It is then applied unchanged to the v3 holdout.
// 4. Order. Evidence class first (shared, then published, then inferred), as production does,
//    then reciprocal rank fusion of the lexical and semantic ranks. Top five.
// 5. Added after the first scored run, and reported as such: a relative threshold. Raw cosine
//    scales differ by model, so this variant asks how far a candidate stands above the other
//    allowed candidates for the same query (a z-score). Its cut-off also comes from v2 development.
// 6. Also added after the first scored run: a semantic veto. Keyword evidence is kept only when the
//    candidate's z-score is at least the 5th percentile of the z-scores of correct keyword
//    suggestions on v2 development. Semantic evidence still qualifies on its own.
// The v3 holdout has been examined before (see ../../README.md), so its numbers are directional.
import { writeFile } from "node:fs/promises";
import { loadEvaluation } from "../../../scripts/matching-heldout.mjs";
import { evaluateV3, loadMatchingV3, projectEvidence, sharedEntry } from "../../../scripts/matching-v3.mjs";
import { expandPartnerText } from "../../../src/partner-concepts.ts";
import { PARTNER_ENGINE_VERSION, partnerLexicalText, rankPartnerMatches } from "../../../src/partner-matcher.ts";
import { MODELS, cosine, createEmbedder } from "./models.mjs";

const NOW = Date.parse("2026-11-16T00:00:00Z");
const WINDOW = 5;
const RRF_K = 60;
export const PRECISION_TARGET = 0.8;

// Copied from partner-matcher.ts, which does not export them. English only, like production.
const negative = /\b(?:not|never|without|unable to|cannot|can['’]t|do(?:es)? not|don['’]t|doesn['’]t|no longer|used to|discontinued|unavailable|was offered|previously offered)\b/iu;
const noTopic = /\bno\s+(?!later\b|more than\b|less than\b)/iu;
const aspiration = /\b(?:need(?:s|ed|ing)?|seek(?:s|ing)?|request(?:s|ing)?|look(?:s|ing)? for|want(?:s|ed)?|hope(?:s|d)?|plan(?:s|ning)? to|aim(?:s|ing)? to|intend(?:s|ed)? to|would like|will need|lack(?:s|ing)?|wish(?:es)? to)\b/iu;
const clauses = text => text.split(/[.!?;\n]+|\b(?:but|however|although)\b(?=\s+(?:we|i|they|it)\s+\p{L})/iu).map(part => part.trim()).filter(Boolean);

/** Layer 1: which candidate kinds may answer a query at all. */
export const allowed = (direction, candidate) => candidate.cls === "shared" ? candidate.kind !== direction
  : candidate.kind === "work" || candidate.kind === (direction === "need" ? "published_offer" : "published_request");
const rejectsRequests = candidate => candidate.cls === "shared" ? candidate.kind === "offer" : candidate.kind !== "published_request";
/** The part of a candidate's text that asserts something it does or has. */
export const assertedText = candidate => clauses(candidate.text)
  .filter(clause => !negative.test(clause) && !noTopic.test(clause) && !(rejectsRequests(candidate) && aspiration.test(clause))).join(". ");
const classOrder = candidate => candidate.cls === "shared" ? 0 : candidate.kind === "work" ? 2 : 1;

const queryEntry = query => ({ initiativeId: "evaluation-initiative", entryId: query.id, revision: 1, kind: query.direction,
  value: { title: query.title, description: query.description || null, status: "open", placeScope: "anywhere" }, summary: {} });

export function fromV3(data, judgments = "agreed") {
  const candidates = [
    ...data.projects.map(project => ({ id: project.id, domain: project.domain, language: project.language, cls: "public",
      kind: project.evidenceKind, text: project.passage, evidence: projectEvidence(project) })),
    ...data.shared.map(entry => ({ id: entry.id, domain: entry.domain, language: entry.language, cls: "shared",
      kind: entry.kind, text: `${entry.title}. ${entry.description}`, entry: sharedEntry(entry) })),
  ];
  const queries = data.queries.filter(query => query.judgment === judgments).map(query => ({
    id: query.id, domain: query.domain, direction: query.direction, language: query.language, evidenceType: query.evidenceType,
    title: query.title, description: query.description, text: [query.title, query.description].filter(Boolean).join(". "),
    relevant: new Set([...query.relevantProjects, ...query.relevantShared]) }));
  return { name: `matching-v3-holdout (${judgments})`, candidates, queries };
}
export function fromV2(data, split) {
  const dated = "2026-11-11T00:00:00Z";
  const candidates = data.projects.filter(project => project.split === split).map(project => {
    const uri = `at://did:web:fixture.example/org.hypercerts.collection/${project.id}`;
    return { id: project.id, domain: project.domain, language: "en", cls: "public", kind: "work", text: project.passage,
      evidence: { id: project.id, projectUri: uri, projectName: project.id, sourceUri: uri, sourceUrl: "https://fixture.example",
        cid: "fixture", contentHash: "fixture", fieldPath: "$.shortDescription", passage: project.passage, kind: "work",
        sourceCreatedAt: dated, sourceIndexedAt: dated, fetchedAt: dated, extractionVersion: "evaluation-v2" } };
  });
  const queries = data.queries.filter(query => query.split === split).map(query => ({ id: query.id, domain: query.domain,
    direction: query.kind, language: "en", evidenceType: query.relevant.length ? "v2" : "no-match", title: query.title,
    description: null, text: query.title, relevant: new Set(query.relevant) }));
  return { name: `matching-v2 ${split}`, candidates, queries };
}

/** What production returns today: the ordered ids the lexical matcher accepts. */
export function lexicalAccepted(query, candidates) {
  const results = rankPartnerMatches({ queries: [queryEntry(query)], now: NOW, limitPerEntryAndKind: 10,
    shared: candidates.filter(c => c.cls === "shared").map(c => c.entry),
    publicEvidence: candidates.filter(c => c.cls === "public").map(c => c.evidence) });
  return results.map(match => match.evidence.type === "public" ? match.evidence.id : match.evidence.entryId);
}

function bm25(candidates) {
  const tokens = text => partnerLexicalText(text).split(" ").filter(Boolean);
  const documents = candidates.map(c => tokens(c.cls === "public" ? expandPartnerText(c.text) : c.text));
  const frequency = new Map();
  for (const document of documents) for (const term of new Set(document)) frequency.set(term, (frequency.get(term) ?? 0) + 1);
  const average = documents.reduce((n, d) => n + d.length, 0) / Math.max(1, documents.length);
  return queryText => {
    const wanted = tokens(queryText);
    return candidates.map((candidate, index) => {
      const document = documents[index];
      let score = 0;
      for (const term of wanted) {
        const tf = document.filter(t => t === term).length;
        if (!tf) continue;
        const idf = Math.log(1 + (documents.length - frequency.get(term) + 0.5) / (frequency.get(term) + 0.5));
        score += idf * tf * 2.2 / (tf + 1.2 * (0.25 + 0.75 * document.length / average));
      }
      return { id: candidate.id, score };
    });
  };
}
const rankOf = scored => new Map([...scored].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).map((row, index) => [row.id, index + 1]));

/** Embeds a dataset once. Returns, per query, the lexical and semantic evidence for every allowed candidate. */
export async function prepare(dataset, embedder) {
  const lexicalScore = bm25(dataset.candidates);
  const asserted = new Map(dataset.candidates.map(c => [c.id, assertedText(c)]));
  const vectors = new Map();
  if (embedder) for (const c of dataset.candidates) if (asserted.get(c.id)) vectors.set(c.id, await embedder.embed(asserted.get(c.id), "passage"));
  const rows = [];
  for (const query of dataset.queries) {
    const pool = dataset.candidates.filter(c => allowed(query.direction, c));
    const accepted = lexicalAccepted(query, dataset.candidates);
    const queryVector = embedder ? await embedder.embed(query.text, "query") : null;
    const keyword = new Map(lexicalScore(query.text).map(row => [row.id, row.score]));
    const scored = pool.map(candidate => ({ candidate,
      lexicalRank: accepted.indexOf(candidate.id) + 1 || null,
      keyword: keyword.get(candidate.id) ?? 0,
      cosine: queryVector && vectors.has(candidate.id) ? cosine(queryVector, vectors.get(candidate.id)) : null }));
    const values = scored.filter(c => c.cosine !== null).map(c => c.cosine);
    const average = values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
    const spread = Math.sqrt(values.reduce((n, v) => n + (v - average) ** 2, 0) / Math.max(1, values.length)) || 1;
    rows.push({ query, accepted, candidates: scored.map(c => ({ ...c, relative: c.cosine === null ? null : (c.cosine - average) / spread })) });
  }
  return rows;
}

/** engine: "current" | "semantic" | "hybrid". Returns the ordered top-five candidate ids for one query. */
export function suggest(row, engine, threshold, measure = "cosine", veto = null) {
  const semanticRank = rankOf(row.candidates.filter(c => c.cosine !== null).map(c => ({ id: c.candidate.id, score: c.cosine })));
  const lexical = c => engine !== "semantic" && Boolean(c.lexicalRank) && (veto === null || (c.relative !== null && c.relative >= veto));
  const semantic = c => engine !== "current" && c[measure] !== null && c[measure] >= threshold;
  const kept = row.candidates.filter(c => lexical(c) || semantic(c)).map(c => ({ ...c,
    path: lexical(c) && semantic(c) ? "both" : lexical(c) ? "lexicalOnly" : "semanticOnly",
    fused: (lexical(c) ? 1 / (RRF_K + c.lexicalRank) : 0) + (semantic(c) ? 1 / (RRF_K + semanticRank.get(c.candidate.id)) : 0) }));
  // "current" keeps production's own order; the others put evidence class first, then the fused rank.
  kept.sort(engine === "current" ? (a, b) => a.lexicalRank - b.lexicalRank
    : (a, b) => classOrder(a.candidate) - classOrder(b.candidate) || b.fused - a.fused || a.candidate.id.localeCompare(b.candidate.id));
  return kept.slice(0, WINDOW).map(c => ({ id: c.candidate.id, path: c.path }));
}

const ratio = (part, whole) => whole ? Number((part / whole).toFixed(4)) : null;
const mean = values => values.length ? Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(4)) : null;
function summarize(scored) {
  const positive = scored.filter(row => row.relevant);
  const returned = positive.reduce((n, row) => n + row.returned, 0), correct = positive.reduce((n, row) => n + row.correct, 0);
  return { queries: scored.length, positiveQueries: positive.length, suggestionsAt5: returned, relevantSuggestionsAt5: correct,
    relevantAmongReturnedAt5: ratio(correct, returned), finalRecallAt5: mean(positive.map(row => row.correct / row.relevant)),
    positiveQueriesWithNoSuggestion: positive.filter(row => !row.returned).length,
    noMatchQueries: scored.length - positive.length, noMatchQueriesWithSuggestion: scored.filter(row => !row.relevant && row.returned).length };
}
/** Post-hoc definitions from the evaluation README: counted over suggestions, positive queries only. */
export function score(rows, engine, threshold, measure = "cosine", veto = null) {
  const scored = rows.map(row => {
    const picks = suggest(row, engine, threshold, measure, veto), ids = picks.map(pick => pick.id);
    return { id: row.query.id, language: row.query.language, evidenceType: row.query.evidenceType, direction: row.query.direction,
      relevant: row.query.relevant.size, returned: ids.length, correct: ids.filter(id => row.query.relevant.has(id)).length, ids,
      wrong: picks.filter(pick => !row.query.relevant.has(pick.id)).map(pick => pick.path) };
  });
  // Which kind of evidence let each wrong suggestion in, over every query including no-match ones.
  const wrongSuggestionsByEvidence = Object.fromEntries(["lexicalOnly", "semanticOnly", "both"].map(path =>
    [path, scored.reduce((n, row) => n + row.wrong.filter(p => p === path).length, 0)]));
  const by = key => Object.fromEntries([...new Set(scored.map(key))].sort().map(name => [name, summarize(scored.filter(row => key(row) === name))]));
  return { summary: summarize(scored), wrongSuggestionsByEvidence, byLanguage: by(row => row.language),
    byEvidenceType: by(row => row.evidenceType), byDirection: by(row => row.direction), rows: scored };
}

/** Ranking quality with no threshold: where the first relevant candidate lands when everything allowed is ranked. */
export function rankingQuality(rows, signal) {
  const positive = rows.filter(row => row.query.relevant.size);
  const perQuery = positive.map(row => {
    // A retriever only votes for what it retrieved: candidates with no shared keyword get no keyword rank.
    const keyword = rankOf(row.candidates.filter(c => c.keyword > 0).map(c => ({ id: c.candidate.id, score: c.keyword })));
    const semantic = rankOf(row.candidates.filter(c => c.cosine !== null).map(c => ({ id: c.candidate.id, score: c.cosine })));
    const vote = (ranks, id) => ranks.has(id) ? 1 / (RRF_K + ranks.get(id)) : 0;
    const order = row.candidates.map(c => ({ id: c.candidate.id,
      score: signal === "keyword" ? c.keyword : signal === "semantic" ? (c.cosine ?? -1)
        : vote(keyword, c.candidate.id) + vote(semantic, c.candidate.id) }))
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).map(c => c.id);
    const hits = k => order.slice(0, k).filter(id => row.query.relevant.has(id)).length / row.query.relevant.size;
    const first = order.findIndex(id => row.query.relevant.has(id));
    return { language: row.query.language, evidenceType: row.query.evidenceType, recallAt5: hits(5), recallAt10: hits(10), reciprocalRank: first < 0 ? 0 : 1 / (first + 1) };
  });
  const pack = list => ({ queries: list.length, recallAt5: mean(list.map(r => r.recallAt5)), recallAt10: mean(list.map(r => r.recallAt10)), meanReciprocalRank: mean(list.map(r => r.reciprocalRank)) });
  return { ...pack(perQuery), byLanguage: Object.fromEntries(["en", "pt"].map(l => [l, pack(perQuery.filter(r => r.language === l))])),
    crossLanguage: pack(perQuery.filter(r => r.evidenceType === "cross-language")) };
}

/** The pre-registered rule in the header: lowest threshold meeting the precision target with no no-match suggestion. */
export function chooseThreshold(developmentRows, measure = "cosine") {
  const grid = measure === "cosine" ? Array.from({ length: 76 }, (_, i) => Number((0.2 + i * 0.01).toFixed(2)))
    : Array.from({ length: 61 }, (_, i) => Number((i * 0.1).toFixed(1)));
  const sweep = grid.map(threshold => ({ threshold, ...score(developmentRows, "semantic", threshold, measure).summary }));
  const passing = sweep.find(point => point.relevantAmongReturnedAt5 !== null && point.relevantAmongReturnedAt5 >= PRECISION_TARGET
    && point.noMatchQueriesWithSuggestion === 0);
  return { threshold: passing?.threshold ?? null, measure, rule: `lowest ${measure === "cosine" ? "cosine" : "z-score"} threshold with >= ${PRECISION_TARGET} relevant among returned and no no-match suggestion on v2 development, semantic only`, sweep };
}

/** The veto bar: the 5th percentile z-score of correct keyword suggestions on development. */
export function chooseVeto(developmentRows) {
  const values = developmentRows.flatMap(row => row.candidates.filter(c => c.lexicalRank && c.relative !== null && row.query.relevant.has(c.candidate.id))
    .map(c => c.relative)).sort((a, b) => a - b);
  return values.length ? Number(values[Math.floor(values.length * 0.05)].toFixed(2)) : null;
}

function mulberry32(seed) {
  return () => { let t = seed += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
/** 95% percentile bootstrap over positive queries; `other` gives a paired difference. */
export function bootstrap(rows, other = null, draws = 4000) {
  const positive = rows.filter(row => row.relevant), random = mulberry32(20261119);
  const partner = other && new Map(other.map(row => [row.id, row]));
  const recall = [], relevance = [], difference = [];
  for (let draw = 0; draw < draws; draw++) {
    let correct = 0, returned = 0, sum = 0, otherSum = 0;
    for (let i = 0; i < positive.length; i++) {
      const row = positive[Math.floor(random() * positive.length)];
      correct += row.correct; returned += row.returned; sum += row.correct / row.relevant;
      if (partner) otherSum += partner.get(row.id).correct / partner.get(row.id).relevant;
    }
    recall.push(sum / positive.length);
    if (returned) relevance.push(correct / returned);
    if (partner) difference.push((sum - otherSum) / positive.length);
  }
  const interval = values => { const sorted = [...values].sort((a, b) => a - b);
    return sorted.length ? [Number(sorted[Math.floor(sorted.length * 0.025)].toFixed(3)), Number(sorted[Math.floor(sorted.length * 0.975)].toFixed(3))] : null; };
  return { finalRecallAt5: interval(recall), relevantAmongReturnedAt5: interval(relevance), ...(partner ? { recallDifference: interval(difference) } : {}) };
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const flag = name => { const index = process.argv.indexOf(name); return index > 0 ? process.argv[index + 1] : null; };
  const keys = (flag("--models") ?? Object.keys(MODELS).join(",")).split(",");
  const offline = process.argv.includes("--offline");
  const v2 = await loadEvaluation(), v3 = await loadMatchingV3();
  const development = fromV2(v2.data, "development"), holdout = fromV3(v3.data), uncertain = fromV3(v3.data, "uncertain");

  // The production evaluator's own numbers, so this harness can be checked against the committed report.
  const reference = Object.fromEntries([["lexical-v1", false], [PARTNER_ENGINE_VERSION, true]].map(([name, concepts]) => {
    const s = evaluateV3(v3.data, concepts, "all-candidates").summary;
    return [name, { relevantAmongReturnedAt5: s.relevantAmongReturnedAt5, finalRecallAt5: s.finalRecallAt5,
      positiveQueriesWithNoSuggestion: s.positiveQueryAbstentions, noMatchQueriesWithSuggestion: s.noMatchFalsePositives }];
  }));
  const lexicalRows = await prepare(holdout, null);
  const current = score(lexicalRows, "current", null);
  const report = {
    reportDate: "2026-11-19", status: "offline experiment; the v3 holdout was examined before this work, so results are directional",
    fixtures: { v2Sha256: v2.digest, v3Sha256: v3.digest },
    counts: { v2DevelopmentQueries: development.queries.length, v2DevelopmentCandidates: development.candidates.length,
      v3Candidates: holdout.candidates.length, v3AgreedQueries: holdout.queries.length,
      v3AgreedPositive: holdout.queries.filter(q => q.relevant.size).length, v3AgreedNoMatch: holdout.queries.filter(q => !q.relevant.size).length,
      v3UncertainQueries: uncertain.queries.length },
    productionEvaluator: reference,
    current: { engine: PARTNER_ENGINE_VERSION, ...current.summary, wrongSuggestionsByEvidence: current.wrongSuggestionsByEvidence, interval95: bootstrap(current.rows),
      byLanguage: current.byLanguage, byEvidenceType: current.byEvidenceType },
    keywordRanking: rankingQuality(lexicalRows, "keyword"),
    models: {},
  };
  for (const key of keys) {
    const embedder = await createEmbedder(key, { offline });
    const developmentRows = await prepare(development, embedder);
    const holdoutRows = await prepare(holdout, embedder);
    const uncertainRows = await prepare(uncertain, embedder);
    await embedder.close();
    const chosen = chooseThreshold(developmentRows), relative = chooseThreshold(developmentRows, "relative");
    const threshold = chosen.threshold;
    const veto = chooseVeto(developmentRows);
    const packWith = (cut, measure, bar = null) => (rows, engine) => { const result = score(rows, engine, cut, measure, bar);
      return { ...result.summary, wrongSuggestionsByEvidence: result.wrongSuggestionsByEvidence, interval95: bootstrap(result.rows, current.rows),
        byLanguage: result.byLanguage, byEvidenceType: result.byEvidenceType }; };
    const pack = packWith(threshold, "cosine"), packRelative = packWith(relative.threshold, "relative");
    // Shown only to describe the trade-off. Choosing a threshold from this table would be tuning on the holdout.
    const holdoutSweep = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.85, 0.9].map(t => ({ threshold: t, hybrid: score(holdoutRows, "hybrid", t).summary }))
      .map(({ threshold: t, hybrid }) => ({ threshold: t, relevantAmongReturnedAt5: hybrid.relevantAmongReturnedAt5, finalRecallAt5: hybrid.finalRecallAt5,
        positiveQueriesWithNoSuggestion: hybrid.positiveQueriesWithNoSuggestion, noMatchQueriesWithSuggestion: hybrid.noMatchQueriesWithSuggestion }));
    report.models[key] = {
      model: { id: embedder.spec.id, revision: embedder.spec.revision, dtype: embedder.spec.dtype, dimensions: embedder.spec.dimensions,
        languages: embedder.spec.languages, licence: embedder.spec.licence, onnxBytes: embedder.spec.onnxBytes, pinnedInRepository: Boolean(embedder.spec.pinned) },
      timing: embedder.timing(),
      threshold: { value: threshold, rule: chosen.rule,
        developmentAtThreshold: threshold === null ? null : { semantic: score(developmentRows, "semantic", threshold).summary, hybrid: score(developmentRows, "hybrid", threshold).summary, current: score(developmentRows, "current", null).summary } },
      holdout: threshold === null ? null : { semantic: pack(holdoutRows, "semantic"), hybrid: pack(holdoutRows, "hybrid") },
      holdoutUncertainJudgments: threshold === null ? null : { current: score(uncertainRows, "current", null).summary, hybrid: score(uncertainRows, "hybrid", threshold).summary },
      relativeThreshold: relative.threshold === null ? null : { value: relative.threshold, rule: relative.rule,
        note: "Added after the first scored holdout run; the cut-off still comes from v2 development only.",
        developmentAtThreshold: { semantic: score(developmentRows, "semantic", relative.threshold, "relative").summary,
          hybrid: score(developmentRows, "hybrid", relative.threshold, "relative").summary },
        holdout: { semantic: packRelative(holdoutRows, "semantic"), hybrid: packRelative(holdoutRows, "hybrid") } },
      semanticVeto: relative.threshold === null || veto === null ? null : { vetoBelowZ: veto, semanticAtOrAboveZ: relative.threshold,
        rule: "keyword evidence needs a z-score at or above the 5th percentile of correct keyword suggestions on v2 development",
        note: "Added after the first scored holdout run; both cut-offs come from v2 development only.",
        development: score(developmentRows, "hybrid", relative.threshold, "relative", veto).summary,
        holdout: packWith(relative.threshold, "relative", veto)(holdoutRows, "hybrid"),
        holdoutUncertainJudgments: score(uncertainRows, "hybrid", relative.threshold, "relative", veto).summary },
      rankingWithoutThreshold: { semantic: rankingQuality(holdoutRows, "semantic"), fused: rankingQuality(holdoutRows, "fused") },
      postHocHoldoutSweep: holdoutSweep,
    };
  }
  const output = flag("--output");
  if (output) await writeFile(output, JSON.stringify(report, null, 2) + "\n");
  const line = (name, s) => `${name.padEnd(34)} relevant ${String(s.relevantAmongReturnedAt5).padEnd(7)} recall ${String(s.finalRecallAt5).padEnd(7)} silent ${String(s.positiveQueriesWithNoSuggestion).padEnd(3)} no-match hits ${s.noMatchQueriesWithSuggestion}/${s.noMatchQueries}`;
  console.log(`v3 holdout, ${report.counts.v3AgreedPositive} positive and ${report.counts.v3AgreedNoMatch} no-match agreed queries, all candidates`);
  console.log(line("production evaluator, current", { ...reference[PARTNER_ENGINE_VERSION], noMatchQueries: report.counts.v3AgreedNoMatch }));
  console.log(line("this harness, current", report.current));
  for (const [key, value] of Object.entries(report.models)) {
    if (!value.holdout) { console.log(`${key}: no threshold met the development rule`); continue; }
    console.log(line(`${key} semantic @${value.threshold.value}`, value.holdout.semantic));
    console.log(line(`${key} hybrid @${value.threshold.value}`, value.holdout.hybrid));
    if (value.relativeThreshold) {
      console.log(line(`${key} semantic z>=${value.relativeThreshold.value}`, value.relativeThreshold.holdout.semantic));
      console.log(line(`${key} hybrid z>=${value.relativeThreshold.value}`, value.relativeThreshold.holdout.hybrid));
      if (value.semanticVeto) console.log(line(`${key} hybrid, veto z<${value.semanticVeto.vetoBelowZ}`, value.semanticVeto.holdout));
    }
  }
}
