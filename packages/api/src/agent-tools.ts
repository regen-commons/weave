// Runs the tools in agent-tools-contract.ts against the fund catalog and the public project list. It
// reads public data only, keeps nothing a caller sent and never reads a cookie or a session.
import { ACCESS, effectiveAccess, filterFunds, RESEARCH, researchStatus, safeFundUrl, sortFunds, utcDate } from "../../../dist/domain.mjs";
import type { AgentToolCall, GetFundArguments, GetProjectArguments, SearchFundsArguments, SearchProjectsArguments } from "./agent-tools-contract.ts";
import { parsePublicProjectPage, PUBLIC_PROJECT_PAGE_MAX, type PublicProjectCard, type PublicProjectPage } from "./public-projects-contract.ts";

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
  readonly code: "catalog_unavailable" | "projects_unavailable" | "not_found" | "invalid_cursor";
  constructor(code: AgentToolError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

export type AgentToolSources = {
  /** The fund catalog. Rejects when the file cannot be read. */
  catalog(): Promise<FundCatalog>;
  /** Answers a request as GET /api/public-projects does. */
  publicProjects(request: Request): Promise<Response>;
  /** Weave's public address, for the links results carry. */
  origin: string;
  now?: () => Date;
};

const POSSIBILITY = "A possibility to check against the funder's own page. Weave does not decide eligibility.";
const NOT_CONFIRMED = "Listed from public Certified records. Weave has not confirmed availability or interest, and nothing here contacts anyone.";

/** http and https links only, and none on a host the catalog warns about. An unsafe link is left out. */
function link(fund: CatalogFund, value: unknown): string | undefined {
  return typeof value === "string" && value ? safeFundUrl(fund, value) || undefined : undefined;
}
/** A program with every link checked the same way, wherever the catalog nests it. */
function withSafeLinks(fund: CatalogFund, value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => withSafeLinks(fund, item));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => {
    if (key !== "url") return [[key, withSafeLinks(fund, item)]];
    const safe = link(fund, item);
    return safe ? [[key, safe]] : [];
  }));
}

function fundSummary(fund: CatalogFund, origin: string, now: Date) {
  const access = effectiveAccess(fund, now);
  return {
    id: fund.id,
    name: fund.displayName || fund.name,
    summary: fund.enrichment?.summary || fund.description || "",
    sectors: fund.sectors,
    regions: fund.regions,
    access: { state: access, label: ACCESS[access]?.label ?? access, detail: fund.accessDetail ?? "" },
    amount: fund.amount ?? "",
    timing: fund.timing ?? "",
    deadline: fund.deadlineDate ?? null,
    research: { status: RESEARCH[researchStatus(fund)] ?? researchStatus(fund), checkedOn: fund.verifiedOn ?? fund.enrichment?.researchedOn ?? null },
    programs: (fund.enrichment?.programs ?? []).map(({ id, name }) => ({ id: `${fund.id}::${id}`, name })),
    sourceUrl: link(fund, fund.evidenceUrl) ?? link(fund, fund.website) ?? null,
    weaveUrl: `${origin}/funding/${fund.id}`,
  };
}

async function searchFunds(sources: AgentToolSources, a: SearchFundsArguments, now: Date) {
  const catalog = await loadCatalog(sources);
  const today = utcDate(now);
  const matched = sortFunds(
    filterFunds(catalog.funds, { q: a.query, region: a.region ?? "", theme: a.sector ?? "", access: a.access ?? "" }, [], now)
      .filter((fund) => !a.deadlineBefore || (!!fund.deadlineDate && fund.deadlineDate <= a.deadlineBefore
        && fund.deadlineDate >= today && effectiveAccess(fund, now) !== "closed")),
    a.sort, now,
  );
  if (a.offset > matched.length) throw new AgentToolError("invalid_cursor", "That cursor is past the end of this search. Start the search again.");
  const page = matched.slice(a.offset, a.offset + a.limit);
  const end = a.offset + page.length;
  return {
    note: POSSIBILITY,
    catalog: { compiledAt: catalog.compiledAt, researchCheckedOn: catalog.researchCheckedOn ?? null, funds: catalog.funds.length },
    total: matched.length,
    funds: page.map((fund) => fundSummary(fund, sources.origin, now)),
    next: end < matched.length ? String(end) : null,
  };
}

async function getFund(sources: AgentToolSources, a: GetFundArguments, now: Date) {
  const catalog = await loadCatalog(sources);
  const fund = catalog.funds.find(({ id }) => id === a.fundId);
  if (!fund) throw new AgentToolError("not_found", "The catalog has no fund with that identifier.");
  const all = fund.enrichment?.programs ?? [];
  const programs = a.programId === null ? all : all.filter(({ id }) => id === a.programId);
  if (a.programId !== null && !programs.length) throw new AgentToolError("not_found", "That fund has no program with that identifier.");
  return {
    note: POSSIBILITY,
    fund: {
      ...fundSummary(fund, sources.origin, now),
      programs: programs.map((program) => ({ ...(withSafeLinks(fund, program) as CatalogProgram), id: `${fund.id}::${program.id}` })),
      sources: (fund.enrichment?.sources ?? []).flatMap((source) => {
        const url = link(fund, source.url);
        return url ? [{ url, title: source.title ?? "", checkedOn: source.checkedOn ?? null }] : [];
      }),
      researchNotes: fund.enrichment?.researchNotes ?? "",
      qualityFlags: fund.qualityFlags ?? [],
      // The warned links themselves are left out: the reason says why a source is not offered.
      sourceWarnings: (fund.sourceWarnings ?? []).map(({ reason }) => reason),
    },
  };
}

async function loadCatalog(sources: AgentToolSources): Promise<FundCatalog> {
  try {
    const catalog = await sources.catalog();
    if (!Array.isArray(catalog?.funds)) throw Error("invalid_catalog");
    return catalog;
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

/** The most pages get_project reads: the list holds about a thousand projects. */
const GET_PROJECT_PAGES_MAX = 200;
/**
 * The list has no lookup by address, so this reads its pages until the project appears. Every page comes
 * from the copy the function already holds, so the walk reads the database no more than one search does.
 */
async function getProject(sources: AgentToolSources, a: GetProjectArguments) {
  let cursor = "";
  for (let pages = 0; pages < GET_PROJECT_PAGES_MAX; pages += 1) {
    const page = await projectPage(sources, { limit: String(PUBLIC_PROJECT_PAGE_MAX), cursor });
    const found = page.projects.find(({ uri }) => uri === a.uri);
    if (found) return { note: NOT_CONFIRMED, index: { status: page.index.status, checkedAt: page.index.checkedAt }, project: projectCard(found, sources.origin) };
    if (!page.next) break;
    cursor = page.next;
  }
  throw new AgentToolError("not_found", "Weave lists no public project at that address. It may have been withdrawn.");
}

/** Runs one checked tool call and returns its result as plain data. Throws AgentToolError for a failure the caller can report. */
export function createAgentTools(sources: AgentToolSources) {
  const now = sources.now ?? (() => new Date());
  return (call: AgentToolCall): Promise<Record<string, unknown>> => {
    switch (call.name) {
      case "search_funds": return searchFunds(sources, call.arguments, now());
      case "get_fund": return getFund(sources, call.arguments, now());
      case "search_projects": return searchProjects(sources, call.arguments);
      case "get_project": return getProject(sources, call.arguments);
    }
  };
}
export type AgentTools = ReturnType<typeof createAgentTools>;
