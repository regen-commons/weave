// Builds the frozen partner-real-v1 corpus from saved pages of GET /api/public-projects.
// It keeps only what the public list shows, leaves out QA, test and placeholder listings and
// any passage with contact details, and samples deterministically across themes and languages.
//
//   node scripts/partner-real-corpus.mjs <pages-dir> <collected-at ISO> <output.json>
//
// The pages themselves are not committed; the corpus records how many projects each rule removed.
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parsePublicProjectPage } from "../src/public-projects-contract.ts";

export const SAMPLE_SALT = "partner-real-v1";
/** English projects drawn per theme, in this priority order; every non-English project is kept. */
export const ENGLISH_QUOTAS = [["art", 30], ["software", 30], ["research", 30], ["place", 40]];

const THEMES = {
  art: /\b(art|arts|artist|artists|artisans?|mural|murals|music|musicians?|film|films|cinema|theatre|theater|dance|painting|crafts?|festival|poetry|photograph\w*|artistic|museum|exhibition|storytelling|weaving|ceramics?)\b/iu,
  software: /\b(software|app|apps|platform|open[- ]source|blockchain|dao|protocol|web3|dashboard|database|digital|code|smart contracts?|ai|api|sensors?|bioacoustic\w*|satellite|remote sensing|marketplace)\b/iu,
  research: /\b(research|researchers?|study|studies|monitoring|survey|surveys|scientific|science|scientists|university|measure\w*|analysis|laborator\w+|experiments?|trials?|inventory|baseline)\b/iu,
};

/** A listing is QA or test data when its name or its own words say so, or its text is keyboard noise. */
const QA_NAME = /^(qa\b|test project$|testing$)|\((test|demo)\)/iu;
const QA_TEXT = /^(test project\b|qa (org |test |individual project )?story\b)|\b(staging qa runs?|automated qa|qa pass|created by an automated qa run)\b/iu;
const NOISE = /\b[b-df-hj-np-tv-z]{12,}\b/iu;
const REPEATED = text => { const words = text.toLowerCase().split(/\s+/u).filter(Boolean); return words.length >= 4 && new Set(words).size <= 2; };
/** Form prompts or filler instead of the project's own words. */
const PLACEHOLDER = /lorem ipsum|share your (project )?story|potential backers|your project story is your most powerful/iu;
/** Email addresses, phone numbers, links, messaging handles and @mentions. */
const CONTACT = /[\w.+-]+@[\w-]+\.[\w.]+|\+?\d[\d\s().-]{8,}\d|https?:\/\/|www\.|t\.me\/|wa\.me|whatsapp|telegram|signal app|(^|\s)@\w{3,}/iu;

const STOPWORDS = {
  en: "the and with our for are this that we to of in is it as by from their through which have has be".split(" "),
  pt: "não com uma para são está pela pelo nossa nosso nós comunidade também então através projeto das dos ao em que se".split(" "),
  es: "para con una los las del está nuestra nuestro nosotros comunidad también través proyecto como sus el y en que se".split(" "),
  fr: "les des avec pour une nous notre est dans sur aux du la le et qui".split(" "),
  id: "dan yang di ke dari untuk karena kegiatan dengan ini".split(" "),
};
/** The passages' language by stopword counts; names are often English when the text is not. */
export function passageLanguage(passages) {
  const text = passages.join(" ");
  if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text)) return "other";
  // Capitalized words are mostly place and project names ("São Paulo"), which say nothing of the language.
  const words = (text.match(/\p{L}+/gu) ?? []).filter(word => word[0] === word[0].toLowerCase());
  const score = Object.fromEntries(Object.entries(STOPWORDS).map(([lang, list]) => [lang, words.filter(w => list.includes(w)).length]));
  score.pt += 3 * words.filter(w => /ção$|ções$|^não$/u.test(w)).length;
  score.es += 3 * words.filter(w => /ñ|ción$|ciones$/u.test(w)).length;
  const [best, count] = Object.entries(score).sort((a, b) => b[1] - a[1])[0];
  // Headline-only passages carry few stopwords; Latin text no other language claims is English.
  if (count < 2 || best === "en") return "en";
  return best === "id" ? "other" : best;
}

