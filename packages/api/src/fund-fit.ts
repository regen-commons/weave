/**
 * Funding's fit between an initiative and a fund program (DL-143). Funding and the MCP tool both use
 * it, over the shared rubric's results, so the two order funds the same way. The rubric itself, and
 * the live site that runs it, are unchanged.
 *
 * The rubric grades fit by how many distinct words a program and an initiative share. Here it is
 * graded by what is shared:
 * - the field of work, such as energy access, farming and food or open source and public goods,
 *   weighs most, in full where the description's first sentence names it and three quarters
 *   where a later one does; named only as an example ("such as planting trees") or as a subject
 *   taught ("workshops on climate") it weighs a quarter;
 * - the people served weigh less, and the tools used (technology, internet access) least, since a
 *   program funds a field and an initiative is known by what it does;
 * - a word the rubric shares that names no theme still counts a little;
 * - a program focused on the initiative's field fits better than one that funds it among many
 *   others: up to 40% of the fit depends on how many of the program's fields the initiative shares;
 * - where the program names the country the initiative works in, or limits itself to its region,
 *   the fit rises; where it names only other countries, it falls by half, as a caution to check and
 *   never as a decision. Place adds nothing without a shared topic.
 *
 * The score keeps the rubric's scale and Funding's four levels (DL-129): Strong 60 and up, Good 40
 * to 59, Possible 20 to 39, Low under 20. One field in common is a Good fit, a field and the
 * program's own country or two fields a Strong one. Fit is never eligibility.
 */
import { readThemes, themeById, type ThemeReading } from "./themes.ts";
import { namedPlaces, namesLowOrMiddleIncome, lowOrMiddleIncome, regionsOf, REGIONS, type Region } from "./places.ts";

export const FUND_FIT_VERSION = "weave-fund-fit-v1";

/** What Funding and the MCP tool rank: the card's words, its kept needs' and offers' words, and its places. */
export type FitProject = {
  readonly description: string;
  readonly tags: readonly string[];
  readonly asks?: readonly string[];
  /** Where you work, as the card says it. Read for fit only, never as an eligibility fact. */
  readonly places?: readonly string[];
  readonly workCountries?: readonly string[];
  readonly benefitCountries?: readonly string[];
};
type Program = {
  readonly focus?: readonly string[];
  readonly beneficiaries?: readonly string[];
  readonly geography?: { readonly workCountries?: readonly string[]; readonly scope?: string };
} | null;
type Fund = {
  readonly regions?: readonly string[];
  readonly sectors?: readonly string[];
  readonly approaches?: readonly string[];
  readonly enrichment?: { readonly focus?: readonly string[] };
};
export type ThematicFit = {
  version: string;
  score: number | null;
  band: "unknown" | "strong" | "relevant" | "partial" | "limited";
  label: string;
  semanticGrade?: number | null;
  keywordGrade?: number;
  evidenceTerms: string[];
  basis?: string;
};
/** The part of a rubric result this reads and replaces. */
export type RubricResult = {
  readonly documentId: string;
  readonly fund: Fund;
  readonly program: Program;
  readonly thematicFit: ThematicFit;
};

const WEIGHT = { field: 40, people: 15, means: 8 } as const;
/** Tools add at most this much: a program and an initiative that share only technology share little. */
const MEANS_MAX = 16;
/** A shared word no theme names; at most two count. */
const WORD = 10;
const WORDS_MAX = 2;
/** The program's own country weighs half a field: with one, a Nigerian energy challenge is a Strong fit for a Nigerian solar hub. */
const COUNTRY = 20;
const REGION = 10;
const LOW_OR_MIDDLE_INCOME = 10;
/** The share of fit that depends on how much of the program's own fields the initiative shares. */
const FOCUS = 0.4;
/** A theme named only as an example, or as a subject taught, illustrates the work: it weighs a quarter. */
const EXAMPLE_SHARE = 0.25;
/** A theme named after the first sentence, which says what the work is, weighs three quarters. */
const LATER_SHARE = 0.75;
/** A program that names only other countries, or only other regions, keeps this share of its fit. */
const ELSEWHERE = { country: 0.5, region: 0.75 } as const;
/** Place counts only once something topical is shared. */
const PLACE_FLOOR = 20;
/** Words the rubric shares that say what a program uses or how, not what it funds. */
const GENERIC = new Set(
  ("open source digital internet online technology technologies tech data app apps platform platforms tool tools software design " +
    "hub hubs power new local build building place space access free based first small every use uses used quality value " +
    "level levels made making management work works way ways area areas part parts").split(" "),
);
const regionNames = new Set<string>(REGIONS);

