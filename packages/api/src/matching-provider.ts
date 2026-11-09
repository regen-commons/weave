import { PROJECT_MODEL_VERSION } from "./project-index-vector.ts";
import { record } from "./account-contract.ts";
import { AccountError, createSupabaseWeaveRpc } from "./account-provider.ts";
import {
  parseMatchingLeads, parseMatchingPreview, parseMatchingSearch, parseMatchingShortlist, parseMatchingState, parseProjectEvidence,
  type MatchingCommand, type MatchingCoverage, type MatchingLeads, type MatchingPreview, type MatchingSearch, type MatchingState,
} from "./matching-contract.ts";
import { PARTNER_ENGINE_VERSION, rankPartnerMatches, type ProjectEvidence, type SharedPartnerEntry } from "./partner-matcher.ts";

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
  let malformed = false, evidenceCount = 0, modelUsed = false;
  groups.forEach(({ entry, candidates, publicEvidence, publicModelVersion }) => {
    if (entry.initiativeId !== initiativeId) throw Error("invalid_data");
    const key = `${entry.kind}:${entry.entryId}`;
    sharedByEntry[key] = candidates;
    const evidence = publicEvidence;
    if (!Array.isArray(evidence) || evidence.length > 80) {
      malformed = true;
      return;
    }
    if (publicModelVersion === PROJECT_MODEL_VERSION) modelUsed = true;
    publicEvidenceByEntry[key] = evidence.flatMap(value => {
      try {
        const row = parseProjectEvidence(value);
        evidenceCount++;
        return [row];
      } catch {
        malformed = true;
        return [];
      }
    });
  });
  const coverage: MatchingCoverage = {
    shared: groups.length ? "available" : "not_joined",
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
  return parseMatchingSearch({ initiativeId, coverage, results: rankPartnerMatches({
    queries: groups.map(group => group.entry),
    sharedByEntry,
    publicEvidenceByEntry,
    limitPerEntryAndKind: 5,
  }) });
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
