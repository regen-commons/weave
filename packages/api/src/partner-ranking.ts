/**
 * Partners ranked on complementarity, not shared words alone (PRD goal 2, R12; DL-144).
 *
 * The word matcher (partner-matcher.ts) finds a counterpart only when a passage repeats the words of
 * a need or offer. A tool builder asking for "communities to pilot it" then meets whoever writes
 * "community", and an offer of an app "for recording community work" meets bioacoustic projects that
 * make "recordings". Here each need or offer is read with the initiative it belongs to, and each
 * public project as a whole, for what each side is and does:
 * - the role a need asks for, or the users an offer would serve, against the roles a project's own
 *   words show (a place-based community, a tool builder, a research group, art and culture, learning
 *   and education, a funder), as the PRD's persona table pairs them: a tool builder with communities
 *   to pilot with, a researcher with place-based partners, a solar hub's need for a record of its
 *   work with a tool that records it;
 * - the fields of work both sides name (themes.ts), the initiative's examples included: the kinds of
 *   work a tool builder lists ("keeping solar panels running, teaching classes") are the communities
 *   it is looking for;
 * - the countries and regions both name.
 * Shared words from the word matcher still count, and still carry their own reasons.
 *
 * Evidence keeps its kind and provenance. A project read this way is an inferred capability or a
 * potential use of an offer, never a confirmed offer or need, and every result keeps the unknowns
 * the word matcher gives public work. A public project's words never answer a need for money unless
 * the project says it funds others. The word matcher itself, and the sealed evaluations that pin it,
 * are unchanged.
 */
import {
  partnerQueryProjection, rankPartnerMatches, type PartnerEntry, type PartnerEvidenceKind, type PartnerMatch,
  type ProjectEvidence, type SharedPartnerEntry,
} from "./partner-matcher.ts";
import { readThemes, type ThemeReading } from "./themes.ts";
import { namedPlaces, regionsOf, type Region } from "./places.ts";

export const PARTNER_RANKING_VERSION = "partner-complement-v1";

export type PartnerRole = "place" | "builder" | "research" | "culture" | "learning" | "funder";
export const ROLE_LABELS: Readonly<Record<PartnerRole, string>> = {
  place: "a place-based community", builder: "a tool builder", research: "a research group",
  culture: "art and culture", learning: "learning and education", funder: "a funder",
};

const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const strings = (value: unknown) => (Array.isArray(value) ? value.map(str).filter(Boolean) : []);

/** A product the writer builds, said as what they are or make. Using a tool ("with AudioMoth sensors") is not building one. */
const BUILDS = /\b(?:open[- ]source|we build|we develop|we built|we developed|we make|we maintain|builds?|develops?|is an?|are an?|is building|is developing)\s+(?:(?:an?|the|our|its)\s+)?(?:[\p{L}-]+\s+){0,4}(?:apps?|application|platform|protocol|software|tool|tools|toolkit|dashboard|marketplace|layer|database|wallet|network of tools)\b/iu;
/** Words that put a project in a place: where it is, the land it tends, the people there. */
const LOCAL = /\b(?:villages?|county|counties|district|province|municipality|state of|city of|neighbou?rhoods?|valley|island|islands|river|rivers|estuary|wetlands?|farms?|reserve|park|forest|forests|gardens?|land|lands|landscape|basin|coast|coastline|hubs?|campus|community[- ]led|community[- ]based|community[- ]driven|local communit(?:y|ies)|our communit(?:y|ies)|grassroots|ecovillage|living lab)\b/iu;
/** Research the project does. Being based at a university is a place, not research. */
const RESEARCH = /\b(?:research|researchers?|scientists?|scientific|study|studies|laborator(?:y|ies)|monitor(?:ing|s|ed)?|baseline|surveys?|data collection|citizen science|bioacoustic\w*|ecoacoustic\w*|acoustic|evaluation|evaluators?|measur\w+|analysis|inventory)\b/iu;
/** A statement that the project funds others. Seeking money ("looking for investors") is not one. */
const FUNDS = /\b(?:we (?:fund|give grants|award grants|make grants|regrant)|grantmak\w*|regranting|small grants (?:to|for)|grants? to (?:communit\w*|groups|grassroots|local)|funding pool)\b/iu;
/** A clause that seeks or receives money, or denies giving it, is not one that funds others. */
const ASKS_OR_DENIES = /\b(?:looking for|seeking|we seek|we need|need funding|we want|we are raising|raise funds|raising funds|apply for|applying for|attract|hope to|plan to|received|receive|won|were awarded|not|never|no longer|without)\b/iu;
const fundsOthers = (text: string) =>
  text.split(/[.!?;\n]+|\bbut\b/iu).some((clause) => FUNDS.test(clause) && !ASKS_OR_DENIES.test(clause));

