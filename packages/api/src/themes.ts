/**
 * What a piece of writing is about, read as themes: the field of work it is in, the people it
 * serves, and the means it uses. Funding and Partners read an initiative and a fund program or a
 * public project with the same table, so a match rests on the same meaning both ways (DL-143, DL-144).
 *
 * The rubric in dist/matching.mjs counts shared words, and every word counts the same. A solar hub
 * that also offers internet then shares three words ("internet", "digital", "open") with an internet
 * freedom fund and one ("solar") with an off-grid energy challenge, and the internet fund wins. Here
 * the field of work weighs most, the people served less, and the tools used least, because a
 * program funds a field and an initiative is known by what it does, not by the tools it uses.
 *
 * - A theme is read from English phrases, and from Portuguese and Spanish through the catalog
 *   topics they name (topics.ts, DL-142).
 * - A theme named only in an example list ("such as planting trees, sorting waste") is marked as an
 *   example: an app that helps groups doing many kinds of work is not itself an energy project.
 * - A theme named after "without", "not" or "no" is not read ("a way to give without crypto").
 * - Ambiguous single words stay out (garden, power, class, course, monitoring, native, hub). They
 *   count only inside a phrase that settles them, such as "community hub" or "monitoring and
 *   evaluation".
 *
 * A theme is never an eligibility decision, and reading one creates no need or offer.
 */
import { translatedTopics } from "./topics.ts";

export type ThemeKind = "field" | "people" | "means";
export type Theme = { readonly id: string; readonly label: string; readonly kind: ThemeKind };
/** One theme a text names: the words that named it, and whether it was named only as an example or a subject taught. */
export type ThemeReading = {
  readonly theme: Theme;
  readonly words: readonly string[];
  readonly example: boolean;
  /** Named in the first sentence, where a description says what the work is, and not only as an example. */
  readonly lead: boolean;
};

export const THEME_VERSION = "weave-themes-v1";

type Row = readonly [id: string, label: string, kind: ThemeKind, phrases: string];
/**
 * Phrases are written folded and lower case, separated by commas; a hyphen reads as a space, so
 * "solar powered" matches "solar-powered". A word also matches its plural with s, es or ies.
 */
