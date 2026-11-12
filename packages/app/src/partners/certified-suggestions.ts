import type { PublicEvidenceSnapshot } from "@weave/api/matching-contract";
import { rankPartnerMatches, type PartnerEntry, type PartnerMatch } from "@weave/api/partner-matcher";

type DraftEntry = {
  id: string;
  value: { title?: unknown; description?: unknown; purpose?: unknown; status?: unknown; placeScope?: unknown };
};

export function privatePartnerQueries(
  initiativeId: string, revision: number, needs: readonly DraftEntry[], offers: readonly DraftEntry[],
): PartnerEntry[] {
  return (["need", "offer"] as const).flatMap((kind) =>
    (kind === "need" ? needs : offers).flatMap(({ id: entryId, value }) => {
      if (value.status !== "open" || typeof value.title !== "string" || !value.title.trim()) return [];
      const { title, description, purpose, placeScope } = value;
      return [{ initiativeId, revision, entryId, kind, summary: {}, value: {
        status: "open", title,
        description: typeof description === "string" ? description : null,
        purpose: typeof purpose === "string" ? purpose : null,
        placeScope: typeof placeScope === "string" ? placeScope : null,
      } }];
    }),
  );
}

export function rankCertifiedSuggestions(
  workspaceId: string, queries: readonly PartnerEntry[], evidence: PublicEvidenceSnapshot["evidence"],
) {
  return rankPartnerMatches({ queries: queries.filter(({ initiativeId }) => initiativeId === workspaceId),
    publicEvidence: evidence, limitPerEntryAndKind: 3 });
}

/** One project in Partners for you: every need and offer of the person's that it fits, and its words once. */
export type ProjectSuggestion = {
  id: string;
  name: string;
  fits: { query: PartnerEntry; match: PartnerMatch }[];
  /** The project's own words, each passage once, with the source it came from. */
  passages: { text: string; sourceUrl: string | null }[];
};

/**
 * Groups ranked matches by project, so a project that fits a need and an offer shows once, naming both
 * (DL-052). Projects keep the order of their best match, and each keeps its fits in rank order.
 * `perEntry` keeps what a preview shows: only projects among the first few for some entry.
 */
export function projectSuggestions(
  matches: readonly PartnerMatch[], queries: readonly PartnerEntry[], perEntry?: number,
): ProjectSuggestion[] {
  const queryOf = (match: PartnerMatch) =>
    queries.find(({ kind, entryId }) => kind === match.query.kind && entryId === match.query.entryId);
  const shown = new Set<PartnerMatch>();
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
