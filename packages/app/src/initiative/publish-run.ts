import { parseMatchingState, type MatchingState } from "@weave/api/matching-contract";
import { record } from "@weave/api/account-contract";
import { AccountFailure, accountRequest } from "../account/client.ts";
import { publicListingReview } from "../partners/public-support-state.ts";
import {
  listingResult, matchesPreview, publishCommand, sameEntry,
  type ListingResult, type PreparedListing, type PublishEntry, type PublishPlan,
} from "./publish-plan.ts";

/** The two endpoints a publication uses: the project commands and the matching state of the saved card. */
export interface PublishRequests {
  project(body: Record<string, unknown>, signal: AbortSignal): Promise<Record<string, unknown>>;
  matchingState(workspaceId: string, signal: AbortSignal): Promise<MatchingState>;
}

export const browserRequests: PublishRequests = {
  project: (body, signal) => accountRequest("", body, "/api/projects", signal),
  async matchingState(workspaceId, signal) {
    const state = parseMatchingState(await accountRequest("", { action: "state", initiativeId: workspaceId }, "/api/matching", signal));
    if (state.initiativeId !== workspaceId) throw new AccountFailure("matching_unavailable");
    return state;
  },
};

/** Why a preview could not be prepared, in the words the person reads. Nothing was published in any case. */
export class PreviewProblem extends Error {}

/**
 * Asks the server to review each chosen entry of the saved card, the project's workspace, at its
 * current revision, and keeps the exact public records it returns with a new request ID each. `only`
 * prepares just those entries again, as after a review lapsed; the others keep what they had.
 */
export async function prepareListings(
  plan: PublishPlan,
  workspaceId: string,
  saved: { readonly revision: number },
  requests: PublishRequests,
  signal: AbortSignal,
  only: readonly PublishEntry[] = plan.preview,
): Promise<PublishPlan> {
  const matching = await requests.matchingState(workspaceId, signal);
  signal.throwIfAborted();
  if (matching.initiativeRevision !== saved.revision)
    throw new PreviewProblem("Your saved card changed while the preview was prepared. Prepare it again.");
  const prepared: PreparedListing[] = [];
  for (const chosen of only) {
    const entry = matching.entries.find((item) => sameEntry(item, chosen));
    if (!entry) throw new PreviewProblem("A chosen need or offer is not in the saved card. Check your card, then prepare the preview again.");
    let answer: Record<string, unknown>;
    try {
      answer = await requests.project({ action: "support_review", workspaceId, kind: entry.kind, entryId: entry.entryId,
        expectedRevision: saved.revision, expectedEntryRevision: entry.revision, expiresAt: null }, signal);
    } catch (error) {
      throw error instanceof AccountFailure ? new PreviewProblem(reviewRefusal(error.code)) : error;
    }
    signal.throwIfAborted();
    const review = publicListingReview(answer, saved.revision, entry.revision);
    const lapses = record(answer).reviewExpiresAt;
    if (review.record.kind !== entry.kind || typeof lapses !== "string" || !Number.isFinite(Date.parse(lapses)))
      throw new PreviewProblem("Weave could not check the preview. Nothing was published. Try again.");
    const item: PreparedListing = { kind: entry.kind, entryId: entry.entryId, review, requestId: crypto.randomUUID(),
      savedRevision: saved.revision, entryRevision: entry.revision, reviewExpiresAt: lapses };
    // The server builds the public record from the saved card. It must be what the person saw, or nothing is published.
    if (!matchesPreview(item, plan.preview))
      throw new PreviewProblem("What Weave would publish differs from what you saw, because the card changed. Look at it again before making it public. Nothing was published.");
    prepared.push(item);
  }
  const again = (item: PublishEntry) => only.some((entry) => sameEntry(entry, item));
  return {
    ...plan,
    prepared: [...plan.prepared.filter((item) => !again(item)), ...prepared],
    results: plan.results.filter((item) => !again(item)),
  };
}

/**
 * Creates the personal Certified project from the draft, at the record keys the plan chose before anything
 * was sent. A retry sends the same request, and the server answers with the project it already made, so
 * there is never a second one. Certified's permission is asked for by the caller when the server says so.
 */
