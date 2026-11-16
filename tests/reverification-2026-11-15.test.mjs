import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {validateResearch} from '../scripts/research-validation.mjs';
import {validConditions, checkConditions} from '../dist/matching.mjs';
import {upcomingWindows} from '../dist/deadlines.mjs';
import {reverificationArchive as archive} from './helpers/reverification-2026-11-15.mjs';
import {auditCatalog, auditInput, auditFileHash, beforeRevisions} from './helpers/audit-revisions.mjs';

const read = path => JSON.parse(fs.readFileSync(new URL('../' + path, import.meta.url)));
const canonical = v => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
const hash = v => createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
const catalog = read('dist/data/funders.json');
// Before this pass, and as this pass left it before any later journaled revision.
const prior = auditCatalog(catalog);
const afterPass = beforeRevisions(catalog);
const conditionsFile = read('dist/data/program-conditions.json');
const schema = read('dist/data/enrichment.schema.json');
const log = read('research/maintenance-review-log.json');
const run = log.runs.find(r => r.id === archive.runId);
const thursday = read('research/maintenance-history/thursday-2026-11-05/proposals.json');
const monday = read('research/discovery-2026-11-09.json');
const program = (funds, fundId, programId) => funds.find(f => f.id === fundId)?.enrichment.programs.find(p => p.id === programId);
const applied = [
  ['local-nlnet', 'nlnet-restack-call2-2027'],
  ['local-funbio', 'funbio-articulacao-institucional-11-2026'],
  ['local-cdfw', 'cdfw-golden-mussel-delta-2026'],
];

test('the archive rebuilds the exact catalog, inputs and screening state from before the pass', () => {
  assert.equal(archive.baseCommit, 'f54bf29362fc05109aff9038d74b7808d2130c84');
  assert.equal(archive.priorTopLevel.compiledAt, '2026-10-30T05:14:23.839542+00:00');
  for (const [path, expected] of Object.entries(archive.priorFileSha256))
    if (path !== 'dist/data/research-coverage.json') assert.equal(auditFileHash(path), expected, path);
  assert.equal(hash(prior.funds), archive.priorCatalogFundsSha256);
  assert.equal(hash(auditInput('research/supplemental-funders.json')), archive.priorManifestSha256);
  for (const change of archive.changes) assert.equal(hash(change.priorFundRecord), change.priorFundSha256, change.fundId);
  assert.deepEqual(catalog.funds.map(f => f.id), prior.funds.map(f => f.id));
  assert.equal(catalog.funds.length, 699);
  assert.deepEqual(catalog.funds.slice(0, 593).map(f => f.id), read('research/source-record-ids.json'));
  assert.deepEqual(archive.changes.map(c => c.fundId).sort(),
    ['local-cdfw', 'local-funbio', 'local-la-city-cultural-affairs', 'local-nlnet', 'recqd3f6mBVBdH2ID']);
  assert.deepEqual(archive.changes.filter(c => c.appendedProgramIds.length).map(c => [c.fundId, ...c.appendedProgramIds]).sort(), [...applied].sort());
  for (const change of archive.changes.filter(c => !c.appendedProgramIds.length)) {
    assert.ok(change.displayReselected, change.fundId);
    assert.deepEqual(afterPass.funds.find(f => f.id === change.fundId).enrichment, change.priorFundRecord.enrichment, 'research terms unchanged');
  }
  assert.ok(catalog.compiledAt > archive.priorTopLevel.compiledAt);
});

test('applied rounds sit under existing funders with evidence, unknowns and a screening condition per requirement', () => {
  assert.ok(validConditions(conditionsFile, catalog.funds));
  for (const [fundId, programId] of applied) {
    assert.ok(prior.funds.some(f => f.id === fundId), 'existing funder ' + fundId);
    assert.equal(program(prior.funds, fundId, programId), undefined, 'new round ' + programId);
    const fund = catalog.funds.find(f => f.id === fundId);
    const p = program(catalog.funds, fundId, programId);
    validateResearch(fund.enrichment, schema);
    assert.ok(p.unknowns.length, programId);
    assert.equal(p.award.basis, 'current_offer', programId);
    for (const e of p.evidence) assert.ok(fund.enrichment.sources.some(s => s.url === e.url), e.url);
    for (const requirement of p.applicants.requirements)
      assert.ok(conditionsFile.conditions.some(c => c.fundId === fundId && c.programId === programId && c.requirement === requirement), requirement);
    const checks = checkConditions({}, fundId, programId, conditionsFile.conditions, '2026-11-15');
    assert.equal(checks.length, p.applicants.requirements.length, programId);
    assert.ok(checks.every(c => c.outcome === 'needs_confirmation'), programId);
  }
  const call2 = program(catalog.funds, 'local-nlnet', 'nlnet-restack-call2-2027');
  assert.equal(call2.application.deadlineInstant, '2027-01-03T11:00:00Z');
  assert.ok(!call2.costs.supported.join(' ').includes('accessibility'), 'accessibility is not a named eligible cost');
  assert.deepEqual(program(catalog.funds, 'local-nlnet', 'nlnet-restack'), program(prior.funds, 'local-nlnet', 'nlnet-restack'), 'first call retained');
  const articulacao = program(catalog.funds, 'local-funbio', 'funbio-articulacao-institucional-11-2026');
  assert.equal(articulacao.application.deadlineInstant, '2026-12-05T02:45:00Z');
  assert.equal(articulacao.award.max, 1000000);
  assert.equal(articulacao.award.durationMonths, 24);
  const mussel = program(catalog.funds, 'local-cdfw', 'cdfw-golden-mussel-delta-2026');
  assert.equal(mussel.application.closesOn, '2026-12-15');
  assert.equal(mussel.application.deadlineInstant, null, 'Pacific Time and PDT conflict: no exact cutoff');
  assert.equal(mussel.award.max, null, 'the USD 6 million pool is not an individual award');
  const ids = upcomingWindows(catalog.funds, new Date('2026-11-15T12:00:00Z'), 60).map(w => w.program.id);
  for (const [, programId] of applied) assert.ok(ids.includes(programId), programId);
  assert.ok(!upcomingWindows(catalog.funds, new Date('2027-01-03T11:00:01Z'), 60).some(w => w.program.id === call2.id));
});

