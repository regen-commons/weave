// Builds the partner-real-v2 holdout's corpus and query slots, writes the blind writers' briefs, and checks the
// queries they return. The plan is ../evaluation/partner-real-v2-plan.md.
//
// The holdout files stay private until the scored run. Write them outside tracked files (the repository ignores
// docs/platform/research/local-only/); only their SHA-256 hashes are committed, in partner-real-v2.sha256.
//
//   node packages/api/scripts/partner-real-v2.mjs pages <dir>
//   node packages/api/scripts/partner-real-v2.mjs corpus <pages-dir> <collected-at ISO> <corpus.json>
//   node packages/api/scripts/partner-real-v2.mjs slots <corpus.json> <out-dir>
//   node packages/api/scripts/partner-real-v2.mjs assemble <corpus.json> <slots.json> <answers-dir> <out-dir>
//   node packages/api/scripts/partner-real-v2.mjs hashes <file>...
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parsePublicProjectPage, PUBLIC_PROJECT_PAGE_MAX } from "../src/public-projects-contract.ts";
import { exclusionReason, passageLanguage, theme } from "./partner-real-corpus.mjs";

export const SALT = "partner-real-v2";
export const DOMAINS = ["art", "software", "research", "place"];
const ENDPOINT = "https://weave.regencommons.com/api/public-projects";
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const salted = (...parts) => sha256([SALT, ...parts].join(":"));
const saltKey = item => typeof item === "string" ? item : item.uri ?? item.key ?? item.order;
const bySalt = (...prefix) => (a, b) => salted(...prefix, saltKey(a)).localeCompare(salted(...prefix, saltKey(b)));

/** Saves every page of the public list, as partner-real-corpus.mjs reads them. Stops on any change mid-listing. */
export async function savePages(dir, fetchPage = url => fetch(url, { signal: AbortSignal.timeout(60_000) })) {
  let cursor = null, total = null, page = 0;
  do {
    const url = new URL(ENDPOINT);
    url.searchParams.set("limit", String(PUBLIC_PROJECT_PAGE_MAX));
    if (cursor) url.searchParams.set("cursor", cursor);
    const response = await fetchPage(url.href);
    if (!response.ok) throw Error(`public_projects_failed:${response.status}`);
    const body = await response.json();
    const parsed = parsePublicProjectPage(body);
    if (total !== null && parsed.index.total !== total) throw Error("listing_changed_while_reading");
    total = parsed.index.total;
    page++;
    await writeFile(join(dir, `p${String(page).padStart(3, "0")}.json`), JSON.stringify(body), { flag: "wx" });
    cursor = parsed.next;
  } while (cursor);
  return { pages: page, total };
}

/**
 * Every project the v1 rules keep, unsampled: the QA, placeholder and contact rules, passage language by stopwords
 * and theme by keyword, all from partner-real-corpus.mjs. Ids follow a salted order of URIs; v1Id marks the 140
 * projects partner-real-v1 used.
 */
export function buildCorpus(cards, { collectedAt, index, v1 }) {
  const v1Ids = new Map(v1.projects.map(project => [project.uri, project.id]));
  const exclusions = { qa_or_test: 0, placeholder_text: 0, contact_details: 0 };
  const kept = [];
  for (const card of cards) { const reason = exclusionReason(card); if (reason) exclusions[reason]++; else kept.push(card); }
  kept.sort(bySalt("corpus"));
  return {
    version: 1, dataset: "partner-real-v2-corpus",
    source: { endpoint: `GET ${ENDPOINT}`, collectedAt, indexStatus: index.status, indexCheckedAt: index.checkedAt, listedProjects: cards.length },
    exclusions,
    rules: `Every project the partner-real-v1 rules keep, without sampling, in the order of sha256("${SALT}:corpus:" + uri). Language and theme come from the fixed keyword rules in scripts/partner-real-corpus.mjs.`,
    projects: kept.map((card, i) => ({
      id: `rp2-${String(i + 1).padStart(4, "0")}`, uri: card.uri, account: card.uri.split("/")[2], name: card.name, passages: card.passages,
      language: passageLanguage(card.passages), theme: theme(card), v1Id: v1Ids.get(card.uri) ?? null,
      sharedAt: card.sharedAt, checkedAt: card.checkedAt, collectedAt, sourceUrl: card.sourceUrl,
    })),
  };
}

