import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { rankFunds, createLexicalIndex, corpusDocuments, checkEligibility, conditionKey, validConditions, projectText } from '../dist/matching.mjs';
import { normalizeProject, emptySaved, upsertProject, readSaved } from '../dist/storage.mjs';
const json = p => JSON.parse(fs.readFileSync(new URL('../'+p, import.meta.url)));
const funds=json('dist/data/funders.json').funds, rules=json('dist/data/eligibility-rules.json').rules;
const data=json('dist/data/program-conditions.json'), conditions=data.conditions;
const now=new Date('2026-10-16T12:00:00Z');
const project=normalizeProject({id:'test',name:'Test project',description:'Solar energy and clean electricity',tags:['solar energy'],workCountries:['NG'],benefitCountries:['NG']});
function rank(fs, p=project, scores=null, cs=conditions, rs=rules, date=now){return rankFunds(fs,p,createLexicalIndex(fs),rs,scores,date,cs);}
function only(fid,pid){const f=structuredClone(funds.find(f=>f.id===fid));f.enrichment.programs=f.enrichment.programs.filter(p=>p.id===pid);return f;}
const itf=only('rec7BaQRplxUJvmmS','thrive-grants-2026-cycle');
const history=conditions.find(c=>c.fundId===itf.id&&c.programId==='thrive-grants-2026-cycle'&&c.category==='history');
const semantic=fs=>Object.fromEntries(corpusDocuments(fs).map(d=>[d.id,.9]));
test('sourced conditions validate and cannot silently use a namesake, missing programme or unretained URL',()=>{
 assert.ok(validConditions(data,funds));
 for(const override of [{fundId:'namesake'},{programId:'other'},{sourceUrl:'https://unretained.example/'},{sourceUrl:'javascript:alert(1)'},{kind:'hard-priority'}])
  assert.equal(validConditions({...data,conditions:[{...conditions[0],...override}]},funds),false);
 assert.equal(validConditions({...data,conditions:[conditions[0],conditions[0]]},funds),false);
});
test('leadership and previous grants stay unknown; thematic similarity never satisfies them',()=>{
 const m=rank([itf],project,semantic([itf]))[0];
 assert.ok(m.score<=39);assert.equal(m.eligibility.status,'needs_confirmation');
 const checks=m.eligibility.programs[0].checks.filter(c=>c.field==='condition');
 assert.ok(checks.some(c=>c.category==='history'&&c.missing));
 assert.ok(checks.some(c=>c.category==='leadership'&&c.missing));
 assert.ok(checks.every(c=>!c.answer));
});
test('explicit failure of THRIVE history is a programme conflict, not an invented identity fact',()=>{
 assert.ok(history);
 const p=normalizeProject({...project,programAnswers:{[conditionKey(history)]:{answer:'no',sourceCheckedOn:history.checkedOn}}});
 const thrive=rank([itf],p,semantic([itf]))[0];
 assert.equal(thrive.score,0);assert.equal(thrive.eligibility.status,'conflict');
 const seed=only(itf.id,'seed-grants-2026-cycle');
 assert.equal(rank([seed],p,semantic([seed]))[0].eligibility.status,'needs_confirmation');
});
test('yes answers are self-reported, invalidated on source changes, and never assert full eligibility',()=>{
 const cs=conditions.filter(c=>c.fundId===itf.id&&c.programId===itf.enrichment.programs[0].id);
 const p=normalizeProject({...project,programAnswers:Object.fromEntries(cs.map(c=>[conditionKey(c),{answer:'yes',sourceCheckedOn:c.checkedOn}]))});
 const m=rank([itf],p,semantic([itf]))[0];
 assert.equal(m.eligibility.status,'needs_confirmation');assert.ok(m.eligibility.programs[0].checks.filter(c=>c.field==='condition').every(c=>c.outcome==='self_reported'));
 const changed=cs.map(c=>({...c,checkedOn:'2026-10-17'}));
 assert.ok(rank([itf],p,semantic([itf]),changed,[],new Date('2026-10-18'))[0].score<=39);
 const later=rank([itf],{...p,programAnswers:{[conditionKey(history)]:{answer:'no',sourceCheckedOn:history.checkedOn}}},semantic([itf]),conditions,[],new Date('2027-10-18'))[0];
 assert.equal(later.eligibility.status,'needs_confirmation');
});
test('selection priorities never become hard exclusions',()=>{
 const shell=only('reccZG8TtBrCwLG7R','shell-foundation-clean-energy-partnerships');
 const priority=conditions.find(c=>c.fundId===shell.id&&c.kind==='priority');
 const p={...project,programAnswers:{[conditionKey(priority)]:{answer:'no',sourceCheckedOn:priority.checkedOn}}};
 assert.equal(rank([shell],p,semantic([shell]))[0].eligibility.status,'needs_confirmation');
});
test('answers stay out of embeddings and round-trip with favorites; material edits clear stale project context',()=>{
 const answer={answer:'yes',sourceCheckedOn:history.checkedOn};
 const p=normalizeProject({...project,programAnswers:{[conditionKey(history)]:answer}});
 assert.equal(projectText(p),projectText(project));
 let saved=upsertProject(emptySaved(),p);saved.lists.test=['retained'];saved.notes.retained='Private note';
 saved=readSaved(JSON.stringify(saved));assert.deepEqual(saved.projects[0].programAnswers,p.programAnswers);
 saved=upsertProject(saved,{...saved.projects[0],name:'Rename'});assert.deepEqual(saved.projects[0].programAnswers,p.programAnswers);
 saved=upsertProject(saved,{...saved.projects[0],description:'Changed funding proposal'});assert.deepEqual(saved.projects[0].programAnswers,{});
 assert.deepEqual(saved.lists.test,['retained']);assert.equal(saved.notes.retained,'Private note');
 for(const bad of [{bad:answer},{[conditionKey(history)]:{...answer,answer:'eligible'}},{[conditionKey(history)]:{...answer,sourceCheckedOn:'yesterday'}}])assert.throws(()=>normalizeProject({...project,programAnswers:bad}));
});
test('scores are bounded integers, account for every point, apply every stated cap and order monotonically',()=>{
 const ranked=rank(funds,project,semantic(funds));
 assert.equal(ranked.length,699);
 for(const [i,m] of ranked.entries()){
  assert.ok(Number.isInteger(m.score)&&m.score>=0&&m.score<=100);
  assert.equal(m.rawScore,Object.values(m.breakdown).reduce((a,b)=>a+b,0));
  assert.ok(m.limits.every(l=>m.score<=l.maximum));
  if(m.eligibility.status==='conflict'||m.resourceOnly||!m.focusAvailable)assert.equal(m.score,0);
  if(i)assert.ok(ranked[i-1].score>=m.score);
 }
});
test('strong inquiry purpose beats an unrelated open call; unknown geography cannot earn country credit',()=>{
 const strong=structuredClone(funds.find(f=>f.enrichment.programs.length));strong.id='strong';strong.name='Strong';
 strong.enrichment.programs=[{...strong.enrichment.programs[0],focus:['solar energy clean electricity'],beneficiaries:[],application:{route:'inquiry'}}];
 const weak=structuredClone(strong);weak.id='weak';weak.name='Weak';weak.enrichment.programs[0].focus=['performing arts'];weak.enrichment.programs[0].application.route='open';
 const scores=Object.fromEntries(corpusDocuments([strong,weak]).map(d=>[d.id,d.id.startsWith('strong')?.8:.1]));
 const ranked=rank([strong,weak],project,scores,[],[]);
 assert.equal(ranked[0].fund.id,'strong');assert.ok(ranked[1].score<=24);assert.equal(ranked[0].breakdown.geography,2);
});
test('Emergent rejects Nigeria-only work; mixed country work needs a scoped US component, not blanket approval',()=>{
 const fund=funds.find(f=>f.id==='recgDAwfqtJyo2MEx');
 assert.equal(checkEligibility(project,fund,rules,'2026-10-16').status,'conflict');
 const mixed={...project,workCountries:['US','NG']};
 assert.equal(checkEligibility(mixed,fund,rules,'2026-10-16').status,'needs_confirmation');
 assert.ok(rank([fund],mixed,semantic([fund]))[0].score<=29);
 assert.match(fund.enrichment.programs[0].application.note,/conflicts/);
});
test('missing prerequisite data produces an explicitly provisional limited score',()=>{
 const m=rank([itf],project,semantic([itf]),null)[0];
 assert.ok(m.score<=29);assert.ok(m.limits.some(l=>/could not load/.test(l.reason)));
});

