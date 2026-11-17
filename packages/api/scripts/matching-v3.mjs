import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { rankPartnerMatches as baseline, partnerLexicalText } from "../evaluation/lexical-v1.ts";
import { rankPartnerMatches as improved, PARTNER_ENGINE_VERSION, partnerQueryProjection } from "../src/partner-matcher.ts";
import { expandPartnerText, PARTNER_CONCEPT_VERSION } from "../src/partner-concepts.ts";

const root = new URL("../evaluation/", import.meta.url);
const DOMAINS = ["art", "software", "research", "place"];
const nonempty = value => typeof value === "string" && value.trim().length > 0;
const confirmed = new Set(["confirmed_offer", "confirmed_need"]);

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
const normalized = text => partnerLexicalText(text);
const mean = values => values.length ? Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(4)) : null;

/** An explanation is correct when every cited term occurs in the query and, for its evidence, in the cited text. */
function explanationFailures(query, match, useConcepts) {
  const failures = [];
  const queryText = normalized(partnerQueryProjection(queryEntry(query)));
  const evidenceText = match.evidence.type === "public" ? match.evidence.passage : match.evidence.passage;
  const evidenceTerms = normalized(useConcepts && match.evidence.type === "public" ? expandPartnerText(evidenceText) : evidenceText);
  if (!match.reasons.length) failures.push("no_reason");
  for (const reason of match.reasons) {
    for (const term of reason.terms) {
      const words = normalized(term);
      if (reason.type === "shared_terms" && (!` ${queryText} `.includes(` ${words} `) || !` ${evidenceTerms} `.includes(` ${words} `)))
        failures.push(`unsupported_term:${term}`);
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
  return { queries: rows.length, positiveQueries: positive.length,
    returned: rows.reduce((n, row) => n + row.returned, 0), relevantReturned: rows.reduce((n, row) => n + row.correct, 0),
    precisionAmongReturned: mean(rows.filter(row => row.returned).map(row => row.correct / row.returned)),
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
 * Candidate retrieval is simulated as token overlap within the query's domain (judgments are within domain),
 * public passages expanded as the index writer does. "full-domain" isolates final ranking by passing every candidate.
 */
export function evaluateV3(data, useConcepts, path, judgments = "agreed") {
  if (!["retrieval", "full-domain"].includes(path)) throw Error("invalid_evaluation_path");
  const rank = useConcepts ? improved : baseline;
  const selected = data.queries.filter(query => query.judgment === judgments);
  const rows = selected.map(query => {
    const projects = data.projects.filter(project => project.domain === query.domain);
    const shared = data.shared.filter(entry => entry.domain === query.domain);
    const queryTerms = terms(partnerQueryProjection(queryEntry(query)));
    const overlaps = text => [...terms(text)].filter(term => queryTerms.has(term)).length;
    const projectPool = path === "full-domain" ? projects
      : projects.filter(project => overlaps(useConcepts ? expandPartnerText(project.passage) : project.passage) > 0);
    const sharedPool = path === "full-domain" ? shared
      : shared.filter(entry => overlaps(`${entry.title}. ${entry.description}`) > 0);
    const results = rank({ queries: [queryEntry(query)], shared: sharedPool.map(sharedEntry),
      publicEvidence: projectPool.map(projectEvidence), limitPerEntryAndKind: 5, now: Date.parse("2026-11-16T00:00:00Z") });
    const ids = results.map(match => match.evidence.type === "public" ? match.evidence.id : match.evidence.entryId);
    const relevant = new Set([...query.relevantProjects, ...query.relevantShared]);
    const top5 = ids.slice(0, 5);
    const pool = new Set([...projectPool.map(project => project.id), ...sharedPool.map(entry => entry.id)]);
    const failures = results.flatMap(match => explanationFailures(query, match, useConcepts).map(reason => ({ candidate:
      match.evidence.type === "public" ? match.evidence.id : match.evidence.entryId, reason })));
    return { id: query.id, domain: query.domain, direction: query.direction, language: query.language, evidenceType: query.evidenceType,
      relevantClass: !relevant.size ? "none" : query.relevantShared.length && query.relevantProjects.length ? "both"
        : query.relevantShared.length ? "shared" : "public",
      relevant: relevant.size, returned: ids.length, correct: ids.filter(id => relevant.has(id)).length,
      candidateRecall: relevant.size ? [...relevant].filter(id => pool.has(id)).length / relevant.size : null,
      finalRecallAt5: relevant.size ? top5.filter(id => relevant.has(id)).length / relevant.size : null,
      unsupportedConfirmations: results.filter(match => match.evidence.type === "public" && confirmed.has(match.evidenceKind)).length,
      explanationFailures: failures, results: ids, missed: [...relevant].filter(id => !ids.includes(id)),
      falsePositives: ids.filter(id => !relevant.has(id)) };
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
    precisionAmongReturned: value.precisionAmongReturned,
    // An abstaining group has no returned results: it neither passes nor fails precision, and recall shows the cost.
    passed: value.precisionAmongReturned === null || value.precisionAmongReturned >= t.precisionAmongReturnedPerDomainDirection }));
  return {
    precisionPerDomainDirection: { threshold: t.precisionAmongReturnedPerDomainDirection, groups: precision, passed: precision.every(g => g.passed) },
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
  const paths = Object.fromEntries(["retrieval", "full-domain"].map(path => {
    const candidate = evaluateV3(data, true, path);
    return [path, { baseline: evaluateV3(data, false, path), improved: candidate, gates: gatesV3(data, candidate),
      uncertainJudgments: evaluateV3(data, true, path, "uncertain") }];
  }));
  const report = { dataset: data.dataset, fixtureSha256: digest, baselineSha256: baselineHash, engineSha256,
    conceptVersion: PARTNER_CONCEPT_VERSION, node: process.version, evaluationStatus: "independent-synthetic-holdout-first-run",
    annotationStatus: data.annotationStatus, thresholds: data.thresholds,
    counts: { projects: data.projects.length, shared: data.shared.length, queries: data.queries.length,
      agreed: data.queries.filter(q => q.judgment === "agreed").length, uncertain: data.queries.filter(q => q.judgment === "uncertain").length },
    limits: ["Synthetic agent-authored and agent-judged text, blind to the engine; not human judged.",
      "Judgments are within domain, so candidates are restricted to the query's domain.",
      "Retrieval simulates token overlap on expanded public text and on shared entry text; it is not PostgreSQL ranking.",
      "Shared entries are modelled as open, confirmed and unexpired; database-level gates are tested separately.",
      "Small relevant sets (1 to 3 per query) make recall coarse.",
      "Run once after freezing; once its misses are examined, a rerun is regression evidence."],
    paths };
  if (output) await writeFile(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify(Object.fromEntries(Object.entries(paths).map(([path, value]) => [path, {
    baseline: value.baseline.summary, improved: value.improved.summary, gates: value.gates,
    byDomainAndDirection: value.improved.byDomainAndDirection, byLanguage: value.improved.byLanguage,
    byEvidenceType: value.improved.byEvidenceType, byRelevantCandidateClass: value.improved.byRelevantCandidateClass,
    uncertainJudgments: value.uncertainJudgments.summary }])), null, 2));
}
