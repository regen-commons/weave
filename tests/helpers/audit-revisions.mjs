import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {beforeProgramRevisions,inputBeforeRevisions,loadRevisions} from '../../scripts/revision-history.mjs';
import {catalogBefore,manifestBefore,conditionsBefore} from './reverification-2026-11-15.mjs';
const root=new URL('../../',import.meta.url);
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');

// Historical audits check the catalog compiled on October 30, 2026. Undo journaled
// program revisions first, then the November 15 appends that preceded the journal.
export const beforeRevisions=data=>beforeProgramRevisions(data,root);
export const auditCatalog=data=>catalogBefore(beforeRevisions(data));
const appendsUndone={
  'research/supplemental-funders.json':manifestBefore,
  'research/program-conditions.json':conditionsBefore,
};
export const auditInput=path=>(appendsUndone[path]??(value=>value))(inputBeforeRevisions(path,root));

// Files the November 15 pass changed are rebuilt from the audit views. Any other file
// uses the hash recorded before its first journaled revision, or its current bytes.
const rebuilt={
  'dist/data/funders.json':()=>JSON.stringify(auditCatalog(JSON.parse(fs.readFileSync(new URL('dist/data/funders.json',root),'utf8')))),
  'research/supplemental-funders.json':()=>JSON.stringify(auditInput('research/supplemental-funders.json'),null,2)+'\n',
  'research/program-conditions.json':()=>JSON.stringify(auditInput('research/program-conditions.json'),null,2)+'\n',
  'dist/data/program-conditions.json':()=>JSON.stringify(auditInput('research/program-conditions.json'),null,2)+'\n',
};
export function auditFileHash(path) {
  if(rebuilt[path]) return sha256(rebuilt[path]());
  const earliest=loadRevisions(root).find(r=>Object.hasOwn(r.beforeFileSha256,path));
  return earliest?.beforeFileSha256[path] ?? sha256(fs.readFileSync(new URL(path,root)));
}
