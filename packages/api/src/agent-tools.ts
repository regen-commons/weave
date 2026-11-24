// Runs the tools in agent-tools-contract.ts against the fund catalog and the public project list. It
// reads public data only, keeps nothing a caller sent and never reads a cookie or a session. One tool takes
// a person's own words, an initiative's description: it is used inside that one call and held nowhere.
import type { AgentToolCall, FindFundsArguments, GetFundArguments, GetProjectArguments, SearchFundsArguments, SearchProjectsArguments } from "./agent-tools-contract.ts";
import type { FindPublicProject } from "./public-projects-http.ts";
import { parsePublicProjectPage, type PublicProjectCard, type PublicProjectPage } from "./public-projects-contract.ts";
import { fundingTopics } from "./topics.ts";
import { withFundFit, type RubricResult } from "./fund-fit.ts";

/** A fund as the catalog file holds it. Only the fields the tools read are named. */
export type CatalogFund = {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  sectors: string[];
  regions: string[];
  approaches: string[];
  website?: string;
  evidenceUrl?: string;
  access: string;
  accessDetail?: string;
  amount?: string;
  timing?: string;
  deadlineDate?: string | null;
  deadlineInstant?: string | null;
  verifiedOn?: string | null;
  qualityFlags?: string[];
  sourceWarnings?: { url: string; reason: string }[];
  enrichment?: {
    summary?: string;
    reviewStatus?: string;
    researchedOn?: string;
    researchNotes?: string;
    sources?: { url: string; title?: string; checkedOn?: string }[];
    programs?: CatalogProgram[];
  };
};
type CatalogProgram = { id: string; name: string; [field: string]: unknown };
export type FundCatalog = { compiledAt: string; researchCheckedOn?: string; funds: CatalogFund[] };

/** A failure the assistant can be told about, with a stable code. */
export class AgentToolError extends Error {
  readonly code: "catalog_unavailable" | "projects_unavailable" | "not_found" | "invalid_cursor" | "invalid_argument";
  constructor(code: AgentToolError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

export type AgentToolSources = {
  /** The fund catalog. Rejects when the file cannot be read. */
  catalog(): Promise<FundCatalog>;
  /**
   * The catalog's screening data, as its files hold them: the eligibility rules and the program
   * conditions. Rejects when they cannot be read. Without it, find_funds_for_initiative is unavailable.
   */
  screening?(): Promise<{ rules: unknown; conditions: unknown }>;
  /** Answers a request as GET /api/public-projects does. */
  publicProjects(request: Request): Promise<Response>;
  /** One shown project by its address, from the same copy of the list. */
  findPublicProject: FindPublicProject;
  /** Weave's public address, for the links results carry. */
  origin: string;
  now?: () => Date;
};

const POSSIBILITY = "A possibility to check against the funder's own page. Weave does not decide eligibility.";
const NOT_CONFIRMED = "Listed from public Certified records. Weave has not confirmed availability or interest, and nothing here contacts anyone.";

/**
 * The catalog's own rules for access, filtering, ordering and safe links, which the live site and the app
 * also run. Loaded on first use, so a deployment that cannot find the file loses the fund tools only.
 */
type Domain = {
  effectiveAccess(fund: unknown, now?: Date): string;
  utcDate(now?: Date): string;
  safeFundUrl(fund: unknown, url: string): string;
  researchStatus(fund: unknown): string;
  filterFunds<T>(funds: T[], state: { q?: string; region?: string; theme?: string; access?: string }, savedIds?: string[], now?: Date): T[];
  sortFunds<T>(funds: T[], sort?: string, now?: Date): T[];
  ACCESS: Record<string, { label: string } | undefined>;
  RESEARCH: Record<string, string | undefined>;
};
let domain: Promise<Domain> | undefined;
function catalogDomain(): Promise<Domain> {
  const current = domain ??= (import("../../../dist/domain.mjs") as Promise<unknown>).then((module) => {
    const loaded = module as Partial<Domain>;
    // A catalog build without one of these would fail every call later, less clearly.
    for (const name of ["effectiveAccess", "utcDate", "safeFundUrl", "researchStatus", "filterFunds", "sortFunds"] as const)
      if (typeof loaded[name] !== "function") throw Error("invalid_catalog_code");
    if (!loaded.ACCESS || !loaded.RESEARCH) throw Error("invalid_catalog_code");
    return loaded as Domain;
  });
  current.catch(() => { if (domain === current) domain = undefined; });
  return current;
}

const isText = (value: unknown): value is string => typeof value === "string";
const isTextList = (value: unknown): value is string[] => Array.isArray(value) && value.every(isText);
const parses = (value: unknown) => { try { return isText(value) && !!new URL(value); } catch { return false; } };
/** Whether a fund holds the fields the tools and the catalog's search read, in the shapes they read them. */
function usableFund(fund: unknown): fund is CatalogFund {
  if (!fund || typeof fund !== "object") return false;
  const f = fund as Record<string, unknown>;
  return isText(f.id) && /^[A-Za-z0-9_-]{1,80}$/u.test(f.id) && isText(f.name) && isText(f.access)
    && isTextList(f.sectors) && isTextList(f.regions) && isTextList(f.approaches)
    && (f.sourceWarnings === undefined || (Array.isArray(f.sourceWarnings) && f.sourceWarnings.every((w) => !!w && typeof w === "object" && parses((w as { url?: unknown }).url) && isText((w as { reason?: unknown }).reason))));
}
/** Each catalog is checked once. A fund the tools could not read safely is left out, so one bad record cannot fail every search. */
const checked = new WeakMap<FundCatalog, FundCatalog>();

/** http and https links only, and none on a host the catalog warns about. An unsafe link is left out. */
function link(d: Domain, fund: CatalogFund, value: unknown): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  try { return d.safeFundUrl(fund, value) || undefined; } catch { return undefined; }
}
/** A program with every link checked the same way, wherever the catalog nests it. */
function withSafeLinks(d: Domain, fund: CatalogFund, value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => withSafeLinks(d, fund, item));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => {
    if (key !== "url") return [[key, withSafeLinks(d, fund, item)]];
    const safe = link(d, fund, item);
    return safe ? [[key, safe]] : [];
  }));
}

