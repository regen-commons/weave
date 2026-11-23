import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {discoveryPlan, freshnessPlan} from '../scripts/research-plan.mjs';

const read = path => JSON.parse(fs.readFileSync(new URL('../'+path, import.meta.url)));
const text = path => fs.readFileSync(new URL('../'+path, import.meta.url), 'utf8');
const registry = read('research/discovery-sources.json');
const coverage = read('research/search-coverage.json');
const intervals = read('research/review-intervals.json');
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const cellIds = new Set(coverage.themes.flatMap(theme => coverage.places.map(place => theme.id+'/'+place.id)));

test('every registry source says what it covers, how to reach it and how far to trust it', () => {
  const themes = new Set(coverage.themes.map(theme => theme.id));
  const ids = new Set();
  for (const source of registry.sources) {
    assert.match(source.id, /^[a-z0-9-]+$/);
    assert.ok(!ids.has(source.id), 'duplicate '+source.id); ids.add(source.id);
    assert.equal(new URL(source.url).protocol, 'https:', source.id);
    assert.ok(['government-portal','funder-directory','foundation-database','ecosystem-list','aggregator'].includes(source.kind), source.id);
    assert.ok(['official-call-directory','discovery-only'].includes(source.role), source.id);
    assert.ok(['free','registration','paid'].includes(source.access.cost), source.id);
    assert.ok(['official','curated','community'].includes(source.reliability.level), source.id);
    assert.ok(['active','candidate','blocked','retired'].includes(source.status), source.id);
    for (const note of [source.name, source.access.terms, source.query, source.reliability.note]) assert.ok(note.trim(), source.id);
    assert.ok(Number.isInteger(source.cadenceDays) && source.cadenceDays >= 0, source.id);
    assert.ok(source.covers.themes.length && source.covers.places.length && source.covers.languages.length, source.id);
    for (const theme of source.covers.themes) assert.ok(themes.has(theme), source.id+' theme '+theme);
    for (const form of source.covers.formsOfCapital) assert.ok(coverage.formsOfCapital.includes(form), source.id+' form '+form);
    // Only a source's own listing can be evidence; a database or aggregator never is.
    if (source.role === 'official-call-directory') assert.ok(['government-portal','funder-directory'].includes(source.kind), source.id);
    if (source.reliability.level === 'official') assert.equal(source.role, 'official-call-directory', source.id);
    // A source nobody has used makes no claim about a past result, and a used one names it.
    if (source.status === 'candidate') assert.equal(source.lastUsed, null, source.id);
    else {
      assert.match(source.lastUsed.on, DATE, source.id);
      assert.ok(source.lastUsed.runId && source.lastUsed.result, source.id);
    }
  }
});

test('the coverage ledger only records cells and forms it defines', () => {
  assert.equal(coverage.formsOfCapital.length, 8);
  const seen = new Set();
  for (const cell of coverage.cells) {
    assert.ok(cellIds.has(cell.id), cell.id);
    assert.ok(!seen.has(cell.id), 'duplicate '+cell.id); seen.add(cell.id);
    assert.match(cell.lastSearchedOn, DATE);
    assert.ok(cell.runId && cell.result, cell.id);
    assert.equal(cell.forms.financial, cell.lastSearchedOn, cell.id+' searches money every time');
    for (const [form, on] of Object.entries(cell.forms)) {
      assert.ok(coverage.formsOfCapital.includes(form), cell.id+' '+form);
      assert.ok(DATE.test(on) && on <= cell.lastSearchedOn, cell.id+' '+form);
    }
  }
});

const fixture = {
  registry: {sources: [
    {id: 'weekly', name: 'Weekly', status: 'active', cadenceDays: 7, access: {cost: 'free'}, lastUsed: {on: '2026-11-01'}},
    {id: 'fresh', name: 'Fresh', status: 'active', cadenceDays: 28, access: {cost: 'free'}, lastUsed: {on: '2026-11-01'}},
    {id: 'new', name: 'New', status: 'candidate', cadenceDays: 28, access: {cost: 'free'}, lastUsed: null},
    {id: 'paid', name: 'Paid', status: 'candidate', cadenceDays: 28, access: {cost: 'paid'}, lastUsed: null},
    {id: 'unscheduled', name: 'Unscheduled', status: 'active', cadenceDays: 0, access: {cost: 'free'}, lastUsed: null},
  ]},
  coverage: {cadenceDays: 28, cellsPerRun: 3, formsOfCapital: ['financial','material','living'],
    themes: [{id: 'a'}, {id: 'b'}], places: [{id: 'x', languages: ['en']}, {id: 'y', languages: ['pt']}],
    cells: [
      {id: 'a/x', lastSearchedOn: '2026-11-10', forms: {financial: '2026-11-10', material: '2026-11-10'}},
      {id: 'b/y', lastSearchedOn: '2026-10-01', forms: {financial: '2026-10-01', material: '2026-09-01', living: '2026-10-01'}},
    ]},
};

