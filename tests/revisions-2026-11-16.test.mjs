import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadRevisions} from '../scripts/revision-history.mjs';

// The November 16 go-live deadline check found the Haymarket note still saying its page
// used "was" for the 2026-27 deadline. The page now says "is"; the date is unchanged and
// the page's older October 2025 and 2024-2025 references stay recorded as conflicts.
const root = new URL('../', import.meta.url);
const read = path => JSON.parse(fs.readFileSync(new URL(path, root)));
const catalog = read('dist/data/funders.json');
const log = read('research/maintenance-review-log.json');
const fundId = 'recTQMgGnvmEseTmT', programId = 'sustaining-grants2026-27';
const revision = loadRevisions(root).find(r => r.id === '2026-11-16-haymarket-deadline-wording');
const fund = catalog.funds.find(f => f.id === fundId);
const program = fund.enrichment.programs.find(p => p.id === programId);

test('the Haymarket revision changes only the note and its unknowns, never the dates or route', () => {
  assert.ok(revision);
  assert.deepEqual([revision.fundId, revision.programId, revision.reviewedOn], [fundId, programId, '2026-11-16']);
  assert.deepEqual(revision.changedPaths, ['application.note', 'unknowns']);
  const {route, opensOn, closesOn, deadlineInstant} = program.application;
  assert.deepEqual([route, opensOn, closesOn, deadlineInstant], ['unconfirmed', null, '2026-12-02', null]);
  assert.deepEqual(program.application, {...revision.beforeProgram.application, note: program.application.note});
  assert.equal(fund.verifiedOn, revision.priorFundRecord.verifiedOn, 'whole-record verification date does not advance');
  for (const source of revision.priorFundRecord.enrichment.sources)
    assert.ok(fund.enrichment.sources.some(s => JSON.stringify(s) === JSON.stringify(source)), 'prior source version retained');
});

test('the note follows the page today and keeps its conflicting package reference unresolved', () => {
  const {note} = program.application;
  assert.doesNotMatch(note, /\bwas\b|past tense/);
  assert.match(note, /deadline is December 2, 2026/);
  assert.match(note, /November 30, 2026/);
  assert.match(note, /October 2025/);
  assert.match(note, /stays unconfirmed/);
  assert.ok(program.unknowns.some(u => /October 2025/.test(u)));
  assert.ok(program.unknowns.some(u => /2024–2025 Grant Cycle/.test(u)));
  assert.ok(program.evidence.some(e => e.checkedOn === '2026-11-16' && e.fields.includes('application') && e.fields.includes('unknowns')));
});

test('the review log records the check that supports the revision', () => {
  const run = log.runs.find(r => r.id === 'revision-2026-11-16-haymarket');
  assert.deepEqual(run.appliedRevisions, [revision.id]);
  assert.deepEqual(log.entries.filter(e => e.runId === run.id).map(e => e.recordKey), run.sources.map(s => run.id + '::' + s.id));
  assert.deepEqual(run.sources.map(s => [s.url, s.verifiedOn, s.fields]), [[program.application.url, '2026-11-16', ['application', 'unknowns']]]);
});
