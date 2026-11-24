// The must-match gate. A set of real initiatives, each pair written against the rubric in README.md, that
// Weave must match for what the platform is for: needs meeting offers across the kinds of support, funds
// that fund what an initiative does where it works, and the keyword traps that must stay out. CI fails
// when a gated pair stops holding. See README.md#must-match-suite.
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { namedPlaces } from "../../api/src/places.ts";
import { rankPartners, type RankedPartnerMatch } from "../../api/src/partner-ranking.ts";
import { rankPartnerMatches, type PartnerEntry, type ProjectEvidence } from "../../api/src/partner-matcher.ts";
import { createLexicalIndex, rankFunds } from "../../../dist/matching.mjs";
import { catalogEntries } from "../src/funding/catalog.ts";
import { evaluateCatalog, rubricProject, type Project } from "../src/funding/engine.ts";
import { EvaluationSchema, type Evaluation } from "../src/funding/contracts.ts";
import { z } from "../src/validation.ts";
import { emptyFundingFilters, filterFunding } from "../src/funding/select.ts";
import { loadRankingData, validateRankingSet, type RankingData, type RankingInitiative } from "./fund-ranking.ts";

type Entry = { id: string; kind: "need" | "offer"; title: string; description: string; capitalForms: string[]; placeScope: string };
type SuiteInitiative = {
  id: string; name: string; lens: string; description?: string; corpus?: string; places?: string[]; isGlobal?: boolean;
  workCountries?: string[]; entries?: Entry[]; publicRecord?: { uri: string; name: string; passages: string[] };
};
type Status = "gate" | "should";
type FundCase = { id: string; persona: string; initiative: string; within: number; status: Status; must?: string[]; mustNot?: string[]; reason: string };
type ProgramCase = { id: string; persona: string; program: string; first: string; among: string[]; status: Status; reason: string };
type PartnerCase = {
  id: string; persona: string; entry: string; within: number; status: Status; reason: string;
  must?: string[]; mustNot?: string[]; none?: boolean; onlyCountries?: string[];
  /** At least one of these, where several projects fit equally. */
  anyOf?: string[];
};
export type Suite = { version: 1; dataset: string; initiatives: SuiteInitiative[]; funds: FundCase[]; programs: ProgramCase[]; partners: PartnerCase[] };
type CorpusProject = { id: string; uri: string; name: string; passages: string[]; sharedAt: string; checkedAt: string; collectedAt: string; sourceUrl: string };

export type CaseResult = { id: string; kind: "fund" | "program" | "partner"; persona: string; status: Status; pass: boolean; detail: string; reason: string };

const HERE = new URL("./", import.meta.url);
const json = async (path: URL): Promise<unknown> => JSON.parse(await readFile(path, "utf8"));
const text = (value: unknown) => typeof value === "string" && value.trim().length > 0;

/** Rejects a suite whose pairs could not be judged: unknown ids, a pair with nothing to check, or no stated reason. */
export function validateSuite(raw: unknown, known: { programs: Set<string>; initiatives: Set<string>; projects: Set<string> }): Suite {
  const suite = raw as Suite;
  if (!suite || suite.version !== 1 || !Array.isArray(suite.funds) || !Array.isArray(suite.partners) || !Array.isArray(suite.programs))
    throw Error("invalid_must_match_suite");
  const ids = new Set<string>();
  const entries = new Set(suite.initiatives.flatMap(({ entries }) => (entries ?? []).map(({ id }) => id)));
  for (const pair of [...suite.funds, ...suite.programs, ...suite.partners]) {
    if (!text(pair.id) || ids.has(pair.id)) throw Error(`duplicate_or_missing_case: ${pair.id}`);
    ids.add(pair.id);
    if (!text(pair.reason) || !text(pair.persona)) throw Error(`case_without_reason: ${pair.id}`);
    if (!["gate", "should"].includes(pair.status)) throw Error(`invalid_status: ${pair.id}`);
  }
  for (const pair of suite.funds) {
    if (!known.initiatives.has(pair.initiative)) throw Error(`unknown_initiative: ${pair.id} ${pair.initiative}`);
    const programs = [...(pair.must ?? []), ...(pair.mustNot ?? [])];
    if (!programs.length) throw Error(`nothing_to_check: ${pair.id}`);
    for (const program of programs) if (!known.programs.has(program)) throw Error(`unknown_program: ${pair.id} ${program}`);
  }
  for (const pair of suite.programs) {
    if (!known.programs.has(pair.program)) throw Error(`unknown_program: ${pair.id} ${pair.program}`);
    for (const id of [pair.first, ...pair.among]) if (!known.initiatives.has(id)) throw Error(`unknown_initiative: ${pair.id} ${id}`);
    if (!pair.among.includes(pair.first)) throw Error(`first_not_among: ${pair.id}`);
  }
  for (const pair of suite.partners) {
    if (!entries.has(pair.entry)) throw Error(`unknown_entry: ${pair.id} ${pair.entry}`);
    const candidates = [...(pair.must ?? []), ...(pair.mustNot ?? []), ...(pair.anyOf ?? [])];
    if (!candidates.length && !pair.none && !pair.onlyCountries?.length) throw Error(`nothing_to_check: ${pair.id}`);
    for (const candidate of candidates) if (!known.projects.has(candidate)) throw Error(`unknown_project: ${pair.id} ${candidate}`);
  }
  return suite;
}

