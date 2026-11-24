import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {beforeProgramRevisions,inputBeforeRevisions,loadRevisions} from '../../scripts/revision-history.mjs';
import {catalogBefore,manifestBefore,conditionsBefore} from './reverification-2026-11-15.mjs';
import {catalogBeforeNames,inputBeforeNames,fileBeforeNames,renamedPaths} from './name-normalization.mjs';
const root=new URL('../../',import.meta.url);
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export const discoveryArchive=JSON.parse(fs.readFileSync(new URL('research/maintenance-history/discovery-2026-11-23/preservation.json',root)));
export function beforeDiscovery(data) {
  const restored=structuredClone(data);
  const fund=restored.funds.find(f=>f.id===discoveryArchive.fundId);
  assert.deepEqual(fund.enrichment.programs.pop(),discoveryArchive.addition.program);
  assert.deepEqual(fund.enrichment.sources.splice(-discoveryArchive.addition.sources.length),discoveryArchive.addition.sources);
  fund.additionalSources=fund.enrichment.sources.slice(1).map(s=>s.url);
  for(const {field,before,after} of discoveryArchive.displayChanges) {
    assert.deepEqual(fund[field],after,'archived discovery display '+field);
    fund[field]=before;
  }
  assert.deepEqual(fund,discoveryArchive.priorFundRecord,'discovery may only append the archived program and sources');
  return {...restored,...structuredClone(discoveryArchive.priorTopLevel)};
}
export function inputBeforeDiscovery(path,value) {
  if(!['research/supplemental-funders.json','research/history-intake.json'].includes(path)) return value;
  const restored=structuredClone(value);
  if(path==='research/history-intake.json') assert.deepEqual(restored.reviewed.pop(),discoveryArchive.intakeAddition);
  else assert.deepEqual(restored.programAdditions.pop(),discoveryArchive.addition);
  return restored;
}

// Historical audits check the catalog compiled on October 30, 2026. Undo the
// November 23 discovery, journaled revisions, name normalizations and finally
// the November 15 appends that preceded the journal.
export const beforeRevisions=data=>catalogBeforeNames(beforeProgramRevisions(beforeDiscovery(data),root));
export const auditCatalog=data=>catalogBefore(beforeRevisions(data));
const appendsUndone={
  'research/supplemental-funders.json':manifestBefore,
  'research/program-conditions.json':conditionsBefore,
};
export const auditInput=path=>(appendsUndone[path]??(value=>value))(inputBeforeNames(path,inputBeforeDiscovery(path,inputBeforeRevisions(path,root))));

// Files the November 15 pass changed are rebuilt from the audit views. Any other file
// uses the hash recorded before its first journaled revision, or its current bytes
// with the name normalizations undone.
const rebuilt={
  'research/history-intake.json':()=>JSON.stringify(auditInput('research/history-intake.json'),null,2)+'\n',
  'dist/data/funders.json':()=>JSON.stringify(auditCatalog(JSON.parse(fs.readFileSync(new URL('dist/data/funders.json',root),'utf8')))),
  'research/supplemental-funders.json':()=>JSON.stringify(auditInput('research/supplemental-funders.json'),null,2)+'\n',
  'research/program-conditions.json':()=>JSON.stringify(auditInput('research/program-conditions.json'),null,2)+'\n',
  'dist/data/program-conditions.json':()=>JSON.stringify(auditInput('research/program-conditions.json'),null,2)+'\n',
};
export function auditFileHash(path) {
  if(rebuilt[path]) return sha256(rebuilt[path]());
  const earliest=loadRevisions(root).find(r=>Object.hasOwn(r.beforeFileSha256,path));
  return earliest?.beforeFileSha256[path] ?? sha256(renamedPaths.has(path) ? fileBeforeNames(path) : fs.readFileSync(new URL(path,root)));
}
