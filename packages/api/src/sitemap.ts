// GET /api/sitemap, served at /sitemap.xml (sitemap-http.ts). Funds come from the build's record previews;
// initiatives are read through the public project list's own handler, page by page, so the sitemap lists
// exactly the projects the list shows.
import { builtPreviews, builtSource } from "./built-files.ts";
import { PUBLIC_ORIGIN } from "./page-preview.ts";
import { GET as publicProjects } from "./public-projects.ts";
import { PUBLIC_PROJECT_PAGE_MAX, parsePublicProjectPage, type PublicProjectCard } from "./public-projects-contract.ts";
import { createSitemapHandler } from "./sitemap-http.ts";

/** More pages than a list of this size can have: a guard against a cursor that never ends. */
const PAGES_MAX = 200;

async function projects(): Promise<PublicProjectCard[]> {
  const cards: PublicProjectCard[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < PAGES_MAX; page++) {
    const query = new URLSearchParams({ limit: String(PUBLIC_PROJECT_PAGE_MAX), ...(cursor ? { cursor } : {}) });
    const response = await publicProjects(new Request(`${PUBLIC_ORIGIN}/api/public-projects?${query}`));
    if (!response.ok) throw Error("public_projects_unavailable");
    const result = parsePublicProjectPage(await response.json());
    cards.push(...result.projects);
    if (!result.next) return cards;
    cursor = result.next;
  }
  throw Error("public_projects_unbounded");
}

const serve = createSitemapHandler({ previews: builtPreviews, projects });

export async function GET(request: Request): Promise<Response> {
  const response = await serve(request);
  response.headers.set("X-Weave-Record-Source", builtSource());
  return response;
}
export const HEAD = GET;
