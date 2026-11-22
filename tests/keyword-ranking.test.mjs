// Keyword-only ranking: Weave always runs this path, and the live site falls back to it
// when its model has not loaded. These checks pin the fixes for the Funding QA defects
// where program names, open access and country mentions decided the order.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { rankFunds, createLexicalIndex, corpusDocuments, terms } from '../dist/matching.mjs';
import { normalizeProject } from '../dist/storage.mjs';

const json = path => JSON.parse(fs.readFileSync(new URL('../' + path, import.meta.url)));
const catalog = json('dist/data/funders.json').funds;
const rules = json('dist/data/eligibility-rules.json').rules;
const conditions = json('dist/data/program-conditions.json').conditions;
const now = new Date('2026-11-21T12:00:00Z');

// An open, single-program record with no executable rules, reshaped per case.
const template = catalog.find(f => f.id === 'local-futo');
const program = (id, { name, focus, workCountries = [] }) => {
  const f = structuredClone(template);
  f.id = id; f.name = id;
  const p = f.enrichment.programs[0];
  Object.assign(p, { id: `${id}-program`, name, focus, beneficiaries: [], geography: { ...p.geography, workCountries } });
  return f;
};
const keywordRank = (funds, project) => rankFunds(funds, project, createLexicalIndex(funds), [], null, now, []);
const byId = results => Object.fromEntries(results.map(r => [r.fund.id, r]));
const muralists = normalizeProject({
  id: 'murals', name: 'Mural workshop',
  description: 'Young muralists in Accra running community art and music workshops in public spaces.',
  tags: [], workCountries: ['GH'], benefitCountries: ['GH'],
});
const WEAK_TOPIC = /^Limited evidence of shared program purpose/;
const COUNTRY = /^Documented country mentions do not overlap/;

test('an "art" project shares the "arts" topic of an arts program', () => {
  assert.deepEqual(terms('art, artistic and cultural work'), ['arts', 'culture']);
  const arts = program('arts', { name: 'Grants', focus: ['Arts education and murals for young people'] });
  const [m] = keywordRank([arts], muralists);
  assert.ok(m.shared.includes('arts'), `shared: ${m.shared}`);
  assert.ok(m.thematicFit.evidenceTerms.includes('arts'));
});

test('program names are not keyword evidence, and the embedding text keeps them', () => {
  const named = program('named', { name: 'Mural music pilot workshops', focus: ['Coastal fisheries monitoring'] });
  const [m] = keywordRank([named], muralists);
  assert.deepEqual(m.shared, []);
  assert.equal(m.lexicalScore, 0);
  assert.ok(m.limits.some(l => WEAK_TOPIC.test(l.reason)));
  assert.match(corpusDocuments([named])[0].text, /^Mural music pilot workshops\. /);
});

test('two specific shared terms clear the weak-topic cap in keyword mode; one does not', () => {
  const longFocus = words => [`${words}, archive digitisation, cataloguing, preservation, oral history recordings, translation and exhibitions`];
  const two = program('two', { name: 'Grants', focus: longFocus('Music workshops') });
  const one = program('one', { name: 'Grants', focus: longFocus('Music') });
  const r = byId(keywordRank([two, one], muralists));
  // The share-based score alone stays under 0.25 for both, so access used to set their order.
  assert.ok(r.two.lexicalScore < 0.25 && r.one.lexicalScore < 0.25);
  assert.equal(r.two.thematicFit.keywordGrade, 50);
  assert.equal(r.two.fitScore, 0.25);
  assert.ok(!r.two.activeLimits.some(l => WEAK_TOPIC.test(l.reason)));
  assert.notEqual(r.two.group, 'limited');
  assert.equal(r.one.thematicFit.keywordGrade, 30);
  assert.ok(r.one.fitScore < 0.25);
  assert.ok(r.one.limits.some(l => WEAK_TOPIC.test(l.reason)));
  assert.equal(r.one.group, 'limited');
});

test('a semantic score keeps the blended formula without the keyword-grade floor', () => {
  const two = program('two', { name: 'Grants', focus: ['Music workshops, archive digitisation, cataloguing, preservation and exhibitions'] });
  const [m] = rankFunds([two], muralists, createLexicalIndex([two]), [], { [corpusDocuments([two])[0].id]: 0.2 }, now, []);
  assert.equal(m.method, 'semantic');
  assert.equal(m.fitScore, 0.5 * m.lexicalScore);
});

test('a country mismatch ranks below a weak-topic program with no country mentioned', () => {
  const elsewhere = program('elsewhere', { name: 'Grants', focus: ['Arts education, murals and music for young people'], workCountries: ['US'] });
  const weak = program('weak', { name: 'Grants', focus: ['Music archive digitisation, cataloguing, preservation, oral history recordings and exhibitions'] });
  const results = keywordRank([elsewhere, weak], muralists);
  const r = byId(results);
  assert.ok(r.weak.activeLimits.some(l => WEAK_TOPIC.test(l.reason)));
  assert.ok(r.elsewhere.geographic.countryMismatch);
  assert.ok(r.elsewhere.activeLimits.some(l => COUNTRY.test(l.reason) && l.maximum === 19));
  assert.ok(r.elsewhere.score < r.weak.score, `${r.elsewhere.score} vs ${r.weak.score}`);
  assert.deepEqual(results.map(m => m.fund.id), ['weak', 'elsewhere']);
});

test('across the catalog, keyword evidence comes from program focus and country mismatches stay at or below 19', () => {
  const funds = catalog.flatMap(f => f.enrichment.programs.length
    ? f.enrichment.programs.map(p => ({ ...f, enrichment: { ...f.enrichment, programs: [p] } }))
    : [f]);
  const results = rankFunds(funds, muralists, createLexicalIndex(catalog), rules, null, now, conditions);
  assert.equal(results.length, funds.length);
  for (const m of results) {
    if (m.geographic.countryMismatch) assert.ok(m.score <= 19, `${m.documentId} scored ${m.score}`);
    const focus = [...(m.program?.focus || []), ...(m.program?.beneficiaries || [])];
    if (focus.length) {
      const words = terms(focus.join('. '));
      for (const word of m.shared) assert.ok(words.includes(word), `${m.documentId}: "${word}" is not in the program focus`);
    }
  }
});