/** The roles a project's own words show. */
export function projectRoles(text: string, themes: ReadonlyMap<string, ThemeReading>, places: number): Set<PartnerRole> {
  const roles = new Set<PartnerRole>();
  const builds = BUILDS.test(text);
  if (builds) roles.add("builder");
  if (places > 0 || LOCAL.test(text)) roles.add("place");
  if (RESEARCH.test(text)) roles.add("research");
  const core = (id: string) => themes.has(id) && !themes.get(id)!.example;
  if (core("arts")) roles.add("culture");
  if (core("education")) roles.add("learning");
  if (fundsOthers(text)) roles.add("funder");
  // A tool for many places is not itself one of them.
  if (builds && places === 0 && !/\b(?:villages?|farms?|reserve|hubs?|campus|ecovillage)\b/iu.test(text)) roles.delete("place");
  return roles;
}

/** Words that ask for a community or a place to work with. "At the hub" names the asker's own place, so hub is not one. */
const WANTS_PLACE = /\b(?:communities|community groups|local groups|groups doing|grassroots groups|pilots?|piloting|to pilot|test it|testers|users|local partners?|host sites?|sites for|on the ground|gardens|farms|villages|cooperatives|neighbou?rhoods|comunidades|grupos|cooperativas|aldeias|veredas|bairros|barrios|usuarios|usuários)\b/iu;
const WANTS_RESEARCH = /\b(?:evaluat\w*|research\w*|evidence|baseline|measur\w*|study|studies|scientists?|data analysis|monitor\w*|assessment|reviewers?|pesquisa\w*|investigaci\w*|avalia\w*|evalua\w*|medir|medi[cç][aã]o|monitoreo|monitoramento|cient[ií]fic\w*)\b/iu;
const WANTS_BUILDER = /\b(?:tools?|apps?|software|platform|record|records|recording|track|tracking|dashboard|database|digital|system|reports?|reporting|ferramentas?|herramientas?|aplicativos?|aplicaci[oó]n|aplicaciones|plataformas?|registrar|registro|rastrear|rastreo|rastreabilidade|trazabilidad|sistema|relat[oó]rios?|informes?)\b/iu;
const WANTS_CULTURE = /\b(?:artists?|story|stories|storytell\w*|film\w*|music\w*|murals?|culture|cultural|creative|artistas?|hist[oó]rias?|historias?|cine|m[uú]sica|cultura)\b/iu;
const WANTS_LEARNING = /\b(?:workshops?|training|trainers?|teach\w*|mentors?|mentoring|courses?|curriculum|skills|education|educators?|classes|oficinas|talleres|capacita\w*|forma[cç][aã]o|formaci[oó]n|cursos|educa[cç][aã]o|educaci[oó]n|mentor[ae]s)\b/iu;
const WANTS_FUNDER = /\b(?:funding|funds?|grants?|money|donors?|funders?|investors?|investment|budget|financiamento|financiaci[oó]n|fondos|dinheiro|dinero|doadores|donantes)\b/iu;