const ROWS: readonly Row[] = [
  ["energy", "energy access", "field",
    "energy, solar, solar powered, photovoltaic, photovoltaics, off grid, offgrid, mini grid, mini grids, minigrid, microgrid, micro grid, electricity, electrification, electric power, renewable energy, renewables, clean energy, clean cooking, cookstove, battery storage, wind power, hydropower, energy poor"],
  ["farming", "farming and food", "field",
    "agriculture, agricultural, farming, farm, farmer, farmworker, agroecology, agroecological, agroforestry, permaculture, food, food system, food security, food sovereignty, crop, soil, soil health, plant health, seed, seed saving, livestock, pastoralist, horticulture, orchard, fisheries, smallholder"],
  ["forests", "forests and trees", "field",
    "forest, forestry, tree, tree planting, reforestation, afforestation, agroforestry, mangrove, woodland, rainforest, seedling, sapling, tree nursery"],
  ["nature", "nature and biodiversity", "field",
    "biodiversity, conservation, wildlife, species, habitat, ecosystem, nature, pollinator, bee, bird, bioacoustic, bioacoustics, rewilding, protected area, ecology, ecological"],
  ["water", "water", "field",
    "water, watershed, river, wetland, sanitation, rainwater, groundwater, drinking water, irrigation, lake, freshwater"],
  ["ocean", "oceans and coasts", "field",
    "ocean, marine, coastal, coast, fisheries, fisher, fishing, reef, seagrass, blue economy, mangrove"],
  ["climate", "climate", "field",
    "climate, climate change, carbon, emissions, decarbonisation, decarbonization, net zero, climate adaptation, climate resilience, greenhouse, global warming, climate action, climate justice"],
  ["waste", "waste and reuse", "field",
    "waste, recycling, recycle, circular economy, circularity, plastic, compost, composting, upcycling, reuse, landfill"],
  ["regeneration", "regeneration and restoration", "field",
    "regenerative, regeneration, regen, restoration, restore, restoring, land restoration, ecological restoration, degraded land"],
  ["education", "education and skills", "field",
    "education, educational, school, student, learning, learner, teaching, teacher, training, workshop, skills, literacy, curriculum, classes, bootcamp, stem, stem education, university, scholarship, digital skills, mentorship, mentoring, courses"],
  ["childhood", "early childhood", "field",
    "early childhood, early years, childhood development, early childhood development, childhood, preschool, kindergarten, early learning, children aged"],
  ["health", "health and wellbeing", "field",
    "health, healthcare, wellbeing, well being, mental health, medicine, medical, clinic, disease, nutrition, maternal health, health equity"],
  ["arts", "arts and culture", "field",
    "art, arts, artist, culture, cultural, music, musician, film, cinema, theatre, theater, dance, storytelling, heritage, craft, festival, museum, poetry, photography, humanities"],
  ["livelihoods", "jobs and livelihoods", "field",
    "livelihood, employment, job, income, work opportunities, gig, career, workforce, decent work, unemployment, employability, workers rights"],
  ["enterprise", "enterprise", "field",
    "entrepreneur, entrepreneurship, startup, start up, small business, sme, social enterprise, business development, incubator, accelerator"],
  ["finance", "access to finance", "field",
    "financial inclusion, microfinance, savings, credit, payments, community payments, community currency, mutual credit, voucher, remittance, lending, loan, banking, unbanked, cash transfer, basic income, commitment pooling"],
  ["commons", "open source and public goods", "field",
    "open source, opensource, free software, floss, public goods, public good, digital public goods, digital commons, knowledge commons, commons, open knowledge, open data, open hardware, open science, digital public infrastructure, open infrastructure, open technology, developer tools"],
  ["web3", "web3 and blockchain", "field",
    "blockchain, web3, ethereum, crypto, cryptocurrency, onchain, on chain, daos, smart contract, token, tokenized, defi, refi, decentralized, decentralised, nft, filecoin, ipfs, celo, hypercert, attestation, layer 2, wallet, decentralized storage, decentralized science"],
  ["staking", "staking and validators", "field",
    "staking, staking infrastructure, validator, distributed validators, home stakers, node operators, community staking, ethereum staking, ethereum community staking"],
  ["rights-online", "digital rights and security", "field",
    "internet freedom, digital rights, privacy, digital security, censorship, surveillance, cybersecurity, software security, encryption, information controls, digital autonomy"],
  ["research", "research and science", "field",
    "research, researcher, science, scientific, scientist, study, academic, laboratory, citizen science, data science"],
  ["evidence", "impact records and evaluation", "field",
    "impact measurement, measuring impact, impact reporting, monitoring and evaluation, evaluation, evaluator, evidence, verification, verified, mrv, accountability, reporting, report, record, records, documentation, documenting, traceability, outcomes, green accountability, registro, registros, registrar, rastreabilidade, trazabilidad, rastrear, evidencias, evidencia, avaliacao, evaluacion, relatorio, relatorios, informe, informes"],
  ["community", "community development", "field",
    "community development, community led, community driven, grassroots, cooperative, coop, co op, mutual aid, neighborhood, neighbourhood, community organizing, community organising, community building, community hub, community centre, community center, makerspace, hackerspace, community resilience, community wellbeing, community power"],
  ["civic", "democracy and civic life", "field",
    "democracy, democratic, governance, civic, civil society, policy, advocacy, voting, election, participatory, public participation, movement building"],
  ["justice", "rights and justice", "field",
    "human rights, justice, social justice, legal aid, racial justice, economic justice, racial equity"],
  ["housing", "housing and land", "field",
    "housing, homelessness, land rights, land tenure, affordable housing, land access"],
  ["migration", "migration and refugees", "field",
    "migration, migrant, refugee, displaced, asylum"],
  ["peace", "peace and safety", "field",
    "peace, peacebuilding, peace building, conflict, violence, safety"],
  ["media", "media and journalism", "field",
    "journalism, journalist, news media, independent media, community media, local media, media literacy, public interest media, community radio, radio station, radio programme, radio program, radio show, news, podcast, broadcasting, documentary"],
  ["transport", "transport", "field",
    "transport, transportation, mobility, bicycle, cycling, bike, public transit"],
  ["animals", "animal welfare", "field", "animal welfare, animal, animals"],
  ["spirit", "care and spirit", "field",
    "spiritual, spirituality, faith, ceremony, care work, caregiving, healing"],
  ["youth", "young people", "people",
    "youth, young people, children, child, kids, adolescent, teenager, young"],
  ["women", "women and girls", "people",
    "women, woman, girls, gender, feminist, mother, gender equality, gender justice, gender equity"],
  ["indigenous", "Indigenous peoples", "people",
    "indigenous, first nations, aboriginal, tribal, native american, native communities, traditional knowledge, ancestral knowledge"],
  ["low-income", "people on low incomes", "people",
    "poverty, low income, marginalized, marginalised, underserved, vulnerable, poverty reduction, energy poor"],
  ["rural", "rural communities", "people", "rural, village, smallholder"],
  ["disability", "disabled people", "people", "disability, disabilities, disabled, deaf, blind"],
  ["lgbtq", "LGBTQ people", "people", "lgbtq, lgbt, queer, transgender"],
  ["connectivity", "internet access", "means",
    "internet, connectivity, broadband, wifi, wi fi, starlink, digital inclusion, digital divide"],
  ["technology", "technology", "means",
    "technology, tech, software, app, platform, digital, data, ai, artificial intelligence, machine learning, tool, sensor, satellite, remote sensing, mobile"],
];