export type MustMatchData = {
  suite: Suite;
  ranking: RankingData;
  /** Every initiative a fund pair can name: the suite's own and the fund-ranking set's. */
  cards: Map<string, Project>;
  corpus: CorpusProject[];
  evidence: ProjectEvidence[];
  /** A project's suite id (rp-xxx, or a suite initiative with a public record) and its address. */
  uris: Map<string, string>;
};

const projectOf = (id: string, name: string, description: string, places: string[], countries: string[]): Project => ({
  id, name, description, tags: [], asks: [], places, workCountries: countries, benefitCountries: countries,
  applicantBaseCountry: "", registrationCountry: "", applicantType: "unknown", fundingInstruments: [],
  goalMin: null, goalMax: null, currency: "", usWorkStates: [], usBenefitStates: [], programAnswers: {},
});
const rankingCard = (row: RankingInitiative): Project =>
  projectOf(row.id, row.name, row.description, row.where ? [row.where] : [], row.workCountries);

function evidenceOf(project: CorpusProject): ProjectEvidence[] {
  return project.passages.map((passage, index) => ({
    id: `${project.id}:${index}`, projectUri: project.uri, projectName: project.name, sourceUri: project.uri,
    sourceUrl: project.sourceUrl, cid: "", contentHash: "", fieldPath: `$.passages[${index}]`, passage,
    sourceCreatedAt: project.sharedAt, sourceIndexedAt: project.checkedAt, fetchedAt: project.collectedAt,
    extractionVersion: "partner-real-v1-corpus", kind: "work",
  }));
}

export async function loadMustMatch(): Promise<MustMatchData> {
  const [raw, rankingSet, ownerSet, corpusFile, ranking] = await Promise.all([
    json(new URL("must-match-v1.json", HERE)),
    json(new URL("fund-ranking-v1.json", HERE)),
    json(new URL("fund-relevance-owner-v1.json", HERE)),
    json(new URL("../../api/evaluation/partner-real-v1-corpus.json", HERE)),
    loadRankingData(),
  ]);
  const rows = [
    ...validateRankingSet(rankingSet).initiatives,
    ...validateRankingSet({ version: 1, dataset: "owner", initiatives: (ownerSet as { initiatives: unknown[] }).initiatives }).initiatives,
  ];
  const corpus = (corpusFile as { projects: CorpusProject[] }).projects;
  const draft = raw as Suite;
  const records: CorpusProject[] = draft.initiatives.flatMap(({ id, publicRecord }) => publicRecord
    ? [{ id, uri: publicRecord.uri, name: publicRecord.name, passages: publicRecord.passages, sharedAt: "2026-11-01T00:00:00.000000Z",
      checkedAt: "2026-11-24T00:00:00.000000Z", collectedAt: "2026-11-24T00:00:00.000Z", sourceUrl: `https://weave.example/${id}` }]
    : []);
  const all = [...corpus, ...records];
  const uris = new Map(all.map((project) => [project.id, project.uri]));
  const cards = new Map(rows.map((row) => [row.id, rankingCard(row)]));
  for (const initiative of draft.initiatives) {
    const source = initiative.corpus ? corpus.find(({ id }) => id === initiative.corpus) : undefined;
    const description = initiative.description ?? source?.passages.join(" ") ?? "";
    cards.set(initiative.id, projectOf(initiative.id, initiative.name, description, initiative.places ?? [], initiative.workCountries ?? []));
  }
  const suite = validateSuite(raw, {
    programs: new Set(ranking.names.keys()), initiatives: new Set(cards.keys()), projects: new Set(uris.keys()),
  });
  return { suite, ranking, cards, corpus: all, evidence: all.flatMap(evidenceOf), uris };
}

