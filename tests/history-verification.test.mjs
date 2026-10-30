import {auditCatalog,auditInput} from './helpers/audit-revisions.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {upcomingWindows} from '../dist/deadlines.mjs';
import {checkConditions} from '../dist/matching.mjs';
import {priorFundingRecord, verificationBaseline as baseline} from './helpers/prior-funding-record.mjs';
const read = path => JSON.parse(fs.readFileSync(new URL('../'+path, import.meta.url)));
const data = auditCatalog(read('dist/data/funders.json'));
const intake = read('research/history-intake.json');
const conditions = auditInput('research/program-conditions.json').conditions;
const canonical = v => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
const hash = v => createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
const programs = new Map(data.funds.flatMap(f => f.enrichment.programs.map(p => [f.id+'::'+p.id, p])));
const added = intake.reviewed.flatMap(r => r.programs);

test('verification retains every prior field and program/source revision across all 630 records', () => {
  assert.equal(Object.keys(baseline.sha256ById).length, 630);
  assert.deepEqual(data.funds.slice(0,630).map(f => f.id), Object.keys(baseline.sha256ById));
  for (const fund of data.funds.slice(0,630))
    assert.equal(hash(priorFundingRecord(fund)), baseline.sha256ById[fund.id], fund.id);
  assert.deepEqual(Object.keys(baseline.appendedTo).sort(), ['reccZG8TtBrCwLG7R','local-nlnet','local-acta','local-interledger','local-lido-lego'].sort());
  assert.equal(data.funds.length, 699); // Current total; all historical hashes above remain unchanged.
});

test('all 94 original leads have a disposition and every imported reference resolves uniquely', () => {
  assert.equal(intake.reviewed.length, 94);
  assert.equal(intake.pending.length, 0);
  assert.deepEqual(intake.reviewed.map(r => r.id), Array.from({length:94}, (_, i) => 'history-lead-'+String(i+1).padStart(3,'0')));
  assert.equal(hash(intake.reviewed.map(({id,name,discoveryUrl,initialUnresolved}) => ({id,name,discoveryUrl,status:'needs-verification',unresolved:initialUnresolved}))), baseline.leadQueueSha256);
  assert.equal(added.length, 87);
  assert.equal(new Set(added.map(r => r.fundId+'::'+r.programId)).size, 87);
  assert.equal(intake.reviewed.filter(r => r.status === 'imported').length, 81);
  for (const row of intake.reviewed) {
    assert.ok(row.officialSources.length && row.findings.length, row.id);
    assert.notEqual(row.status, 'needs-verification');
    assert.equal(row.status === 'imported', row.programs.length > 0);
    for (const ref of row.programs) assert.ok(programs.has(ref.fundId+'::'+ref.programId), row.id);
  }
  for (const n of [1,8,20,23,36,38,49,54,59,61,62,64,66])
    assert.equal(intake.reviewed[n-1].programs.length,0,'held lead '+n);
});

test('new requirements require answers and every new program retains evidence and unknowns', () => {
  for (const {fundId,programId} of added) {
    const p = programs.get(fundId+'::'+programId);
    const checks = checkConditions({},fundId,programId,conditions,'2026-10-29');
    for (const requirement of p.applicants.requirements)
      assert.ok(conditions.some(c => c.fundId===fundId && c.programId===programId && c.requirement===requirement), programId);
    assert.ok(checks.every(c => c.outcome !== 'self_reported'), programId);
    assert.ok(p.evidence.length && p.unknowns.length, programId);
    if (p.application.route === 'closed') assert.equal(p.award.basis,'historical',programId);
  }
});

test('deadline pulse includes verified windows without turning closed, future or conflicted calls into leads', () => {
  const windows = upcomingWindows(data.funds,new Date(2026,9,29,12),21);
  const ids = windows.map(w => w.program.id);
  for (const id of ['la-near-2027-28','la-co-up-2027-28','cnra-youth-access-round4','cpuc-cea-lat-round3','rocket-pool-gmc-round42']) assert.ok(ids.includes(id),id);
  for (const ref of added) {
    const p=programs.get(ref.fundId+'::'+ref.programId);
    if (['closed','future','unconfirmed','directory'].includes(p.application.route)) assert.ok(!ids.includes(p.id),p.id);
  }
  const cpuc=programs.get('local-cpuc::cpuc-cea-lat-round3');
  assert.ok(cpuc.applicants.requirements.some(r=>r.includes('91326')));
  assert.equal(cpuc.application.deadlineInstant,null);
  assert.equal(cpuc.award.max,null,'round budget is not a per-award ceiling');
  const rocket=programs.get('local-rocket-pool::rocket-pool-gmc-round42');
  assert.equal(rocket.application.deadlineInstant,'2026-11-07T23:59:00Z');
  assert.ok(!upcomingWindows(data.funds,new Date('2026-11-08T00:00:00Z')).some(w=>w.program.id===rocket.id));
  assert.equal(programs.get('local-ma-earth::ma-earth-round4').application.opensOn,null,'fundraising start is not an application start');
  assert.equal(programs.get('local-us-doe::doe-sbir-phase1-future').application.closesOn,null);
});
