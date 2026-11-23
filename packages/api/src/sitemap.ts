// GET /api/sitemap, served at /sitemap.xml (sitemap-http.ts). Funds come from the build's record previews;
// initiatives are read through the public project list's own handler, page by page, so the sitemap lists
// exactly the projects the list shows.
import { builtPreviews, builtSource } from "./built-files.ts";
import { PUBLIC_ORIGIN } from "./page-preview.ts";
import { GET as publicProjects } from "./public-projects.ts";
import { PUBLIC_PROJECT_PAGE_MAX, parsePublicProjectPage, type PublicProjectCard } from "./public-projects-contract.ts";
import { createSitemapHandler } from "./sitemap-http.ts";

/**
 * Every project the list shows, a page at a time from its own handler, until it says there are no more,
 * it has given as many as it counts, or `signal` aborts. A cursor seen twice would walk in a circle, so it
 * is refused instead.
 */
export async function allProjects(signal: AbortSignal, list: (request: Request) => Promise<Response> = publicProjects): Promise<PublicProjectCard[]> {
  const cards: PublicProjectCard[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  for (;;) {
    signal.throwIfAborted();
    const query = new URLSearchParams({ limit: String(PUBLIC_PROJECT_PAGE_MAX), ...(cursor ? { cursor } : {}) });
    const response = await list(new Request(`${PUBLIC_ORIGIN}/api/public-projects?${query}`));
    if (!response.ok) throw Error("public_projects_unavailable");
    const page = parsePublicProjectPage(await response.json());
    cards.push(...page.projects);
    if (!page.next || cards.length >= page.index.total) return cards;
    if (seen.has(page.next)) throw Error("public_projects_cursor_repeated");
    seen.add(page.next);
    cursor = page.next;
  }
}

const serve = createSitemapHandler({ previews: builtPreviews, projects: (signal) => allProjects(signal) });

export async function GET(request: Request): Promise<Response> {
  const response = await serve(request);
  response.headers.set("X-Weave-Record-Source", builtSource());
  return response;
}
export const HEAD = GET;