function fundSummary(d: Domain, fund: CatalogFund, origin: string, now: Date) {
  const access = d.effectiveAccess(fund, now);
  return {
    id: fund.id,
    name: fund.displayName || fund.name,
    summary: fund.enrichment?.summary || fund.description || "",
    sectors: fund.sectors,
    regions: fund.regions,
    access: { state: access, label: d.ACCESS[access]?.label ?? access, detail: fund.accessDetail ?? "" },
    amount: fund.amount ?? "",
    timing: fund.timing ?? "",
    deadline: fund.deadlineDate ?? null,
    research: { status: d.RESEARCH[d.researchStatus(fund)] ?? d.researchStatus(fund), checkedOn: fund.verifiedOn ?? fund.enrichment?.researchedOn ?? null },
    programs: (fund.enrichment?.programs ?? []).map(({ id, name }) => ({ id: `${fund.id}::${id}`, name })),
    sourceUrl: link(d, fund, fund.evidenceUrl) ?? link(d, fund, fund.website) ?? null,
    weaveUrl: `${origin}/funding/${fund.id}`,
  };
}

async function searchFunds(sources: AgentToolSources, a: SearchFundsArguments, now: Date) {
  const { catalog, d } = await loadCatalog(sources);
  const today = d.utcDate(now);
  const matched = d.sortFunds(
    d.filterFunds(catalog.funds, { q: a.query, region: a.region ?? "", theme: a.sector ?? "", access: a.access ?? "" }, [], now)
      .filter((fund) => !a.deadlineBefore || (!!fund.deadlineDate && fund.deadlineDate <= a.deadlineBefore
        && fund.deadlineDate >= today && d.effectiveAccess(fund, now) !== "closed")),
    a.sort, now,
  );
  if (a.offset > matched.length) throw new AgentToolError("invalid_cursor", "That cursor is past the end of this search. Start the search again.");
  const page = matched.slice(a.offset, a.offset + a.limit);
  const end = a.offset + page.length;
  return {
    note: POSSIBILITY,
    catalog: { compiledAt: catalog.compiledAt, researchCheckedOn: catalog.researchCheckedOn ?? null, funds: catalog.funds.length },
    total: matched.length,
    funds: page.map((fund) => fundSummary(d, fund, sources.origin, now)),
    next: end < matched.length ? String(end) : null,
  };
}