export const THEMES: readonly Theme[] = ROWS.map(([id, label, kind]) => ({ id, label, kind }));
const BY_ID = new Map(THEMES.map((theme) => [theme.id, theme]));
export const themeById = (id: string): Theme | undefined => BY_ID.get(id);

/** Phrases that look like a theme's words but name something else; their words are not read. */
const OTHER_MEANINGS = [
  "track record", "record label", "world record", "on record", "for the record", "public record",
  "sound recording", "audio recording", "power dynamics", "people power", "power of", "art of", "state of the art",
  "work of art", "field of study", "case study", "case studies",
  "climate of", "health check", "data protection", "tool kit", "evidence based", "evidence backed", "evidence informed",
  "evidence driven", "research based", "data driven", "amateur radio", "ecosystem health", "ocean health", "river health",
];

const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const tokens = (text: string) => fold(text).replace(/['’]/gu, "").split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/** A word and its plurals: farmer, farmers; species; community, communities. */
function wordMatches(token: string, word: string): boolean {
  if (token === word) return true;
  if (word.length < 3) return false;
  if (token === `${word}s` || token === `${word}es`) return true;
  return word.endsWith("y") && token === `${word.slice(0, -1)}ies`;
}

/** One phrase and every theme that lists it: "fisheries" names farming and food, and oceans and coasts. */
type Phrase = { readonly words: readonly string[]; readonly themes: readonly string[] };
let phrases: Phrase[] | undefined;
function phraseList(): Phrase[] {
  if (phrases) return phrases;
  const byText = new Map<string, { words: string[]; themes: string[] }>();
  for (const [id, , , list] of ROWS)
    for (const phrase of list.split(",")) {
      const words = tokens(phrase);
      if (!words.length) continue;
      const key = words.join(" ");
      const seen = byText.get(key);
      if (seen) { if (!seen.themes.includes(id)) seen.themes.push(id); } else byText.set(key, { words, themes: [id] });
    }
  return (phrases = [...byText.values()]);
}
/** The forms a token may take as a phrase's word: itself and the singular it may be a plural of. */
const stems = (token: string) => {
  const forms = [token];
  if (token.endsWith("ies") && token.length > 4) forms.push(`${token.slice(0, -3)}y`);
  if (token.endsWith("es") && token.length > 4) forms.push(token.slice(0, -2));
  if (token.endsWith("s") && token.length > 3) forms.push(token.slice(0, -1));
  return forms;
};
/** Phrases by length, then by their first word, so each position is tried only against phrases that can start there. */
let index: Map<number, Map<string, Phrase[]>> | undefined;
function phraseIndex() {
  if (index) return index;
  index = new Map();
  for (const phrase of phraseList()) {
    const byFirst = index.get(phrase.words.length) ?? new Map<string, Phrase[]>();
    index.set(phrase.words.length, byFirst);
    byFirst.set(phrase.words[0]!, [...(byFirst.get(phrase.words[0]!) ?? []), phrase]);
  }
  return index;
}
const otherMeanings = OTHER_MEANINGS.map(tokens);
/**
 * Catalog topics that name a theme without being one of its English phrases, for Portuguese and
 * Spanish text only: "saberes ancestrais" names ancestral, "mudas nativas" native. In English these
 * words stay unread, since "native" or "ancestral home" says nothing of the work.
 */
const TOPIC_THEMES: Readonly<Record<string, string>> = {
  ancestral: "indigenous", native: "nature", environmental: "nature", environment: "nature", pollution: "waste",
  adaptation: "climate", mitigation: "climate", renewable: "energy", childhood: "childhood", children: "youth",
  peoples: "indigenous", afrodescendant: "justice", volunteer: "community", memory: "arts", communications: "media",
  healing: "spirit", reproductive: "health", rights: "justice", equality: "justice", equity: "justice", racial: "justice",
  racism: "justice", solidarity: "community", cooperative: "community", hygiene: "health", sanitation: "water",
  landscape: "nature", territorial: "housing", disaster: "climate", elders: "community",
};
/** Catalog topics (English words the rubric uses) that name a theme, for Portuguese and Spanish text. */
let topicThemes: Map<string, string> | undefined;
function themeOfTopic(topic: string): string | undefined {
  if (!topicThemes) {
    topicThemes = new Map();
    for (const { words, themes } of phraseList()) if (words.length === 1 && !topicThemes.has(words[0]!)) topicThemes.set(words[0]!, themes[0]!);
  }
  return TOPIC_THEMES[topic] ?? topicThemes.get(topic) ?? topicThemes.get(topic.replace(/s$/u, ""));
}

/**
 * Words that deny what follows ("without crypto", "not a solar project"). Only the word just before a
 * phrase counts, past an article, so "non-profit education" and "no-till farming" keep their themes.
 */
const NEGATIONS = new Set(["without", "not", "no", "never", "nor"]);
const ARTICLES = new Set(["a", "an", "the", "any"]);
/**
 * Teaching words that name a means when another word names what is taught: "investor training",
 * "watershed mapping training", "caregiver workshops". Their field is investment, water or care, not
 * education, so the teaching word reads as an example. After these words it names education itself.
 */
const TEACHING = new Set(["training", "trainings", "workshop", "workshops", "course", "courses", "classes", "lessons", "sessions", "bootcamp", "bootcamps"]);
const TEACHING_AFTER = new Set((
  "a an the our their its your free practical online hands vocational technical professional digital skills skill " +
  "teacher teachers on and or of for with in to we they run runs offer offers provide provides deliver delivers give " +
  "host hosts lead leads short weekly monthly regular community peer basic advanced formal informal public open leadership"
).split(" "));
/**
 * Where a list of examples starts in a sentence. Its themes illustrate the sentence's subject:
 * "an app for groups doing regenerative work, such as planting trees or keeping solar panels running".
 */
const EXAMPLES = /,\s*(?:like|from)\s|\b(?:such as|for example|for instance|including|among them|tales como|tais como|por ejemplo|por exemplo|como por ejemplo|incluyendo|incluindo)\b/iu;
/**
 * Where the subjects of teaching start: "workshops on digital skills, Web3 and climate". Teaching
 * about climate is education, not climate work, so those subjects weigh as examples do. The list ends
 * at the next ", and" or the sentence's end.
 */
const TAUGHT = /\b(?:(?:workshops?|courses?|classes|lessons|sessions|bootcamps?|curriculum|talleres|oficinas|cursos|aulas)\s+(?:on|about|de|sobre|em)|(?:training|trainings)\s+(?:on|about|in|de|sobre|em))\s/iu;
const TAUGHT_END = /,\s*(?:and|y|e)\s/iu;
const SENTENCES = /(?<!\b(?:etc|dr|dra|sr|sra|prof))[.!?;\n]+/iu;
/** Abbreviations whose full stops are not sentence ends; "e.g." opens an example list as "for example" does. */
const ABBREVIATIONS: readonly (readonly [RegExp, string])[] = [[/\be\.\s?g\.,?/giu, "for example"], [/\bi\.\s?e\.,?/giu, "that is"]];

type Found = Map<string, { words: Set<string>; example: boolean; lead: boolean }>;
function readPart(text: string, example: boolean, found: Found, lead = false) {
  const list = tokens(text);
  const used = new Array<boolean>(list.length).fill(false);
  const note = (theme: string, words: string, isExample: boolean) => {
    const seen = found.get(theme);
    if (seen) {
      seen.words.add(words);
      seen.example &&= isExample;
      seen.lead ||= lead && !isExample;
    } else found.set(theme, { words: new Set([words]), example: isExample, lead: lead && !isExample });
  };
  for (const other of otherMeanings)
    for (let i = 0; i + other.length <= list.length; i++)
      if (other.every((word, at) => list[i + at] === word)) for (let at = 0; at < other.length; at++) used[i + at] = true;
  const free = (from: number, length: number) => {
    for (let at = from; at < from + length; at++) if (used[at]) return false;
    return true;
  };
  // Longest phrases first, so "open source" is read before "source" could be, and a word read by a
  // longer phrase is not read again by a shorter one.
  const byLength = phraseIndex();
  for (const length of [...byLength.keys()].sort((a, b) => b - a)) {
    const byFirst = byLength.get(length)!;
    for (let i = 0; i + length <= list.length; i++) {
      if (!free(i, length)) continue;
      const candidates = stems(list[i]!).flatMap((form) => byFirst.get(form) ?? []);
      const phrase = candidates.find(({ words }) => words.every((word, at) => wordMatches(list[i + at]!, word)));
      if (!phrase) continue;
      for (let at = 0; at < length; at++) used[i + at] = true;
      let before = i - 1;
      while (before >= 0 && ARTICLES.has(list[before]!)) before--;
      if (before >= 0 && NEGATIONS.has(list[before]!)) continue;
      const previous = list[i - 1];
      const means = length === 1 && TEACHING.has(list[i]!) && previous !== undefined && !TEACHING_AFTER.has(previous);
      for (const theme of phrase.themes) note(theme, list.slice(i, i + length).join(" "), example || means);
    }
  }
  // Portuguese and Spanish words, through the catalog topics they name.
  for (const topic of translatedTopics(text)) {
    const theme = themeOfTopic(topic);
    if (theme && !found.has(theme)) note(theme, topic, example);
  }
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
/**
 * The themes a text names. A theme named both as the subject and as an example counts as the
 * subject. The initiative's or project's own name is left out, so "Tech and Sun" is not technology
 * and "Green Goods" names no public goods.
 */
export function readThemes(text: string, name = ""): Map<string, ThemeReading> {
  const found: Found = new Map();
  const own = name.trim() ? new RegExp(`(?<![\\p{L}\\p{N}])${escape(name.trim())}(?![\\p{L}\\p{N}])`, "giu") : null;
  let read = own ? text.slice(0, 6000).replace(own, " ") : text.slice(0, 6000);
  for (const [pattern, words] of ABBREVIATIONS) read = read.replace(pattern, words);
  const sentences = read.split(SENTENCES).filter((sentence) => /[\p{L}\p{N}]/u.test(sentence));
  sentences.forEach((sentence, index) => {
    const lead = index === 0;
    const at = sentence.search(EXAMPLES);
    const subject = at < 0 ? sentence : sentence.slice(0, at);
    const taught = subject.search(TAUGHT);
    if (taught < 0) readPart(subject, false, found, lead);
    else {
      const start = taught + subject.slice(taught).match(TAUGHT)![0].length;
      const rest = subject.slice(start), end = rest.search(TAUGHT_END);
      readPart(subject.slice(0, start), false, found, lead);
      readPart(end < 0 ? rest : rest.slice(0, end), true, found, lead);
      if (end >= 0) readPart(rest.slice(end), false, found, lead);
    }
    if (at >= 0) readPart(sentence.slice(at), true, found, lead);
  });
  return new Map([...found].flatMap(([id, { words, example, lead }]) => {
    const theme = BY_ID.get(id);
    return theme ? [[id, { theme, words: [...words], example, lead }] as const] : [];
  }));
}
