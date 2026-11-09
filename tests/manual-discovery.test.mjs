import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {validateSnapshot} from '../scripts/research-validation.mjs';
import {upcomingWindows} from '../dist/deadlines.mjs';
const root = new URL('../', import.meta.url);
const read = p => JSON.parse(fs.readFileSync(new URL(p, root)));
const canonical = v => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
const hash = v => createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
const bytesHash = v => createHash('sha256').update(v).digest('hex');
const baseline = read('research/manual-discovery-baseline-2026-10-29.json');
const data = read('dist/data/funders.json');
const log = read('research/maintenance-review-log.json');
const run = log.runs.find(r => r.id === 'manual-monday-discovery-2026-10-29');

test('manual discovery preserves all 694 full prior records, 721 programs and 1824 source revisions', () => {
  assert.equal(baseline.recordCount, 694);
  assert.equal(baseline.programCount, 721);
  assert.equal(baseline.sourceCount, 1824);
  assert.equal(Object.keys(baseline.sha256ById).length, 694);
  assert.deepEqual(data.funds.slice(0,694).map(f => f.id), Object.keys(baseline.sha256ById));
  for (const fund of data.funds.slice(0,694)) assert.equal(hash(fund), baseline.sha256ById[fund.id], fund.id);
  assert.equal(data.funds.length, 699);
  assert.equal(data.funds.reduce((n,f) => n + f.enrichment.programs.length,0), 727);
  assert.equal(data.funds.reduce((n,f) => n + f.enrichment.sources.length,0), 1835);
  for (const [path,expected] of Object.entries(baseline.preservedFiles))
    assert.equal(bytesHash(fs.readFileSync(new URL(path,root))), expected, path);
  assert.equal(hash(log.entries.slice(0,112)), baseline.reviewEntriesSha256);
  const manifest = read('research/supplemental-funders.json');
  const original = {...manifest, funds: manifest.funds.slice(0,101)};
  assert.equal(hash(original), baseline.manifestSha256, 'all previous input terms and metadata retained');
});

test('manual coverage separates verified fields, retrieved shells, failures and unreviewed discovery leads', () => {
  assert.equal(run.runType, 'manual-test');
  assert.equal(run.scheduledTimerObserved, false);
  assert.equal(run.pendingHistoricalLeadsAtStart, 0);
  assert.equal(run.unresolvedHistoricalLeadsRevisited.length, 4);
  assert.equal(new Set(run.sources.map(s => s.url)).size, 37);
  assert.deepEqual(run.sourceCounts, {selected:37,attempted:37,retrieved:31,verified:17,failed:8,reviewedNoTerms:12,unreviewed:0,retrievalFailed:6});
  for (const [key,predicate] of Object.entries({retrieved:s=>s.retrieval==='retrieved',verified:s=>s.review==='verified',failed:s=>s.review==='failed',reviewedNoTerms:s=>s.review==='reviewed-no-terms',unreviewed:s=>s.review==='unreviewed',retrievalFailed:s=>s.retrieval==='failed'}))
    assert.equal(run.sources.filter(predicate).length,run.sourceCounts[key],key);
  for (const s of run.sources) {
    assert.ok(s.finding && s.nextReviewOn);
    if(s.review==='verified') {assert.equal(s.retrieval,'retrieved');assert.ok(s.fields.length);assert.equal(s.verifiedOn,'2026-10-29');}
    else {assert.equal(s.verifiedOn,null);assert.deepEqual(s.fields,[]);}
  }
  assert.equal(run.deferredLeads.filter(l=>l.status==='unreviewed-call-terms').length,5);
  assert.deepEqual(run.revisedPrograms,[]);
  assert.equal(run.additions.length,5);
});

test('new deadlines retain established timezones, unknowns and conditional award basis', () => {
  const programs = new Map(data.funds.flatMap(f=>f.enrichment.programs.map(p=>[p.id,p])));
  assert.equal(programs.get('hacker-initiative-signal-noise-2026').application.deadlineInstant,'2026-11-10T07:59:00Z');
  assert.equal(programs.get('linux-australia-project-2026').application.deadlineInstant,'2026-11-16T11:59:00Z');
  assert.equal(programs.get('linux-australia-community-2026').award.currency,null);
  assert.equal(programs.get('linux-australia-project-2026').award.max,null);
  assert.equal(programs.get('cdfw-mojave-tortoise-2026').application.deadlineInstant,null);
  assert.equal(programs.get('cdfw-mojave-tortoise-2026').award.max,null);
  assert.equal(programs.get('people-powered-cda-2027').award.max,10000,'bonus is separate and conditional');
  assert.equal(programs.get('funbio-floresta-viva-sao-francisco-2026').award.max,null,'pool is not an individual award');
  assert.equal(programs.get('funbio-floresta-viva-sao-francisco-2026').application.deadlineInstant,'2026-12-02T22:00:00Z');
  const ids=upcomingWindows(data.funds,new Date('2026-10-29T19:00:00Z'),21).map(w=>w.program.id);
  for(const id of ['hacker-initiative-signal-noise-2026','linux-australia-project-2026','linux-australia-community-2026']) assert.ok(ids.includes(id),id);
  assert.ok(!upcomingWindows(data.funds,new Date('2026-11-16T12:00:00Z'),21).some(w=>w.program.id.startsWith('linux-australia-')));
});

test('importing additions preserves the frozen pre-supplemental audit; validation rejects corrupted historical coverage', () => {
  const provenance=read('research/deepening-result-provenance.json');
  const completed=fs.readFileSync(new URL('research/deepening-result.json',root));
  assert.equal(provenance.originalSha256,'82846451880d8c72c58c13ff9a73a1d33d960b18f76382b76a3a1a11d5e31bd2');
  assert.equal(bytesHash(completed),provenance.originalSha256);
  assert.equal(bytesHash(fs.readFileSync(new URL(provenance.priorPublishedArchive,root))),baseline.priorPublishedAuditSha256);
  assert.deepEqual(read('dist/data/research-followup.json'),JSON.parse(completed));
  assert.notDeepEqual(read('dist/data/research-followup.json').fieldCoverage,data.fieldCoverage);
  const dir=fs.mkdtempSync(join(tmpdir(),'funding-manual-preservation-'));
  try {
    for(const p of ['research','dist/data','scripts']) fs.cpSync(new URL(p,root),join(dir,p),{recursive:true});
    const result=spawnSync('python3',['scripts/import-data.py'],{cwd:dir,encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    assert.deepEqual(JSON.parse(fs.readFileSync(join(dir,'dist/data/research-followup.json'))),JSON.parse(completed));
    validateSnapshot(pathToFileURL(dir+'/'));
    const bad=JSON.parse(completed);bad.fieldCoverage.focus++;
    fs.writeFileSync(join(dir,'dist/data/research-followup.json'),JSON.stringify(bad));
    assert.throws(()=>validateSnapshot(pathToFileURL(dir+'/')),/Published follow-up report differs/);
    // The fixed original hash above also protects the authoritative completed result.
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
