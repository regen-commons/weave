import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {checkConditions, rankFunds, createLexicalIndex} from '../dist/matching.mjs';
import {normalizeProject} from '../dist/storage.mjs';
const read = name => JSON.parse(fs.readFileSync(new URL('../'+name,import.meta.url)));
const data=read('dist/data/funders.json');
const manifest=read('research/supplemental-funders.json');
const ids=read('research/source-record-ids.json');
const conditions=read('dist/data/program-conditions.json').conditions;
test('supplemental import preserves immutable upstream identities and distinct provenance',()=>{
 assert.equal(ids.length,593);
 assert.equal(new Set(ids).size,593);
 assert.deepEqual(data.funds.slice(0,593).map(f=>f.id),ids);
 assert.equal(data.funds.length,699);
 assert.equal(manifest.funds.length,106);
 for(const {fund} of manifest.funds){
  assert.match(fund.id,/^local-/);
  assert.equal(fund.origin.upstreamRecordId,null);
  assert(!ids.includes(fund.id));
 }
 for(const [file,hash] of Object.entries({
  'research/source-funders.json':'74f78d400608fa25df1dba0b7e9f4ff9175687b9affcae2b6453f906e1a2ce01',
  'research/source-record-ids.json':'16636cabce66da302b1894ca85502edcdc73b56ba59205e52430fdafbcb26957'}))
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(new URL('../'+file,import.meta.url))).digest('hex'),hash);
});
test('closed and conditional future calls stay outside actionable leads',()=>{
 const project=normalizeProject({id:'test',name:'Community work',description:'Traditional arts cultural education nature conservation biodiversity community climate resilience',tags:[]});
 const funds=data.funds.filter(f=>['local-acta','local-iki'].includes(f.id));
 const ranked=rankFunds(funds,project,createLexicalIndex(funds),[],null,new Date('2026-10-29T12:00:00Z'),conditions);
 assert.equal(funds.find(f=>f.id==='local-acta').access,'closed');
 assert.equal(funds.find(f=>f.id==='local-acta').enrichment.programs[0].award.basis,'historical');
 assert.equal(funds.find(f=>f.id==='local-iki').access,'future');
 assert.match(funds.find(f=>f.id==='local-iki').accessDetail,/subject to funding approval/);
 for(const result of ranked) assert.notEqual(result.group,'lead');
});
test('new eligibility requirements remain unanswered until the user supplies evidence',()=>{
 for(const {fund,enrichment} of manifest.funds){
  for(const p of enrichment.programs){
   const checks=checkConditions({},fund.id,p.id,conditions,'2026-10-29');
   if(p.applicants.requirements.length) assert(checks.length>0);
   assert(checks.every(c=>c.outcome!=='self_reported'));
   assert(p.unknowns.length>0);
  }
 }
 assert(conditions.some(c=>c.fundId==='local-nlnet'&&c.requirement.includes('AI policy')));
 assert.equal(data.funds.find(f=>f.id==='local-cfh').enrichment.programs[0].award.max,null);
 assert.equal(data.funds.find(f=>f.id==='local-d-prize').deadlineInstant,null);
});

test('catalog validation rejects supplemental IDs colliding with the original inventory',async()=>{
 const {validateSnapshot}=await import('../scripts/research-validation.mjs');
 const {tmpdir}=await import('node:os');
 const {join}=await import('node:path');
 const {pathToFileURL}=await import('node:url');
 const dir=fs.mkdtempSync(join(tmpdir(),'funding-collision-'));
 try{
  fs.mkdirSync(join(dir,'research'),{recursive:true});
  fs.mkdirSync(join(dir,'dist/data'),{recursive:true});
  for(const name of ['research/source-record-ids.json','dist/data/funders.json','dist/data/enrichment.schema.json'])
   fs.copyFileSync(new URL('../'+name,import.meta.url),join(dir,name));
  const corrupt=structuredClone(manifest);
  corrupt.funds[0].fund.id=ids[0];
  fs.writeFileSync(join(dir,'research/supplemental-funders.json'),JSON.stringify(corrupt));
  assert.throws(()=>validateSnapshot(pathToFileURL(dir+'/')),/Invalid baseline or supplemental identities/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('additional tracks share funder identities without replacing prior program evidence',()=>{
 const canonical=fs.readdirSync(new URL('../research/',import.meta.url))
  .filter(name=>/^(pilot-.*|expanded-\d+)\.json$/.test(name))
  .flatMap(name=>read('research/'+name));
 for(const original of canonical){
  const current=data.funds.find(f=>f.id===original.sourceRecordId).enrichment;
  for(const p of original.programs) assert.deepEqual(current.programs.find(x=>x.id===p.id),p);
  for(const s of original.sources) assert(current.sources.some(x=>JSON.stringify(x)===JSON.stringify(s)));
 }
 const get=id=>data.funds.find(f=>f.id===id).enrichment.programs;
 const isoc=get('recOExYwWRXF9whgo');
 assert(isoc.some(p=>p.name==='Research Grant Program — institutional track'));
 assert.equal(isoc.find(p=>p.id==='isoc-ccc-catalyst').award.max,50000);
 assert.equal(isoc.find(p=>p.id==='isoc-ccc-scaling').award.max,200000);
 assert.equal(get('local-mozilla').length,2);
 assert.equal(get('local-mozilla').find(p=>p.id==='mozilla-human-scale-ai').award.max,300000);
 assert.equal(get('local-mozilla').find(p=>p.id==='mozilla-independent-fellow-2027').instrument,'fellowship');
 assert.equal(get('local-la-county-arts').length,2);
 assert.equal(manifest.programAdditions.length,4);
 assert.equal(manifest.funds.reduce((n,row)=>n+row.enrichment.programs.length,0)+manifest.programAdditions.length,135);
});

test('unknown currency, award terms and intake dates never become invented bounds or rolling access',()=>{
 const program=id=>data.funds.flatMap(f=>f.enrichment.programs).find(p=>p.id===id);
 for(const id of ['awesome-conservation-climate','futo-microgrants']){
  const p=program(id);assert.equal(p.award.currency,null);assert.equal(p.award.min,null);assert.equal(p.award.max,null);
 }
 const icca=program('undp-nigeria-icca-regular');
 assert.equal(icca.application.route,'unconfirmed');assert.equal(icca.application.closesOn,null);
 assert(icca.unknowns.includes('Whether intake remains open'));
 assert.equal(program('la-county-ciag-2027').application.deadlineInstant,null);
 for(const id of ['ekoenergy-climate-fund','ieee-epics-oct2026','comcast-innovation','icann-grants','nten-pizzigati','wwf-nedbank','cepf-cerrado-small-2026','unesco-ifcd-2026'])
  assert.equal(program(id).application.route,'closed');
 assert.equal(program('table-mountain-small').award.basis,'historical');
 assert.equal(program('pollination-seed').award.max,null);
});

test('connectivity selection preferences do not become mandatory eligibility rules',()=>{
 const preference=conditions.find(c=>c.programId==='isoc-ccc-catalyst'&&c.requirement.includes('preferred'));
 assert.equal(preference.kind,'priority');
 const scaling=conditions.find(c=>c.programId==='isoc-ccc-scaling'&&c.requirement.includes('50,000'));
 assert.equal(scaling.kind,'prerequisite');
});
