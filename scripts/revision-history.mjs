import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export function loadRevisions(root) {
  const path=new URL('research/revisions/index.json',root);
  if(!fs.existsSync(path)) return [];
  const index=JSON.parse(fs.readFileSync(path,'utf8'));
  if(index.version!==1 || !Array.isArray(index.revisions)) throw Error('Invalid revision index');
  const seen=new Set();
  return index.revisions.map(entry=>{
    if(!/^[a-z0-9][a-z0-9-]{0,100}$/.test(entry.id) || seen.has(entry.id) || entry.path!==`research/revisions/${entry.id}.json`)
      throw Error('Invalid or duplicate revision ID/path');
    seen.add(entry.id);
    const bytes=fs.readFileSync(new URL(entry.path,root));
    if(createHash('sha256').update(bytes).digest('hex')!==entry.sha256) throw Error('Revision archive checksum mismatch');
    return JSON.parse(bytes);
  });
}

export function validateRevisionHistory(root) {
  const revisions=loadRevisions(root);
  if(revisions.length) execFileSync('python3',[fileURLToPath(new URL('scripts/revision_import.py',root)),fileURLToPath(root)],{encoding:'utf8'});
}

// Restore the full historical catalog for immutable audit tests. Current behavior
// tests must continue to use the current catalog, rather than this historical view.
export function beforeProgramRevisions(data,root) {
  const copy=structuredClone(data);
  for(const revision of loadRevisions(root).reverse()) {
    const index=copy.funds.findIndex(f=>f.id===revision.fundId);
    if(index<0) throw Error('Archived fund identity missing');
    copy.funds[index]=structuredClone(revision.priorFundRecord);
  }
  return copy;
}

export function inputBeforeRevisions(path,root) {
  const value=JSON.parse(fs.readFileSync(new URL(path,root),'utf8'));
  for(const revision of loadRevisions(root).reverse()) for(const edit of [...revision.edits].reverse()) {
    if(edit.path!==path) continue;
    let parent=value;
    for(const key of edit.keys.slice(0,-1)) parent=parent[key];
    parent[edit.keys.at(-1)]=structuredClone(edit.before);
  }
  return value;
}
