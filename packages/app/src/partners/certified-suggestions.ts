import type { PublicEvidenceSnapshot } from "@weave/api/matching-contract";
import { rankPartnerMatches, type PartnerEntry } from "@weave/api/partner-matcher";

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
