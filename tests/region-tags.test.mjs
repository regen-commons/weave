import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {filterFunds} from '../dist/domain.mjs';

const root = new URL('../', import.meta.url);
const read = p => JSON.parse(fs.readFileSync(new URL(p, root)));
const canonical = v => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
const hash = v => createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
const archive = read('research/maintenance-history/region-tags-2026-10-29/revisions.json');
const catalog = read('dist/data/funders.json');
const funds = catalog.funds;

test('CDFW and FUNBIO remain discoverable when search is combined with their work-region filter', () => {
  for (const [id,q,region] of [
    ['local-cdfw','Mojave Desert Tortoise','North America'],
    ['local-funbio','FUNBIO','Latin America & Caribbean'],
  ]) {
    assert.ok(filterFunds(funds,{q,region}).some(f=>f.id===id),id);
    assert.ok(filterFunds(funds,{q}).some(f=>f.id===id),id);
    assert.ok(!filterFunds(funds,{q,region:'Europe'}).some(f=>f.id===id),id);
    const old=archive.revisions.find(r=>r.fundId===id).priorFundRecord;
    assert.equal(filterFunds([old],{q,region}).length,0,'prior record reproduces the reported filter gap');
  }
});

test('region corrections recover every prior full record and input without changing eligibility or evidence', () => {
  assert.equal(archive.baseCommit,'1c86877af0db2a7f0465412008ec067103b8dc39');
  assert.equal(funds.length,archive.catalogRecordCount);
  assert.deepEqual(archive.revisions.map(r=>r.fundId),['local-cdfw','local-funbio']);
  const prior = funds.map(f => {
    const revision=archive.revisions.find(r=>r.fundId===f.id);
    if (!revision) return f;
    assert.equal(hash(revision.priorFundRecord),revision.priorFundSha256);
    assert.deepEqual(f.regions,revision.afterRegions);
    assert.deepEqual(f.enrichment.regions,revision.afterRegions);
    const restored=structuredClone(f);
    restored.regions=revision.priorFundRecord.regions;
    restored.enrichment.regions=revision.priorFundRecord.enrichment.regions;
    assert.deepEqual(restored,revision.priorFundRecord,'only broad region fields may differ');
    return restored;
  });
  assert.equal(hash(prior),archive.priorCatalogFundsSha256,'all 699 prior full records recover exactly');
  const manifest=read('research/supplemental-funders.json');
  for(const revision of archive.revisions) {
    const index=manifest.funds.findIndex(r=>r.fund.id===revision.fundId);
    const restored=structuredClone(manifest.funds[index]);
    restored.enrichment.regions=revision.priorInputEntry.enrichment.regions;
    assert.deepEqual(restored,revision.priorInputEntry);
    manifest.funds[index]=revision.priorInputEntry;
  }
  assert.equal(hash(manifest),archive.priorManifestSha256);
  for(const [path,expected] of Object.entries(archive.unchangedFilesSha256))
    assert.equal(createHash('sha256').update(fs.readFileSync(new URL(path,root))).digest('hex'),expected,path);
});

test('normal import reproduces corrected regions and all retained program terms', () => {
  const dir=fs.mkdtempSync(join(tmpdir(),'funding-region-import-'));
  try {
    for(const path of ['research','scripts','dist/data']) fs.cpSync(new URL(path,root),join(dir,path),{recursive:true});
    // Pin the clock to the committed compile so a passing deadline cannot change the expected catalog.
    const result=spawnSync('python3',['scripts/import-data.py','--as-of',catalog.compiledAt],{cwd:dir,encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    assert.deepEqual(JSON.parse(fs.readFileSync(join(dir,'dist/data/funders.json'))).funds,funds);
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
