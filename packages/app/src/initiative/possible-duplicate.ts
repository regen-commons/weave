import { projectAddress } from "../partners/public-project.ts";
import { publicProjectsPath, requestPublicProjects, type PublicProjectCard } from "../partners/public-projects.ts";
import { likelyDuplicate } from "./duplicates.ts";

/** A project that may already be this initiative, said before Weave creates another (25 November 2026). */
export interface PossibleDuplicate {
  readonly uri: string;
  readonly name: string;
  /** `yours`: one of the account's own Certified projects, personal or a group's. `public`: one in the public list. */
  readonly where: "yours" | "public";
  /** Who it belongs to, as the reader would say it. */
  readonly byline: string;
  /** Its page in Weave, for a public one the person can open to compare. */
  readonly path: string | null;
}

type OwnProject = { readonly uri: string; readonly name: string; readonly links: readonly string[]; readonly group: string | null };

/**
 * The project this draft most likely already is, before Weave creates a new one: first among the account's
 * own projects, personal and its groups' (a Ma Earth organization is a Certified group), then in the public
 * list, which holds every listed Certified project, Ma Earth's included. Names must agree as the duplicate
 * rule says (`duplicates.ts`). Only a warning: the person decides. A public list that cannot be read finds
 * nothing there, and the warning still covers the account's own projects.
 */
export async function possibleDuplicate(
  card: { readonly name: string; readonly links: readonly string[] },
  own: readonly OwnProject[],
  signal: AbortSignal,
  search: (name: string, signal: AbortSignal) => Promise<readonly PublicProjectCard[]> = searchPublicProjects,
): Promise<PossibleDuplicate | null> {
  const mine = likelyDuplicate(card, own);
  if (mine)
    return { uri: mine.uri, name: mine.name, where: "yours", byline: mine.group ? `A project of ${mine.group} on Certified.` : "Your personal project on Certified.",
      path: projectAddress(mine.uri) };
  let found: readonly PublicProjectCard[] = [];
  try {
    found = await search(card.name, signal);
  } catch {
    if (signal.aborted) throw signal.reason;
  }
  const ownUris = new Set(own.map((project) => project.uri));
  const listed = likelyDuplicate(card, found.filter((project) => !ownUris.has(project.uri)).map((project) => ({ ...project, links: [] as string[] })));
  return listed
    ? { uri: listed.uri, name: listed.name, where: "public", byline: listed.publisher ? `Shared by ${listed.publisher}.` : "Shared on Certified.",
      path: projectAddress(listed.uri) }
    : null;
}

/** The public list's first page for a name: enough to see an existing project with the same name. */
async function searchPublicProjects(name: string, signal: AbortSignal): Promise<readonly PublicProjectCard[]> {
  const page = await requestPublicProjects(publicProjectsPath(name), signal);
  return page.index.status === "off" ? [] : page.projects;
}
