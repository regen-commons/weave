// GET /api/sitemap, served at /sitemap.xml (packages/app/vercel.json, approved by the user on 22 November
// 2026): every public page and every record at its one address, so search engines can find each fund,
// program and initiative. Funds and programs come from the catalog the build bundles; initiatives from the
// public project list, read when the sitemap is asked for.
import { projectSlug, type PublicProjectCard } from "./public-projects-contract.ts";
import { fundAddress, initiativeAddress, type RecordPreviews } from "./record-page-http.ts";

/** How long the initiatives may take before the sitemap goes out without them. */
export const PROJECTS_TIMEOUT_MS = 4000;

/** Search engines read the sitemap at most a few times a day; the CDN keeps it an hour, and a day while it refreshes. */
const CACHED = { "Cache-Control": "public, max-age=3600", "CDN-Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" };
/** A sitemap missing the initiatives is kept only briefly, so the next one can have them. */
const PARTIAL = { "Cache-Control": "public, max-age=300", "CDN-Cache-Control": "public, max-age=300" };
const NOT_CACHED = { "Cache-Control": "no-store" };

const xml = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");

/** One address in the sitemap, with the day its record last changed where that is known. */
export interface SitemapEntry {
  readonly loc: string;
  readonly lastmod?: string;
}

/**
 * Every address the sitemap lists, in a fixed order: the public pages, each fund that has no programs,
 * each program, then each initiative with a Weave address, newest first. A fund with programs is listed
 * through them, because its bare address opens its first program (DL-136).
 */
export function sitemapEntries(previews: RecordPreviews, projects: readonly PublicProjectCard[]): SitemapEntry[] {
  const funds = Object.entries(previews.funds).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return [
    ...previews.pages.map((loc) => ({ loc })),
    ...funds.flatMap(([id, fund]) =>
      fund.programs.length ? fund.programs.map((program) => ({ loc: fundAddress(id, program.id) })) : [{ loc: fundAddress(id, null) }]),
    ...projects.flatMap((card) => {
      const slug = projectSlug(card.uri);
      return slug ? [{ loc: initiativeAddress(slug), lastmod: card.sharedAt.slice(0, 10) }] : [];
    }),
  ];
}

/** The sitemap protocol's document for these addresses. */
export function sitemapXml(entries: readonly SitemapEntry[]): string {
  const urls = entries.map(({ loc, lastmod }) => `  <url><loc>${xml(loc)}</loc>${lastmod ? `<lastmod>${xml(lastmod)}</lastmod>` : ""}</url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}

function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error("projects_timeout")), ms); });
  return Promise.race([work, late]).finally(() => clearTimeout(timer));
}

/**
 * Serves the sitemap to GET and HEAD. Without the build's record previews there is nothing to list, so it
 * answers 503, uncached. A project list that fails or takes longer than `PROJECTS_TIMEOUT_MS` leaves the
 * initiatives out of a sitemap kept only five minutes.
 */
export function createSitemapHandler(options: {
  previews(request: Request): Promise<RecordPreviews>;
  /** Every project the public list shows. Rejects when the list cannot be read. */
  projects(): Promise<PublicProjectCard[]>;
  projectsTimeoutMs?: number;
}) {
  const timeout = options.projectsTimeoutMs ?? PROJECTS_TIMEOUT_MS;
  async function respond(request: Request): Promise<Response> {
    let previews: RecordPreviews;
    try { previews = await options.previews(request); }
    catch { return new Response("The sitemap is not available right now.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", ...NOT_CACHED } }); }
    let projects: PublicProjectCard[] = [], whole = true;
    try { projects = await withDeadline(options.projects(), timeout); }
    catch { whole = false; }
    return new Response(sitemapXml(sitemapEntries(previews, projects)), {
      status: 200, headers: { "Content-Type": "application/xml; charset=utf-8", "X-Content-Type-Options": "nosniff", ...(whole ? CACHED : PARTIAL) },
    });
  }
  return async (request: Request): Promise<Response> => {
    if (request.method !== "GET" && request.method !== "HEAD")
      return new Response(null, { status: 405, headers: { Allow: "GET, HEAD", ...NOT_CACHED } });
    const response = await respond(request);
    return request.method === "HEAD" ? new Response(null, { status: response.status, headers: response.headers }) : response;
  };
}
