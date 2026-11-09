import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { favoritesCsv } from '../dist/domain.mjs';
import { rankFunds, createLexicalIndex, corpusDocuments, conditionKey, projectText } from '../dist/matching.mjs';
import { normalizeProject, readSaved, upsertProject, emptySaved } from '../dist/storage.mjs';
const json = name => JSON.parse(fs.readFileSync(new URL('../'+name, import.meta.url)));
const funds = json('dist/data/funders.json').funds;
const rules = json('dist/data/eligibility-rules.json').rules;
const conditions = json('dist/data/program-conditions.json').conditions;
const now = new Date('2026-10-25T12:00:00Z');
const base = normalizeProject({id:'qa',name:'Community solar',description:'Solar electricity energy access for community hubs',tags:['solar energy'],workCountries:['NG'],benefitCountries:['NG']});
const fund = id => funds.find(f=>f.id===id);
function rank(selected, profile=base, semantic=null, date=now) {
 return rankFunds(selected,profile,createLexicalIndex(selected),rules,semantic,date,conditions);
}
const high = selected => Object.fromEntries(corpusDocuments(selected).map(d=>[d.id,.9]));

test('funding preferences and local geography upgrade old saved profiles without losing favorites or notes',()=>{
 const old={version:2,projects:[{id:'old',name:'Old project',description:'Culture',tags:[],currency:'USD'}],lists:{general:[],old:['missing-fund']},notes:{'missing-fund':'Keep this'}};
 const loaded=readSaved(JSON.stringify(old));
 assert.deepEqual(loaded.projects[0].fundingInstruments,[]);
 assert.deepEqual(loaded.projects[0].usWorkStates,[]);
 assert.deepEqual(loaded.projects[0].usBenefitStates,[]);
 const next=upsertProject(loaded,{...loaded.projects[0],workCountries:['US'],benefitCountries:['US'],usWorkStates:['CA'],usBenefitStates:['CA'],fundingInstruments:['grant','prize']});
 assert.deepEqual(readSaved(JSON.stringify(next)),next);
 assert.deepEqual(next.lists.old,['missing-fund']);assert.equal(next.notes['missing-fund'],'Keep this');
 for(const p of [{fundingInstruments:['loan']},{fundingInstruments:'grant'},{usWorkStates:['XX']},{usWorkStates:['CA']},{usBenefitStates:['CA']}])
  assert.throws(()=>normalizeProject({...base,...p}));
 assert.equal(projectText(normalizeProject({...base,fundingInstruments:['grant']})),projectText(base));
});

test('an investment preference mismatch is distinct from eligibility; mixed instruments remain unconfirmed',()=>{
 const acumen=fund('rec0ean6CkrBpBXS6');
 const grants={...base,fundingInstruments:['grant']};
 const mismatch=rank([acumen],grants,high([acumen]))[0];
 assert.equal(mismatch.score,0);assert.equal(mismatch.group,'outside');
 assert.equal(mismatch.eligibility.status,'needs_confirmation');assert.equal(mismatch.instrument.status,'mismatch');
 assert.ok(rank([acumen],{...base,fundingInstruments:['investment']},high([acumen]))[0].score>0);
 assert.equal(rank([acumen],base,high([acumen]))[0].instrument.status,'any');
 const mixed=structuredClone(acumen);mixed.enrichment.programs[0].instrument='mixed';
 const uncertain=rank([mixed],grants,high([mixed]))[0];
 assert.equal(uncertain.instrument.status,'unconfirmed');assert.ok(uncertain.score>0&&uncertain.score<=29);assert.notEqual(uncertain.group,'lead');
});

test('program selection respects instrument preferences rather than borrowing a sibling grant label',()=>{
 const f=structuredClone(fund('rec0ean6CkrBpBXS6'));
 const grant=structuredClone(f.enrichment.programs[0]);grant.id='grant';grant.instrument='grant';grant.application.route='inquiry';grant.focus=['solar energy electricity'];grant.beneficiaries=[];
 f.enrichment.programs.push(grant);
 const m=rank([f],{...base,fundingInstruments:['grant']},high([f]))[0];
 assert.equal(m.program.id,'grant');assert.equal(m.instrument.status,'match');
 assert.ok(m.alternatives.some(p=>p.programId==='acumen-patient-capital'&&p.score===0));
});