/** The roles a need asks for: who could answer it. */
export function neededRoles(entry: PartnerEntry): Set<PartnerRole> {
  const text = partnerQueryProjection(entry);
  const kinds = new Set(strings(entry.value.capitalForms));
  const roles = new Set<PartnerRole>();
  if (WANTS_PLACE.test(text) || kinds.has("living")) roles.add("place");
  if (WANTS_RESEARCH.test(text)) roles.add("research");
  if (WANTS_BUILDER.test(text)) roles.add("builder");
  if (WANTS_CULTURE.test(text) || kinds.has("cultural")) roles.add("culture");
  if (WANTS_LEARNING.test(text)) roles.add("learning");
  if (WANTS_FUNDER.test(text) || kinds.has("financial")) roles.add("funder");
  return roles;
}
/** The roles that could use an offer: places, and research groups for a tool or a method. */
export function offerUsers(entry: PartnerEntry): Set<PartnerRole> {
  const text = partnerQueryProjection(entry);
  const roles = new Set<PartnerRole>(["place"]);
  if (WANTS_BUILDER.test(text) || WANTS_RESEARCH.test(text)) roles.add("research");
  if (WANTS_LEARNING.test(text)) roles.add("learning");
  return roles;
}
/**
 * A need for money alone, which only a funder answers. Its kinds of support say so; a need that asks for
 * volunteers to raise funds is social capital and stays open to any project.
 */
const moneyOnly = (entry: PartnerEntry, wanted: ReadonlySet<PartnerRole>) => {
  const kinds = strings(entry.value.capitalForms);
  return kinds.length ? kinds.every((kind) => kind === "financial") : wanted.size === 1 && wanted.has("funder");
};

type ProjectReading = {
  uri: string;
  name: string;
  passages: ProjectEvidence[];
  themes: Map<string, ThemeReading>;
  roles: Set<PartnerRole>;
  countries: ReadonlySet<string>;
  regions: ReadonlySet<Region>;
};
function readProject(passages: ProjectEvidence[]): ProjectReading {
  const first = passages[0]!;
  // A public project's title usually says what it does ("...waste value chain..."), so it is read too.
  const text = [first.projectName, ...passages.map(({ passage }) => passage)].join(". ");
  const themes = readThemes(text);
  const places = namedPlaces(text);
  const regions = new Set<Region>([...places.regions, ...[...places.countries].flatMap(regionsOf)]);
  return {
    uri: first.projectUri, name: first.projectName, passages, themes,
    roles: projectRoles(text, themes, places.countries.size + places.regions.size),
    countries: places.countries, regions,
  };
}

type QueryReading = {
  entry: PartnerEntry;
  wanted: Set<PartnerRole>;
  /**
   * Whether the initiative's own examples say whom this entry is looking for. A tool builder asking for
   * communities to pilot with, or offering its tool, is looking for groups doing the work it lists.
   */
  examplesAreUsers: boolean;
  /** The fields the entry itself names, which weigh most. */
  own: Map<string, ThemeReading>;
  /** The fields its initiative names, examples included. */
  context: Map<string, ThemeReading>;
  countries: ReadonlySet<string>;
  regions: ReadonlySet<Region>;
};
function readQuery(entry: PartnerEntry): QueryReading {
  const summary = entry.summary ?? {};
  const name = str(summary.name);
  const description = str(summary.description);
  const places = namedPlaces([description, ...strings(summary.locations)].join(". "));
  const wanted = entry.kind === "need" ? neededRoles(entry) : offerUsers(entry);
  return {
    entry,
    wanted,
    examplesAreUsers: entry.kind === "offer" || wanted.has("place"),
    own: readThemes(partnerQueryProjection(entry), name),
    context: readThemes([description, ...strings(summary.themes)].join(". "), name),
    countries: places.countries,
    regions: new Set<Region>([...places.regions, ...[...places.countries].flatMap(regionsOf)]),
  };
}

/** A reason a ranked match rests on: the word matcher's shared or related words, or what links the two sides. */
export type PartnerReason = { type: "shared_terms" | "related_terms" | "complement"; terms: string[] };
/** A match as Partners shows it: the word matcher's match, with what links the two sides among its reasons. */
export type RankedPartnerMatch = Omit<PartnerMatch, "reasons"> & { reasons: PartnerReason[] };