export async function createProject(plan: PublishPlan, requests: PublishRequests, signal: AbortSignal): Promise<PublishPlan> {
  const creation = plan.creation;
  if (!creation || plan.projectUri) return plan;
  let answer: Record<string, unknown>;
  try {
    answer = await requests.project({ action: "create_personal_project", requestId: creation.requestId, projectRkey: creation.projectRkey,
      ...(creation.locationRkey && creation.place ? { locationRkey: creation.locationRkey, place: creation.place } : {}),
      title: creation.title, description: creation.description }, signal);
  } catch (error) {
    if (error instanceof AccountFailure && error.code === "project_consent_required") throw error;
    if (error instanceof AccountFailure && error.code === "project_conflict")
      throw new PreviewProblem("Certified already holds a different record at the address Weave chose. Nothing was published. Start again to choose a new one.");
    throw new PreviewProblem("Certified did not confirm the new project. Nothing was published. Try again: the same request is sent, so no second project is made.");
  }
  const value = record(answer);
  if (value.status !== "created" || typeof value.projectUri !== "string"
    || !value.projectUri.startsWith("at://") || !value.projectUri.endsWith(`/org.hypercerts.collection/${creation.projectRkey}`))
    throw new PreviewProblem("Certified did not confirm the new project. Nothing was published. Try again.");
  return { ...plan, projectUri: value.projectUri };
}

function reviewRefusal(code: string): string {
  if (code === "support_conflict" || code === "invalid_support_command")
    return "This need or offer changed, or it is already public and must be withdrawn before it is published again. Nothing was published.";
  if (code === "workspace_edit_required") return "Certified did not confirm that you can publish to this project. Nothing was published.";
  if (code === "project_consent_required") return "Weave needs Certified's permission to check your project first. Nothing was published.";
  if (code === "support_group_lifecycle_unverified") return "Publishing for group projects is paused until safe withdrawal is verified. Nothing was published.";
  return "The preview could not be prepared. Nothing was published. Try again.";
}

/** The result for a request that got no usable answer. A refused review was never taken, so nothing was sent. */
function failedResult(item: PreparedListing, error: unknown): ListingResult {
  const code = error instanceof AccountFailure ? error.code : "";
  const base = { kind: item.kind, entryId: item.entryId, title: item.review.record.title };
  if (code === "support_conflict" || code === "invalid_support_command") return { ...base, state: "review_lapsed", problem: code };
  if (code === "project_consent_required") return { ...base, state: "publish_pending", problem: "project_consent_required" };
  return { ...base, state: "unconfirmed", problem: code || null };
}

const resultFor = (plan: PublishPlan, item: PublishEntry) => plan.results.find((result) => sameEntry(result, item));
const replaced = (plan: PublishPlan, result: ListingResult): PublishPlan =>
  ({ ...plan, results: [...plan.results.filter((item) => !sameEntry(item, result)), result] });

/**
 * The one confirmation: sends each prepared listing's publication once, in order, and stores each
 * result as it arrives through `keep`, so a closed tab or a redirect never loses which were sent.
 * A listing that already has a result is not sent again here; `checkListings` follows it up.
 */
export async function publishListings(
  plan: PublishPlan,
  workspaceId: string,
  requests: PublishRequests,
  signal: AbortSignal,
  keep: (plan: PublishPlan) => void,
): Promise<PublishPlan> {
  let current: PublishPlan = { ...plan, confirmed: true };
  keep(current);
  for (const item of current.prepared) {
    if (resultFor(current, item)) continue;
    let result: ListingResult;
    try {
      result = listingResult(item, await requests.project(publishCommand(workspaceId, item), signal));
    } catch (error) {
      if (signal.aborted) throw error;
      result = failedResult(item, error);
    }
    current = replaced(current, result);
    keep(current);
  }
  return current;
}

/**
 * Follows up every listing not yet confirmed: the same publication request again where its answer was
 * lost, and a status check for one the server holds as pending, which goes on only with Certified's
 * permission and only from the server's one durable claim. A lapsed review is left for a new preview.
 */
export async function checkListings(
  plan: PublishPlan,
  workspaceId: string,
  requests: PublishRequests,
  signal: AbortSignal,
  keep: (plan: PublishPlan) => void,
): Promise<PublishPlan> {
  let current = plan;
  for (const item of current.prepared) {
    const before = resultFor(current, item);
    if (!before || before.state === "published" || before.state === "review_lapsed") continue;
    let result: ListingResult;
    try {
      const answer = before.state === "unconfirmed"
        ? await requests.project(publishCommand(workspaceId, item), signal)
        : await requests.project({ action: "support_reconcile", workspaceId, kind: item.kind, entryId: item.entryId }, signal);
      result = listingResult(item, answer);
    } catch (error) {
      if (signal.aborted) throw error;
      result = before.state === "unconfirmed" ? failedResult(item, error) : { ...before, problem: error instanceof AccountFailure ? error.code : before.problem };
    }
    current = replaced(current, result);
    keep(current);
  }
  return current;
}
