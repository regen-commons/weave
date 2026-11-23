// GET /initiatives: the Initiatives page with its first page of projects already drawn (23 November 2026,
// the user's choice for the page's largest paint). Vercel rewrites the list's address here
// (packages/app/vercel.json); the build writes the page this starts from beside index.html instead of at
// the address, since Vercel serves a file at an address before any rewrite. The cards and their JSON are
// drawn by list-first-view.ts. A list that is slow, off or failing never holds the page up: it goes as the
// build drew it, with its skeleton, and the app asks for the list as it did before.
import { asksFirstPage, LIST_PAGE_FILE, withListFirstPage } from "./list-first-view.ts";
import { withoutPageHead } from "./page-preview.ts";
import type { PublicProjectPage } from "./public-projects-contract.ts";
import { withDeadline } from "./record-page-http.ts";

export { LIST_PAGE_FILE };
/** The app's own page, for a deployment whose list page cannot be read. */
export const LIST_PAGE_FALLBACK_FILES = ["shell.html", "index.html"] as const;

/**
 * How long the list's first page may take before the page goes without it. A list answering from a
 * warm connection takes a few hundred milliseconds; one slower than this costs more first paint than its
 * cards save, so the page goes at once and the app asks for the list itself.
 */
export const LIST_LOOKUP_TIMEOUT_MS = 800;

/** The CDN keeps the page for five minutes, as it does a record's, and may serve it for ten more while it refreshes. */
const CACHED = { "Cache-Control": "public, max-age=0, must-revalidate", "CDN-Cache-Control": "public, max-age=300, stale-while-revalidate=600" };
const NOT_CACHED = { "Cache-Control": "no-store" };

function page(html: string, cache: Record<string, string>): Response {
  return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "X-Content-Type-Options": "nosniff", ...cache } });
}

/**
 * Serves the Initiatives page, to GET and to HEAD. Its own first page, asked for with no search, filter
 * or order, gets its cards drawn; an address with one of those gets the build's page as it is, since the
 * cards it wants are not the first page. A list that answers but would show the starter list, or whose
 * page the build drew differently than expected, also goes as the build drew it, uncached. A lookup that
 * fails or takes longer than `LIST_LOOKUP_TIMEOUT_MS` sends the build's page uncached too, so the next
 * request tries again: only a page with the list's answer in it is kept at the CDN. A deployment whose list page cannot be read sends the app's own page with no head of its own,
 * uncached: the app draws the list from the address either way.
 */
export function createInitiativesPageHandler(options: {
  /** The build's page for the list. Rejects when the build has none. */
  template(request: Request): Promise<string>;
  /** The app's own page, when the list's cannot be read. */
  fallback(request: Request): Promise<string>;
  /** The list's first page, as GET /api/public-projects answers it. Rejects when the list cannot be read. */
  firstPage(): Promise<PublicProjectPage>;
  lookupTimeoutMs?: number;
}) {
  const lookupTimeoutMs = options.lookupTimeoutMs ?? LIST_LOOKUP_TIMEOUT_MS;
  async function respond(request: Request): Promise<Response> {
    // The list is asked for at once, so it is on its way while the page is read.
    const wanted = asksFirstPage(new URL(request.url));
    const lookup = wanted ? withDeadline(options.firstPage(), lookupTimeoutMs) : undefined;
    lookup?.catch(() => {});
    let html: string;
    try {
      html = await options.template(request);
    } catch {
      try {
        return page(withoutPageHead(await options.fallback(request)), NOT_CACHED);
      } catch {
        // No page of the app's could be read: a moment's outage of the deployment's own files.
        return new Response(null, { status: 503, headers: { "Retry-After": "5", ...NOT_CACHED } });
      }
    }
    if (!lookup) return page(html, CACHED);
    let first: PublicProjectPage;
    try {
      first = await lookup;
    } catch {
      return page(html, NOT_CACHED);
    }
    // Only a page the list's answer went into is kept at the CDN. One it left as the build drew it (a
    // list that is off or empty, or a page of another shape) goes uncached, as a failed lookup does, so
    // the next request asks again. A page the cards could not be drawn into goes the same way, never as
    // an error.
    try {
      const served = withListFirstPage(html, first);
      return page(served, served === html ? NOT_CACHED : CACHED);
    } catch {
      return page(html, NOT_CACHED);
    }
  }
  return async (request: Request): Promise<Response> => {
    if (request.method !== "GET" && request.method !== "HEAD")
      return new Response(null, { status: 405, headers: { Allow: "GET, HEAD", ...NOT_CACHED } });
    const response = await respond(request);
    if (request.method !== "HEAD") return response;
    // A HEAD answer has no body, so it is never kept where a GET could be served it.
    const headers = new Headers(response.headers);
    headers.delete("CDN-Cache-Control");
    headers.set("Cache-Control", "no-store");
    return new Response(null, { status: response.status, headers });
  };
}
