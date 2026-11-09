import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { rankFunds, createLexicalIndex, corpusDocuments, conditionKey, THEMATIC_SCORE_VERSION } from '../dist/matching.mjs';
import { normalizeProject, emptySaved, upsertProject } from '../dist/storage.mjs';
import { favoritesCsv } from '../dist/domain.mjs';
const json = path => JSON.parse(fs.readFileSync(new URL('../'+path,import.meta.url)));
const funds=json('dist/data/funders.json').funds;
const rules=json('dist/data/eligibility-rules.json').rules;
const conditions=json('dist/data/program-conditions.json').conditions;
const now=new Date('2026-10-25T12:00:00Z');
const solar=normalizeProject({id:'solar',name:'Solar hubs',description:'Solar electricity renewable energy and climate infrastructure for learning hubs',tags:['energy access'],workCountries:['NG'],benefitCountries:['NG']});
const fund=id=>structuredClone(funds.find(f=>f.id===id));
const scores=(fs,value=.7)=>Object.fromEntries(corpusDocuments(fs).map(d=>[d.id,value]));
const rank=(fs,p=solar,s=scores(fs),cs=conditions)=>rankFunds(fs,p,createLexicalIndex(fs),rules,s,now,cs);

test('thematic fit is independent from geography, funding preferences and unknown applicant facts',()=>{
 const acumen=fund('rec0ean6CkrBpBXS6');
 const grant=rank([acumen],{...solar,fundingInstruments:['grant']})[0];
 const investment=rank([acumen],{...solar,fundingInstruments:['investment']})[0];
 assert.deepEqual(grant.thematicFit,investment.thematicFit);
 assert.equal(grant.readiness.status,'preference');assert.equal(grant.score,0);assert.equal(grant.group,'outside');
 assert.notEqual(investment.readiness.status,'preference');assert.ok(investment.score>0);
 const fry=fund('rec89DjJs1dqPyQ2g');
 const p={...solar,description:'Yoruba cultural heritage arts education',tags:['arts','culture'],workCountries:['US'],benefitCountries:['US'],usBenefitStates:['CA']};
 const ca=rank([fry],p)[0],il=rank([fry],{...p,usBenefitStates:['IL']})[0];
 assert.deepEqual(ca.thematicFit,il.thematicFit);assert.equal(ca.readiness.status,'conflict');assert.equal(ca.score,0);assert.equal(il.readiness.status,'geography');
});

test('answering a prerequisite changes readiness and shortlisting rather than thematic fit',()=>{
 const mit=fund('recu4Uz6BAlTZmsjv');
 const c=conditions.find(c=>c.fundId===mit.id&&c.kind==='prerequisite');assert.ok(c);
 const before=rank([mit])[0];
 const no=rank([mit],{...solar,programAnswers:{[conditionKey(c)]:{answer:'no',sourceCheckedOn:c.checkedOn}}})[0];
 const yes=rank([mit],{...solar,programAnswers:Object.fromEntries(conditions.filter(c=>c.fundId===mit.id).map(c=>[conditionKey(c),{answer:'yes',sourceCheckedOn:c.checkedOn}]))})[0];
 assert.deepEqual(before.thematicFit,no.thematicFit);assert.deepEqual(before.thematicFit,yes.thematicFit);
 assert.equal(before.readiness.status,'requirements');assert.equal(no.readiness.status,'conflict');assert.equal(no.score,0);
 assert.notEqual(yes.readiness.status,'requirements');assert.equal(yes.eligibility.status,'needs_confirmation');
 assert.ok(before.thematicFit.score>=80);assert.ok(before.score<=39);
});

test('closing a call preserves topical fit while moving the next step to a closed cycle',()=>{
 const mit=fund('recu4Uz6BAlTZmsjv');const open=rank([mit])[0];
 mit.enrichment.programs[0].application.closesOn='2026-10-24';mit.enrichment.programs[0].application.deadlineInstant=null;
 const closed=rank([mit])[0];assert.deepEqual(closed.thematicFit,open.thematicFit);assert.equal(closed.readiness.status,'closed');assert.ok(closed.score<=19);assert.notEqual(closed.group,'lead');
});

test('broad or absent focus is unassessed, rather than a fabricated zero or a high semantic grade',()=>{
 const broad=fund('recygq2HlMGdX8Ea8');const m=rank([broad],solar,scores([broad],.99))[0];
 assert.equal(m.thematicFit.score,null);assert.equal(m.thematicFit.band,'unknown');assert.notEqual(m.group,'lead');
});