const programText = (fund: Fund, program: Program) => {
  const topics = [...(program?.focus ?? []), ...(program?.beneficiaries ?? [])];
  return (topics.length ? topics : fund.enrichment?.focus?.length ? fund.enrichment.focus : [...(fund.sectors ?? []), ...(fund.approaches ?? [])]).join(". ");
};
const programReadings = new Map<string, Map<string, ThemeReading>>();
function programThemes(id: string, text: string) {
  const key = `${id}\n${text}`;
  let found = programReadings.get(key);
  if (!found) {
    if (programReadings.size > 5000) programReadings.clear();
    programReadings.set(key, (found = readThemes(text)));
  }
  return found;
}
/** Every word any theme phrase uses, so a shared word a theme already reads ("arts", "art") is not counted twice. */
const themedWord = (word: string, readings: Iterable<ThemeReading>) =>
  [...readings].some(({ words }) => words.some((phrase) => phrase.split(" ").some((part) => part.startsWith(word) || word.startsWith(part))));

export type InitiativeReading = {
  readonly themes: Map<string, ThemeReading>;
  readonly countries: ReadonlySet<string>;
  readonly regions: ReadonlySet<Region>;
};
/** The themes and places an initiative names, read once for a whole catalog. */
export function readInitiative(project: FitProject): InitiativeReading {
  // The description is read as written, its name included: the MCP tool is sent no name, and both paths
  // must order funds the same way.
  const own = readThemes([project.description, ...project.tags].join(". "));
  // A kept need or offer says exactly what the person asks for or gives: its themes are the subject. Who it
  // is for ("seedlings to local schools", "training for our volunteers") is its audience, read as an example.
  for (const ask of project.asks ?? []) {
    const audience = ask.search(/\s(?:to|for|para|pour)\s/iu);
    const [what, whom] = audience > 0 ? [ask.slice(0, audience), ask.slice(audience)] : [ask, ""];
    for (const [id, reading] of readThemes(what))
      if (!own.has(id) || !own.get(id)!.lead) own.set(id, { ...reading, example: reading.example, lead: !reading.example });
    for (const [id, reading] of readThemes(whom)) if (!own.has(id)) own.set(id, { ...reading, example: true, lead: false });
  }
  const places = namedPlaces([project.description, ...(project.places ?? [])].join(". "));
  const countries = new Set([...(project.workCountries ?? []), ...(project.benefitCountries ?? []), ...places.countries]);
  const regions = new Set<Region>([...places.regions, ...[...countries].flatMap(regionsOf)]);
  return { themes: own, countries, regions };
}

const band = (score: number): ThematicFit["band"] => (score >= 80 ? "strong" : score >= 60 ? "relevant" : score >= 40 ? "partial" : "limited");
const LABELS: Record<ThematicFit["band"], string> = {
  unknown: "Fit not assessed", strong: "Strong thematic fit", relevant: "Relevant themes", partial: "Partial thematic overlap", limited: "Limited thematic overlap",
};
const display = new Intl.DisplayNames(["en"], { type: "region" });