test('the stale call stays out of the catalog, and this pass left the existing-term revisions unapplied', () => {
  assert.equal(program(catalog.funds, 'local-funbio', 'funbio-tcsa-porto-sul-10-2026'), undefined);
  assert.equal(program(catalog.funds, 'local-nlnet', 'nlnet-restack-call2-2026'), undefined, 'duplicate Thursday id not added');
  for (const proposal of thursday.proposals.filter(p => p.kind === 'revise-existing')) {
    const held = program(afterPass.funds, proposal.fundId, proposal.programId);
    assert.deepEqual(held.application, proposal.before.application ?? proposal.before, proposal.programId);
  }
});

test('the review log keeps attempts, field checks and proposal outcomes apart', () => {
  assert.ok(run);
  assert.equal(run.runType, 'manual-reverification');
  const s = run.sources;
  assert.equal(new Set(s.map(x => x.url)).size, s.length);
  for (const [key, predicate] of Object.entries({
    attempted: () => true, retrieved: x => x.retrieval === 'retrieved', retrievalFailed: x => x.retrieval === 'failed',
    verified: x => x.review === 'verified', reviewedNoTerms: x => x.review === 'reviewed-no-terms', failed: x => x.review === 'failed',
  })) assert.equal(run.sourceCounts[key], s.filter(predicate).length, key);
  assert.equal(run.sourceCounts.verified + run.sourceCounts.reviewedNoTerms + run.sourceCounts.failed, s.length);
  for (const x of s) {
    assert.equal(x.review === 'verified', x.fields.length > 0, x.id);
    assert.equal(x.verifiedOn, x.fields.length ? run.localDate : null, x.id);
    if (x.retrieval === 'failed') assert.equal(x.review, 'failed', x.id);
  }
  const entries = log.entries.filter(e => e.runId === run.id);
  assert.deepEqual(entries.map(e => e.recordKey), s.map(x => run.id + '::' + x.id));
  for (const e of entries) {
    assert.equal(e.verifiedOn, null, 'no whole-record verification date advances');
    assert.equal(e.fieldVerifiedOn, e.fields.length ? run.localDate : null);
  }
  const proposed = [
    ...thursday.proposals.map(p => p.fundId + '::' + (p.kind === 'add-distinct-round' ? p.proposedProgramId : p.programId)),
    ...monday.programAdditions.map(a => a.sourceRecordId + '::' + a.program.id),
  ];
  assert.deepEqual(run.proposalOutcomes.map(o => o.key).sort(), proposed.sort());
  const outcomes = Object.fromEntries(run.proposalOutcomes.map(o => [o.key, o.outcome]));
  assert.equal(outcomes['local-funbio::funbio-tcsa-porto-sul-10-2026'], 'dropped-stale');
  assert.equal(outcomes['local-nlnet::nlnet-restack-call2-2026'], 'superseded');
  assert.deepEqual(run.proposalOutcomes.filter(o => o.outcome === 'held-revision').map(o => o.key.split('::')[1]).sort(),
    ['spencer-small-research', 'susan-t-buffett-scholarship', 'whitley-2027']);
  assert.deepEqual(run.appliedAdditions.map(a => [a.fundId, a.programId]), applied);
  assert.deepEqual(run.appliedRevisions, []);
  assert.deepEqual(run.conditionsAdded, archive.appendedConditionIds);
  assert.equal(run.catalogCompile.compiledAt, catalog.compiledAt);
  assert.deepEqual(run.catalogCompile.displayReselections.map(r => r.fundId),
    archive.changes.filter(c => c.displayReselected).map(c => c.fundId));
});
