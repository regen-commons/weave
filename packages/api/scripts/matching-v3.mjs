import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { rankPartnerMatches as baseline, partnerLexicalText } from "../evaluation/lexical-v1.ts";
import { rankPartnerMatches as improved, PARTNER_ENGINE_VERSION, partnerQueryProjection } from "../src/partner-matcher.ts";
import { expandPartnerText, partnerConcepts, PARTNER_CONCEPT_VERSION } from "../src/partner-concepts.ts";

const root = new URL("../evaluation/", import.meta.url);
const DOMAINS = ["art", "software", "research", "place"];
const EVIDENCE_TYPES = ["literal", "paraphrase", "sparse", "cross-language", "no-match"];
const nonempty = value => typeof value === "string" && value.trim().length > 0;
const confirmed = new Set(["confirmed_offer", "confirmed_need"]);
/**
 * Scoring definitions, written down after the first run's review (see README). The frozen
 * threshold is the spec's: at least 80% relevant among the top five returned suggestions per
 * domain and direction, counted over suggestions, on held-out queries with known relevant
 * candidates. A group with fewer than MIN_SUGGESTIONS returned suggestions cannot pass or fail.
 */
export const SCORING = { window: 5, minSuggestions: 5, precision: "micro over top-five suggestions, positive queries only" };

/** Rejects unknown ids, cross-domain or wrong-direction judgments and unscorable labels. */
export function validateMatchingV3(data) {
  if (!data || data.version !== 1 || !Array.isArray(data.projects) || !Array.isArray(data.shared) || !Array.isArray(data.queries)
    || data.thresholds?.precisionAmongReturnedPerDomainDirection !== 0.8 || data.thresholds.unsupportedConfirmations !== 0)
    throw Error("invalid_matching_v3");
  const ids = new Set();
  const projects = new Map(), shared = new Map();
  for (const [rows, map, field] of [[data.projects, projects, "passage"], [data.shared, shared, "title"]]) {
    for (const row of rows) {
      if (!nonempty(row?.id) || ids.has(row.id) || !DOMAINS.includes(row.domain) || !["en", "pt"].includes(row.language)
        || !nonempty(row[field])) throw Error("invalid_matching_v3_candidate");
      ids.add(row.id);
      map.set(row.id, row);
    }
  }
  for (const project of data.projects)
    if (!["work", "published_offer", "published_request"].includes(project.evidenceKind)) throw Error("invalid_matching_v3_candidate");
  for (const entry of data.shared) if (!["need", "offer"].includes(entry.kind)) throw Error("invalid_matching_v3_candidate");
  for (const query of data.queries) {
    if (!nonempty(query?.id) || ids.has(query.id) || !DOMAINS.includes(query.domain) || !["need", "offer"].includes(query.direction)
      || !["en", "pt"].includes(query.language) || !EVIDENCE_TYPES.includes(query.evidenceType)
      || !nonempty(query.title) || !["agreed", "uncertain"].includes(query.judgment)) throw Error("invalid_matching_v3_query");
    ids.add(query.id);
    for (const [list, map] of [[query.relevantProjects, projects], [query.relevantShared, shared],
      [query.judgeRelevantProjects, projects], [query.judgeRelevantShared, shared]]) {
      if (!Array.isArray(list) || new Set(list).size !== list.length) throw Error("invalid_matching_v3_judgment");
      for (const id of list) {
        const candidate = map.get(id);
        if (!candidate || candidate.domain !== query.domain) throw Error("invalid_matching_v3_judgment");
        // A need is never served by another need or a published request, and an offer never by an offer.
        if (map === shared && candidate.kind === query.direction) throw Error("invalid_matching_v3_judgment");
        if (map === projects && candidate.evidenceKind === (query.direction === "need" ? "published_request" : "published_offer"))
          throw Error("invalid_matching_v3_judgment");
      }
    }
    // A no-match query is one the author judged to have no relevant candidate, and only that.
    if ((query.evidenceType === "no-match") !== !(query.relevantProjects.length + query.relevantShared.length))
      throw Error("invalid_matching_v3_judgment");
    const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
    if (query.judgment === "agreed" && !(same(query.relevantProjects, query.judgeRelevantProjects)
      && same(query.relevantShared, query.judgeRelevantShared))) throw Error("invalid_matching_v3_judgment");
  }
  return data;
}

export async function loadMatchingV3() {
  const bytes = await readFile(new URL("matching-v3-holdout.json", root));
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== (await readFile(new URL("matching-v3-holdout.sha256", root), "utf8")).trim()) throw Error("matching_v3_fixture_changed");
  const baselineHash = createHash("sha256").update(await readFile(new URL("lexical-v1.ts", root))).digest("hex");
  if (baselineHash !== (await readFile(new URL("lexical-v1.sha256", root), "utf8")).trim()) throw Error("evaluation_baseline_changed");
  return { data: validateMatchingV3(JSON.parse(bytes)), digest, baselineHash };
}

