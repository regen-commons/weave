// One public project's card, as the public list shows it, for the pages and pictures that name one record.
import { PUBLIC_ORIGIN } from "./page-preview.ts";
import { GET as publicProjects } from "./public-projects.ts";
import { parsePublicProjectPage, type PublicProjectCard } from "./public-projects-contract.ts";

/** One project from the public list, through its own handler, so it is the card the list shows. */
export async function publicProject(uri: string): Promise<PublicProjectCard | null> {
  const response = await publicProjects(new Request(`${PUBLIC_ORIGIN}/api/public-projects?uri=${encodeURIComponent(uri)}`));
  if (!response.ok) throw Error("public_projects_unavailable");
  const page = parsePublicProjectPage(await response.json());
  return page.projects.find((card) => card.uri === uri) ?? null;
}