/** Why a project complements an entry, and how strongly. Null when nothing but words could link them. */
export type Complement = {
  score: number; role: PartnerRole | null; fields: string[];
  /** The fields the need or offer itself names, not only its initiative. */
  own: string[];
  place: string | null;
};
const ROLE_ORDER: readonly PartnerRole[] = ["place", "builder", "research", "learning", "culture", "funder"];
const display = new Intl.DisplayNames(["en"], { type: "region" });

/**
 * How much a shared field says, from how few projects in the searched set name it: climate is named by
 * many, Web3 by few. Between three quarters and one and a quarter of a field's weight, as the rubric's
 * word weights rise with rarity.
 */
export type Rarity = (themeId: string) => number;
const everyFieldEqual: Rarity = () => 1;
/** Below this many projects, rarity says nothing: a single project page weighs every field alike. */
const RARITY_MIN = 20;
function rarityOf(readings: readonly ProjectReading[]): Rarity {
  if (readings.length < RARITY_MIN) return everyFieldEqual;
  const counts = new Map<string, number>();
  for (const { themes } of readings) for (const id of themes.keys()) counts.set(id, (counts.get(id) ?? 0) + 1);
  return (id) => (readings.length ? 0.75 + 0.5 * (1 - (counts.get(id) ?? 0) / readings.length) : 1);
}

export function complement(query: QueryReading, project: ProjectReading, rarity: Rarity = everyFieldEqual): Complement {
  const role = ROLE_ORDER.find((candidate) => query.wanted.has(candidate) && project.roles.has(candidate)) ?? null;
  const fields: { label: string; weight: number }[] = [];
  const owned: string[] = [];
  for (const [id, theirs] of project.themes) {
    if (theirs.theme.kind === "means") continue;
    const own = query.own.get(id), context = query.context.get(id);
    if (!own && !context) continue;
    // The entry's own field weighs most, and so do the initiative's examples where they say whom it is
    // looking for; the initiative's other fields a little less. A field the project names only as an
    // example weighs half, and the people served half again.
    const weight = (own || (context!.example && query.examplesAreUsers) ? 25 : 15)
      * (theirs.theme.kind === "people" ? 0.5 : 1) * (theirs.example ? 0.5 : 1) * rarity(id);
    fields.push({ label: theirs.theme.label, weight });
    if (own) owned.push(theirs.theme.label);
  }
  fields.sort((a, b) => b.weight - a.weight);
  const topical = fields.reduce((sum, { weight }) => sum + weight, 0);
  const country = [...project.countries].find((code) => query.countries.has(code));
  const region = country ? null : [...project.regions].find((name) => query.regions.has(name));
  const place = country ? (display.of(country) ?? country) : region ?? null;
  // Without the role asked for, shared fields say only that both work on the same things.
  // A community where the initiative already works is the better one to pilot with.
  const near = query.wanted.has("place") ? 30 : 20;
  const score = (role ? 30 + topical : topical / 2) + (country ? near : region ? 8 : 0);
  const shown = fields.slice(0, 4).map(({ label }) => label);
  // A suggestion stands only on what its reason can show.
  return { score: Math.round(score), role, fields: shown, own: owned.filter((label) => shown.includes(label)), place };
}

/** Whether a project is where an entry limited to here, or to its region, must be. Unknown places never qualify. */
function inScope(query: QueryReading, project: ProjectReading): boolean {
  const scope = str(query.entry.value.placeScope);
  if (scope === "here" && query.countries.size) return [...project.countries].some((code) => query.countries.has(code));
  if (scope === "region" && query.regions.size) return [...project.regions].some((name) => query.regions.has(name));
  return true;
}

/** A complement strong enough to stand without shared words: the role asked for, and a field in common. */
const STANDS_ALONE = 50;

