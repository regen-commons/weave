import {
  parsePublicProjectPage, PUBLIC_PROJECT_PAGE_SIZE, type PublicProjectCard, type PublicProjectPage,
} from "@weave/api/public-projects-contract";

export type { PublicProjectCard, PublicProjectPage };
export { PUBLIC_PROJECT_PAGE_SIZE };
/** The longest a search box entry may be, matching what the list accepts. */
export const PUBLIC_PROJECT_QUERY_MAX = 100;
const TIMEOUT_MS = 8000;

/** A search as the list reads it: trimmed, single spaces, no longer than the list accepts. */
export function searchQuery(typed: string): string {
  return typed.trim().replace(/\s+/gu, " ").slice(0, PUBLIC_PROJECT_QUERY_MAX);
}
/** How long the list waits after the last letter before it searches, so typing sends one request. */
export const SEARCH_PAUSE_MS = 300;

/** The same-origin address of one page. Parameters keep one order, so each page has one cached copy. */
export function publicProjectsPath(q: string, cursor: string | null = null, limit = PUBLIC_PROJECT_PAGE_SIZE): string {
  const params = new URLSearchParams();
  const search = searchQuery(q);
  if (search) params.set("q", search);
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

export type PublicProjectList =
  | { status: "loading"; q: string }
  | { status: "failed"; q: string }
  | { status: "ready"; q: string; page: PublicProjectPage; projects: PublicProjectCard[]; more: "idle" | "loading" | "failed" };

export const firstPage = (q: string, page: PublicProjectPage): PublicProjectList =>
  ({ status: "ready", q, page, projects: page.projects, more: "idle" });

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
  return list.status === "ready" && list.page.index.status !== "off" && (list.page.index.total > 0 || list.q !== "");
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

/** How many projects the list holds, or how many match a search, as one whole sentence. */
export function countLine(total: number, searching: boolean): string {
  if (searching) return total === 1 ? "1 project matches your search." : `${count(total)} projects match your search.`;
  return total === 1 ? "1 project shared on Certified." : `${count(total)} projects shared on Certified.`;
}

/** Home's link to the list. */
export function sharedLabel(total: number): string {
  return total === 1 ? "1 Project Shared On Certified" : `${count(total)} Projects Shared On Certified`;
}