export function exclusionReason(card) {
  const text = card.passages.join(" ");
  if (QA_NAME.test(card.name.trim()) || QA_TEXT.test(text.trim()) || NOISE.test(`${card.name} ${text}`) || REPEATED(text))
    return "qa_or_test";
  if (PLACEHOLDER.test(text)) return "placeholder_text";
  if (CONTACT.test(text)) return "contact_details";
  return null;
}

const order = uri => createHash("sha256").update(`${SAMPLE_SALT}:${uri}`).digest("hex");
const theme = card => Object.keys(THEMES).find(name => THEMES[name].test(`${card.name} ${card.passages.join(" ")}`)) ?? "place";

export function buildCorpus(cards, { collectedAt, index }) {
  const excluded = { qa_or_test: [], placeholder_text: [], contact_details: [] };
  const kept = [];
  for (const card of cards) {
    const reason = exclusionReason(card);
    if (reason) excluded[reason].push(card.name);
    else kept.push({ ...card, language: passageLanguage(card.passages), theme: theme(card) });
  }
  const chosen = kept.filter(card => card.language !== "en").map(card => ({ ...card, stratum: `language:${card.language}` }));
  const english = kept.filter(card => card.language === "en").sort((a, b) => order(a.uri).localeCompare(order(b.uri)));
  for (const [name, quota] of ENGLISH_QUOTAS)
    chosen.push(...english.filter(card => card.theme === name).slice(0, quota).map(card => ({ ...card, stratum: `theme:${name}` })));
  chosen.sort((a, b) => order(a.uri).localeCompare(order(b.uri)));
  const projects = chosen.map((card, i) => ({
    id: `rp-${String(i + 1).padStart(3, "0")}`, uri: card.uri, account: card.uri.split("/")[2], name: card.name,
    passages: card.passages, language: card.language, stratum: card.stratum,
    sharedAt: card.sharedAt, checkedAt: card.checkedAt, collectedAt, sourceUrl: card.sourceUrl,
  }));
  return {
    version: 1, dataset: "partner-real-v1-corpus",
    source: { endpoint: "GET https://weave.regencommons.com/api/public-projects", collectedAt,
      indexStatus: index.status, indexCheckedAt: index.checkedAt, listedProjects: cards.length },
    exclusions: Object.fromEntries(Object.entries(excluded).map(([reason, names]) => [reason, names.length])),
    sampling: `Every remaining non-English project, then English projects by theme keyword (${ENGLISH_QUOTAS.map(([n, q]) => `${n} ${q}`).join(", ")}; first matching theme wins, place is the rest), each ordered by sha256("${SAMPLE_SALT}:" + uri). Language and theme come from fixed keyword rules in scripts/partner-real-corpus.mjs, not from reading.`,
    projects,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [dir, collectedAt, output] = process.argv.slice(2);
  if (!dir || !collectedAt || !Number.isFinite(Date.parse(collectedAt)) || !output) throw Error("usage: <pages-dir> <collected-at> <output>");
  const files = (await readdir(dir)).filter(name => /^p\d{3}\.json$/u.test(name)).sort();
  const pages = await Promise.all(files.map(async name => parsePublicProjectPage(JSON.parse(await readFile(join(dir, name), "utf8")))));
  const cards = pages.flatMap(page => page.projects);
  if (new Set(cards.map(card => card.uri)).size !== cards.length || cards.length !== pages[0].index.total) throw Error("incomplete_listing");
  const corpus = buildCorpus(cards, { collectedAt, index: pages[0].index });
  await writeFile(output, JSON.stringify(corpus, null, 1) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ listed: cards.length, exclusions: corpus.exclusions, sampled: corpus.projects.length,
    byStratum: Object.fromEntries(Object.entries(Object.groupBy(corpus.projects, p => p.stratum)).map(([k, v]) => [k, v.length])) }));
}