test('California-only beneficiaries conflict with Fry Chicago scope; work location never substitutes for benefit location',()=>{
 const f=fund('rec89DjJs1dqPyQ2g');
 const ca=normalizeProject({...base,workCountries:['US'],benefitCountries:['US'],usWorkStates:['CA'],usBenefitStates:['CA'],description:'Yoruba cultural heritage education arts',tags:['arts','education'],fundingInstruments:['grant']});
 const m=rank([f],ca,high([f]))[0];assert.equal(m.score,0);assert.equal(m.eligibility.status,'conflict');
 const remote=rank([f],{...ca,usBenefitStates:['IL']},high([f]))[0];
 assert.equal(remote.eligibility.status,'needs_confirmation');assert.ok(remote.geographic.needsConfirmation);assert.notEqual(remote.group,'lead');
 const missing=rank([f],{...ca,usBenefitStates:[]},high([f]))[0];
 assert.equal(missing.eligibility.status,'needs_confirmation');assert.ok(missing.score<=24);
 const condition=conditions.find(c=>c.id==='fry-chicago-program');
 const confirmed=rank([f],{...ca,usBenefitStates:['IL','CA'],programAnswers:{[conditionKey(condition)]:{answer:'yes',sourceCheckedOn:condition.checkedOn}}},high([f]))[0];
 assert.equal(confirmed.geographic.needsConfirmation,false);assert.ok(confirmed.score>24);assert.equal(confirmed.eligibility.status,'needs_confirmation');
 const stale=rank([f],ca,high([f]),new Date('2027-10-25'))[0];assert.equal(stale.eligibility.status,'needs_confirmation');
});

test('New England, Pittsburgh and Southeast Asian priorities never become hard exclusions',()=>{
 const ca=normalizeProject({...base,workCountries:['US'],benefitCountries:['US'],usWorkStates:['CA'],usBenefitStates:['CA']});
 for(const id of ['recw3cebtq8K4YdD0','reciJ2vBOeJMProix','reckq9YI0Vpjvidtt']){
  const f=fund(id),m=rank([f],ca,high([f]))[0];
  assert.equal(m.eligibility.status,'needs_confirmation');assert.ok(m.score>0&&m.score<=24);assert.notEqual(m.group,'lead');
 }
});

test('Nigeria solar hubs do not shortlist US transmission; unknown and mixed RAF scope need checking',()=>{
 const cgi=fund('recUlPGswNITQKNej'),raf=fund('recLO2MrB5qYtgi5l');
 const c=rank([cgi],base,high([cgi]))[0];assert.ok(c.score<=24);assert.notEqual(c.group,'lead');assert.equal(c.eligibility.status,'needs_confirmation');
 assert.equal(rank([raf],base,high([raf]))[0].eligibility.status,'conflict');
 const unknown=rank([raf],{...base,workCountries:[],benefitCountries:[]},high([raf]))[0];assert.equal(unknown.eligibility.status,'needs_confirmation');assert.ok(unknown.score<=24);
 const mixed={...base,workCountries:['US','NG']};const before=rank([raf],mixed,high([raf]))[0];assert.ok(before.score<=24);
 const answers=Object.fromEntries(conditions.filter(c=>c.fundId===raf.id).map(c=>[conditionKey(c),{answer:'yes',sourceCheckedOn:c.checkedOn}]));
 const after=rank([raf],{...mixed,programAnswers:answers},high([raf]))[0];
 assert.equal(after.geographic.needsConfirmation,false);assert.equal(after.eligibility.status,'needs_confirmation');
 assert.ok(after.score>24);
});

test('research leads have purpose evidence and a current direct or inquiry route; all other records remain browsable',()=>{
 const ranked=rank(funds,base,high(funds));assert.equal(ranked.length,699);assert.equal(new Set(ranked.map(m=>m.fund.id)).size,699);
 assert.ok(ranked.some(m=>m.group==='lead'));assert.ok(ranked.some(m=>m.group!=='lead'));
 for(const [i,m] of ranked.entries()){
  assert.ok(['lead','check','unverified','limited','outside'].includes(m.group));
  if(i)assert.ok(ranked[i-1].score>=m.score);
  if(m.group==='lead'){
   assert.ok(m.fitScore>=.25&&m.score>=30);assert.ok(['open','rolling','inquiry'].includes(m.access));
   assert.equal(m.geographic.needsConfirmation,false);assert.equal(m.geographic.countryMismatch,false);
   assert.ok(['any','match'].includes(m.instrument.status));assert.notEqual(m.eligibility.status,'conflict');
  }
  if(m.access==='closed')assert.ok(m.score<=19);
 }
 // A synthetic irrelevant open call may be browsed, but must never become a research lead.
 const f=structuredClone(fund('rec0ean6CkrBpBXS6'));f.enrichment.programs[0].focus=['ballet orchestral performance'];f.enrichment.programs[0].beneficiaries=[];f.enrichment.programs[0].application.route='open';
 const unrelated=rank([f],base,Object.fromEntries(corpusDocuments([f]).map(d=>[d.id,.1])))[0];
 assert.equal(unrelated.group,'limited');assert.ok(unrelated.score<=24);
});

