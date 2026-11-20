// Integrity checks for partner-real-v1. These never score the matcher: the set is a holdout.
import assert from "node:assert/strict";
import test from "node:test";
import { exclusionReason } from "../scripts/partner-real-corpus.mjs";
import { agentLabels, combine, DOMAINS, humanLabels, loadReal, validateCorpus, validateQueries } from "../scripts/matching-real.mjs";

const loaded = loadReal();

test("partner-real-v1 files match their frozen hashes and hold 20 needs and 20 offers per domain", async () => {
  const { corpus, queries } = await loaded;
  assert.equal(corpus.projects.length, 140);
  for (const domain of DOMAINS) for (const direction of ["need", "offer"])
    assert.equal(queries.queries.filter(query => query.domain === domain && query.direction === direction).length, 20, `${domain}/${direction}`);
  const share = queries.queries.filter(query => query.language !== "en").length / queries.queries.length;
  assert.ok(share >= 0.2, `Portuguese and Spanish share ${share}`);
});

test("the corpus keeps no QA, test, placeholder or contact-detail listing", async () => {
  const { corpus } = await loaded;
  for (const project of corpus.projects) assert.equal(exclusionReason(project), null, project.id);
  assert.deepEqual(Object.keys(corpus.projects[0]).sort(),
    ["account", "checkedAt", "collectedAt", "id", "language", "name", "passages", "sharedAt", "sourceUrl", "stratum", "uri"]);
});

test("validation rejects unknown projects, contradictory types and malformed corpus rows", async () => {
  const { corpus, queries, labels } = await loaded;
  const unknown = structuredClone(labels);
  unknown.labels[0].judgeRelevant.push("rp-999");
  assert.throws(() => validateQueries(queries, unknown, corpus), /invalid_real_labels/);
  const noMatch = structuredClone(labels);
  const query = queries.queries.find(row => row.evidenceType === "no-match");
  noMatch.labels.find(row => row.id === query.id).authorRelevant.push(corpus.projects[0].id);
  assert.throws(() => validateQueries(queries, noMatch, corpus), /invalid_real_labels/);
  const domain = structuredClone(queries);
  domain.queries[0].domain = "music";
  assert.throws(() => validateQueries(domain, labels, corpus), /invalid_real_query/);
  const duplicate = structuredClone(corpus);
  duplicate.projects[1].uri = duplicate.projects[0].uri;
  assert.throws(() => validateCorpus(duplicate), /invalid_real_corpus_project/);
});

test("the blind worksheet carries only query and project text, keyed separately by opaque ids", async () => {
  const { worksheet, key, queries, labels, corpus } = await loaded;
  assert.equal(worksheet.length, key.length);
  const allowed = ["direction", "judgment", "pairId", "projectName", "projectPassages", "queryDescription", "queryTitle", "rationale", "reviewer"];
  const ids = new Set();
  for (const row of worksheet) {
    assert.deepEqual(Object.keys(row).sort(), allowed);
    assert.match(row.pairId, /^[0-9a-f-]{36}$/u);
    assert.equal(row.judgment, null);
    ids.add(row.pairId);
  }
  assert.equal(ids.size, worksheet.length);
  const text = JSON.stringify(worksheet);
  assert.doesNotMatch(text, /rp-\d{3}|rq-[a-z]+-|partner-(lexical|concepts)|evidenceType|relevant"/u);
  assert.deepEqual(new Set(key.map(row => row.pairId)), ids);
  // Every project either agent judged relevant for a query is among that query's pairs.
  const pairs = new Set(key.map(row => `${row.queryId}|${row.projectId}`));
  for (const [queryId, { pairs: labelled }] of agentLabels(queries, labels, corpus))
    for (const [projectId, value] of labelled) if (value !== "irrelevant") assert.ok(pairs.has(`${queryId}|${projectId}`), `${queryId}|${projectId}`);
});

test("two judgments combine conservatively and human sheets need two named, complete reviewers", async () => {
  assert.equal(combine("relevant", "relevant"), "relevant");
  assert.equal(combine("irrelevant", "irrelevant"), "irrelevant");
  for (const [a, b] of [["relevant", "irrelevant"], ["relevant", "uncertain"], ["uncertain", "uncertain"], ["irrelevant", "uncertain"]])
    assert.equal(combine(a, b), "unresolved");
  const { queries, labels, key, worksheet } = await loaded;
  const filled = (name, judgment) => worksheet.map(row => ({ ...row, reviewer: name, judgment }));
  assert.throws(() => humanLabels(queries, labels, key, filled("A", "relevant"), filled("A", "relevant")), /two_reviewers/);
  assert.throws(() => humanLabels(queries, labels, key, filled("A", "relevant"), filled("B", "relevant").slice(1)), /worksheet_incomplete/);
  assert.throws(() => humanLabels(queries, labels, key, filled("A", "maybe"), filled("B", "relevant")), /worksheet_incomplete/);
  // A repeated row keeps the count right while another pair goes missing.
  const repeated = filled("B", "relevant");
  repeated[1] = { ...repeated[0] };
  assert.throws(() => humanLabels(queries, labels, key, filled("A", "relevant"), repeated), /worksheet_incomplete/);
  const { labels: combined } = humanLabels(queries, labels, key, filled("A", "relevant"), filled("B", "irrelevant"));
  assert.ok([...combined.values()].every(({ pairs }) => [...pairs.values()].every(value => value === "unresolved")));
});
