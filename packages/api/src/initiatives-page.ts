// GET /initiatives: the Initiatives page with its first page of projects drawn (initiatives-page-http.ts).
// Vercel rewrites the list's address here (packages/app/vercel.json) and bundles the build's page for the
// list with the function, which reads it from the deployment's own files. A deployment without it reads
// the public site's static copy instead.
import { builtFile, builtSource, once } from "./built-files.ts";
import { createInitiativesPageHandler, LIST_PAGE_FALLBACK_FILES, LIST_PAGE_FILE } from "./initiatives-page-http.ts";
import { LIST_FIRST_PAGE_REQUEST } from "./list-first-view.ts";
import { PUBLIC_ORIGIN } from "./page-preview.ts";
import { GET as publicProjects } from "./public-projects.ts";
import { parsePublicProjectPage, type PublicProjectPage } from "./public-projects-contract.ts";

// A copy not in the function's bundle is read from Weave's public site, never from the address a
// request names: the page is kept for the instance and cached, so it must not follow a request's Host.
const site = new Request(`${PUBLIC_ORIGIN}/`);
const template = once(() => builtFile(LIST_PAGE_FILE, site));
const fallback = once(() => builtFile(LIST_PAGE_FALLBACK_FILES, site));

/** The list's first page, through its own handler, so the cards are the ones the list answers with. */
async function firstPage(): Promise<PublicProjectPage> {
  const response = await publicProjects(new Request(`${PUBLIC_ORIGIN}${LIST_FIRST_PAGE_REQUEST}`));
  if (!response.ok) throw Error("public_projects_unavailable");
  return parsePublicProjectPage(await response.json());
}

const serve = createInitiativesPageHandler({ template, fallback, firstPage });

/** The page, saying which copy of the build it came from, so a check after a deploy can tell. */
export async function GET(request: Request): Promise<Response> {
  const response = await serve(request);
  response.headers.set("X-Weave-Record-Source", builtSource());
  return response;
}
export const HEAD = GET;
