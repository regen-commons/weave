import assert from 'node:assert/strict';
import fs from 'node:fs';

// The November 15 re-verification pass appended three program rounds, their sources and
// their screening conditions, and recompiled the catalog at the current date, which
// reselected the displayed program for funders whose earlier program had closed.
// These helpers undo exactly the archived changes, so older audits keep checking
// their original hashes. Anything else that differs fails here. Audits use them
// through audit-revisions.mjs, which first undoes any later journaled revision.
const root = new URL('../../', import.meta.url);
export const reverificationArchive = JSON.parse(fs.readFileSync(
  new URL('research/maintenance-history/reverification-2026-11-15/preservation.json', root)));
const changes = new Map(reverificationArchive.changes.map(change => [change.fundId, change]));

const dropTail = (items, expected, key, label) => {
  const tail = items.slice(items.length - expected.length);
  assert.deepEqual(tail.map(item => item[key]), expected, label);
  return items.slice(0, items.length - expected.length);
};

function fundBefore(fund) {
  const change = changes.get(fund.id);
  if (!change) return fund;
  const prior = change.priorFundRecord;
  const restored = structuredClone(fund);
  restored.enrichment.programs = dropTail(restored.enrichment.programs, change.appendedProgramIds, 'id', fund.id + ' appended programs');
  restored.enrichment.sources = dropTail(restored.enrichment.sources, change.appendedSourceUrls, 'url', fund.id + ' appended sources');
  restored.additionalSources = restored.enrichment.sources.slice(1).map(source => source.url);
  for (const field of reverificationArchive.displayFields) {
    if (Object.hasOwn(prior, field)) restored[field] = prior[field];
    else delete restored[field];
  }
  assert.deepEqual(restored, prior, fund.id + ' may differ only by appended terms and display reselection');
  return restored;
}

// The full catalog (dist/data/funders.json) as it stood before the pass.
export function catalogBefore(catalog) {
  const restored = {...catalog, ...structuredClone(reverificationArchive.priorTopLevel)};
  restored.funds = catalog.funds.map(fundBefore);
  return restored;
}

// research/supplemental-funders.json as it stood before the pass.
export function manifestBefore(manifest) {
  const restored = structuredClone(manifest);
  for (const change of changes.values()) {
    if (change.manifestIndex === null) continue;
    const row = restored.funds[change.manifestIndex];
    assert.equal(row.fund.id, change.fundId);
    const e = row.enrichment;
    e.programs = dropTail(e.programs, change.appendedProgramIds, 'id', change.fundId + ' input programs');
    e.sources = dropTail(e.sources, change.appendedSourceUrls, 'url', change.fundId + ' input sources');
    assert.deepEqual(row, change.priorInputEntry, change.fundId + ' input entry');
  }
  return restored;
}

// research/program-conditions.json or its generated copy as it stood before the pass.
export function conditionsBefore(file) {
  return {...file, conditions: dropTail(file.conditions, reverificationArchive.appendedConditionIds, 'id', 'appended conditions')};
}