test('locally confirmed subregion requirements can lift the geographic cap without declaring eligibility',()=>{
 const fund=only('recc3etQL3z6CaqqF','sff-rapid-response-movement');
 const p=normalizeProject({...project,workCountries:['US'],benefitCountries:['US']});
 const before=rank([fund],p,semantic([fund]))[0];assert.ok(before.geographic.pendingLocal);assert.ok(before.score<=29);
 const answers=Object.fromEntries(conditions.filter(c=>c.fundId===fund.id&&c.programId===fund.enrichment.programs[0].id).map(c=>[conditionKey(c),{answer:'yes',sourceCheckedOn:c.checkedOn}]));
 const after=rank([fund],{...p,programAnswers:answers},semantic([fund]))[0];
 assert.equal(after.geographic.pendingLocal,false);assert.equal(after.breakdown.geography,10);assert.ok(after.score>29);assert.equal(after.eligibility.status,'needs_confirmation');
});
test('stale program evidence and future calls cannot present unrestricted high scores',()=>{
 const f=structuredClone(funds.find(f=>f.enrichment.programs.length));f.enrichment.programs=[f.enrichment.programs[0]];
 f.enrichment.programs[0].focus=['solar energy clean electricity'];f.enrichment.programs[0].beneficiaries=[];
 f.enrichment.programs[0].application={route:'open',opensOn:'2027-01-01'};
 const future=rank([f],project,semantic([f]),[],[])[0];assert.equal(future.access,'future');assert.ok(future.score<=39);
 f.enrichment.programs[0].application={route:'rolling'};f.enrichment.programs[0].evidence=[{checkedOn:'2025-01-01'}];
 const stale=rank([f],project,semantic([f]),[],[])[0];assert.ok(stale.score<=39);assert.ok(stale.limits.some(l=>l.reason.includes('180 days')));
});

test('Canadian school-ground grants reject Nigeria-only projects but leave school identity unconfirmed for Canada work',()=>{
 const f=only('recEHr45RGvwiObx6','learning-by-nature-student-climate-and-biodiversity-leadership-grants');
 assert.equal(rank([f],project,semantic([f]))[0].eligibility.status,'conflict');
 const canada={...project,workCountries:['CA']};const m=rank([f],canada,semantic([f]))[0];
 assert.equal(m.eligibility.status,'needs_confirmation');assert.ok(m.score<=39);
});

test('Visa RPA requires primarily US work independently of applicant base; funding goal is not annual budget',()=>{
 const f=only('rec9bE8Sue9uIgF4r','visa-foundation-us-small-business-growth-and-innovation2026');
 assert.equal(rank([f],project,semantic([f]))[0].eligibility.status,'conflict');
 const us={...project,workCountries:['US'],goalMin:10000,goalMax:50000};const m=rank([f],us,semantic([f]))[0];
 assert.equal(m.eligibility.status,'needs_confirmation');
 assert.ok(m.eligibility.programs[0].checks.some(c=>c.category==='budget'&&c.missing));
});