/**
 * Which matchers to score. "before" is what shipped before DL-143 and DL-144: Funding's fit as the
 * rubric's count of shared words, and Partners as the word matcher alone with no initiative read.
 */
export type Engine = "current" | "before";

/** The rubric's results with its own fit, as Funding ranked them before DL-143. */
function rubricResults(data: MustMatchData, card: Project): Evaluation[] {
  const funds = data.ranking.bundle.catalog.funds.flatMap((fund) => fund.enrichment.programs.length
    ? fund.enrichment.programs.map((program) => ({ ...fund, enrichment: { ...fund.enrichment, programs: [program] } }))
    : [fund]);
  const results = rankFunds(funds, rubricProject(card), createLexicalIndex(data.ranking.bundle.catalog.funds), data.ranking.bundle.rules,
    null, data.ranking.now, data.ranking.bundle.conditions);
  return z.array(EvaluationSchema).parse(results);
}

/** Funding's own order for one card: Strongest fit, as the page opens. */
function fundingOrder(data: MustMatchData, card: Project, engine: Engine) {
  const results = engine === "current" ? evaluateCatalog(data.ranking.bundle, card, data.ranking.now) : rubricResults(data, card);
  const order = filterFunding(catalogEntries(data.ranking.bundle), { ...emptyFundingFilters, sort: "fit" }, results, data.ranking.now);
  return { results: new Map(results.map((result) => [result.documentId, result])), order: order.map(({ id }) => id) };
}

/** The partner queries for one suite initiative, each carrying its initiative as Partners for you does. */
function queriesOf(data: MustMatchData, initiative: SuiteInitiative): PartnerEntry[] {
  const card = data.cards.get(initiative.id)!;
  const uri = initiative.publicRecord?.uri ?? (initiative.corpus ? data.uris.get(initiative.corpus) : undefined) ?? initiative.id;
  return (initiative.entries ?? []).map((entry) => ({
    initiativeId: uri, revision: 1, entryId: entry.id, kind: entry.kind,
    summary: { name: card.name, description: card.description, locations: [...card.places], isGlobal: initiative.isGlobal === true, lenses: [initiative.lens], themes: [] },
    value: { status: "open", title: entry.title, description: entry.description, purpose: null, placeScope: entry.placeScope, capitalForms: entry.capitalForms },
  }));
}

