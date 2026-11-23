// GET /api/record-page: one fund's or initiative's page with its own link preview (record-page-http.ts).
// Vercel rewrites /funding/:id and /initiatives/:id here (packages/app/vercel.json), and bundles the
// build's index.html and share/records.json with the function, which reads them from the deployment's
// own files. A deployment without them reads its own static copies instead.
import { builtFile, builtPreviews, builtSource, once } from "./built-files.ts";
import { PUBLIC_ORIGIN } from "./page-preview.ts";
import { GET as publicProjects } from "./public-projects.ts";
import { parsePublicProjectPage, type PublicProjectCard } from "./public-projects-contract.ts";
import { createRecordPageHandler } from "./record-page-http.ts";

const template = once((request) => builtFile("index.html", request));

/** One project from the public list, through its own handler, so it is the card the list shows. */
async function project(uri: string): Promise<PublicProjectCard | null> {
  const response = await publicProjects(new Request(`${PUBLIC_ORIGIN}/api/public-projects?uri=${encodeURIComponent(uri)}`));
  if (!response.ok) throw Error("public_projects_unavailable");
  const page = parsePublicProjectPage(await response.json());
  return page.projects.find((card) => card.uri === uri) ?? null;
}

const serve = createRecordPageHandler({ template, previews: builtPreviews, project });

/** The page, saying which copy of the build it came from, so a check after a deploy can tell. */
export async function GET(request: Request): Promise<Response> {
  const response = await serve(request);
  response.headers.set("X-Weave-Record-Source", builtSource());
  return response;
}
export const HEAD = GET;
