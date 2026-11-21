import {
  isOrganizationType, isPublicProjectSort, isWorkScope, organizationTypeOf, parsePublicProjectPage, PUBLIC_PROJECT_PAGE_SIZE,
  type PublicProjectCard, type PublicProjectPage, type PublicProjectSort,
} from "@weave/api/public-projects-contract";
import type { Facet, FacetOption } from "../filters.ts";

export type { PublicProjectCard, PublicProjectPage, PublicProjectSort };
export { isPublicProjectSort, PUBLIC_PROJECT_PAGE_SIZE };
/** The longest a search box entry may be, matching what the list accepts. */
export const PUBLIC_PROJECT_QUERY_MAX = 100;
const TIMEOUT_MS = 8000;

/** A search as the list reads it: trimmed, single spaces, no longer than the list accepts. */
export function searchQuery(typed: string): string {
  return typed.trim().replace(/\s+/gu, " ").slice(0, PUBLIC_PROJECT_QUERY_MAX);
}
/** How long the list waits after the last letter before it searches, so typing sends one request. */
export const SEARCH_PAUSE_MS = 300;
/**
 * The search the list asks for now: what was typed once typing paused, except that an emptied box asks
 * at once. Clear Filters then sends one request, with the search and the filters all gone.
 */
export const searchNow = (typed: string, paused: string): string => typed === "" ? "" : paused;

/** What a list is narrowed and ordered by besides its search. A filter not chosen is null or left out. */
export type ProjectChoice = {
  organizationType?: string | null;
  workScope?: string | null;
  sort?: PublicProjectSort;
};

/**
 * The same-origin address of one page. Parameters keep one order, so each page has one cached copy. A
 * kind of group or of work the list cannot read is left out, so the list never refuses the page for it.
 */
export function publicProjectsPath(
  q: string, { cursor = null, limit = PUBLIC_PROJECT_PAGE_SIZE, organizationType = null, workScope = null, sort = "newest" }:
    ProjectChoice & { cursor?: string | null; limit?: number } = {},
): string {
  const params = new URLSearchParams();
  const search = searchQuery(q);
  if (search) params.set("q", search);
  if (isOrganizationType(organizationType)) params.set("organizationType", organizationType);
  if (isWorkScope(workScope)) params.set("workScope", workScope);
  // Newest first is the list's own order, so it is left out and its pages keep the addresses they had.
  if (sort !== "newest") params.set("sort", sort);
  if (cursor) params.set("cursor", cursor);
  if (limit !== PUBLIC_PROJECT_PAGE_SIZE) params.set("limit", String(limit));
  const query = params.toString();
  return `/api/public-projects${query ? `?${query}` : ""}`;
}

/** Reads one page. Any refusal, timeout or unexpected answer is a failure the page falls back from. */
export async function requestPublicProjects(path: string, signal: AbortSignal, request: typeof fetch = fetch): Promise<PublicProjectPage> {
  const response = await request(path, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]),
    headers: { accept: "application/json" },
    credentials: "omit",
  });
  if (!response.ok) throw new Error("public_projects_unavailable");
  return parsePublicProjectPage(await response.json());
}

/**
 * What a list was asked for: the search, the kind of group and the kind of work where one is chosen, and an
 * order other than newest first.
 */
type Asked = { q: string; organizationType?: string; workScope?: string; sort?: Exclude<PublicProjectSort, "newest"> };
export type PublicProjectList =
  | ({ status: "loading" } & Asked)
  | ({ status: "failed" } & Asked)
  | ({ status: "ready"; page: PublicProjectPage; projects: PublicProjectCard[]; more: "idle" | "loading" | "failed" } & Asked);

/** The fields a list records for what it was asked: a default is left out. */
export const askedFor = (q: string, { organizationType, workScope, sort = "newest" }: ProjectChoice = {}): Asked => ({
  q, ...(organizationType ? { organizationType } : {}), ...(workScope ? { workScope } : {}), ...(sort !== "newest" ? { sort } : {}),
});

export const firstPage = (q: string, page: PublicProjectPage, choice: ProjectChoice = {}): PublicProjectList =>
  ({ status: "ready", ...askedFor(q, choice), page, projects: page.projects, more: "idle" });

/** Whether a list answers what is being asked now, so a late page for an earlier search, filter or order is dropped. */
export const sameAsk = (list: Asked, asked: Asked): boolean => list.q === asked.q
  && list.organizationType === asked.organizationType && list.workScope === asked.workScope && list.sort === asked.sort;