type Candidate = { match: RankedPartnerMatch; score: number; freshness: number };
const evidenceOrder: PartnerEvidenceKind[] = [
  "confirmed_offer", "confirmed_need", "published_offer", "published_request", "inferred_capability", "potential_use",
];
const compare = (a: Candidate, b: Candidate) =>
  evidenceOrder.indexOf(a.match.evidenceKind) - evidenceOrder.indexOf(b.match.evidenceKind)
  || b.score - a.score
  || Number(b.match.reciprocal) - Number(a.match.reciprocal)
  || a.match.unknowns.length - b.match.unknowns.length
  || b.freshness - a.freshness
  || a.match.candidateId.localeCompare(b.match.candidateId, "en");

const complementReason = (found: Complement) => ({
  type: "complement" as const,
  terms: [...(found.role ? [ROLE_LABELS[found.role]] : []), ...found.fields, ...(found.place ? [found.place] : [])].slice(0, 6),
});
/**
 * What links them, as far as the passage shown and the project's title support it (spec 7.2 item 4): a
 * field or place read only from another passage is left out of the reason. The role is read from the
 * project's own words as a whole and stays.
 */
function supported(found: Complement, passage: ProjectEvidence, read: (text: string) => Map<string, ThemeReading>): Complement {
  const text = `${passage.projectName}. ${passage.passage}`;
  const labels = new Set([...read(text).values()].map(({ theme }) => theme.label));
  const places = namedPlaces(text);
  const named = new Set([...[...places.countries].map((code) => display.of(code) ?? code), ...places.regions]);
  return {
    ...found, fields: found.fields.filter((label) => labels.has(label)), own: found.own.filter((label) => labels.has(label)),
    place: found.place && named.has(found.place) ? found.place : null,
  };
}
const PUBLIC_UNKNOWNS: PartnerMatch["unknowns"] = ["terms", "timing", "capacity", "audience", "availability"];

/**
 * Ranks partners for each open need and offer: the word matcher's results, and public projects that
 * complement the entry without repeating its words. Within each kind of evidence, the strongest
 * complement comes first. Same input contract as rankPartnerMatches; each query's `summary` carries its
 * initiative's name, description, places and themes, which never leave the device or server they were read on.
 */