const dated = "2026-11-01T00:00:00Z";
export function projectEvidence(project) {
  const uri = `at://did:web:fixture.example/org.hypercerts.collection/${project.id}`;
  return { id: project.id, projectUri: uri, projectName: project.name, sourceUri: uri, sourceUrl: "https://fixture.example",
    cid: `fixture-${project.id}`, contentHash: `fixture-${project.id}`, fieldPath: "$.shortDescription", passage: project.passage,
    kind: project.evidenceKind, sourceCreatedAt: dated, sourceIndexedAt: dated, fetchedAt: dated, extractionVersion: "evaluation-v3" };
}
export function sharedEntry(entry) {
  return { initiativeId: `initiative-${entry.id}`, entryId: entry.id, revision: 1, kind: entry.kind,
    value: { title: entry.title, description: entry.description, status: "open", placeScope: "anywhere" },
    summary: { name: `Shared ${entry.id}` }, confirmedAt: dated, expiresAt: null };
}
const queryEntry = query => ({ initiativeId: "evaluation-initiative", entryId: query.id, revision: 1, kind: query.direction,
  value: { title: query.title, description: query.description || null, status: "open", placeScope: "anywhere" }, summary: {} });
const terms = text => new Set(partnerLexicalText(text).split(" ").filter(Boolean));
const ratio = (part, whole) => whole ? Number((part / whole).toFixed(4)) : null;
const mean = values => values.length ? Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(4)) : null;
const phrases = text => new Set(partnerConcepts(text).values());

/**
 * An explanation is correct when every shared term occurs in the query and in the verbatim
 * evidence the person sees, and every related pair names a phrase found in each of them.
 */
export function explanationFailures(query, match) {
  const failures = [];
  const queryText = partnerQueryProjection(queryEntry(query));
  const queryTerms = terms(queryText), evidenceTerms = terms(match.evidence.passage);
  if (!match.reasons.length) failures.push("no_reason");
  for (const reason of match.reasons) {
    for (const term of reason.terms) {
      if (reason.type === "shared_terms") {
        const words = [...terms(term)];
        if (!words.length || words.some(word => !queryTerms.has(word) || !evidenceTerms.has(word))) failures.push(`unsupported_term:${term}`);
      } else if (reason.type === "related_terms") {
        const [wanted, present] = term.split(" / ");
        if (!wanted || !present || !phrases(queryText).has(wanted) || !phrases(match.evidence.passage).has(present))
          failures.push(`unsupported_related:${term}`);
      } else failures.push(`unknown_reason:${reason.type}`);
    }
  }
  if (match.evidence.type === "public") {
    for (const field of ["sourceUri", "cid", "fieldPath", "passage", "fetchedAt", "projectUri"])
      if (!nonempty(match.evidence[field])) failures.push(`missing_provenance:${field}`);
    if (confirmed.has(match.evidenceKind)) failures.push("public_evidence_marked_confirmed");
    if (!match.unknowns.includes("availability")) failures.push("public_availability_claimed");
    if (match.action !== "open_source") failures.push("public_action");
  } else {
    if (!confirmed.has(match.evidenceKind) || !nonempty(match.evidence.confirmedAt) || !nonempty(match.evidence.entryId))
      failures.push("shared_evidence_unconfirmed");
    if (match.action !== "review_entry") failures.push("shared_action");
  }
  return failures;
}

function summarize(rows) {
  const positive = rows.filter(row => row.relevant);
  const suggested = positive.reduce((n, row) => n + row.returned, 0);
  const relevantSuggested = positive.reduce((n, row) => n + row.correct, 0);
  const unjudged = positive.reduce((n, row) => n + row.unjudged, 0);
  return { queries: rows.length, positiveQueries: positive.length,
    suggestionsAt5: suggested, relevantSuggestionsAt5: relevantSuggested, unjudgedSuggestionsAt5: unjudged,
    // The spec's measure, counted over suggestions; unjudged cross-domain suggestions count as not relevant.
    relevantAmongReturnedAt5: ratio(relevantSuggested, suggested),
    relevantAmongJudgedAt5: ratio(relevantSuggested, suggested - unjudged),
    meanQueryPrecisionAt5: mean(positive.filter(row => row.returned).map(row => row.correct / row.returned)),
    candidateRecall: mean(positive.map(row => row.candidateRecall)),
    finalRecallAt5: mean(positive.map(row => row.finalRecallAt5)),
    positiveQueryAbstentions: positive.filter(row => !row.returned).length,
    noMatchQueries: rows.filter(row => !row.relevant).length,
    noMatchFalsePositives: rows.filter(row => !row.relevant && row.returned).length,
    unsupportedConfirmations: rows.reduce((n, row) => n + row.unsupportedConfirmations, 0),
    explanationOrProvenanceFailures: rows.reduce((n, row) => n + row.explanationFailures.length, 0) };
}
const groupBy = (rows, key) => Object.fromEntries([...new Set(rows.map(key))].sort().map(name => [name, summarize(rows.filter(row => key(row) === name))]));