async function getFund(sources: AgentToolSources, a: GetFundArguments, now: Date) {
  const { catalog, d } = await loadCatalog(sources);
  const fund = catalog.funds.find(({ id }) => id === a.fundId);
  if (!fund) throw new AgentToolError("not_found", "The catalog has no fund with that identifier.");
  const all = fund.enrichment?.programs ?? [];
  const programs = a.programId === null ? all : all.filter(({ id }) => id === a.programId);
  if (a.programId !== null && !programs.length) throw new AgentToolError("not_found", "That fund has no program with that identifier.");
  return {
    note: POSSIBILITY,
    fund: {
      ...fundSummary(d, fund, sources.origin, now),
      programs: programs.map((program) => ({ ...(withSafeLinks(d, fund, program) as CatalogProgram), id: `${fund.id}::${program.id}` })),
      sources: (fund.enrichment?.sources ?? []).flatMap((source) => {
        const url = link(d, fund, source.url);
        return url ? [{ url, title: source.title ?? "", checkedOn: source.checkedOn ?? null }] : [];
      }),
      researchNotes: fund.enrichment?.researchNotes ?? "",
      qualityFlags: fund.qualityFlags ?? [],
      // The warned links themselves are left out: the reason says why a source is not offered.
      sourceWarnings: (fund.sourceWarnings ?? []).map(({ reason }) => reason),
    },
  };
}

async function loadCatalog(sources: AgentToolSources): Promise<{ catalog: FundCatalog; d: Domain }> {
  try {
    const [loaded, d] = await Promise.all([sources.catalog(), catalogDomain()]);
    if (!loaded || typeof loaded !== "object" || !Array.isArray(loaded.funds) || !isText(loaded.compiledAt)) throw Error("invalid_catalog");
    let catalog = checked.get(loaded);
    if (!catalog) checked.set(loaded, catalog = { ...loaded, funds: loaded.funds.filter(usableFund) });
    return { catalog, d };
  } catch {
    throw new AgentToolError("catalog_unavailable", "The fund catalog could not be read. Try again later.");
  }
}

function projectCard(card: PublicProjectCard, origin: string) {
  return { ...card, weaveUrl: `${origin}/initiatives?${new URLSearchParams({ q: card.name.slice(0, 100) })}` };
}

/** One page of the public list, read the way the app reads it, so a tool and the app cannot disagree. */
async function projectPage(sources: AgentToolSources, params: Record<string, string>): Promise<PublicProjectPage> {
  const url = new URL("/api/public-projects", sources.origin);
  for (const [key, value] of Object.entries(params)) if (value) url.searchParams.set(key, value);
  let response: Response;
  try { response = await sources.publicProjects(new Request(url, { method: "GET" })); }
  catch { throw new AgentToolError("projects_unavailable", "The public project list could not be read. Try again later."); }
  if (response.status === 400) throw new AgentToolError("invalid_cursor", "The project list refused that search or cursor. Start the search again.");
  if (!response.ok) throw new AgentToolError("projects_unavailable", "The public project list could not be read. Try again later.");
  let page: PublicProjectPage;
  try { page = parsePublicProjectPage(await response.json()); }
  catch { throw new AgentToolError("projects_unavailable", "The public project list could not be read. Try again later."); }
  if (page.index.status === "off") throw new AgentToolError("projects_unavailable", "The public project list is not switched on here.");
  return page;
}

async function searchProjects(sources: AgentToolSources, a: SearchProjectsArguments) {
  const page = await projectPage(sources, {
    q: a.query, organizationType: a.organizationType ?? "", workScope: a.workScope ?? "",
    sort: a.sort === "newest" ? "" : a.sort, limit: String(a.limit), cursor: a.cursor ?? "",
  });
  return {
    note: NOT_CONFIRMED,
    index: page.index,
    projects: page.projects.map((card) => projectCard(card, sources.origin)),
    next: page.next,
  };
}

async function getProject(sources: AgentToolSources, a: GetProjectArguments) {
  let found;
  try { found = await sources.findPublicProject(a.uri); }
  catch { throw new AgentToolError("projects_unavailable", "The public project list could not be read. Try again later."); }
  if (found === "off") throw new AgentToolError("projects_unavailable", "The public project list is not switched on here.");
  if (!found) throw new AgentToolError("not_found", "Weave lists no public project at that address. It may have been withdrawn.");
  return { note: NOT_CONFIRMED, index: found.index, project: projectCard(found.project, sources.origin) };
}

/**
 * The catalog's ranking rubric and its list of countries, which the live site and the app also run.
 * Loaded on first use, like the rest of the catalog's code.
 */
