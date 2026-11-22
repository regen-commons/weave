// Checks for the partner-real-v2 scoring script on synthetic data and v1's public files. The holdout is never scored here.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { currentPicks } from "./experiments/matching-architecture/d32-engines.mjs";
import { loadReal } from "../scripts/matching-real.mjs";
import { agreement, currentGate, decide, finalLabels, modelGate, pairedIntervals, scoreRows, summarize, verifySeal }
  from "../scripts/partner-real-v2-score.mjs";

test("agreement gives raw agreement and Cohen's kappa", () => {
  const a = new Map([["p1", "relevant"], ["p2", "irrelevant"], ["p3", "irrelevant"], ["p4", "relevant"]]);
  const b = new Map([["p1", "relevant"], ["p2", "irrelevant"], ["p3", "relevant"], ["p4", "relevant"]]);
  assert.deepEqual(agreement(["p1", "p2", "p3", "p4"], a, b), { pairs: 4, raw: 0.75, kappa: 0.5 });
});

test("labels need both reviewers, and every disagreement needs a recorded settlement", () => {
  const key = [{ pairId: "x1" }, { pairId: "x2" }, { pairId: "x3" }];
  const a = [{ pairId: "x1", judgment: "relevant", rationale: "same work" }, { pairId: "x2", judgment: "irrelevant" },
    { pairId: "x3", judgment: "uncertain", rationale: "" }];
  const b = [{ pairId: "x1", judgment: "relevant", rationale: "fits" }, { pairId: "x2", judgment: "relevant", rationale: "close" },
    { pairId: "x3", judgment: "uncertain", rationale: "unclear" }];
  const open = finalLabels(key, a, b, []);
  assert.deepEqual(open.problems, ["unadjudicated:x2"]);
  assert.deepEqual(open.warnings, ["no_rationale:a:x3"]);
  const settled = finalLabels(key, a, b, [{ pairId: "x2", judgment: "irrelevant", how: "third person", note: "different work" }]);
  assert.deepEqual([settled.problems, Object.fromEntries(settled.labels)], [[], { x1: "relevant", x2: "irrelevant", x3: "uncertain" }]);
  const bad = finalLabels(key, [...a, { pairId: "x9", judgment: "relevant" }], b.slice(0, 2).concat([{ pairId: "x3", judgment: "maybe" }]),
    [{ pairId: "x2", judgment: "irrelevant", how: "a guess" }]);
  assert.deepEqual(bad.problems.sort(), ["bad_judgment:b:x3", "unadjudicated:x2", "unjudged:x3", "unknown_pair:a:x9"]);
});

test("measures follow the plan: relevance over resolved suggestions, seed recall, and no-match quiet", () => {
  const queries = [
    { id: "q1", domain: "place", direction: "need", language: "pt" },
    { id: "q2", domain: "place", direction: "offer", language: "en" },
    { id: "q3", domain: "art", direction: "need", language: "es" },
  ];
  const slots = new Map([["q1", { kind: "seeded", seed: "s1" }], ["q2", { kind: "blind", seed: null }], ["q3", { kind: "seeded", seed: "s3" }]]);
  const labels = { "q1:s1": "relevant", "q1:p1": "irrelevant", "q1:p2": "uncertain", "q1:p3": "relevant",
    "q2:p1": "irrelevant", "q2:p4": "irrelevant", "q3:s3": "irrelevant", "q3:p5": "relevant" };
  const pooled = new Map(Object.entries({ q1: new Set(["s1", "p1", "p2", "p3"]), q2: new Set(["p1", "p4"]), q3: new Set(["s3", "p5"]) }));
  const context = { queries, slots, pooled, v1Projects: new Set(["p1"]), labelOf: (q, p) => labels[`${q}:${p}`] };
  const rows = scoreRows({ q1: [{ id: "s1" }, { id: "p1" }, { id: "p2" }], q2: [{ id: "p4" }], q3: [] }, context);
  const s = summarize(rows);
  // q1: 1 relevant of 2 resolved (the uncertain pair is left out); q3 has no suggestion; q2 fits nothing.
  assert.deepEqual([s.positiveQueries, s.noMatchQueries, s.relevantAmongReturnedAt5, s.positiveQueryAbstentions], [2, 1, 0.5, 1]);
  assert.equal(s.finalRecallAt5, 0.25); // q1 found 1 of 2 relevant, q3 found 0 of 1
  // Only q1's seed was judged a fit, and it was found; q3's seed was judged not to fit, so it does not count.
  assert.deepEqual([s.seededQueriesWithAFittingSeed, s.seedRecall], [1, 1]);
  assert.deepEqual([s.noMatchQueriesWithASuggestion, s.noMatchShare], [1, 1]);
  assert.deepEqual([s.relevantAmongReturnedToV1Projects, s.relevantAmongReturnedToNewProjects], [0, 1]);
});