test('related word forms count once and longer profiles retain supported topic evidence',()=>{
 const f=fund('rec0ean6CkrBpBXS6');f.enrichment.programs[0].name='Culture support';f.enrichment.programs[0].focus=['culture cultural arts art heritage'];f.enrichment.programs[0].beneficiaries=[];
 const p={...solar,description:'culture cultural arts art heritage',tags:[]};
 const short=rank([f],p,null)[0],long=rank([f],{...p,description:p.description+' Solar hubs, wildlife, river measurements, youth skills and open source software.'},null)[0];
 assert.deepEqual(short.thematicFit.evidenceTerms.sort(),['arts','culture','heritage']);assert.equal(short.thematicFit.keywordGrade,65);assert.equal(short.thematicFit.score,long.thematicFit.score);
});

test('an unrelated open route stays a low thematic fit; strong semantic synonyms can carry fit without exact words',()=>{
 const f=fund('rec0ean6CkrBpBXS6');f.enrichment.programs[0].focus=['off-grid clean power'];f.enrichment.programs[0].beneficiaries=[];
 const p={...solar,description:'renewable electricity',tags:[]};
 const synonym=rank([f],p,scores([f],.8))[0];assert.equal(synonym.thematicFit.band,'strong');assert.ok(synonym.thematicFit.score>=95);
 const unrelated=rank([f],{...p,description:'Ballet orchestral performances',tags:['dance']},scores([f],.15))[0];assert.equal(unrelated.thematicFit.band,'limited');assert.ok(unrelated.thematicFit.score<40);assert.notEqual(unrelated.group,'lead');
});

test('all 699 records have bounded independent fit metrics and preserve conflict screening',()=>{
 const ranked=rank(funds);assert.equal(ranked.length,699);assert.equal(new Set(ranked.map(m=>m.fund.id)).size,699);
 for(const [i,m] of ranked.entries()){
  assert.ok(m.thematicFit.score===null||Number.isInteger(m.thematicFit.score)&&m.thematicFit.score>=0&&m.thematicFit.score<=100);
  assert.equal(m.thematicFit.version,THEMATIC_SCORE_VERSION);assert.ok(m.readiness.label);
  if(i)assert.ok(ranked[i-1].score>=m.score);
  if(m.group==='lead')assert.ok(m.thematicFit.score>=60);
  if(m.eligibility.status==='conflict'){assert.equal(m.score,0);assert.equal(m.group,'outside');assert.equal(m.readiness.status,'conflict');}
 }
});

test('CSV distinguishes research priority, thematic fit and readiness and retains saved conflicts',()=>{
 const acumen=fund('rec0ean6CkrBpBXS6');const p={...solar,fundingInstruments:['grant']};
 const m=rank([acumen],p)[0];const saved=upsertProject(emptySaved(),p);saved.lists[p.id]=[acumen.id];
 const csv=favoritesCsv([acumen],saved,p.id,now,new Map([[acumen.id,{...m,rank:1}]]));
 assert.ok(csv.includes('Research priority (0-100)'));assert.ok(csv.includes('Thematic fit (0-100)'));assert.ok(csv.includes('Readiness'));assert.ok(csv.includes(THEMATIC_SCORE_VERSION));
 assert.ok(csv.includes(acumen.id));assert.ok(csv.includes('Outside funding preferences'));assert.ok(m.thematicFit.score>0);assert.equal(m.score,0);
});

test('stale requirements and missing applicant details are readiness gaps, not thematic penalties',()=>{
 const f=fund('recw3cebtq8K4YdD0');
 const p={...solar,workCountries:['US'],benefitCountries:['US'],usWorkStates:['MA'],usBenefitStates:['MA'],applicantType:'unknown',description:'Arts culture education climate',tags:['arts']};
 const missing=rank([f],p)[0];assert.equal(missing.readiness.status,'profile');
 const known=rank([f],{...p,applicantType:'nonprofit'})[0];assert.deepEqual(missing.thematicFit,known.thematicFit);
 f.enrichment.programs[0].evidence=f.enrichment.programs[0].evidence.map(e=>({...e,checkedOn:'2025-01-01'}));
 const stale=rank([f],{...p,applicantType:'nonprofit'})[0];assert.equal(stale.readiness.status,'stale');assert.deepEqual(stale.thematicFit,known.thematicFit);
});

test('years, amounts and generic application words do not count as shared topic evidence',()=>{
 const f=fund('rec0ean6CkrBpBXS6');f.enrichment.programs[0].name='Annual challenge 2026 2027 2028';f.enrichment.programs[0].focus=['culture cultural arts art heritage'];f.enrichment.programs[0].beneficiaries=[];
 const p={...solar,description:'culture cultural arts art heritage annual challenge 2026 2027 2028',tags:[]};
 const m=rank([f],p,null)[0];assert.deepEqual(m.thematicFit.evidenceTerms.sort(),['arts','culture','heritage']);assert.equal(m.thematicFit.keywordGrade,65);
});
