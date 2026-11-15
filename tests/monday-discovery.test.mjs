import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {validateResearch} from '../scripts/research-validation.mjs';
import {validConditions, checkConditions} from '../dist/matching.mjs';
import {upcomingWindows} from '../dist/deadlines.mjs';

const read = path => JSON.parse(fs.readFileSync(new URL('../'+path, import.meta.url)));
const canonical = v => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])) : v;
const hash = v => createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
const catalog=read('dist/data/funders.json');
const proposals=read('research/discovery-2026-11-09.json');
const archive=read('research/maintenance-history/monday-discovery-2026-11-09/preservation.json');
const schema=read('dist/data/enrichment.schema.json');

test('Monday research preserves all 699 full records and every prior program/source revision', () => {
  assert.equal(proposals.status,'verified-proposals-not-applied');
  assert.deepEqual(catalog.funds.map(f=>f.id),Object.keys(archive.sha256ById));
  for(const fund of catalog.funds) assert.equal(hash(fund),archive.sha256ById[fund.id],fund.id);
  assert.equal(hash(read('research/supplemental-funders.json')),archive.priorManifestSha256);
  assert.deepEqual(catalog.funds.slice(0,593).map(f=>f.id),read('research/source-record-ids.json'));
  for(const [id,prior] of Object.entries(archive.priorRecords)) {
    assert.equal(hash(prior),archive.sha256ById[id]);
    assert.deepEqual(prior,catalog.funds.find(f=>f.id===id));
  }
});

test('proposed additions fit existing identities, schemas and screening without mutating the catalog', () => {
  const funds=structuredClone(catalog.funds);
  const keys=new Set();
  for(const row of proposals.programAdditions) {
    const fund=funds.find(f=>f.id===row.sourceRecordId);
    assert.ok(fund,'existing funder identity');
    const key=fund.id+'::'+row.program.id;
    assert.ok(!keys.has(key));keys.add(key);
    assert.ok(!fund.enrichment.programs.some(p=>p.id===row.program.id));
    fund.enrichment.programs.push(row.program);
    for(const source of row.sources) if(!fund.enrichment.sources.some(s=>s.url===source.url)) fund.enrichment.sources.push(source);
    validateResearch(fund.enrichment,schema);
    assert.equal(row.proposedConditions.length,row.program.applicants.requirements.length);
    for(const req of row.program.applicants.requirements) assert.ok(row.proposedConditions.some(c=>c.requirement===req));
    assert.ok(row.program.unknowns.length);
  }
  const conditions={version:1,checkedOn:'2026-11-09',conditions:proposals.programAdditions.flatMap(r=>r.proposedConditions)};
  assert.ok(validConditions(conditions,funds));
  for(const row of proposals.programAdditions) {
    const checks=checkConditions({},row.sourceRecordId,row.program.id,conditions.conditions,'2026-11-09');
    assert.ok(checks.length);
    assert.ok(checks.every(c=>c.outcome!=='self_reported'));
  }
  assert.equal(keys.size,4);
  assert.equal(funds.find(f=>f.id==='local-nlnet').enrichment.programs.find(p=>p.id==='nlnet-restack').application.deadlineInstant,'2026-11-03T11:00:00Z');
});

test('proposed windows keep unknown cutoffs and distinguish pools from individual awards', () => {
  const programs=new Map(proposals.programAdditions.map(r=>[r.program.id,r.program]));
  const next=programs.get('nlnet-restack-call2-2027');
  const funds=[{id:'local-nlnet',sourceWarnings:[],enrichment:{programs:[next]}}];
  assert.equal(next.application.deadlineInstant,'2027-01-03T11:00:00Z');
  assert.ok(!upcomingWindows(funds,new Date('2026-11-02T12:00:00Z'),90).length);
  assert.equal(upcomingWindows(funds,new Date('2026-11-09T17:00:00Z'),90).length,1);
  assert.ok(!upcomingWindows(funds,new Date('2027-01-03T11:00:01Z'),90).length);
  assert.equal(programs.get('funbio-articulacao-institucional-11-2026').application.deadlineInstant,'2026-12-05T02:45:00Z');
  for(const id of ['funbio-tcsa-porto-sul-10-2026','cdfw-golden-mussel-delta-2026']) {
    assert.equal(programs.get(id).application.deadlineInstant,null);
    assert.equal(programs.get(id).award.max,null);
  }
});

test('Monday coverage separates attempts, successful field checks and unapplied proposals', () => {
  const log=read('research/maintenance-review-log.json');
  const run=log.runs.find(r=>r.id===proposals.runId);
  assert.ok(run);
  assert.equal(run.priorCoverage.historyPending,0);
  assert.equal(run.sources.length,29);
  assert.equal(new Set(run.sources.map(s=>s.url)).size,29);
  for(const [key,predicate] of Object.entries({retrieved:s=>s.retrieval==='retrieved',retrievalFailed:s=>s.retrieval==='failed',verified:s=>s.review==='verified',reviewedNoTerms:s=>s.review==='reviewed-no-terms',failed:s=>s.review==='failed'}))
    assert.equal(run.sourceCounts[key],run.sources.filter(predicate).length,key);
  for(const source of run.sources) {
    if(source.review==='verified') {assert.ok(source.fields.length);assert.equal(source.verifiedOn,'2026-11-09');}
    else {assert.deepEqual(source.fields,[]);assert.equal(source.verifiedOn,null);}
  }
  assert.equal(log.entries.filter(e=>e.runId===run.id).length,run.sources.length);
  assert.deepEqual(run.appliedAdditions,[]);
  assert.deepEqual(run.appliedRevisions,[]);
  assert.equal(run.proposedAdditions.length,4);
  assert.deepEqual(run.inspectedPrUrls,[9,3].map(n=>'https://github.com/regen-commons/weave/pull/'+n));
});
