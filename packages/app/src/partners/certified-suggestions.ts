import type { PublicEvidenceSnapshot } from "@weave/api/matching-contract";
import type { PartnerEntry } from "@weave/api/partner-matcher";
import { rankPartners, type RankedPartnerMatch } from "@weave/api/partner-ranking";

type DraftEntry = {
  id: string;
  value: { title?: unknown; description?: unknown; purpose?: unknown; status?: unknown; placeScope?: unknown; capitalForms?: unknown };
};
const text = (value: unknown) => (typeof value === "string" ? value : "");
const texts = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);

/**
 * The person's open, kept needs and offers as partner queries. Each carries its initiative's name,
 * description, places and themes, which the ranking reads for what the initiative does (DL-144). They
 * stay on this device: the snapshot request sends only the workspace.
 */
export function privatePartnerQueries(
  initiativeId: string, revision: number, needs: readonly DraftEntry[], offers: readonly DraftEntry[], initiative?: unknown,
): PartnerEntry[] {
  const card = initiative && typeof initiative === "object" ? (initiative as Record<string, unknown>) : {};
  const summary = {
    name: text(card.name), description: text(card.description), locations: texts(card.locations),
    isGlobal: card.isGlobal === true, lenses: texts(card.lenses), themes: texts(card.themes),
  };
  return (["need", "offer"] as const).flatMap((kind) =>
    (kind === "need" ? needs : offers).flatMap(({ id: entryId, value }) => {
      if (value.status !== "open" || typeof value.title !== "string" || !value.title.trim()) return [];
      const { title, description, purpose, placeScope } = value;
      return [{ initiativeId, revision, entryId, kind, summary, value: {
        status: "open", title,
        description: typeof description === "string" ? description : null,
        purpose: typeof purpose === "string" ? purpose : null,
        placeScope: typeof placeScope === "string" ? placeScope : null,
        capitalForms: texts(value.capitalForms),
      } }];
    }),
  );
}

/**
 * Ranks the draft's entries against the snapshot on this device: other projects' published listings as direct
 * fits (DL-155, step 5), then public project evidence.
 */
export function rankCertifiedSuggestions(
  workspaceId: string, queries: readonly PartnerEntry[], evidence: PublicEvidenceSnapshot["evidence"],
  listings: PublicEvidenceSnapshot["listings"] = [],
): RankedPartnerMatch[] {
  return rankPartners({ queries: queries.filter(({ initiativeId }) => initiativeId === workspaceId),
    publicEvidence: evidence, listings, limitPerEntryAndKind: 3 });
}

/** One project in Partners for you: every need and offer of the person's that it fits, and its words once. */
export type ProjectSuggestion = {
  id: string;
  name: string;
  fits: { query: PartnerEntry; match: RankedPartnerMatch }[];
  /** The project's own words, each passage once, with the source it came from. */
  passages: { text: string; sourceUrl: string | null }[];
};

/**
 * Groups ranked matches by project, so a project that fits a need and an offer shows once, naming both
 * (DL-052). Projects keep the order of their best match, and each keeps its fits in rank order.
 * `perEntry` keeps what a preview shows: only projects among the first few for some entry.
 */
export function projectSuggestions(
  matches: readonly RankedPartnerMatch[], queries: readonly PartnerEntry[], perEntry?: number,
): ProjectSuggestion[] {
  const queryOf = (match: RankedPartnerMatch) =>
    queries.find(({ kind, entryId }) => kind === match.query.kind && entryId === match.query.entryId);
  const shown = new Set<RankedPartnerMatch>();
  for (const query of queries) {
    const own = matches.filter((match) => queryOf(match) === query);
    for (const match of perEntry === undefined ? own : own.slice(0, perEntry)) shown.add(match);
  }
  const projects = new Map<string, ProjectSuggestion>();
  for (const match of matches) {
    const query = queryOf(match);
    if (!query || !shown.has(match)) continue;
    const project = projects.get(match.counterpart.id)
      ?? { id: match.counterpart.id, name: match.counterpart.name, fits: [], passages: [] };
    projects.set(project.id, project);
    project.fits.push({ query, match });
    const text = match.evidence.passage.trim();
    if (text && !project.passages.some((passage) => passage.text === text))
      project.passages.push({ text, sourceUrl: match.evidence.type === "public" ? match.evidence.sourceUrl : null });
  }
  return [...projects.values()];
}
