import assert from 'node:assert/strict';
import fs from 'node:fs';

// On November 22, 2026 program names lost their em dashes and status words, and two
// funder names lost their em dash (verification standard, "Program names"). These
// helpers set the archived names back, so audits of earlier catalogs keep checking
// their original hashes. A name that is neither the old nor the new one fails here.
// Audits use them through audit-revisions.mjs.
const root = new URL('../../', import.meta.url);
export const renameArchive = JSON.parse(fs.readFileSync(
  new URL('research/maintenance-history/name-normalization-2026-11-22/renames.json', root)));
const programRenames = new Map(renameArchive.programs.map(row => [row.fundId + '::' + row.programId, row]));
const funderRenames = new Map(renameArchive.funders.map(row => [row.after, row.before]));
export const renamedPaths = new Set(renameArchive.programs.map(row => row.path));

function programBefore(fundId, program) {
  const row = programRenames.get(fundId + '::' + program.id);
  if (!row || program.name === row.before) return;
  assert.equal(program.name, row.after, fundId + ' ' + program.id + ' name');
  program.name = row.before;
}

// Funder names were replaced wherever the whole string appeared, so they go back the same way.
function funderNamesBefore(value) {
  if (typeof value === 'string') return funderRenames.get(value) ?? value;
  if (Array.isArray(value)) return value.map(funderNamesBefore);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, funderNamesBefore(item)]));
  return value;
}

// dist/data/funders.json with the earlier names. A funder's displayed program is a copy
// of one of its program names, so it goes back with them.
export function catalogBeforeNames(catalog) {
  const restored = funderNamesBefore(catalog);
  for (const fund of restored.funds) {
    const displayed = renameArchive.programs.find(row => row.fundId === fund.id && row.after === fund.program);
    if (displayed) fund.program = displayed.before;
    for (const program of fund.enrichment?.programs ?? []) programBefore(fund.id, program);
  }
  return restored;
}

// A research input file, parsed, with the earlier names.
export function inputBeforeNames(path, value) {
  if (!renamedPaths.has(path)) return value;
  const restored = path === 'research/supplemental-funders.json' ? funderNamesBefore(value) : structuredClone(value);
  if (Array.isArray(restored)) {
    for (const record of restored) for (const program of record.programs) programBefore(record.sourceRecordId, program);
    return restored;
  }
  for (const row of restored.funds) for (const program of row.enrichment.programs) programBefore(row.fund.id, program);
  for (const row of restored.programAdditions ?? []) programBefore(row.sourceRecordId, row.program);
  return restored;
}

// The bytes of a research input file as they stood before the renames.
export const fileBeforeNames = path => JSON.stringify(inputBeforeNames(path, JSON.parse(fs.readFileSync(new URL(path, root), 'utf8'))), null, 2) + '\n';