test('generic organizational purpose cannot become a research lead even with a high semantic score',()=>{
 const f=fund('recygq2HlMGdX8Ea8');
 const m=rank([f],{...base,description:'Ecological restoration and biodiversity partnerships',tags:['restoration']},high([f]))[0];
 assert.ok(m.score<=24);assert.equal(m.group,'limited');assert.ok(m.limits.some(l=>/too broad/.test(l.reason)));
});

test('limited capacity and missing named-country context stay outside the research-lead view',()=>{
 const kreitman=fund('rec6wQIVWX6v3SjAi');
 const p={...base,description:'Climate biodiversity conservation ecosystem restoration food systems',tags:['climate','biodiversity']};
 const limited=rank([kreitman],p,high([kreitman]))[0];
 assert.equal(limited.access,'inquiry');assert.ok(limited.score<=29);assert.equal(limited.group,'check');
 assert.ok(limited.limits.some(l=>/limited capacity/.test(l.reason)));
 const neb=structuredClone(fund('recaoWDJ9bgmtXQAM'));neb.enrichment.programs=neb.enrichment.programs.filter(p=>p.id==='international-conservation-grants');
 const missing=rank([neb],{...p,workCountries:[]},high([neb]))[0];
 assert.equal(missing.eligibility.status,'needs_confirmation');assert.ok(missing.geographic.needsConfirmation);assert.notEqual(missing.group,'lead');
 const known=rank([neb],{...p,workCountries:['GH']},high([neb]))[0];
 assert.equal(known.geographic.needsConfirmation,false);assert.equal(known.eligibility.status,'needs_confirmation');
});

test('one broad subject overlap is not enough for a shortlist; strong semantic synonyms can still qualify',()=>{
 const f=structuredClone(fund('rec0ean6CkrBpBXS6'));f.enrichment.programs[0].focus=['climate justice grassroots organizing direct action'];f.enrichment.programs[0].beneficiaries=[];
 const p={...base,description:'Climate ecosystem restoration biodiversity water research and partnerships',tags:['restoration','biodiversity']};
 const moderate=Object.fromEntries(corpusDocuments([f]).map(d=>[d.id,.49]));
 const uncertain=rank([f],p,moderate)[0];assert.ok(uncertain.score<=29);assert.notEqual(uncertain.group,'lead');assert.equal(uncertain.specificPurposeEvidence,false);
 const strong=rank([f],p,high([f]))[0];assert.equal(strong.specificPurposeEvidence,true);assert.equal(strong.group,'lead');
});

test('unconfirmed applicant models need checking and a sourced invitation exception can lift a soft geographic caution',()=>{
 const gfcf=fund('recB7S1RKY2vqDj9d');
 const model=rank([gfcf],base,high([gfcf]))[0];assert.ok(model.score<=29);assert.notEqual(model.group,'lead');assert.equal(model.eligibility.status,'needs_confirmation');
 const grable=fund('reciJ2vBOeJMProix');
 const ca=normalizeProject({...base,workCountries:['US'],benefitCountries:['US'],usBenefitStates:['CA'],description:'children youth education learning environments',tags:['education','children']});
 const c=conditions.find(c=>c.id==='grable-pittsburgh-or-invitation');
 const confirmed=rank([grable],{...ca,programAnswers:{[conditionKey(c)]:{answer:'yes',sourceCheckedOn:c.checkedOn}}},high([grable]))[0];
 assert.equal(confirmed.geographic.needsConfirmation,false);assert.ok(confirmed.score>24);assert.equal(confirmed.eligibility.status,'needs_confirmation');
});


test('CSV keeps saved funds outside preferences with their actual program, score and explicit preference reason',()=>{
 const acumen=fund('rec0ean6CkrBpBXS6');
 const profile={...base,fundingInstruments:['grant']};
 const m=rank([acumen],profile,high([acumen]))[0];
 const saved=upsertProject(emptySaved(),profile);saved.lists[profile.id]=[acumen.id];saved.notes[acumen.id]='Keep for a later investment discussion';
 const csv=favoritesCsv([acumen],saved,profile.id,now,new Map([[acumen.id,{...m,rank:1}]]));
 assert.ok(csv.includes(acumen.id));assert.ok(csv.includes('Patient Capital'));assert.ok(csv.includes('preference mismatch'));assert.ok(csv.includes('Keep for a later investment discussion'));
 assert.equal(m.score,0);assert.equal(m.eligibility.status,'needs_confirmation');
});
