import { rankPartnerMatches, type ProjectEvidence } from "@weave/api/partner-matcher";
import { PROJECT_COLLECTION } from "@weave/api/public-projects-contract";
import { privatePartnerQueries, projectSuggestions, type ProjectSuggestion } from "./certified-suggestions.ts";
import { requestPublicProjects, type PublicProjectCard } from "./public-projects.ts";

/**
 * One public Certified project at its own address in Weave, so a person can open it, read it and share
 * it (22 November 2026). The address is `/initiatives/<did>-<record>`: the project's account and record
 * key, both written in lower-case base32, joined by a hyphen neither can contain. Every project the
 * index lists today has an address of this shape. One that does not (a `did:web` account, or a record
 * key that is not a timestamp ID) has no page, and its card keeps its name unlinked.
 */
const PLC = /^did:plc:([a-z2-7]{24})$/u;
const TID = /^[a-z2-7]{13}$/u;
const SLUG = /^([a-z2-7]{24})-([a-z2-7]{13})$/u;

/** The project's part of its Weave address, or null where it has none. */
export function projectSlug(uri: string): string | null {
  if (!uri.startsWith("at://")) return null;
  const [did, collection, key, ...rest] = uri.slice(5).split("/");
  const account = PLC.exec(did ?? "")?.[1];
  return account && collection === PROJECT_COLLECTION && key && TID.test(key) && !rest.length ? `${account}-${key}` : null;
}

/** The project's Weave address, or null where it has none. */
export function projectAddress(uri: string): string | null {
  const slug = projectSlug(uri);
  return slug ? `/initiatives/${slug}` : null;
}

/** The Certified project an address names, or null where the address names none. */
export function projectUriOf(slug: string): string | null {
  const parts = SLUG.exec(slug);
  return parts ? `at://did:plc:${parts[1]}/${PROJECT_COLLECTION}/${parts[2]}` : null;
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

/**
 * One project's card from the list, or null when the list does not show it: never listed, withdrawn by
 * its publisher, or the list is switched off here. A refusal, timeout or unexpected answer rejects.
 * Only a card at exactly this address counts, so an answer for another project is never shown as this one.
 */
export async function requestPublicProject(uri: string, signal: AbortSignal, request: typeof fetch = fetch): Promise<PublicProjectCard | null> {
  const page = await requestPublicProjects(publicProjectPath(uri), signal, request);
  return page.projects.find((card) => card.uri === uri) ?? null;
}

/**
 * The project's own words, each said once. A Certified project often has a short description that is its
 * long one cut off with an ellipsis, so a passage that only begins another is left out.
 */
export function projectPassages(card: Pick<PublicProjectCard, "passages">): string[] {
  const opening = (passage: string) => passage.trim().replace(/(\.\.\.|…)$/u, "").trim();
  return card.passages.filter((passage, index) => {
    const start = opening(passage);
    return !card.passages.some((other, at) => at !== index && other.trim() !== passage.trim() && other.trim().startsWith(start))
      && card.passages.findIndex((other) => other.trim() === passage.trim()) === index;
  });
}

/** The longest description a link preview or a share carries before it is cut at a word. */
export const SUMMARY_MAX = 160;

/** The project's own words in one short line, cut at a word where they run long. */
export function projectSummary(card: Pick<PublicProjectCard, "passages">): string {
  const words = projectPassages(card).join(" ").replace(/\s+/gu, " ").trim();
  if (words.length <= SUMMARY_MAX) return words;
  const cut = words.slice(0, SUMMARY_MAX - 1);
  const end = cut.lastIndexOf(" ");
  return `${(end > SUMMARY_MAX / 2 ? cut.slice(0, end) : cut).replace(/[\s,.;:]+$/u, "")}…`;
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
  initiative: { id: string; revision: number; needs: readonly Entry[]; offers: readonly Entry[] },
  now = Date.now(),
): ProjectSuggestion | null {
  const queries = privatePartnerQueries(initiative.id, initiative.revision, initiative.needs, initiative.offers);
  if (!queries.length) return null;
  const evidence: ProjectEvidence[] = card.passages.map((passage, index) => ({
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
  const matches = rankPartnerMatches({ queries, publicEvidence: evidence, now, limitPerEntryAndKind: 1 });
  return projectSuggestions(matches, queries)[0] ?? { id: card.uri, name: card.name, fits: [], passages: [] };
}
