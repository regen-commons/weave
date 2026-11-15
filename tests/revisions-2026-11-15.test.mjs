import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {loadRevisions} from '../scripts/revision-history.mjs';
import {effectiveAccess} from '../dist/domain.mjs';
import {upcomingWindows} from '../dist/deadlines.mjs';
import {beforeRevisions} from './helpers/audit-revisions.mjs';

const root = new URL('../', import.meta.url);
const read = path => JSON.parse(fs.readFileSync(new URL(path, root)));
const catalog = read('dist/data/funders.json');
const before = beforeRevisions(catalog);
const revisions = loadRevisions(root);
const log = read('research/maintenance-review-log.json');
const run = log.runs.find(r => r.id === 'revisions-2026-11-15');
const thursday = read('research/maintenance-history/thursday-2026-11-05/proposals.json');
const manual = read('research/maintenance-history/manual-thursday-2026-10-29/proposals.json');
const novemberBaseline = read('research/maintenance-history/thursday-2026-11-05/preservation.json');
const canonical = v => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
const hash = v => createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
const fund = (funds, id) => funds.find(f => f.id === id);
const program = (funds, id, programId) => fund(funds, id).enrichment.programs.find(p => p.id === programId);
const now = new Date('2026-11-15T20:00:00Z');
const expected = [
  ['2026-11-15-buffett-2027-dates', 'recUfkfwM3ISTcnSH', 'susan-t-buffett-scholarship'],
  ['2026-11-15-spencer-2027-pause', 'recrvyr2BGCOy0NAI', 'spencer-small-research'],
  ['2026-11-15-emergent-2027-resumption', 'recgDAwfqtJyo2MEx', 'rapid-response-organizing-grants'],
];

test('the journal holds the three re-verified revisions, each starting from the held proposal terms', () => {
  assert.deepEqual(revisions.map(r => [r.id, r.fundId, r.programId]), expected);
  const held = [...thursday.proposals, ...manual.proposals];
  for (const r of revisions) {
    assert.equal(r.reviewedOn, '2026-11-15', r.id);
    // The November 15 appends did not touch these funders, so each prior record is the
    // one the November 5 run hashed.
    assert.equal(hash(r.priorFundRecord), novemberBaseline.fundHashes[r.fundId], r.id);
    const proposal = held.find(p => p.fundId === r.fundId && p.programId === r.programId);
    assert.deepEqual(r.beforeProgram.application, proposal.before.application ?? proposal.before, r.id);
    for (const key of Object.keys(r.beforeProgram))
      if (!['application', 'unknowns', 'evidence'].includes(key)) assert.deepEqual(r.afterProgram[key], r.beforeProgram[key], r.id + ' ' + key);
    assert.ok(r.afterProgram.evidence.some(e => e.checkedOn === '2026-11-15' && e.fields.includes('application')), r.id);
    const current = fund(catalog.funds, r.fundId);
    for (const source of r.priorFundRecord.enrichment.sources) assert.ok(current.enrichment.sources.some(s => JSON.stringify(s) === JSON.stringify(source)), r.id);
    for (const source of r.sources) assert.ok(current.enrichment.sources.some(s => JSON.stringify(s) === JSON.stringify(source)), r.id);
    assert.equal(current.verifiedOn, r.priorFundRecord.verifiedOn, 'whole-record verification date does not advance');
  }
});

test('current terms carry the re-verified dates without inventing an open route', () => {
  const buffett = program(catalog.funds, 'recUfkfwM3ISTcnSH', 'susan-t-buffett-scholarship').application;
  assert.deepEqual([buffett.route, buffett.opensOn, buffett.closesOn, buffett.deadlineInstant], ['future', '2026-12-01', '2027-03-01', '2027-03-01T23:00:00Z']);
  assert.doesNotMatch(buffett.note, /November 1/);
  const spencer = program(catalog.funds, 'recrvyr2BGCOy0NAI', 'spencer-small-research').application;
  assert.deepEqual([spencer.route, spencer.opensOn, spencer.closesOn], ['closed', null, null]);
  assert.match(spencer.note, /January and\s+June 2027/);
  const emergent = program(catalog.funds, 'recgDAwfqtJyo2MEx', 'rapid-response-organizing-grants').application;
  assert.deepEqual([emergent.route, emergent.opensOn, emergent.closesOn, emergent.deadlineInstant], ['future', '2027-01-01', null, null]);
  assert.match(emergent.note, /conflicts/);
  assert.equal(effectiveAccess(fund(catalog.funds, 'recUfkfwM3ISTcnSH'), now), 'future');
  assert.equal(effectiveAccess(fund(catalog.funds, 'recgDAwfqtJyo2MEx'), now), 'future');
  const ids = upcomingWindows(catalog.funds, now, 180).map(w => w.program.id);
  for (const [, , programId] of expected) assert.ok(!ids.includes(programId), programId + ' is not an open window');
});

test('Whitley stays held: its passed cutoff already reads as closed', () => {
  const whitley = fund(catalog.funds, 'local-whitley');
  assert.deepEqual(whitley, fund(before.funds, 'local-whitley'));
  assert.equal(whitley.enrichment.programs[0].application.closesOn, '2026-10-30');
  assert.equal(effectiveAccess(whitley, now), 'closed');
  assert.ok(!revisions.some(r => r.fundId === 'local-whitley'));
});

test('the review log records this pass separately from the checks it reuses', () => {
  assert.ok(run);
  for (const [key, predicate] of Object.entries({
    attempted: () => true, retrieved: s => s.retrieval === 'retrieved', retrievalFailed: s => s.retrieval === 'failed',
    verified: s => s.review === 'verified', reviewedNoTerms: s => s.review === 'reviewed-no-terms', failed: s => s.review === 'failed',
  })) assert.equal(run.sourceCounts[key], run.sources.filter(predicate).length, key);
  for (const s of run.sources) {
    assert.equal(s.verifiedOn, s.fields.length ? '2026-11-15' : null, s.id);
    if (s.retrieval === 'failed') assert.deepEqual(s.fields, [], s.id);
  }
  assert.deepEqual(log.entries.filter(e => e.runId === run.id).map(e => e.recordKey), run.sources.map(s => run.id + '::' + s.id));
  assert.deepEqual(run.appliedRevisions, expected.map(([id]) => id));
  const reused = log.runs.find(r => r.id === run.reusedChecks[0].runId);
  for (const id of run.reusedChecks[0].sourceIds) assert.equal(reused.sources.find(s => s.id === id).attemptedOn, run.localDate, id);
  assert.equal(run.revisionOutcomes.find(o => o.key === 'local-whitley::whitley-2027').outcome, 'held');
});