/** How many filters narrow a list, besides its search. */
export const filtersChosen = (list: Asked): number => Number(!!list.organizationType) + Number(!!list.workScope);

/** Whether a list is narrowed by a search or a filter. */
const narrowed = (list: Asked) => list.q !== "" || filtersChosen(list) > 0;

/** Adds the next page, skipping any project already shown, since the list can change between pages. */
export function nextPage(list: PublicProjectList, page: PublicProjectPage): PublicProjectList {
  if (list.status !== "ready") return list;
  const shown = new Set(list.projects.map(({ uri }) => uri));
  return { ...list, page, projects: [...list.projects, ...page.projects.filter(({ uri }) => !shown.has(uri))], more: "idle" };
}

/**
 * The Initiatives page shows the index when it has projects or a search is running. An empty index, one
 * that is not switched on or one that did not answer falls back to the starter list of public sources.
 */
export function showsIndex(list: PublicProjectList): boolean {
  return list.status === "ready" && list.page.index.status !== "off" && (list.page.index.total > 0 || narrowed(list));
}

/**
 * What the Initiatives page shows now. Until a first page says whether the list is switched on, it shows
 * only that it is loading, so neither the search form nor the starter list flashes before the other.
 * A browser that last heard the list is off shows the starter list straight away (`expectStarter`).
 * Once the list has answered, a later search keeps the index on screen while it loads.
 */
export function listView(list: PublicProjectList, indexSeen: boolean, expectStarter = false): "loading" | "index" | "starter" {
  if (list.status === "loading") return indexSeen ? "index" : expectStarter ? "starter" : "loading";
  return showsIndex(list) ? "index" : "starter";
}

/**
 * Where this browser keeps one fact: the list was not switched on the last time it answered. The
 * starter list needs nothing from the network, so a page that expects it shows it at once, with
 * no skeleton of another list's shape to jump from (DL-109). Nothing about the person is kept.
 */
export const INDEX_OFF_KEY = "weave-projects-index-off";

/** Whether the last answer said the list is off. A browser that refuses storage expects the list. */
export function expectsStarter(storage: Pick<Storage, "getItem"> | null): boolean {
  try {
    return storage?.getItem(INDEX_OFF_KEY) === "1";
  } catch {
    return false;
  }
}

/** Keeps what an answer said about the list being on. A request that failed says nothing either way. */
export function rememberIndex(storage: Pick<Storage, "setItem" | "removeItem"> | null, page: PublicProjectPage): void {
  try {
    if (page.index.status === "off") storage?.setItem(INDEX_OFF_KEY, "1");
    else storage?.removeItem(INDEX_OFF_KEY);
  } catch {
    /* The page still works; it only cannot skip the skeleton next time. */
  }
}

const count = (total: number) => new Intl.NumberFormat("en-GB").format(total);

/** The sentence after the count that says how current the list is. */
export function indexLine(index: PublicProjectPage["index"], formatDate: (iso: string) => string): string {
  if (index.status === "stale" && index.checkedAt)
    return `Last checked on ${formatDate(index.checkedAt)}. The list may be out of date.`;
  if (index.status === "bounded" && index.checkedAt) return `Checked on ${formatDate(index.checkedAt)}.`;
  return "The latest check did not finish, so some projects may be missing.";
}

/** How many projects the list holds, or how many match a search or its filters, as one whole sentence. */
export function countLine(total: number, searching: boolean, filters = 0): string {
  const filter = filters > 1 ? "filters" : "filter";
  const what = searching && filters ? `your search and ${filter}` : searching ? "your search" : `your ${filter}`;
  if (searching || filters) return total === 1 ? `1 project matches ${what}.` : `${count(total)} projects match ${what}.`;
  return total === 1 ? "1 project shared on Certified." : `${count(total)} projects shared on Certified.`;
}

/** What an empty list says, and what its one button takes away. */
export function emptyList(searching: boolean, filters: number): { title: string; body: string; action: string } {
  if (!filters) return { title: "No projects match your search", body: "Try other words, or clear the search to see every project.",
    action: "Clear Search" };
  const filter = filters > 1 ? "filters" : "filter";
  return {
    title: searching ? `No projects match your search and ${filter}` : `No projects match ${filters > 1 ? "these filters" : "this filter"}`,
    body: filters > 1 ? "Try fewer filters, or clear them to see every project."
      : "Try another choice, or clear the filters to see every project.",
    action: "Clear Filters",
  };
}