/**
 * Per domain: 40 slots, 20 needs and 20 offers, 25 English, 10 Portuguese and 5 Spanish. By kind: 21 seeded, 4 hard
 * negatives (seeded, but the seed must not fit), 10 blind and 5 sparse (blind, 1 to 4 words). Over four domains that
 * is 100 seeded queries, 16 of them hard negatives, and 60 blind, 20 of them sparse, as the plan sets out.
 */
export const KINDS = [
  { kind: "seeded", count: 21, languages: { en: 13, pt: 5, es: 3 } },
  { kind: "hard-negative", count: 4, languages: { en: 3, pt: 1, es: 0 } },
  { kind: "blind", count: 10, languages: { en: 6, pt: 3, es: 1 } },
  { kind: "sparse", count: 5, languages: { en: 3, pt: 1, es: 1 } },
];
/** Seeded needs come first in art and research, seeded offers in software and place; sparse slots start the other way. */
const firstDirection = (domain, kind) => {
  const seededFirst = domain === "art" || domain === "research" ? "need" : "offer";
  if (kind === "seeded") return seededFirst;
  if (kind === "sparse") return seededFirst === "need" ? "offer" : "need";
  return "need";
};
const other = direction => direction === "need" ? "offer" : "need";

/** Seeds for one domain: projects of that theme, new to v2 first, each group in salted order, repeated if too few. */
export function seedOrder(corpus, domain) {
  const themed = corpus.projects.filter(project => project.theme === domain);
  const fresh = themed.filter(project => !project.v1Id).sort(bySalt("seed", domain));
  const seen = themed.filter(project => project.v1Id).sort(bySalt("seed", domain));
  return [...fresh, ...seen];
}

export function buildSlots(corpus) {
  const slots = [];
  for (const domain of DOMAINS) {
    const seeds = seedOrder(corpus, domain);
    if (!seeds.length) throw Error(`no_seed_projects:${domain}`);
    const drafted = [];
    let seedIndex = 0;
    for (const { kind, count, languages } of KINDS) {
      const languageList = Object.entries(languages).flatMap(([language, n]) => Array(n).fill(language))
        .map((language, i) => ({ language, key: `${domain}:${kind}:${i}` })).sort(bySalt("language")).map(entry => entry.language);
      if (languageList.length !== count) throw Error(`language_quota_mismatch:${kind}`);
      let direction = firstDirection(domain, kind);
      for (let i = 0; i < count; i++) {
        const seeded = kind === "seeded" || kind === "hard-negative";
        drafted.push({ domain, direction, language: languageList[i], kind, seed: seeded ? seeds[seedIndex++ % seeds.length].id : null, order: `${domain}:${kind}:${i}` });
        direction = other(direction);
      }
    }
    // Query ids follow a salted order, so an id says nothing of the slot's kind.
    drafted.sort(bySalt("id")).forEach((slot, i) => {
      const { order, ...rest } = slot;
      slots.push({ id: `rq2-${domain}-${String(i + 1).padStart(2, "0")}`, ...rest });
    });
  }
  return { version: 1, dataset: "partner-real-v2-slots", note: "Part of the key. Never shown to reviewers.", slots };
}

const DOMAIN_TEXT = {
  art: "arts, culture, crafts, film, music, storytelling, design, artisans, cultural heritage",
  software: "digital tools, apps, data platforms, sensors and AI, maps and remote sensing, web3",
  research: "scientific study, monitoring, surveys, field data, evaluation, laboratories",
  place: "on-the-ground work with land, water, food, forests, compost, buildings, schools, sites",
};
const LANGUAGE_NAME = { en: "English", pt: "Portuguese", es: "Spanish" };
const WEAVE = "Weave helps regenerative initiatives find partners. An initiative is a project, organisation, collective or "
  + "place-based effort, such as a community farm, a watershed group, an artists' collective, a research team or a group "
  + "building digital tools. Each initiative lists needs (what it is looking for) and offers (what it can give). A partner "
  + "for a need is an initiative whose work could provide it; a partner for an offer is an initiative whose work could use it.";
const RUBRIC = "A need is served by an initiative whose described work could plausibly provide what is needed; an offer fits an "
  + "initiative that could plausibly use what is offered, given what it describes doing. A nearby but different activity "
  + "does not fit, and shared vague words are not a reason.";
const OUTPUT = "Reply with only a JSON array, one object per slot, in the order given: "
  + "[{\"id\": \"...\", \"title\": \"...\", \"description\": \"...\"}]. Use \"description\": null for sparse slots.";