/**
 * Paths: "all-candidates" gives the matcher every candidate, as production has no domain field;
 * suggestions outside the query's domain were never judged and count as not relevant.
 * "full-domain" gives only the judged domain, isolating ranking on judged candidates.
 * "retrieval" simulates token-overlap retrieval within the domain on expanded public text,
 * an upper bound for the SQL shortlist, then ranks.
 */
export function evaluateV3(data, useConcepts, path, judgments = "agreed") {
  if (!["all-candidates", "full-domain", "retrieval"].includes(path)) throw Error("invalid_evaluation_path");
  const rank = useConcepts ? improved : baseline;
  const selected = data.queries.filter(query => query.judgment === judgments);
  const rows = selected.map(query => {
    const inDomain = row => path === "all-candidates" || row.domain === query.domain;
    const projects = data.projects.filter(inDomain), shared = data.shared.filter(inDomain);
    const queryTerms = terms(partnerQueryProjection(queryEntry(query)));
    const overlaps = text => [...terms(text)].filter(term => queryTerms.has(term)).length;
    const projectPool = path !== "retrieval" ? projects
      : projects.filter(project => overlaps(useConcepts ? expandPartnerText(project.passage) : project.passage) > 0);
    const sharedPool = path !== "retrieval" ? shared : shared.filter(entry => overlaps(`${entry.title}. ${entry.description}`) > 0);
    const results = rank({ queries: [queryEntry(query)], shared: sharedPool.map(sharedEntry),
      publicEvidence: projectPool.map(projectEvidence), limitPerEntryAndKind: 5, now: Date.parse("2026-11-16T00:00:00Z") });
    const top = results.slice(0, SCORING.window);
    const id = match => match.evidence.type === "public" ? match.evidence.id : match.evidence.entryId;
    const ids = top.map(id);
    const domainOf = new Map([...data.projects, ...data.shared].map(row => [row.id, row.domain]));
    const relevant = new Set([...query.relevantProjects, ...query.relevantShared]);
    const pool = new Set([...projectPool.map(project => project.id), ...sharedPool.map(entry => entry.id)]);
    return { id: query.id, domain: query.domain, direction: query.direction, language: query.language, evidenceType: query.evidenceType,
      relevantClass: !relevant.size ? "none" : query.relevantShared.length && query.relevantProjects.length ? "both"
        : query.relevantShared.length ? "shared" : "public",
      judgeSetsDiffer: JSON.stringify([...query.relevantProjects, ...query.relevantShared].sort())
        !== JSON.stringify([...query.judgeRelevantProjects, ...query.judgeRelevantShared].sort()),
      relevant: relevant.size, returned: ids.length, correct: ids.filter(entry => relevant.has(entry)).length,
      unjudged: ids.filter(entry => domainOf.get(entry) !== query.domain).length,
      candidateRecall: relevant.size ? [...relevant].filter(entry => pool.has(entry)).length / relevant.size : null,
      finalRecallAt5: relevant.size ? ids.filter(entry => relevant.has(entry)).length / relevant.size : null,
      unsupportedConfirmations: top.filter(match => match.evidence.type === "public" && confirmed.has(match.evidenceKind)).length,
      explanationFailures: results.flatMap(match => explanationFailures(query, match).map(reason => ({ candidate: id(match), reason }))),
      results: ids, missed: [...relevant].filter(entry => !ids.includes(entry)),
      falsePositives: ids.filter(entry => !relevant.has(entry)) };
  });
  return { engine: useConcepts ? PARTNER_ENGINE_VERSION : "partner-lexical-v1", path, judgments,
    summary: summarize(rows),
    byDomainAndDirection: groupBy(rows, row => `${row.domain}/${row.direction}`),
    byDirection: groupBy(rows, row => row.direction), byLanguage: groupBy(rows, row => row.language),
    byEvidenceType: groupBy(rows, row => row.evidenceType), byRelevantCandidateClass: groupBy(rows, row => row.relevantClass),
    rows };
}