export function rankPartners(input: Parameters<typeof rankPartnerMatches>[0]): RankedPartnerMatch[] {
  const limit = Number.isInteger(input.limitPerEntryAndKind) ? Math.min(10, Math.max(1, input.limitPerEntryAndKind ?? 5)) : 5;
  const words = rankPartnerMatches({ ...input, limitPerEntryAndKind: 10 });
  const projectsOf = new Map<readonly ProjectEvidence[], { readings: ProjectReading[]; rarity: Rarity }>();
  const projects = (passages: readonly ProjectEvidence[]) => {
    let read = projectsOf.get(passages);
    if (!read) {
      const byUri = new Map<string, ProjectEvidence[]>();
      for (const passage of passages) byUri.set(passage.projectUri, [...(byUri.get(passage.projectUri) ?? []), passage]);
      const readings = [...byUri.values()].map(readProject);
      projectsOf.set(passages, (read = { readings, rarity: rarityOf(readings) }));
    }
    return read;
  };
  const readings = new Map<string, Map<string, ThemeReading>>();
  const read = (text: string) => {
    let found = readings.get(text);
    if (!found) readings.set(text, (found = readThemes(text)));
    return found;
  };
  return input.queries.flatMap((entry) => {
    if (entry.value.status !== "open") return [];
    const key = `${entry.kind}:${entry.entryId}`;
    const query = readQuery(entry);
    const ownWords = words.filter((match) => match.query.kind === entry.kind && match.query.entryId === entry.entryId);
    const passages = input.publicEvidenceByEntry?.[key] ?? input.publicEvidence ?? [];
    const { readings: projectReadings, rarity } = projects(passages);
    const byUri = new Map(projectReadings.map((reading) => [reading.uri, reading]));
    const money = entry.kind === "need" && moneyOnly(entry, query.wanted);
    const candidates: Candidate[] = [];
    for (const match of ownWords) {
      // An initiative's own public project is never its own partner.
      if (match.counterpart.id === entry.initiativeId) continue;
      const project = match.evidence.type === "public" ? byUri.get(match.evidence.projectUri) : undefined;
      if (project && money && !project.roles.has("funder")) continue;
      if (project && !inScope(query, project)) continue;
      const whole = project ? complement(query, project, rarity) : null;
      const found = whole && match.evidence.type === "public" ? supported(whole, match.evidence, read) : null;
      const overlap = match.reasons.reduce((sum, reason) => sum + reason.terms.length, 0);
      candidates.push({
        match: { ...match, reasons: found && (found.role || found.fields.length || found.place) ? [...match.reasons, complementReason(found)] : match.reasons },
        score: (found?.score ?? 0) + 8 * Math.min(4, overlap),
        freshness: match.evidence.type === "shared" ? Date.parse(match.evidence.confirmedAt) : Date.parse(match.evidence.sourceIndexedAt ?? match.evidence.sourceCreatedAt) || 0,
      });
    }
    const listed = new Set(ownWords.map((match) => match.candidateId));
    {
      for (const project of projectReadings) {
        // A need for money alone looks only at projects that say they fund others.
        if (money && !project.roles.has("funder")) continue;
        const candidateId = `public:${project.uri}`;
        // The device snapshot already leaves out the initiative's own project; this guards a caller that does not.
        if (listed.has(candidateId) || project.uri === entry.initiativeId || !inScope(query, project)) continue;
        const whole = complement(query, project, rarity);
        if (!whole.role || whole.score < STANDS_ALONE) continue;
        // Only a passage describing the project's work can show a capability or a use for an offer.
        const work = project.passages.filter(({ kind }) => kind === "work");
        const best = work.map((passage) => ({ passage, found: supported(whole, passage, read) }))
          .sort((a, b) => weight(b.found) - weight(a.found))[0];
        if (!best) continue;
        const { passage, found } = best;
        // The role asked for, and in the passage shown: the field the entry itself names, two fields of its
        // initiative, or one and the same country. A theme in common alone is not a match (spec 7.2). An offer
        // kept to here may stand on the same country alone, since where it is used is the point.
        const country = !!found.place && [...project.countries].some((code) => query.countries.has(code));
        if (!(found.own.length >= 1 || found.fields.length >= 2 || (found.fields.length >= 1 && country)
          || (entry.kind === "offer" && entry.value.placeScope === "here" && country)
          // A funder that funds the same field, or in the same country, answers a need for money.
          || (money && (found.fields.length >= 1 || country)))) continue;
        const unknowns: PartnerMatch["unknowns"] = [...PUBLIC_UNKNOWNS];
        if (entry.value.placeScope !== "anywhere") unknowns.push("place");
        candidates.push({
          match: {
            query: { kind: entry.kind, entryId: entry.entryId, revision: entry.revision },
            candidateId,
            counterpart: { id: project.uri, name: project.name },
            evidenceKind: entry.kind === "need" ? "inferred_capability" : "potential_use",
            evidence: { ...passage, type: "public" },
            reasons: [complementReason(found)],
            unknowns,
            reciprocal: false,
            action: "open_source",
          },
          score: found.score,
          freshness: Date.parse(passage.sourceIndexedAt ?? passage.sourceCreatedAt) || 0,
        });
      }
    }
    const seen = new Set<string>();
    const counts = new Map<PartnerEvidenceKind, number>();
    return candidates.sort(compare).flatMap(({ match }) => {
      const count = counts.get(match.evidenceKind) ?? 0;
      if (count >= limit || seen.has(match.candidateId)) return [];
      seen.add(match.candidateId);
      counts.set(match.evidenceKind, count + 1);
      return [match];
    });
  });
}

/** How much of what links them a passage supports. */
const weight = (found: Complement) => found.fields.length * 2 + (found.place ? 1 : 0);

export type { PartnerEntry, PartnerMatch, ProjectEvidence, SharedPartnerEntry };