const RULES = "Do not open any file, run any command or search the web: everything you need is here. "
  + "Write each one as a real initiative would type it into Weave: a short title, and for every slot that is not sparse a "
  + "description of one or two plain sentences. Write in the language the slot names. Do not mention Weave, matching or these instructions.";

/** Phase 1: blind and sparse slots, with no project shown. Phase 2, sent afterwards to the same writer: seeded slots. */
export function briefs(corpus, slotFile) {
  const byId = new Map(corpus.projects.map(project => [project.id, project]));
  const out = {};
  for (const domain of DOMAINS) {
    const mine = slotFile.slots.filter(slot => slot.domain === domain);
    const line = slot => `- ${slot.id}: ${slot.direction === "offer" ? "an offer" : "a need"} in ${LANGUAGE_NAME[slot.language]}`;
    const blind = mine.filter(slot => slot.kind === "blind" || slot.kind === "sparse");
    out[`${domain}-1-blind.md`] = [
      `You are writing test requests for a partner-finding tool, in the ${domain} domain (${DOMAIN_TEXT[domain]}).`, "", WEAVE, "", RULES, "",
      "For each slot below, write one need or offer an initiative in this domain might list. Some may have no partner anywhere; "
        + "that is fine. Vary the kinds of initiative and request.",
      "Sparse slots: a title of 1 to 4 words and no description, as a hurried person would type it.", "",
      ...blind.map(slot => `${line(slot)}${slot.kind === "sparse" ? ", sparse" : ""}`), "", OUTPUT,
    ].join("\n");
    const seeded = mine.filter(slot => slot.kind === "seeded" || slot.kind === "hard-negative");
    out[`${domain}-2-seeded.md`] = [
      "Second part, same domain and rules. Each slot now shows one real initiative's public description.", "", RUBRIC, "",
      "Fit slots: write a need that initiative could serve, or an offer it could use, as a different initiative would list it. "
        + "Use your own words: do not copy its name, its place names or its distinctive phrases.",
      "Not-fit slots: write a need that initiative could not serve, or an offer it could not use, that still uses some of the "
        + "same ordinary words. It must still be a plausible request in this domain.", "",
      ...seeded.map(slot => { const project = byId.get(slot.seed);
        return `${line(slot)}, ${slot.kind === "seeded" ? "fit" : "not fit"}\n  Initiative: ${project.name}\n  Its words: ${project.passages.join(" ")}`; }),
      "", OUTPUT,
    ].join("\n");
  }
  return out;
}

const STOP = new Set("about after also and are been being but can could each for from has have into its more most not our out over such than that the their them then there these they this those through very was were what when where which while who will with within would your".split(" "));
const words = text => (text.toLowerCase().match(/\p{L}{4,}/gu) ?? []).filter(word => !STOP.has(word));

/** Words of a seed's name and passages that at most 1% of corpus projects use: a fit query must not reuse them. */
export function distinctiveWords(corpus, project) {
  const frequency = new Map();
  for (const p of corpus.projects) for (const word of new Set(words(`${p.name} ${p.passages.join(" ")}`))) frequency.set(word, (frequency.get(word) ?? 0) + 1);
  const limit = Math.max(1, Math.floor(corpus.projects.length * 0.01));
  return new Set(words(`${project.name} ${project.passages.join(" ")}`).filter(word => frequency.get(word) <= limit));
}