type Rubric = {
  createLexicalIndex(funds: unknown[]): unknown;
  rankFunds(funds: unknown[], project: unknown, index: unknown, rules: unknown[], semantic: null, now: Date, conditions: unknown[] | null): unknown;
  validConditions(data: unknown, funds: unknown[]): boolean;
  COUNTRIES: string[];
};
let rubric: Promise<Rubric> | undefined;
function catalogRubric(): Promise<Rubric> {
  const current = rubric ??= Promise.all([
    import("../../../dist/matching.mjs") as Promise<unknown>, import("../../../dist/storage.mjs") as Promise<unknown>,
  ]).then(([matching, storage]) => {
    const loaded = { ...(matching as Partial<Rubric>), COUNTRIES: (storage as Partial<Rubric>).COUNTRIES };
    for (const name of ["createLexicalIndex", "rankFunds", "validConditions"] as const)
      if (typeof loaded[name] !== "function") throw Error("invalid_catalog_code");
    if (!isTextList(loaded.COUNTRIES)) throw Error("invalid_catalog_code");
    return loaded as Rubric;
  });
  current.catch(() => { if (rubric === current) rubric = undefined; });
  return current;
}
/** One entry per program, as the app ranks them, and the word index over the whole catalog. Built once per catalog. */
const ranked = new WeakMap<FundCatalog, { entries: unknown[]; index: unknown }>();
/** Whether a conditions file belongs to a catalog, checked once for each pair. */
const screened = new WeakMap<FundCatalog, WeakMap<object, boolean>>();

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
/** The most open checks one result lists. The count says when there are more. */
const TO_CHECK_MAX = 6;

/** One ranked program as an assistant reads it. Null for a result the rubric did not shape as expected. */
function fitResult(d: Domain, value: unknown, origin: string) {
  if (!isRecord(value) || !isRecord(value.fund) || !isText(value.fund.id) || !isText(value.documentId)) return null;
  const fund = value.fund as unknown as CatalogFund;
  const program = isRecord(value.program) ? value.program : null;
  const thematic = isRecord(value.thematicFit) ? value.thematicFit : {};
  const readiness = isRecord(value.readiness) ? value.readiness : {};
  const eligibility = isRecord(value.eligibility) ? value.eligibility : {};
  const checks = (Array.isArray(eligibility.programs) ? eligibility.programs : [])
    .flatMap((entry) => isRecord(entry) && Array.isArray(entry.checks) ? entry.checks : []).filter(isRecord)
    // Every check is listed, including one the details sent seem to satisfy: the funder decides, not Weave.
    .filter((check) => isText(check.outcome))
    .map((check) => ({
      outcome: check.outcome === "conflict" ? "possible_conflict" : check.outcome as string,
      requirement: isText(check.requirement) ? check.requirement : isText(check.reason) ? check.reason : "",
      ...(link(d, fund, check.sourceUrl) ? { sourceUrl: link(d, fund, check.sourceUrl) } : {}),
      ...(isText(check.checkedOn) ? { checkedOn: check.checkedOn } : {}),
    })).filter(({ requirement }) => requirement);
  const access = isText(value.access) ? value.access : fund.access;
  const application = program && isRecord(program.application) ? program.application : {};
  const geographic = isRecord(value.geographic) && isTextList(value.geographic.reasons) ? value.geographic.reasons : [];
  return {
    score: typeof thematic.score === "number" && Number.isFinite(thematic.score) ? thematic.score : null,
    result: {
      id: value.documentId,
      fund: fund.displayName || fund.name,
      program: program && isText(program.name) ? program.name : null,
      fit: {
        score: typeof thematic.score === "number" && Number.isFinite(thematic.score) ? thematic.score : null,
        label: isText(thematic.label) ? thematic.label : "Fit not assessed",
        sharedTopics: isTextList(thematic.evidenceTerms) ? thematic.evidenceTerms.slice(0, 12) : [],
      },
      // The rubric calls this a known conflict. Here it is a caution to check, since only the funder decides.
      nextStep: readiness.status === "conflict"
        ? { status: "possible_conflict", label: "A published requirement may conflict with the details sent. Check with the funder." }
        : { status: isText(readiness.status) ? readiness.status : "unverified", label: isText(readiness.label) ? readiness.label : "Application route needs checking" },
      access: { state: access, label: d.ACCESS[access]?.label ?? access },
      deadline: isText(application.closesOn) ? application.closesOn : fund.deadlineDate ?? null,
      geography: geographic.slice(0, 3),
      toCheck: checks.slice(0, TO_CHECK_MAX),
      toCheckTotal: checks.length,
      sourceUrl: link(d, fund, application.url) ?? link(d, fund, fund.evidenceUrl) ?? link(d, fund, fund.website) ?? null,
      weaveUrl: `${origin}/funding/${fund.id}`,
    },
  };
}

const FIT_NOTE = "Fit grades shared topics only: the field of work weighs most, then the people served, then the tools used. It rises where a program names a country sent, and falls, as a caution, where it names only other countries or names countries when none are sent. It is not eligibility and not a chance of funding. Check each program's own page.";