/** The page address's name for the kind of group, the same as the list's. */
export const ORGANIZATION_TYPE_KEY = "organizationType";
/** The page address's name for the kind of work, the same as the list's. */
export const WORK_SCOPE_KEY = "workScope";
/** The page address's name for the order, the same as the list's. */
export const SORT_KEY = "sort";

/** The orders the Sort menu offers, newest first as the list's own (DL-121). */
export const PUBLIC_PROJECT_SORT_OPTIONS: readonly FacetOption[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "name", label: "Name A to Z" },
];

/** The order from the page's address, or newest first where it names none the list knows. */
export function chosenSort(search: string): PublicProjectSort {
  const value = new URLSearchParams(search).get(SORT_KEY);
  return isPublicProjectSort(value) ? value : "newest";
}

/** Words a key spells in lower case that people read in capitals. */
const ACRONYMS: ReadonlyMap<string, string> = new Map([["ngo", "NGO"]]);

/**
 * A kind of group or of work as people read it, from its key: `community-group` is "Community group",
 * `disaster-relief` is "Disaster relief" and `ngo` is "NGO". The key, not the tag's own name, is what is
 * shown, so a tag named in another language reads the same as its English twin (DL-125).
 */
export function keyLabel(key: string): string {
  const words = key.split("-").map((word) => ACRONYMS.get(word) ?? word).join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
export const organizationTypeLabel = keyLabel;

/**
 * One filter with a short list to pick one from, whose first option means no filter (DL-081). It offers
 * only the values the list names, and a value chosen through an address stays on offer so it can be taken
 * off. A list that names none, as one from before the filter, has no such filter. Before the first page
 * answers (`"waiting"`) the filter is drawn waiting, so the bar does not grow when the list arrives
 * (DL-108).
 */
function pickOne(facet: { key: string; label: string; any: string }, offered: readonly string[] | undefined | "waiting",
  chosen: string | null): Facet[] {
  const values = offered === "waiting" ? [] : [...offered ?? []];
  if (chosen && !values.includes(chosen)) values.push(chosen);
  if (!values.length && offered !== "waiting") return [];
  return [{
    key: facet.key,
    label: facet.label,
    kind: "one",
    options: [{ value: "", label: facet.any }, ...values.map((value) => ({ value, label: keyLabel(value) }))],
    chosen: chosen ? [chosen] : [],
  }];
}

/** The kind of group the projects' publishers say they are (DL-120). */
export const organizationTypeFacets = (offered: readonly string[] | undefined | "waiting", chosen: string | null): Facet[] =>
  pickOne({ key: ORGANIZATION_TYPE_KEY, label: "Kind of group", any: "Any kind" }, offered, chosen);

/**
 * What the projects' own activities say the work is, their work scope (DL-125). It is called Focus, not
 * type of work, because type of work is Weave's own lens and these are Certified's tags.
 */
export const workScopeFacets = (offered: readonly string[] | undefined | "waiting", chosen: string | null): Facet[] =>
  pickOne({ key: WORK_SCOPE_KEY, label: "Focus", any: "Any focus" }, offered, chosen);

/**
 * A kind of group from the page's address, or none where it is not one the list could read. An address
 * shared before two spellings were read as one kind opens on that kind.
 */
export function chosenOrganizationType(search: string): string | null {
  const value = new URLSearchParams(search).get(ORGANIZATION_TYPE_KEY);
  return isOrganizationType(value) ? organizationTypeOf(value) : null;
}

/** A kind of work from the page's address, or none where it is not one the list could read. */
export function chosenWorkScope(search: string): string | null {
  const value = new URLSearchParams(search).get(WORK_SCOPE_KEY);
  return isWorkScope(value) ? value : null;
}

/**
 * The line under a card's name: who shared it and where. `title` is the whole line in words, for a line
 * cut at its end. A card with neither keeps the line empty, so every card is one height (DL-108).
 */
export function sharedByLine(project: Pick<PublicProjectCard, "publisher" | "place">): string {
  return [project.publisher && `Shared by ${project.publisher}.`, project.place && `Place: ${project.place}.`]
    .filter(Boolean).join(" ");
}

/** Home's link to the list. */
export function sharedLabel(total: number): string {
  return total === 1 ? "1 Project Shared On Certified" : `${count(total)} Projects Shared On Certified`;
}