/** Joins the writers' answers to their slots and checks quotas, format, language and word reuse. Labels nothing. */
export function assemble(corpus, slotFile, answers) {
  const byId = new Map(corpus.projects.map(project => [project.id, project]));
  const answered = new Map();
  const problems = [];
  for (const answer of answers) {
    if (answered.has(answer.id)) problems.push(`duplicate_answer:${answer.id}`);
    answered.set(answer.id, answer);
  }
  const ids = new Set(slotFile.slots.map(slot => slot.id));
  for (const id of answered.keys()) if (!ids.has(id)) problems.push(`unknown_slot:${id}`);
  const queries = [], flags = [];
  for (const slot of slotFile.slots) {
    const answer = answered.get(slot.id);
    if (!answer) { problems.push(`missing_answer:${slot.id}`); continue; }
    const title = typeof answer.title === "string" ? answer.title.trim() : "";
    const description = typeof answer.description === "string" && answer.description.trim() ? answer.description.trim() : null;
    if (!title || title.length > 160) problems.push(`bad_title:${slot.id}`);
    if (slot.kind === "sparse" && (description || title.split(/\s+/u).length > 4)) problems.push(`not_sparse:${slot.id}`);
    if (slot.kind !== "sparse" && (!description || description.length > 500)) problems.push(`bad_description:${slot.id}`);
    const language = passageLanguage([title, description ?? ""]);
    if (slot.kind !== "sparse" && language !== slot.language) flags.push({ id: slot.id, flag: "language", expected: slot.language, read: language });
    if (slot.kind === "seeded") {
      const reused = [...new Set(words(`${title} ${description ?? ""}`))].filter(word => distinctiveWords(corpus, byId.get(slot.seed)).has(word));
      if (reused.length) flags.push({ id: slot.id, flag: "reuses_seed_words", words: reused });
    }
    queries.push({ id: slot.id, domain: slot.domain, direction: slot.direction, language: slot.language, title, description });
  }
  const count = key => Object.fromEntries(Object.entries(Object.groupBy(queries, key)).map(([name, list]) => [name, list.length]));
  return {
    queries: { version: 1, dataset: "partner-real-v2-queries", corpus: "partner-real-v2-corpus.json", queries },
    problems, flags,
    counts: { total: queries.length, byDomainAndDirection: count(q => `${q.domain}/${q.direction}`), byLanguage: count(q => q.language),
      byKind: count(q => slotFile.slots.find(slot => slot.id === q.id).kind) },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, ...args] = process.argv.slice(2);
  const json = async path => JSON.parse(await readFile(path, "utf8"));
  const write = (path, value) => writeFile(path, typeof value === "string" ? value : JSON.stringify(value, null, 1) + "\n", { flag: "wx" });
  if (command === "pages") {
    console.log(JSON.stringify(await savePages(args[0])));
  } else if (command === "corpus") {
    const [dir, collectedAt, output] = args;
    if (!dir || !Number.isFinite(Date.parse(collectedAt)) || !output) throw Error("usage: corpus <pages-dir> <collected-at> <corpus.json>");
    const files = (await readdir(dir)).filter(name => /^p\d{3}\.json$/u.test(name)).sort();
    const pages = await Promise.all(files.map(async name => parsePublicProjectPage(await json(join(dir, name)))));
    const cards = pages.flatMap(page => page.projects);
    if (new Set(cards.map(card => card.uri)).size !== cards.length || cards.length !== pages[0].index.total) throw Error("incomplete_listing");
    const v1 = await json(new URL("../evaluation/partner-real-v1-corpus.json", import.meta.url));
    const corpus = buildCorpus(cards, { collectedAt, index: pages[0].index, v1 });
    await write(output, corpus);
    const count = key => Object.fromEntries(Object.entries(Object.groupBy(corpus.projects, key)).map(([k, v]) => [k, v.length]));
    console.log(JSON.stringify({ listed: cards.length, exclusions: corpus.exclusions, kept: corpus.projects.length,
      byLanguage: count(p => p.language), byTheme: count(p => p.theme), inV1: corpus.projects.filter(p => p.v1Id).length }));
  } else if (command === "slots") {
    const [corpusPath, dir] = args;
    const corpus = await json(corpusPath);
    const slotFile = buildSlots(corpus);
    await write(join(dir, "partner-real-v2-slots.json"), slotFile);
    for (const [name, text] of Object.entries(briefs(corpus, slotFile))) await write(join(dir, `brief-${name}`), text + "\n");
    console.log(JSON.stringify({ slots: slotFile.slots.length, seedsReused: slotFile.slots.filter(s => s.seed).length - new Set(slotFile.slots.map(s => s.seed).filter(Boolean)).size }));
  } else if (command === "assemble") {
    const [corpusPath, slotsPath, answersDir, outDir] = args;
    const answers = [];
    for (const name of (await readdir(answersDir)).filter(name => name.endsWith(".json")).sort()) answers.push(...await json(join(answersDir, name)));
    const result = assemble(await json(corpusPath), await json(slotsPath), answers);
    console.log(JSON.stringify({ problems: result.problems, flags: result.flags, counts: result.counts }, null, 1));
    if (!result.problems.length) await write(join(outDir, "partner-real-v2-queries.json"), result.queries);
  } else if (command === "hashes") {
    for (const path of args) console.log(`${sha256(await readFile(path))}  ${path.split("/").at(-1)}`);
  } else {
    throw Error("usage: pages | corpus | slots | assemble | hashes");
  }
}
