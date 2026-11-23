import assert from 'node:assert/strict';
import fs from 'node:fs';

// Name normalizations apply the naming rule (verification standard, "Program names")
// without changing any term: on November 22, 2026 names lost their em dashes and status
// words, and on November 23 a missing space before a year was restored. Each pass keeps
// its earlier names in research/maintenance-history/name-normalization-<date>/renames.json.
// These helpers set the archived names back, newest pass first, so audits of earlier
// catalogs keep checking their original hashes. A name that is neither the old nor the
// new one fails here. Audits use them through audit-revisions.mjs.
const root = new URL('../../', import.meta.url);
const historyDir = new URL('research/maintenance-history/', root);
export const renameArchives = fs.readdirSync(historyDir)
  .filter(name => /^name-normalization-\d{4}-\d{2}-\d{2}$/.test(name)).sort().reverse()
  .map(name => JSON.parse(fs.readFileSync(new URL(name + '/renames.json', historyDir), 'utf8')));
const programRenames = renameArchives.map(archive => new Map(archive.programs.map(row => [row.fundId + '::' + row.programId, row])));
const funderRenames = renameArchives.map(archive => new Map(archive.funders.map(row => [row.after, row.before])));
export const renamedPaths = new Set(renameArchives.flatMap(archive => archive.programs.map(row => row.path)));

// A record may already carry an earlier name, as in a catalog rewound past a pass, so
// each pass only steps back from its own new name. Any name no pass recorded fails.
function programBefore(fundId, program) {
  const rows = programRenames.map(renames => renames.get(fundId + '::' + program.id)).filter(Boolean);
  if (!rows.length) return;
  assert.ok(rows.some(row => program.name === row.after || program.name === row.before), fundId + ' ' + program.id + ' name: ' + program.name);
  for (const row of rows) if (program.name === row.after) program.name = row.before;
}

// Funder names were replaced wherever the whole string appeared, so they go back the same way.
function funderNamesBefore(value) {
  if (typeof value === 'string') return funderRenames.reduce((name, renames) => renames.get(name) ?? name, value);
  if (Array.isArray(value)) return value.map(funderNamesBefore);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, funderNamesBefore(item)]));
  return value;
}

// dist/data/funders.json with the earlier names. A funder's displayed program is a copy
// of one of its program names, so it goes back with them.
export function catalogBeforeNames(catalog) {
  const restored = funderNamesBefore(catalog);
  for (const fund of restored.funds) {
    for (const archive of renameArchives) {
      const displayed = archive.programs.find(row => row.fundId === fund.id && row.after === fund.program);
      if (displayed) fund.program = displayed.before;
    }
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
