import {
  parseMatchingLeads, parseMatchingPreview, parseMatchingSearch, parseMatchingState,
  type MatchingLeadUpdate, type MatchingEntryRef, type MatchingEntryState,
  type MatchingLead, type MatchingSearch as SearchResponse, type MatchingState as AccountMatchingState,
} from "@weave/api/matching-contract";
import { accountRequest, AccountFailure } from "../account/client.ts";
import { SuggestionSchema } from "../describe/contracts.ts";
import { AskSchema } from "../intake/contracts.ts";
import { z } from "../validation.ts";

const revision = z.number().int().nonnegative();
const entryRef = z.object({
  kind: z.enum(["need", "offer"]),
  entryId: z.uuid(),
  revision,
  shareVersion: revision,
});
const reviewFields = z.object({
  summary: SuggestionSchema.pick({
    name: true,
    description: true,
    locations: true,
    isGlobal: true,
    lenses: true,
    themes: true,
  }),
  entries: z.array(entryRef.extend({ value: AskSchema })),
});
function parseReview(data: unknown) {
  const review = parseMatchingPreview(data);
  return { ...review, ...reviewFields.parse(review) };
}

export type EntryRef = MatchingEntryRef;
export type MatchingState = AccountMatchingState;
export type MatchingEntry = MatchingEntryState;
export type SharingPreview = ReturnType<typeof parseReview>;
export type NetworkLead = MatchingLead;
export type NetworkMatch = SearchResponse["results"][number];
export type MatchingSearch = SearchResponse;

type Commands = {
  state: Record<string, never>;
  preview: { initiativeRevision: number; entries: EntryRef[] };
  share: { reviewId: string; requestId: string };
  renew: { reviewId: string; requestId: string };
  withdraw: { entries: EntryRef[]; requestId: string };
  search: { entries?: EntryRef[] };
  leads: Record<string, never>;
  set_lead: MatchingLeadUpdate;
};
const responses = {
  state: parseMatchingState,
  preview: parseReview,
  share: parseMatchingState,
  renew: parseMatchingState,
  withdraw: parseMatchingState,
  search: parseMatchingSearch,
  leads: parseMatchingLeads,
  set_lead: parseMatchingLeads,
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

export function entryReference({ kind, entryId, revision, shareVersion }: EntryRef): EntryRef {
  return { kind, entryId, revision, shareVersion };
}

export function entryKey(entry: Pick<EntryRef, "kind" | "entryId">): string {
  return `${entry.kind}:${entry.entryId}`;
}

export function leadKey(entry: Pick<EntryRef, "kind" | "entryId">, candidateId: string): string {
  return `${entryKey(entry)}/${candidateId}`;
}

export type MatchingMutation =
  | { action: "share" | "renew"; input: Commands["share"] }
  | { action: "withdraw"; input: Commands["withdraw"] }
  | { action: "set_lead"; input: Commands["set_lead"] };

export function matchingMessage(error: unknown): string {
  switch (error instanceof AccountFailure ? error.code : "") {
    case "sign_in_required": return "Your session ended. Sign in again to continue matching.";
    case "matching_conflict": return "The saved entry changed. Refresh matching, then review the latest saved version.";
    case "connection_failed": return "Matching could not connect. Try again when you are online.";
    case "rate_limited": return "Wait a moment before trying matching again.";
    case "not_found": return "This saved initiative is no longer available in your account.";
    default: return "Matching is unavailable right now. Try again in a moment.";
  }
}