/** The fit of one program for an initiative, in the rubric's own shape. A program the rubric could not assess stays unassessed. */
export function fundFit(initiative: InitiativeReading, result: RubricResult): ThematicFit {
  const { thematicFit } = result;
  if (thematicFit.score === null) return thematicFit;
  const text = programText(result.fund, result.program);
  const program = programThemes(result.documentId, text);

  const shared: { label: string; weight: number; kind: string }[] = [];
  let means = 0;
  for (const [id, theirs] of program) {
    const ours = initiative.themes.get(id);
    // A program's own example, such as the training in "investor training", is not what it funds.
    if (!ours || theirs.example) continue;
    const kind = theirs.theme.kind;
    const weight = kind === "means" ? WEIGHT.means : WEIGHT[kind] * (ours.example ? EXAMPLE_SHARE : ours.lead ? 1 : LATER_SHARE);
    if (kind === "means") means += weight;
    shared.push({ label: themeById(id)!.label, weight, kind });
  }
  // A place is weighed as a place, below, and never again as a shared word.
  const words = thematicFit.evidenceTerms
    .filter((word) => !GENERIC.has(word) && !themedWord(word, program.values()) && !themedWord(word, initiative.themes.values())
      && !namedPlaces(word).countries.size && !namedPlaces(word).regions.size)
    .slice(0, WORDS_MAX);
  // How much of the program's own purpose the initiative shares: a program about energy access fits a
  // solar hub better than one that funds energy among eight other fields.
  const fields = [...program.values()].filter(({ theme, example }) => theme.kind === "field" && !example);
  const coverage = fields.length
    ? fields.reduce((sum, { theme }) => {
      const ours = initiative.themes.get(theme.id);
      return sum + (ours ? (ours.example ? EXAMPLE_SHARE : 1) : 0);
    }, 0) / fields.length
    : 1;
  const topical = Math.min(100,
    (shared.filter(({ kind }) => kind !== "means").reduce((sum, { weight }) => sum + weight, 0) + Math.min(MEANS_MAX, means) + words.length * WORD) *
      (1 - FOCUS + FOCUS * coverage));

  // Place: the program's own countries first, then a region it limits itself to.
  let bonus = 0, factor = 1, place = "";
  const theirCountries = result.program?.geography?.workCountries ?? [];
  const theirRegions = (result.fund.regions ?? []).filter((region): region is Region => regionNames.has(region));
  const scope = `${result.program?.geography?.scope ?? ""} ${text}`;
  if (initiative.countries.size || initiative.regions.size) {
    const here = theirCountries.filter((code) => initiative.countries.has(code));
    if (theirCountries.length && here.length) {
      bonus = COUNTRY;
      place = display.of(here[0]!) ?? here[0]!;
    } else if (theirCountries.length && initiative.countries.size) {
      factor = ELSEWHERE.country;
    } else if (theirRegions.length && theirRegions.length <= 3) {
      const region = theirRegions.find((name) => initiative.regions.has(name));
      if (region) {
        bonus = REGION;
        place = region;
      } else factor = ELSEWHERE.region;
    } else if (namesLowOrMiddleIncome(scope) && [...initiative.countries].some(lowOrMiddleIncome)) {
      bonus = LOW_OR_MIDDLE_INCOME;
      place = "low- and middle-income countries";
    }
  }
  const score = Math.round(Math.min(100, (topical + (topical >= PLACE_FLOOR ? bonus : 0)) * factor));
  const ordered = [...shared].sort((a, b) => b.weight - a.weight).map(({ label }) => label);
  const evidenceTerms = [...ordered, ...(place && topical >= PLACE_FLOOR && bonus ? [place] : []), ...words];
  return {
    ...thematicFit,
    version: FUND_FIT_VERSION,
    score,
    band: band(score),
    label: LABELS[band(score)],
    evidenceTerms,
    basis: "Fit weighs the field of work a program funds and the initiative does most, the people it serves less and the tools it uses least, and rises where the program names the place the initiative works. A place named only elsewhere lowers it as a caution. Eligibility, access and award size do not change fit.",
  };
}

/** The rubric's results with Funding's fit in place of the word count, for one initiative. */
export function withFundFit<T extends RubricResult>(project: FitProject, results: readonly T[]): T[] {
  const initiative = readInitiative(project);
  return results.map((result) => ({ ...result, thematicFit: fundFit(initiative, result) }));
}
