import type { ProjectEvidence } from "@weave/api/partner-matcher";
import { rankPartners } from "@weave/api/partner-ranking";
import { projectPassages, projectSlug, projectUriOf } from "@weave/api/public-projects-contract";
import { privatePartnerQueries, projectSuggestions, type ProjectSuggestion } from "./certified-suggestions.ts";
import { requestPublicProjects, type PublicProjectCard } from "./public-projects.ts";

/**
 * One public Certified project at its own address in Weave, so a person can open it, read it and share
 * it (22 November 2026). The address rule, `/initiatives/<account>-<record>`, and the rule for saying a
 * project's words once belong to the list itself, in `@weave/api/public-projects-contract`, which the
 * record pages' link previews read too.
 */
export { projectPassages, projectSlug, projectUriOf };

/** The project's Weave address, or null where it has none. */
export function projectAddress(uri: string): string | null {
  const slug = projectSlug(uri);
  return slug ? `/initiatives/${slug}` : null;
}

/** The same-origin request for one project's card. */
export const publicProjectPath = (uri: string): string => `/api/public-projects?uri=${encodeURIComponent(uri)}`;

/**
 * Cards the person has already seen in a list, so the one they open shows at once instead of loading
 * again. Kept in memory only, for this tab, and never more than a few pages' worth.
 */
const seen = new Map<string, PublicProjectCard>();
const SEEN_MAX = 120;

export function rememberProject(card: PublicProjectCard): void {
  seen.delete(card.uri);
  seen.set(card.uri, card);
  while (seen.size > SEEN_MAX) seen.delete(seen.keys().next().value!);
}

export const rememberedProject = (uri: string): PublicProjectCard | undefined => seen.get(uri);

/** What the list said about one project: its card, or why there is none. */
export type ProjectLookup =
  | { status: "found"; card: PublicProjectCard }
  /** Not on the list: never listed, withdrawn by its publisher, or not read by Weave yet. */
  | { status: "missing" }
  /** The list is not switched on here, so no project can be found. */
  | { status: "off" };

/**
 * One project's card from the list, or why there is none. A refusal, timeout or unexpected answer
 * rejects. Only a card at exactly this address counts, so an answer for another project is never shown
 * as this one.
 */
export async function requestPublicProject(uri: string, signal: AbortSignal, request: typeof fetch = fetch): Promise<ProjectLookup> {
  const page = await requestPublicProjects(publicProjectPath(uri), signal, request);
  if (page.index.status === "off") return { status: "off" };
  const card = page.projects.find((candidate) => candidate.uri === uri);
  return card ? { status: "found", card } : { status: "missing" };
}

/** What a project's page says when the list has no card for it. */
export function missingLine(status: "missing" | "off"): string {
  return status === "off"
    ? "Shared initiatives are not switched on here yet, so this one cannot be shown."
    : "This initiative is not on the public list. Its publisher may have withdrawn it, or Weave may not have read it yet.";
}

/**
 * How to reach the initiative, said honestly: Weave makes no introductions, so the way is the publisher's
 * own links where it shared any (DL-154). Null while its own answer has not come.
 */
export function contactLine(hasLinks: boolean | null): string {
  if (hasLinks === null) return "Weave makes no introductions yet.";
  return hasLinks
    ? "Weave makes no introductions yet. Their own links may say how to reach them."
    : "Weave makes no introductions yet, and this initiative has shared no links to reach it.";
}

/** The person's needs and offers as the partner search reads them: the kept items of the card on screen. */
type Entry = Parameters<typeof privatePartnerQueries>[2][number];

/**
 * How this project could partner with the person's own initiative, worked out on this device from the
 * card's open needs and offers and the project's own words on its card. Nothing about the person leaves
 * the device. Null when the card names no open need or offer to compare, and a suggestion with no fits
 * when the words share nothing.
 *
 * The project's words are read as its work, never as an offer or a request it made, so every fit here is
 * a possible fit, as in Partners for you (DL-052).
 */
export function projectFit(
  card: PublicProjectCard,
  initiative: { id: string; revision: number; needs: readonly Entry[]; offers: readonly Entry[]; card?: unknown },
  now = Date.now(),
): ProjectSuggestion | null {
  // Ranked as Partners for you ranks, with the card read for what the initiative does (DL-144), so the two never disagree.
  const queries = privatePartnerQueries(initiative.id, initiative.revision, initiative.needs, initiative.offers, initiative.card);
  if (!queries.length) return null;
  const evidence: ProjectEvidence[] = projectPassages(card).map((passage, index) => ({
    id: `${card.uri}#card-${index}`,
    projectUri: card.uri,
    projectName: card.name,
    sourceUri: card.uri,
    sourceUrl: card.sourceUrl,
    cid: "",
    contentHash: "",
    fieldPath: `passages/${index}`,
    passage,
    sourceCreatedAt: card.sharedAt,
    sourceIndexedAt: card.checkedAt,
    fetchedAt: card.checkedAt,
    extractionVersion: "public-card",
    kind: "work",
  }));
  const matches = rankPartners({ queries, publicEvidence: evidence, now, limitPerEntryAndKind: 1 });
  return projectSuggestions(matches, queries)[0] ?? { id: card.uri, name: card.name, fits: [], passages: [] };
}
