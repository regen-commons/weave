import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const read = path => JSON.parse(fs.readFileSync(new URL('../'+path, import.meta.url)));
const canonical = v => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
const hash = v => createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
const baseline = read('research/manual-freshness-baseline-2026-10-29.json');
const coverage = read('research/freshness-coverage-2026-10-29.json');
const inventory = read('research/freshness-inventory-2026-10-29.json');
const log = read('research/maintenance-review-log.json');
const archive = read('research/maintenance-history/manual-thursday-2026-10-29/proposals.json');
const funds = read('dist/data/funders.json').funds;
const sourceById = new Map(coverage.sources.map(s => [s.id,s]));
const runId = 'manual-thursday-2026-10-29';
const sorted = rows => [...rows].sort((a,b) => {
  for (const field of ['lastVerifiedOn','fundId','programId']) {
    const x=a[field]??'', y=b[field]??'';
    if(x!==y) return x<y?-1:1;
  }
  return 0;
});

test('manual freshness review preserves all 694 full records and older historical baselines', () => {
  assert.equal(baseline.commit,'4688d55232b847b422370441fa1e79d5273a0ec8');
  assert.equal(baseline.recordCount,694);
  assert.equal(baseline.programCount,721);
  assert.equal(baseline.sourceRevisionCount,1824);
  assert.equal(Object.keys(baseline.sha256ById).length,694);
  assert.deepEqual(funds.slice(0,694).map(f=>f.id),Object.keys(baseline.sha256ById));
  for(const [id,expected] of Object.entries(baseline.sha256ById))
    assert.equal(hash(funds.find(f=>f.id===id)),expected,id);
  assert.deepEqual(funds.slice(0,593).map(f=>f.id),read('research/source-record-ids.json'));
  for(const [path,expected] of Object.entries(baseline.protectedFileSha256))
    assert.equal(createHash('sha256').update(fs.readFileSync(new URL('../'+path,import.meta.url))).digest('hex'),expected,path);
});

test('manual review retains the prior ledger and makes no scheduled-timer claim', () => {
  assert.equal(baseline.priorReviewEntryCount,112);
  assert.equal(hash(log.entries.slice(0,112)),baseline.priorReviewEntriesSha256);
  const run=log.runs.find(r=>r.id===runId);
  assert.equal(run.kind,'manual-test');
  assert.equal(run.scheduledTimerObserved,false);
  assert.equal(coverage.execution.scheduledTimerObserved,false);
  assert.equal(coverage.execution.businessDate,'2026-10-29');
  assert.equal(coverage.execution.timeZone,'America/Los_Angeles');
  assert.deepEqual(run.summary,coverage.summary);
  assert.deepEqual(log.entries.filter(r=>r.runId===runId).map(r=>r.recordKey),coverage.recordReviews.map(r=>r.recordKey));
  assert.deepEqual(run.inspectedPrUrls,[6,3].map(n=>'https://github.com/regen-commons/funding-commons/pull/'+n));
});

test('priority coverage precedes a deterministic 125 oldest remaining records', () => {
  assert.equal(inventory.records.length,762);
  assert.equal(new Set(inventory.records.map(r=>r.recordKey)).size,762);
  assert.deepEqual(inventory.records,sorted(inventory.records));
  const priorities=inventory.records.filter(r=>r.priorityReasons.length);
  const oldest=sorted(inventory.records.filter(r=>!r.priorityReasons.length)).slice(0,125);
  assert.equal(priorities.length,128);
  assert.deepEqual(coverage.recordReviews.filter(r=>r.selection==='oldest-125').map(r=>r.recordKey),oldest.map(r=>r.recordKey));
  assert.deepEqual(coverage.recordReviews.filter(r=>r.selection==='priority').map(r=>r.recordKey).sort(),priorities.map(r=>r.recordKey).sort());
  const nearTerm=inventory.records.filter(r=>!['closed','future','unconfirmed','directory'].includes(r.route) && r.applicationSnapshot?.closesOn >= '2026-10-29' && r.applicationSnapshot.closesOn <= '2026-11-19');
  assert.equal(nearTerm.length,29);
  for(const r of nearTerm) assert.ok(r.priorityReasons.includes('deadline-within-21-days'),r.recordKey);
  assert.equal(coverage.recordReviews.length,253);
  assert.equal(new Set(coverage.recordReviews.map(r=>r.recordKey)).size,253);
  assert.deepEqual(coverage.backlog.notSelectedRecordKeys,inventory.records.filter(r=>r.selection==='not-selected').map(r=>r.recordKey));
  assert.equal(coverage.backlog.notSelectedRecordKeys.length,509);
});

