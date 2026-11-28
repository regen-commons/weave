import { PROJECT_MODEL_VERSION } from "./project-index-vector.ts";
import { record } from "./account-contract.ts";
import { AccountError, createSupabaseWeaveRpc } from "./account-provider.ts";
import {
  parseListingShortlist, parseMatchingLeads, parseMatchingPreview, parseMatchingSearch, parseMatchingShortlist, parseMatchingState,
  parseProjectEvidence, type MatchingCommand, type MatchingCoverage, type MatchingLeads, type MatchingPreview, type MatchingSearch,
  type MatchingState,
} from "./matching-contract.ts";
import {
  PARTNER_ENGINE_VERSION, rankPartnerMatches, type ListingPartnerEntry, type ProjectEvidence, type SharedPartnerEntry,
} from "./partner-matcher.ts";
import { publicEvidenceForMatching } from "./partner-ranking.ts";

type MatchingResponse = MatchingState | MatchingPreview | MatchingLeads | MatchingSearch;
export interface MatchingProvider {
  execute(token: string, command: MatchingCommand): Promise<MatchingResponse>;
}
type WeaveRpc = ReturnType<typeof createSupabaseWeaveRpc>;

function rank(initiativeId: string, payload: unknown): MatchingSearch {
  const raw = record(payload);
  const groups = parseMatchingShortlist(raw.groups);
  const sharedByEntry: Record<string, SharedPartnerEntry[]> = {};
  const publicEvidenceByEntry: Record<string, ProjectEvidence[]> = {};
  const read = readPublicEvidence();
  groups.forEach(({ entry, candidates, publicEvidence, publicModelVersion }) => {
    if (entry.initiativeId !== initiativeId) throw Error("invalid_data");
    const key = `${entry.kind}:${entry.entryId}`;
    sharedByEntry[key] = candidates;
    if (publicModelVersion === PROJECT_MODEL_VERSION) read.modelUsed();
    const parsed = read.passages(publicEvidence);
    if (parsed) publicEvidenceByEntry[key] = publicEvidenceForMatching(entry, parsed);
  });
  return parseMatchingSearch({ initiativeId, coverage: read.coverage(groups.length > 0, raw.externalCoverage), results: rankPartnerMatches({
    queries: groups.map(group => group.entry),
    sharedByEntry,
    publicEvidenceByEntry,
    limitPerEntryAndKind: 5,
  }) });
}

/**
 * Partners for a linked project's published listings (DL-155, step 5): other projects' current listings of the
 * other kind, as direct fits, and public project evidence, ranked as a shared entry's were. The project's own
 * public evidence is never its own partner.
 */
function rankListings(workspaceId: string, payload: unknown): MatchingSearch {
  const { groups, externalCoverage } = parseListingShortlist(payload, workspaceId);
  const listingsByEntry: Record<string, ListingPartnerEntry[]> = {};
  const publicEvidenceByEntry: Record<string, ProjectEvidence[]> = {};
  const read = readPublicEvidence();
  for (const { query, projectUri, candidates, publicEvidence } of groups) {
    const key = `${query.kind}:${query.entryId}`;
    listingsByEntry[key] = candidates;
    const parsed = read.passages(publicEvidence);
    if (parsed) publicEvidenceByEntry[key] = publicEvidenceForMatching(query, parsed.filter(row => row.projectUri !== projectUri));
  }
  return parseMatchingSearch({ initiativeId: workspaceId, coverage: read.coverage(groups.length > 0, externalCoverage),
    results: rankPartnerMatches({ queries: groups.map(group => group.query), listingsByEntry, publicEvidenceByEntry,
      limitPerEntryAndKind: 5 }) });
}

/** Reads each query's public passages and says how complete the public evidence was. */
function readPublicEvidence() {
  let malformed = false, evidenceCount = 0, modelUsed = false;
  return {
    modelUsed() { modelUsed = true; },
    passages(evidence: unknown): ProjectEvidence[] | null {
      if (!Array.isArray(evidence) || evidence.length > 80) {
        malformed = true;
        return null;
      }
      return evidence.flatMap(value => {
        try {
          const row = parseProjectEvidence(value);
          evidenceCount++;
          return [row];
        } catch {
          malformed = true;
          return [];
        }
      });
    },
    coverage(joined: boolean, externalCoverage: unknown): MatchingCoverage {
      return coverageOf(joined, externalCoverage, { malformed, evidenceCount, modelUsed });
    },
  };
}

function coverageOf(joined: boolean, externalCoverage: unknown,
  { malformed, evidenceCount, modelUsed }: { malformed: boolean; evidenceCount: number; modelUsed: boolean }): MatchingCoverage {
  const raw = { externalCoverage };
  const coverage: MatchingCoverage = {
    shared: joined ? "available" : "not_joined",
    external: evidenceCount ? "partial" : "unavailable",
    corpusVersion: null,
    modelVersion: modelUsed ? PROJECT_MODEL_VERSION : null,
    engineVersion: PARTNER_ENGINE_VERSION,
  };
  if (raw.externalCoverage !== null && typeof raw.externalCoverage === "object" && !Array.isArray(raw.externalCoverage)) {
    const c = record(raw.externalCoverage);
    if (typeof c.corpusVersion === "string" && c.corpusVersion.length <= 200) {
      coverage.corpusVersion = c.corpusVersion;
      if (c.status === "stale") coverage.external = "stale";
      else if (c.status === "bounded" || c.status === "partial") {
        // Available describes the configured pilot, never the whole network.
        coverage.external = malformed ? evidenceCount ? "partial" : "unavailable"
          : c.status === "bounded" ? "available" : "partial";
      }
    }
  }
  return coverage;
}

export function createMatchingProvider(rpc: WeaveRpc): MatchingProvider {
  return {
    async execute(token, command) {
      const p_id = command.initiativeId;
      try {
        switch (command.action) {
          case "state":
            return parseMatchingState(await rpc("matching_state", { p_id }, token));
          case "preview":
            return parseMatchingPreview(await rpc("matching_preview", { p_id, p_revision: command.initiativeRevision,
              p_entries: command.entries, p_expires_at: command.expiresAt ?? null }, token));
          case "share":
          case "renew":
          case "withdraw":
            return parseMatchingState(await rpc("matching_change", { p_id, p_action: command.action,
              p_request_id: command.requestId, p_review_id: command.action === "withdraw" ? null : command.reviewId,
              p_entries: command.action === "withdraw" ? command.entries : null }, token));
          case "search":
            return rank(p_id, await rpc("matching_shortlist", { p_id, p_entries: command.entries ?? null }, token));
          case "listing_search":
            return rankListings(p_id, await rpc("listing_shortlist", {}, token));
          case "leads":
            return parseMatchingLeads(await rpc("matching_leads", { p_id }, token));
          case "set_lead":
            return parseMatchingLeads(await rpc("matching_set_lead", { p_id, p_entry: command.entry,
              p_candidate_id: command.candidateId, p_disposition: command.disposition, p_request_id: command.requestId }, token));
        }
      } catch (error) {
        if (error instanceof AccountError && error.status !== 503) {
          throw error.status === 409 ? new AccountError(409, "matching_conflict") : error;
        }
        throw new AccountError(503, "matching_unavailable");
      }
    },
  };
}