export function runMustMatch(data: MustMatchData, engine: Engine = "current"): CaseResult[] {
  const out: CaseResult[] = [];
  const name = (id: string) => data.ranking.names.get(id) ?? id;
  const orders = new Map<string, ReturnType<typeof fundingOrder>>();
  const orderOf = (id: string) => {
    let found = orders.get(id);
    if (!found) orders.set(id, (found = fundingOrder(data, data.cards.get(id)!, engine)));
    return found;
  };
  for (const pair of data.suite.funds) {
    const { order, results } = orderOf(pair.initiative);
    const place = (program: string) => order.indexOf(program) + 1;
    const describe = (program: string) => {
      const fit = results.get(program)?.thematicFit;
      return `${name(program)} #${place(program) || "none"} (fit ${fit?.score ?? "not assessed"}: ${fit?.evidenceTerms.join(", ") || "nothing shared"})`;
    };
    const missing = (pair.must ?? []).filter((program) => !(place(program) > 0 && place(program) <= pair.within));
    const present = (pair.mustNot ?? []).filter((program) => place(program) > 0 && place(program) <= pair.within);
    out.push({
      id: pair.id, kind: "fund", persona: pair.persona, status: pair.status, reason: pair.reason,
      pass: !missing.length && !present.length,
      detail: [
        ...(pair.must ?? []).map((program) => `must: ${describe(program)}`),
        ...(pair.mustNot ?? []).map((program) => `must not: ${describe(program)}`),
      ].join("; "),
    });
  }
  for (const pair of data.suite.programs) {
    const scores = pair.among.map((id) => ({ id, score: orderOf(id).results.get(pair.program)?.thematicFit.score ?? -1 }))
      .sort((a, b) => b.score - a.score);
    const top = scores[0]!;
    out.push({
      id: pair.id, kind: "program", persona: pair.persona, status: pair.status, reason: pair.reason,
      // A tie at the top does not put the expected initiative first.
      pass: top.id === pair.first && (scores[1]?.score ?? -1) < top.score,
      detail: `${name(pair.program)}: ${scores.map(({ id, score }) => `${id} ${score}`).join(", ")}`,
    });
  }
  const queries = data.suite.initiatives.flatMap((initiative) => queriesOf(data, initiative));
  const ranked: RankedPartnerMatch[] = engine === "current"
    ? rankPartners({ queries, publicEvidence: data.evidence, limitPerEntryAndKind: 5 })
    // The word matcher never left out the initiative's own project; the device snapshot did.
    : rankPartnerMatches({ queries: queries.map((query) => ({ ...query, summary: {} })), publicEvidence: data.evidence, limitPerEntryAndKind: 5 })
      .filter((match) => !queries.some((query) => query.entryId === match.query.entryId && query.initiativeId === match.counterpart.id));
  const projectId = new Map([...data.uris].map(([id, uri]) => [uri, id]));
  const passagesOf = new Map(data.corpus.map((project) => [project.uri, project.passages.join(" ")]));
  for (const pair of data.suite.partners) {
    const results = ranked.filter((match: RankedPartnerMatch) => match.query.entryId === pair.entry);
    const ids = results.map((match) => projectId.get(match.counterpart.id) ?? match.counterpart.id);
    const place = (id: string) => ids.indexOf(id) + 1;
    const missing = (pair.must ?? []).filter((id) => !(place(id) > 0 && place(id) <= pair.within));
    const present = (pair.mustNot ?? []).filter((id) => place(id) > 0 && place(id) <= pair.within);
    const elsewhere = pair.onlyCountries
      ? results.filter((match) => ![...namedPlaces(passagesOf.get(match.counterpart.id) ?? "").countries].some((code) => pair.onlyCountries!.includes(code)))
      : [];
    const someOf = !pair.anyOf || pair.anyOf.some((id) => place(id) > 0 && place(id) <= pair.within);
    const pass = !missing.length && !present.length && someOf && (!pair.none || !results.length) && !elsewhere.length;
    out.push({
      id: pair.id, kind: "partner", persona: pair.persona, status: pair.status, reason: pair.reason, pass,
      detail: results.length
        ? results.slice(0, pair.within).map((match, i) => `${i + 1}. ${match.counterpart.name.slice(0, 60)} [${match.reasons.map(({ terms }) => terms.join(", ")).join("; ")}]`).join(" | ")
        : "no suggestion",
    });
  }
  return out;
}

export function summary(results: CaseResult[]) {
  const gated = results.filter(({ status }) => status === "gate");
  return { gated: gated.length, gatedPassed: gated.filter(({ pass }) => pass).length, all: results.length, passed: results.filter(({ pass }) => pass).length };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const engine: Engine = process.argv.includes("--before") ? "before" : "current";
  const results = runMustMatch(await loadMustMatch(), engine);
  for (const result of results)
    console.log(`${result.pass ? "pass" : "FAIL"}  ${result.id.padEnd(5)} ${result.status.padEnd(6)} ${result.persona}\n      ${result.detail}`);
  const { gated, gatedPassed, all, passed } = summary(results);
  console.log(`\nMust-match (${engine} matchers): ${passed} of ${all} pairs hold; gated ${gatedPassed} of ${gated}.`);
  if (engine === "current" && gatedPassed < gated) process.exitCode = 1;
}