test('discovery plans due sources and the longest-unsearched cells, and skips what was just covered', () => {
  const plan = discoveryPlan({...fixture, asOf: '2026-11-15'});
  assert.deepEqual(plan.sources.map(source => source.id), ['new', 'weekly']);
  assert.deepEqual(plan.cells.map(cell => cell.id), ['a/y', 'b/x', 'b/y']);
  assert.equal(plan.cellsDue, 3);
  assert.deepEqual(plan.cells.find(cell => cell.id === 'b/y').formsOfCapital, ['financial', 'material']);
  assert.deepEqual(plan.cells.find(cell => cell.id === 'a/y').languages, ['pt']);
  assert.deepEqual(discoveryPlan({...fixture, asOf: '2026-11-15'}), plan, 'same records, same plan');
});

const program = (id, application, checkedOn) => ({id, name: id, application, evidence: [{checkedOn}]});
const catalog = {funds: [
  {id: 'f1', name: 'One', enrichment: {programs: [
    program('closing', {route: 'open', closesOn: '2026-12-01'}, '2026-11-01'),
    program('checked', {route: 'open', closesOn: '2026-12-01'}, '2026-11-18'),
    program('passed', {route: 'open', closesOn: '2026-11-10'}, '2026-11-18'),
    program('old-closed', {route: 'closed', closesOn: '2026-01-01'}, '2026-08-01'),
    program('recent-closed', {route: 'closed', closesOn: '2026-01-01'}, '2026-10-01'),
    program('flaky', {route: 'rolling'}, '2026-11-18'),
  ]}},
  {id: 'f2', name: 'Two', verifiedOn: '2026-07-01', enrichment: {programs: []}},
]};
const failed = attemptedOn => ({fundId: 'f1', programId: 'flaky', attemptedOn, verifiedOn: null, result: 'failed'});
const log = {entries: [failed('2026-11-05'), failed('2026-11-12'), failed('2026-11-19'),
  {fundId: 'f1', programId: 'recent-closed', attemptedOn: '2026-10-01', verifiedOn: '2026-10-01', result: 'verified', nextReviewOn: '2026-11-15'}]};

test('freshness puts near deadlines, passed cutoffs and failing sources first, then the oldest due', () => {
  const plan = freshnessPlan({catalog, log, intervals, asOf: '2026-11-20'});
  const reasons = Object.fromEntries(plan.priority.map(record => [record.programId, record.reasons]));
  assert.deepEqual(reasons, {passed: ['cutoff-passed-still-open'], closing: ['closing-soon'], flaky: ['repeated-failed-retrieval']});
  // An earlier review a run asked for counts; a record inside its interval does not.
  assert.deepEqual(plan.oldestDue.map(record => record.id), ['f2::@source', 'f1::old-closed', 'f1::recent-closed']);
  assert.equal(plan.records, 7);
});

test('a failed retrieval never counts as a verification', () => {
  const plan = freshnessPlan({catalog, log, intervals, asOf: '2026-11-20'});
  const flaky = [...plan.priority, ...plan.oldestDue].find(record => record.programId === 'flaky');
  assert.equal(flaky.lastVerifiedOn, '2026-11-18');
});

test('the verification standard states the intervals the planner applies', () => {
  const standard = text('.claude/skills/catalog-research/verification-standard.md');
  const row = label => standard.split('\n').find(line => line.startsWith('| '+label)) ?? assert.fail('no row: '+label);
  assert.match(row('A program closing within'), new RegExp(`within ${intervals.closingWindowDays} days \\| ${intervals.closingRecheckDays} days`));
  const days = route => intervals.routeDays[route];
  for (const [label, routes] of [['Route and dates', ['open','rolling','inquiry','future','unconfirmed','unverified']], ['Route of a', ['closed','relationship','restricted','directory']]]) {
    for (const route of routes) assert.ok(row(label).includes('`'+route+'`') && row(label).includes(`| ${days(route)} days`), route);
  }
  assert.equal(days('source-only'), days('closed'));
  assert.ok(row('Eligibility, award, geography and costs of an active').includes(`| ${intervals.termsDays.active} days`));
  assert.ok(row('Eligibility, award, geography and costs of an inactive').includes(`| ${intervals.termsDays.inactive} days`));
  assert.ok(row('Funder identity').includes(`| ${intervals.identityDays} days`));
  assert.deepEqual(Object.keys(intervals.routeDays).filter(route => route !== 'source-only').sort(), [...read('dist/data/enrichment.schema.json').properties.programs.items.properties.application.properties.route.enum].sort());
});

test('program and funder names carry no em dash, and every rename keeps its earlier name', () => {
  const catalog = read('dist/data/funders.json');
  const renames = read('research/maintenance-history/name-normalization-2026-11-22/renames.json');
  const programs = new Map(catalog.funds.flatMap(fund => (fund.enrichment?.programs ?? []).map(program => [fund.id+'::'+program.id, program.name])));
  for (const fund of catalog.funds) for (const name of [fund.name, fund.displayName, fund.program]) assert.ok(!name.includes('—'), fund.id+' '+name);
  for (const [key, name] of programs) assert.ok(!name.includes('—'), key+' '+name);
  for (const row of renames.programs) {
    assert.ok(row.before.includes('—') && row.before !== row.after, row.programId);
    assert.ok(programs.has(row.fundId+'::'+row.programId), 'program id kept: '+row.programId);
  }
  // A funder's programs stay distinguishable by name.
  for (const fund of catalog.funds) {
    const names = (fund.enrichment?.programs ?? []).map(program => program.name);
    assert.equal(new Set(names).size, names.length, fund.id);
  }
});
