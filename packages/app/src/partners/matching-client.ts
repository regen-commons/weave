import {
  parseMatchingSearch, parseMatchingState, parsePublicEvidenceSnapshot,
  type PublicEvidenceSnapshot, type MatchingSearch as SearchResponse, type MatchingState as AccountMatchingState,
} from "@weave/api/matching-contract";
import { accountRequest, AccountFailure } from "../account/client.ts";

export type MatchingState = AccountMatchingState;
export type NetworkMatch = SearchResponse["results"][number];
export type MatchingSearch = SearchResponse;

/**
 * What the matching endpoint still answers (DL-155, step 5): `state`, which publishing a team's saved card reads
 * for its entries' revisions until step 6, and `listing_search`, partners for the project's published listings.
 * Sharing, its search and the saved partners kept on the server have ended; partners are kept on the device.
 */
type Commands = {
  state: Record<string, never>;
  listing_search: Record<string, never>;
};
const responses = {
  state: parseMatchingState,
  listing_search: parseMatchingSearch,
};

export async function matchingRequest<Action extends keyof Commands>(
  initiativeId: string,
  action: Action,
  input: Commands[Action],
  signal: AbortSignal,
): Promise<ReturnType<(typeof responses)[Action]>> {
  const data = await accountRequest("", { action, initiativeId, ...input }, "/api/matching", signal);
  try {
    const parsed = responses[action](data);
    if (parsed.initiativeId !== initiativeId) throw new Error("Unexpected initiative");
    return parsed as ReturnType<(typeof responses)[Action]>;
  } catch {
    throw new AccountFailure("matching_unavailable");
  }
}

export async function requestPublicEvidence(workspaceId: string, signal: AbortSignal): Promise<PublicEvidenceSnapshot> {
  const data = await accountRequest("", { action: "public_evidence", workspaceId }, "/api/projects", signal);
  try {
    const snapshot = parsePublicEvidenceSnapshot(data);
    if (snapshot.workspaceId !== workspaceId || Date.parse(snapshot.availableUntil) <= Date.now()) throw Error();
    return snapshot;
  } catch {
    throw new AccountFailure("public_evidence_unavailable");
  }
}
