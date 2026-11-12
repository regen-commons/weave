import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { compactReport, evaluate, loadEvaluation, reviewPairs, summarize, validateEvaluation } from "../scripts/matching-heldout.mjs";

test("frozen fixtures reject topic, text, identity and judgment leakage", async () => {
  const {data,digest} = await loadEvaluation();
  assert.equal(digest.length,64);
  assert.equal(data.projects.length,200);
  const bad = structuredClone(data);
  const held = bad.queries.find(q=>q.split==="holdout");
  held.title = bad.queries.find(q=>q.split==="development").title;
  assert.throws(()=>validateEvaluation(bad), /split_leakage/);
  held.title = "A distinct query";
  held.relevant = ["missing"];
  assert.throws(()=>validateEvaluation(bad), /invalid_judgment/);
  bad.projects[1].id = bad.projects[0].id;
  assert.throws(()=>validateEvaluation(bad), /invalid_evaluation_identity/);
});

test("split guards inspect scored project passages even when a display title is present", async () => {
  const {data} = await loadEvaluation();
  const bad = structuredClone(data);
  const development = bad.projects.find(p=>p.split==="development");
  const holdout = bad.projects.find(p=>p.split==="holdout");
  holdout.title = "A distinct display title";
  holdout.passage = development.passage.toUpperCase().replaceAll(" ", " / ");
  assert.throws(()=>validateEvaluation(bad), /split_leakage/);

  const familyLeak = structuredClone(data);
  familyLeak.projects.find(p=>p.split==="holdout").family = development.family;
  assert.throws(()=>validateEvaluation(familyLeak), /split_leakage/);
});

test("fixture validation rejects malformed scored fields, domains and duplicate judgments", async () => {
  const {data} = await loadEvaluation();
  assert.throws(()=>validateEvaluation(null), /invalid_evaluation_dataset/);
  for (const [collection, field, otherField] of [["projects", "passage", "title"], ["queries", "title", "passage"]]) {
    for (const value of [undefined, null, 42, [], {}, "", "   ", "---"]) {
      const bad = structuredClone(data);
      bad[collection][0][field] = value;
      bad[collection][0][otherField] = "An unrelated fallback must not make invalid scored text valid";
      assert.throws(()=>validateEvaluation(bad), /invalid_evaluation_text/);
    }
    for (const domain of [undefined, null, 42, "", "unknown"]) {
      const bad = structuredClone(data);
      bad[collection][0].domain = domain;
      assert.throws(()=>validateEvaluation(bad), /invalid_evaluation_domain/);
    }
    for (const field of ["id", "family"]) {
      const bad = structuredClone(data);
      bad[collection][0][field] = "   ";
      assert.throws(()=>validateEvaluation(bad), /invalid_evaluation_identity/);
    }
  }
  const duplicate = structuredClone(data);
  duplicate.queries[0].relevant.push(duplicate.queries[0].relevant[0]);
  assert.throws(()=>validateEvaluation(duplicate), /invalid_judgment/);
});

test("empty returns cannot manufacture precision and recall counts abstentions", () => {
  const empty = { id:"q", family:"one", relevant:2, returned:0, correct:0, candidateRecall:.5, finalRecall:0,
    precision:null, falsePositiveNoMatch:false, unsupportedConfirmation:false, durationMs:0 };
  const report = summarize([empty]);
  assert.equal(report.precisionAmongReturnedAt5,null);
  assert.equal(report.finalRecallAt5,0);
  assert.equal(report.candidateRecallAt80,.5);
  assert.equal(report.positiveQueryAbstentions,1);
  assert.equal(summarize([{...empty,relevant:0,returned:1,precision:0,falsePositiveNoMatch:true}]).noMatchFalsePositives,1);
});

test("development regression compares precision AND recall with the frozen baseline", async () => {
  const {data} = await loadEvaluation();
  for (const path of ["indexed","device","full-corpus"]) {
    const before = evaluate(data,"development",false,path);
    const after = evaluate(data,"development",true,path);
    assert.ok(after.summary.finalRecallAt5 > before.summary.finalRecallAt5, path);
    assert.equal(after.summary.unsupportedConfirmations,0);
    assert.equal(after.summary.noMatchFalsePositives,0);
    for (const [key,cell] of Object.entries(after.byDomainAndDirection)) {
      assert.ok(cell.finalRecallAt5 >= before.byDomainAndDirection[key].finalRecallAt5, `${path}/${key} recall`);
      assert.ok(cell.precisionAmongReturnedAt5 >= before.byDomainAndDirection[key].precisionAmongReturnedAt5, `${path}/${key} precision`);
    }
  }
});

test("snapshot misses remain visible", async () => {
  const {data} = await loadEvaluation();
  const full = evaluate(data,"development",true,"full-corpus");
  const snapshot = evaluate(data,"development",true,"device");
  assert.ok(snapshot.summary.finalRecallAt5 < full.summary.finalRecallAt5);
});