test('retrieval, reviewed fields, failures and unreviewed sources reconcile without conflation', () => {
  const ss=coverage.sources, summary=coverage.summary.sources;
  assert.equal(ss.length,379);
  assert.equal(new Set(ss.map(s=>s.url)).size,379);
  assert.equal(new Set(ss.map(s=>s.id)).size,379);
  assert.deepEqual(Object.fromEntries(['verified-fields','reviewed-no-terms','failed','unreviewed'].map(status=>[status,ss.filter(s=>s.review.status===status).length])),{'verified-fields':217,'reviewed-no-terms':35,failed:73,unreviewed:54});
  assert.equal(summary.attemptedUrls,ss.length);
  assert.equal(summary.verifiedFields+summary.reviewedNoTerms+summary.failed+summary.unreviewed,ss.length);
  assert.equal(summary.directHttpSuccess,ss.filter(s=>s.retrieved.directHttpSuccess).length);
  assert.equal(summary.directUsableContent,ss.filter(s=>s.retrieved.directUsableContent).length);
  assert.equal(summary.fullContentAvailable,ss.filter(s=>s.retrieved.fullContentAvailable).length);
  for(const s of ss) {
    assert.ok(s.attempts.length,s.id);
    assert.equal(s.review.status==='verified-fields',s.review.fields.length>0,s.id);
    assert.equal(s.review.verifiedOn,s.review.fields.length?'2026-10-29':null,s.id);
    if(s.review.fields.length) {
      assert.ok(s.review.finding,s.id);
      assert.ok(s.retrieved.fullContentAvailable||s.review.evidenceForm==='official-indexed-excerpt',s.id);
    }
    if(s.review.status==='unreviewed') assert.equal(s.review.reviewedOn,null,s.id);
  }
  assert.deepEqual(ss.filter(s=>s.review.evidenceForm==='official-indexed-excerpt').map(s=>s.id),['source-021','source-341']);
  for(const id of ['source-021','source-341']) {
    assert.equal(sourceById.get(id).retrieved.fullContentAvailable,false);
    assert.ok(sourceById.get(id).attempts.some(a=>['http_error','unreachable'].includes(a.outcome)));
  }
  for(const [status,key] of [['failed','failedSourceIds'],['unreviewed','unreviewedSourceIds']])
    assert.deepEqual(coverage.backlog[key],ss.filter(s=>s.review.status===status).map(s=>s.id));
});

test('partial field reviews retain unknowns and never advance whole-record verification', () => {
  for(const r of coverage.recordReviews) {
    const verified=r.attemptedSourceIds.map(id=>sourceById.get(id)).filter(s=>s.review.fields.length);
    assert.deepEqual(r.fields,[...new Set(verified.flatMap(s=>s.review.fields))].sort(),r.recordKey);
    assert.equal(r.verifiedOn,null,r.recordKey);
    assert.equal(r.fieldVerifiedOn,r.fields.length?'2026-10-29':null,r.recordKey);
    const f=funds.find(f=>f.id===r.fundId), p=f.enrichment.programs.find(p=>p.id===r.programId);
    assert.deepEqual(r.unknownsRetained,p?.unknowns??[],r.recordKey);
    assert.ok(r.nextReviewOn,r.recordKey);
  }
  assert.equal(coverage.recordReviews.filter(r=>r.fields.length).length,197);
  assert.equal(coverage.recordReviews.filter(r=>r.fields.some(f=>f.startsWith('application'))).length,157);
  assert.deepEqual(coverage.backlog.selectedWithoutVerifiedFields,coverage.recordReviews.filter(r=>!r.fields.length).map(r=>r.recordKey));
  assert.equal(coverage.summary.allSelected.completeTermReviews,0);
});

test('proposed revisions retain exact prior records and remain unapplied', () => {
  assert.equal(archive.applied,false);
  assert.equal(archive.proposals.length,2);
  for(const p of archive.proposals) {
    assert.equal(p.status,'proposed-not-applied');
    assert.equal(hash(p.priorFundRecord),baseline.sha256ById[p.fundId]);
    assert.equal(p.priorFundSha256,baseline.sha256ById[p.fundId]);
    const current=funds.find(f=>f.id===p.fundId).enrichment.programs.find(x=>x.id===p.programId);
    assert.deepEqual(current.application,p.before.application);
    assert.deepEqual(current.unknowns,p.before.unknowns);
    assert.ok(p.sourceEvidence.every(e=>sourceById.has(e.sourceId)));
    assert.match(p.implementation,/Not imported/);
  }
  const [emergent,keeling]=archive.proposals;
  assert.equal(emergent.before.application.closesOn,'2026-10-22');
  assert.equal(emergent.after.application.route,'future');
  assert.equal(emergent.after.application.opensOn,'2027-01-01');
  assert.equal(emergent.after.application.closesOn,null);
  assert.equal(keeling.after.application.route,'closed');
  assert.equal(keeling.after.application.opensOn,null,'annual opening is not a dated verified call');
  assert.match(keeling.after.application.note,/sources conflict/);
});

test('unresolved historical leads and incomplete discovery remain held with explicit evidence limits', () => {
  const intake=read('research/history-intake.json');
  assert.equal(intake.pending.length,0);
  assert.equal(intake.reviewed.length,94);
  assert.deepEqual(coverage.discovery.historicalRevisits.map(r=>r.leadId),['history-lead-020','history-lead-023','history-lead-054','history-lead-059']);
  for(const r of coverage.discovery.historicalRevisits) {
    assert.equal(intake.reviewed.find(p=>p.id===r.leadId).status,'unresolved');
    assert.equal(r.verifiedOn,null);
    assert.ok(r.sourceIds.every(id=>sourceById.has(id)));
  }
  assert.equal(coverage.discovery.heldNewLeads.length,3);
  assert.ok(coverage.discovery.heldNewLeads.every(r=>r.unresolved));
});

// These hashes come from the independent PR heads before combining their ledgers.
test('combining discovery and freshness preserves both complete run records and entry sets', () => {
  const runs = read('research/maintenance-history/manual-thursday-2026-10-29/ledger-integration-baseline.json');
  assert.deepEqual(runs.map(r=>r.entryCount),[9,253]);
  for(const expected of runs) {
    const entries=log.entries.filter(e=>e.runId===expected.runId);
    assert.equal(entries.length,expected.entryCount,expected.runId);
    assert.equal(hash(entries),expected.entriesSha256,expected.runId);
    assert.equal(hash(log.runs.find(r=>r.id===expected.runId)),expected.runSha256,expected.runId);
    assert.equal(log.runs.filter(r=>r.id===expected.runId).length,1,expected.runId);
  }
});