test("the decision rule applies the confirmed margins and fails closed", () => {
  const engine = (relevance, seed, pt, es, noMatch) => ({ relevantAmongReturnedAt5: relevance, seedRecall: seed, noMatchShare: noMatch,
    byLanguage: { pt: { seedRecall: pt }, es: { seedRecall: es } } });
  const current = engine(0.3, 0.5, 0.1, 0.2, 0.25);
  const clean = { unsupportedConfirmations: 0, explanationOrProvenanceFailures: 0 };
  const pass = decide(current, engine(0.6, 0.45, 0.2, 0.3, 0.35), { relevance: [0.1, 0.4] }, clean);
  assert.equal(pass.passesRulesOneToFive, true);
  const edge = decide(current, engine(0.6, 0.449, 0.2, 0.3, 0.36), { relevance: [0, 0.4] }, { ...clean, explanationOrProvenanceFailures: 1 });
  assert.deepEqual(edge.rules, { hardGate: false, relevance: false, recallFloor: false, languages: true, quietWhenNothingFits: false });
  const level = decide(current, engine(0.6, 0.5, 0.1, 0.3, 0.25), { relevance: [0.1, 0.4] }, clean);
  assert.equal(level.rules.languages, false);
  const empty = decide(engine(0.3, null, null, null, null), engine(0.6, null, null, null, null), { relevance: null }, clean);
  assert.deepEqual(empty.rules, { hardGate: true, relevance: false, recallFloor: false, languages: false, quietWhenNothingFits: false });
});

test("paired intervals resample queries together and sit at zero when the engines agree", () => {
  const row = (id, relevant, irrelevant, language) => ({ id, class: "positive", language, returned: relevant + irrelevant, relevant, irrelevant,
    relevant3: relevant, irrelevant3: irrelevant, v1Relevant: 0, v1Irrelevant: 0, freshRelevant: 0, freshIrrelevant: 0,
    recall: relevant ? 1 : 0, seedHit: relevant ? 1 : 0 });
  const current = Array.from({ length: 20 }, (_, i) => row(`q${i}`, i % 4 === 0 ? 1 : 0, 2, i % 2 ? "pt" : "es"));
  const same = pairedIntervals(current, current, 200);
  assert.deepEqual([same.relevance, same.seedRecall], [[0, 0], [0, 0]]);
  const better = pairedIntervals(current, current.map(r => ({ ...r, relevant: r.relevant + 1, relevant3: r.relevant3 + 1, seedHit: 1 })), 200);
  assert.ok(better.relevance[0] > 0 && better.seedRecall[0] > 0);
  assert.equal(better.noMatchShare, null); // no no-match queries here
});

test("the seal refuses a changed private file and a changed repository file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "partner-real-v2-score-"));
  await writeFile(join(dir, "partner-real-v2-queries.json"), "{\"queries\":[]}\n");
  const hash = bytes => createHash("sha256").update(bytes).digest("hex");
  const own = await readFile(new URL("../package.json", import.meta.url));
  const seal = `${hash("{\"queries\":[]}\n")}  partner-real-v2-queries.json\n${hash(own)}  packages/api/package.json\n`;
  assert.deepEqual(await verifySeal(dir, seal), []);
  await writeFile(join(dir, "partner-real-v2-queries.json"), "{\"queries\":[1]}\n");
  assert.deepEqual(await verifySeal(dir, seal + `${"0".repeat(64)}  packages/api/package.json\n`), ["partner-real-v2-queries.json", "packages/api/package.json"]);
});

test("provenance checks a model's picks against the frozen corpus", () => {
  const corpus = { projects: [{ id: "rp2-0001", uri: "at://did:plc:x/org.hypercerts.collection/a", name: "Soil school",
    passages: ["We teach composting to farmers in the valley and run a seed library."], sourceUrl: "https://api.hypercerts.dev/x",
    sharedAt: "2026-01-01T00:00:00Z", collectedAt: "2026-11-21T20:36:20Z" }] };
  assert.equal(modelGate(corpus, { q1: [{ id: "rp2-0001", path: "semanticOnly" }] }).explanationOrProvenanceFailures, 0);
  const bad = modelGate(corpus, { q1: [{ id: "rp2-9999", path: "both" }, { id: "rp2-0001", path: "guessed" }] });
  assert.deepEqual(bad.failures.map(f => f.reason), ["not_in_corpus:rp2-9999", "unknown_path:rp2-0001"]);
  assert.match(bad.explanation, /^not built/);
});

test("the current matcher's gate reruns it and refuses a run that differs", async () => {
  const { corpus, queries } = await loadReal();
  const engineDate = "2026-11-19T00:00:00.000Z", list = queries.queries.slice(0, 12);
  const picks = currentPicks(corpus.projects, list, Date.parse(engineDate));
  const runs = { engineDate, engines: { current: Object.fromEntries(list.map(query => [query.id, picks.get(query.id)])) } };
  const gate = currentGate(corpus, list, runs);
  assert.equal(gate.explanation, "checked");
  assert.equal(typeof gate.explanationOrProvenanceFailures, "number");
  const changed = structuredClone(runs);
  const target = list.find(query => changed.engines.current[query.id].length);
  changed.engines.current[target.id].reverse().push({ id: "rp-999", path: "lexicalOnly" });
  assert.throws(() => currentGate(corpus, list, changed), new RegExp(`current_run_differs:${target.id}`));
});