export function gatesV3(data, result) {
  const t = data.thresholds;
  const precision = Object.entries(result.byDomainAndDirection).map(([key, value]) => ({ key,
    relevantAmongReturnedAt5: value.relevantAmongReturnedAt5, suggestions: value.suggestionsAt5,
    positiveQueries: value.positiveQueries, abstentions: value.positiveQueryAbstentions,
    // Returning almost nothing cannot pass: too few suggestions leave the group undecided.
    passed: value.suggestionsAt5 < SCORING.minSuggestions ? null
      : value.relevantAmongReturnedAt5 >= t.precisionAmongReturnedPerDomainDirection }));
  const decided = precision.filter(group => group.passed !== null);
  return {
    precisionPerDomainDirection: { threshold: t.precisionAmongReturnedPerDomainDirection, definition: SCORING, groups: precision,
      passed: precision.some(group => group.passed === false) ? false : decided.length === precision.length ? true : null },
    unsupportedConfirmations: { observed: result.summary.unsupportedConfirmations, passed: result.summary.unsupportedConfirmations === 0 },
    explanationOrProvenance: { observed: result.summary.explanationOrProvenanceFailures, passed: result.summary.explanationOrProvenanceFailures === 0 },
    recall: { floor: t.recallFloor, observed: result.summary.finalRecallAt5, passed: null, note: "No recall floor is agreed; reported only." },
    noMatchFalsePositives: { target: t.noMatchFalsePositiveTarget, observed: result.summary.noMatchFalsePositives,
      passed: result.summary.noMatchFalsePositives === t.noMatchFalsePositiveTarget },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const index = process.argv.indexOf("--output");
  const output = index > 0 ? process.argv[index + 1] : undefined;
  if (index > 0 && (!output || output.startsWith("--"))) throw Error("missing_argument:--output");
  const { data, digest, baselineHash } = await loadMatchingV3();
  const engineSha256 = createHash("sha256").update(await readFile(new URL("../src/partner-matcher.ts", import.meta.url)))
    .update(await readFile(new URL("../src/partner-concepts.ts", import.meta.url))).digest("hex");
  const paths = Object.fromEntries(["all-candidates", "full-domain", "retrieval"].map(path => {
    const candidate = evaluateV3(data, true, path);
    return [path, { baseline: evaluateV3(data, false, path), improved: candidate, gates: gatesV3(data, candidate),
      uncertainJudgments: evaluateV3(data, true, path, "uncertain") }];
  }));
  const groups = Object.fromEntries(Object.entries(paths["full-domain"].improved.byDomainAndDirection)
    .map(([key, value]) => [key, value.positiveQueries]));
  const report = { dataset: data.dataset, fixtureSha256: digest, baselineSha256: baselineHash, engineSha256,
    conceptVersion: PARTNER_CONCEPT_VERSION, node: process.version, scoring: SCORING,
    evaluationStatus: process.argv.includes("--post-hoc") ? "post-hoc-rescoring-of-the-examined-holdout" : "independent-synthetic-holdout",
    annotationStatus: data.annotationStatus, thresholds: data.thresholds,
    counts: { projects: data.projects.length, shared: data.shared.length, queries: data.queries.length,
      agreed: data.queries.filter(q => q.judgment === "agreed").length, uncertain: data.queries.filter(q => q.judgment === "uncertain").length,
      positiveAgreedQueriesByDomainDirection: groups },
    limits: ["Synthetic agent-authored and agent-judged text, blind to the engine; not human judged.",
      "Judgments are within domain. On the all-candidates path, suggestions from another domain are unjudged and count as not relevant.",
      "Small groups: 4 to 8 agreed positive queries per domain and direction, below the spec's 20 needs and 20 offers per domain; one query moves a group by 11 to 25 points.",
      "No one-way-fit or explicit-incompatibility cases; every shared entry is 'anywhere' with no timeframe or amount, so compatibility checks never run.",
      "Retrieval simulates token overlap on expanded public text and on shared entry text with no shortlist cap; it is an upper bound, not PostgreSQL ranking.",
      "Shared entries are modelled as open, confirmed and unexpired; database-level gates are tested separately.",
      "Once its misses are examined, a rerun is regression evidence, not a new independent result."],
    paths };
  if (output) await writeFile(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify(Object.fromEntries(Object.entries(paths).map(([path, value]) => [path, {
    baseline: value.baseline.summary, improved: value.improved.summary, gates: value.gates,
    byLanguage: value.improved.byLanguage, byEvidenceType: value.improved.byEvidenceType,
    byRelevantCandidateClass: value.improved.byRelevantCandidateClass, uncertainJudgments: value.uncertainJudgments.summary }])), null, 2));
}
