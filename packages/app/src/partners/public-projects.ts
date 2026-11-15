import {
  parsePublicProjectPage, PUBLIC_PROJECT_PAGE_SIZE, type PublicProjectCard, type PublicProjectPage,
} from "@weave/api/public-projects-contract";

export type { PublicProjectCard, PublicProjectPage };
/** The longest a search box entry may be, matching what the list accepts. */
export const PUBLIC_PROJECT_QUERY_MAX = 100;
const TIMEOUT_MS = 8000;

/** The same-origin address of one page. Parameters keep one order, so each page has one cached copy. */
export function publicProjectsPath(q: string, cursor: string | null = null, limit = PUBLIC_PROJECT_PAGE_SIZE): string {
  const params = new URLSearchParams();
  const search = q.trim().replace(/\s+/gu, " ").slice(0, PUBLIC_PROJECT_QUERY_MAX);
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
 * Once the list has answered, a later search keeps the index on screen while it loads.
 */
export function listView(list: PublicProjectList, indexSeen: boolean): "loading" | "index" | "starter" {
  if (list.status === "loading") return indexSeen ? "index" : "loading";
  return showsIndex(list) ? "index" : "starter";
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
  return total === 1 ? "1 project shared on Certified" : `${count(total)} projects shared on Certified`;
}