test("review worksheets expose opaque pair IDs and keep source identities in a separate key", async () => {
  const {data} = await loadEvaluation();
  const {pairs,key} = reviewPairs(data,"development");
  assert.equal(pairs.length,8800);
  assert.equal(key.length,pairs.length);
  assert.equal(new Set(pairs.map(p=>p.pairId)).size,pairs.length);
  assert.equal(new Set(key.map(k=>JSON.stringify([k.queryId,k.projectId]))).size,key.length);
  const mappings = new Map(key.map(row=>[row.pairId,row]));
  const queries = new Map(data.queries.map(row=>[row.id,row]));
  const projects = new Map(data.projects.map(row=>[row.id,row]));
  for (const pair of pairs) {
    assert.deepEqual(Object.keys(pair).sort(),["direction","pairId","passage","query","rationale","relevant","reviewer"]);
    assert.match(pair.pairId,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.equal(pair.relevant,null);
    assert.equal(pair.reviewer,"");
    const mapping = mappings.get(pair.pairId);
    assert.equal(pair.query,queries.get(mapping.queryId).title);
    assert.equal(pair.direction,queries.get(mapping.queryId).kind);
    assert.equal(pair.passage,projects.get(mapping.projectId).passage);
  }
});

test("worksheet CLI writes a mapping only when separately requested", async t => {
  const directory = await mkdtemp(join(tmpdir(),"weave-evaluation-"));
  t.after(()=>rm(directory,{ recursive:true,force:true }));
  const script = fileURLToPath(new URL("../scripts/matching-heldout.mjs",import.meta.url));
  const run = args => spawnSync(process.execPath,[script,"--split","development",...args],{ encoding:"utf8",timeout:30000 });
  const worksheet = join(directory,"review.jsonl"), keyFile = join(directory,"key.jsonl");
  const onlyWorksheet = run(["--review-output",worksheet]);
  assert.equal(onlyWorksheet.status,0,onlyWorksheet.stderr);
  assert.deepEqual(await readdir(directory),["review.jsonl"]);
  const withKey = run(["--review-output",worksheet,"--review-key-output",keyFile]);
  assert.equal(withKey.status,0,withKey.stderr);
  const parse = text => text.trim().split("\n").map(line=>JSON.parse(line));
  const pairs = parse(await readFile(worksheet,"utf8")), key = parse(await readFile(keyFile,"utf8"));
  assert.deepEqual(pairs.map(p=>p.pairId),key.map(k=>k.pairId));
  assert.ok(pairs.every(p=>!Object.hasOwn(p,"queryId") && !Object.hasOwn(p,"projectId")));
  const original = await readFile(worksheet,"utf8");
  const sameFile = run(["--review-output",worksheet,"--review-key-output",worksheet]);
  assert.notEqual(sameFile.status,0);
  assert.match(sameFile.stderr,/review_key_requires_separate_file/);
  assert.equal(await readFile(worksheet,"utf8"),original);
  const keyOnly = run(["--review-key-output",keyFile]);
  assert.notEqual(keyOnly.status,0);
  assert.match(keyOnly.stderr,/review_key_requires_worksheet/);
  const alias = join(directory,"worksheet-alias.jsonl");
  await symlink(worksheet,alias);
  const aliasedKey = run(["--review-output",worksheet,"--review-key-output",alias]);
  assert.notEqual(aliasedKey.status,0);
  assert.match(aliasedKey.stderr,/EEXIST/);
  assert.equal(await readFile(worksheet,"utf8"),original);
});

test("compact reports preserve metadata and every failure while omitting successful rows", () => {
  const success = { id:"success",relevant:2,returned:2,correct:2,candidateRecall:1,finalRecall:1,
    precision:1,falsePositiveNoMatch:false,unsupportedConfirmation:false,results:["a","b"],durationMs:1 };
  const rows = [success,
    { ...success,id:"recall",returned:1,correct:1,finalRecall:.5,results:["a"] },
    { ...success,id:"precision",returned:3,precision:2/3,results:["a","b","c"] },
    { ...success,id:"no-match-error",relevant:0,returned:1,correct:0,finalRecall:null,precision:0,falsePositiveNoMatch:true,results:["c"] },
    { ...success,id:"unsupported",unsupportedConfirmation:true },
    { ...success,id:"no-match-abstention",relevant:0,returned:0,correct:0,finalRecall:null,precision:null,results:[] },
  ];
  const report = { fixtureSha256:"fixture",baselineSha256:"baseline",engineSha256:"engine",split:"development",
    evaluationStatus:"development-regression",limits:["synthetic"],paths:{ indexed:{ improved:{
      engine:"candidate",path:"indexed",summary:summarize(rows),byDomainAndDirection:{"art/need":summarize(rows)},rows,
    } } } };
  const original = structuredClone(report), compact = compactReport(report);
  const { paths, ...metadata } = report;
  const { paths:compactPaths, ...compactMetadata } = compact;
  assert.deepEqual(compactMetadata,metadata);
  assert.deepEqual(compactPaths.indexed.improved.summary,paths.indexed.improved.summary);
  assert.deepEqual(compactPaths.indexed.improved.byDomainAndDirection,paths.indexed.improved.byDomainAndDirection);
  assert.equal(Object.hasOwn(compactPaths.indexed.improved,"rows"),false);
  assert.deepEqual(compactPaths.indexed.improved.misses.map(row=>row.id),["recall","precision","no-match-error","unsupported"]);
  assert.ok(compactPaths.indexed.improved.misses.every(row=>!Object.hasOwn(row,"durationMs")));
  assert.deepEqual(report,original);
});
