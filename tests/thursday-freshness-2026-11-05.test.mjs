import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {catalogBefore} from './helpers/reverification-2026-11-15.mjs';

const read = path => JSON.parse(fs.readFileSync(new URL('../' + path, import.meta.url)));
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const hash = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const root = 'research/maintenance-history/thursday-2026-11-05/';
const baseline = read(root + 'preservation.json');
const archive = read(root + 'proposals.json');
const coverage = read('research/freshness-coverage-2026-11-05.json');
const inventory = read('research/freshness-inventory-2026-11-05.json');
const log = read('research/maintenance-review-log.json');
const funds = catalogBefore(read('dist/data/funders.json')).funds;

test('November freshness proposals retain all 699 records and preceding ledger entries', () => {
  assert.equal(funds.length, baseline.fundCount);
  assert.equal(Object.keys(baseline.fundHashes).length, 699);
  for (const fund of funds) assert.equal(hash(fund), baseline.fundHashes[fund.id], fund.id);
  assert.deepEqual(funds.slice(0, 593).map(fund => fund.id), read('research/source-record-ids.json'));
  assert.equal(hash(log.entries.slice(0, baseline.priorEntryCount)), baseline.priorEntriesSha256);
  assert.equal(hash(log.runs.slice(0, baseline.priorRunCount)), baseline.priorRunsSha256);
  assert.equal(archive.applied, false);
  for (const proposal of archive.proposals) {
    assert.equal(hash(proposal.priorFundRecord), proposal.priorFundSha256);
    assert.deepEqual(proposal.priorFundRecord, funds.find(fund => fund.id === proposal.fundId));
    assert.deepEqual(proposal.before, proposal.priorFundRecord.enrichment.programs.find(program => program.id === proposal.programId).application);
    if (proposal.kind === 'add-distinct-round') assert.notEqual(proposal.proposedProgramId, proposal.programId);
  }
});

test('November coverage keeps failed and partial checks separate from whole-record verification', () => {
  const ordered = [...inventory.records].sort((a, b) => {
    for (const field of ['lastVerifiedOn', 'fundId', 'programId']) {
      const x = a[field] ?? '', y = b[field] ?? '';
      if (x !== y) return x < y ? -1 : 1;
    }
    return 0;
  });
  const expected = ordered.filter(record => !record.priorityReasons.length).slice(0, 125);
  assert.deepEqual(coverage.recordReviews.filter(record => record.selection === 'oldest-125').map(record => record.recordKey), expected.map(record => record.recordKey));
  assert.equal(new Set(coverage.sources.map(source => source.url)).size, 240);
  for (const record of coverage.recordReviews) {
    assert.equal(record.verifiedOn, null);
    if (!record.fields.length) assert.equal(record.fieldVerifiedOn, null);
    if (record.sourceId) assert.ok(coverage.sources.some(source => source.id === record.sourceId));
  }
  for (const source of coverage.sources) {
    if (source.review === 'failed') assert.deepEqual(source.fields, []);
    assert.equal(Boolean(source.verifiedOn), Boolean(source.fields.length));
  }
  assert.deepEqual(log.entries.filter(entry => entry.runId === coverage.runId), coverage.recordReviews);
  assert.equal(coverage.summary.allSelected.completeTermReviews, 0);
});