async function findFunds(sources: AgentToolSources, a: FindFundsArguments, now: Date) {
  const { catalog, d } = await loadCatalog(sources);
  let r: Rubric;
  let rules: unknown[];
  let conditions: unknown[] | null;
  try {
    if (!sources.screening) throw Error("no_screening");
    const [loaded, screening] = await Promise.all([catalogRubric(), sources.screening()]);
    r = loaded;
    if (!isRecord(screening.rules) || !Array.isArray(screening.rules.rules)) throw Error("invalid_rules");
    rules = screening.rules.rules;
    // As in the app: conditions that do not match this catalog are not used, and results say screening was unavailable.
    conditions = null;
    if (isRecord(screening.conditions) && Array.isArray(screening.conditions.conditions)) {
      let known = screened.get(catalog);
      if (!known) screened.set(catalog, known = new WeakMap());
      let valid = known.get(screening.conditions);
      if (valid === undefined) known.set(screening.conditions, valid = r.validConditions(screening.conditions, catalog.funds) === true);
      if (valid) conditions = screening.conditions.conditions;
    }
  } catch {
    throw new AgentToolError("catalog_unavailable", "The fund catalog could not be read. Try again later.");
  }
  const places = [...a.workCountries, ...a.benefitCountries, a.applicantBaseCountry, a.registrationCountry].filter(Boolean);
  const unknown = places.find((code) => !r.COUNTRIES.includes(code));
  if (unknown) throw new AgentToolError("invalid_argument", `${unknown} is not a country code the catalog knows.`);
  // The same shape the app gives the rubric, with the catalog topics a Portuguese or Spanish description
  // or theme names added to the themes, as the app's matcher adds them (topics.ts). Nothing here
  // outlives this call.
  const project = {
    id: "assistant", name: "", description: a.description, tags: fundingTopics(a.description, a.themes, a.themes),
    workCountries: a.workCountries, benefitCountries: a.benefitCountries,
    applicantBaseCountry: a.applicantBaseCountry, registrationCountry: a.registrationCountry, applicantType: a.applicantType,
    fundingInstruments: [], goalMin: null, goalMax: null, currency: "", usWorkStates: [], usBenefitStates: [], programAnswers: {},
  };
  let results: unknown;
  try {
    let prepared = ranked.get(catalog);
    if (!prepared) {
      const entries = catalog.funds.flatMap((fund): unknown[] => {
        const programs = fund.enrichment?.programs ?? [];
        return programs.length ? programs.map((program) => ({ ...fund, enrichment: { ...fund.enrichment, programs: [program] } })) : [fund];
      });
      ranked.set(catalog, prepared = { entries, index: r.createLexicalIndex(catalog.funds) });
    }
    results = r.rankFunds(prepared.entries, project, prepared.index, rules, null, now, conditions);
    // Funding's fit, read from what the description is about and where it works (DL-143), as the app reads it.
    if (Array.isArray(results)) results = withFundFit(project, results as RubricResult[]);
  } catch {
    // A catalog record the rubric cannot read fails here. The error is not passed on: it could quote the description.
    throw new AgentToolError("catalog_unavailable", "The fund catalog could not be ranked. Try again later.");
  }
  // Strongest topical fit first; equal fit keeps the rubric's own order. A program with no topic in common is left out.
  const fits = (Array.isArray(results) ? results : []).map((value, place) => ({ place, fit: fitResult(d, value, sources.origin) }))
    .flatMap(({ place, fit }) => fit && fit.score !== null && fit.score > 0 ? [{ place, score: fit.score, result: fit.result }] : [])
    .sort((x, y) => y.score - x.score || x.place - y.place);
  return {
    note: FIT_NOTE,
    privacy: "The description was used for this answer only. Weave did not store or log it.",
    catalog: { compiledAt: catalog.compiledAt, researchCheckedOn: catalog.researchCheckedOn ?? null },
    screening: conditions === null ? "unavailable" : "applied",
    total: fits.length,
    programs: fits.slice(0, a.limit).map(({ result }) => result),
  };
}

/** Runs one checked tool call and returns its result as plain data. Throws AgentToolError for a failure the caller can report. */
export function createAgentTools(sources: AgentToolSources) {
  const now = sources.now ?? (() => new Date());
  return (call: AgentToolCall): Promise<Record<string, unknown>> => {
    switch (call.name) {
      case "search_funds": return searchFunds(sources, call.arguments, now());
      case "get_fund": return getFund(sources, call.arguments, now());
      case "find_funds_for_initiative": return findFunds(sources, call.arguments, now());
      case "search_projects": return searchProjects(sources, call.arguments);
      case "get_project": return getProject(sources, call.arguments);
    }
  };
}
export type AgentTools = ReturnType<typeof createAgentTools>;
