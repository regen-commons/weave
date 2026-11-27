import { record, uuid } from "@weave/api/account-contract";
import { AccountFailure, accountRequest } from "../account/client.ts";
import { publicListingReview, type PublicReview } from "../partners/public-support-state.ts";
import {
  DRAFT_REVISION, listingResult, matchesPreview, publishCommand, reviewCommand, sameEntry, showsPreview,
  type ListingFields, type ListingResult, type PreparedListing, type PublishEntry, type PublishPlan,
} from "./publish-plan.ts";

/** The one endpoint a publication uses: the project commands. Nothing is read from a private save (DL-155). */
export interface PublishRequests {
  project(body: Record<string, unknown>, signal: AbortSignal): Promise<Record<string, unknown>>;
}

export const browserRequests: PublishRequests = {
  project: (body, signal) => accountRequest("", body, "/api/projects", signal),
};

/** Why a preview could not be prepared, in the words the person reads. Nothing was published in any case. */
export class PreviewProblem extends Error {}

/** Weave's link to the plan's project, which every review and publication names. */
function linkedWorkspace(plan: PublishPlan): string {
  if (!plan.workspaceId) throw new PreviewProblem("Your project is not linked in Weave yet. Try again. Nothing was published.");
  return plan.workspaceId;
}

/**
 * Links the plan's personal project in Weave with no saved card behind it (DL-155), so Weave can keep its
 * record of what it publishes there. The server answers with the project's one link, made now or before,
 * so a retry never makes a second one.
 */
export async function linkForPublishing(plan: PublishPlan, requests: PublishRequests, signal: AbortSignal): Promise<PublishPlan> {
  if (plan.workspaceId) return plan;
  const projectUri = plan.projectUri;
  if (!projectUri) throw new PreviewProblem("Weave lost track of the project. Start again. Nothing was published.");
  let answer: Record<string, unknown>;
  try {
    answer = await requests.project({ action: "link", projectUri }, signal);
  } catch (error) {
    if (error instanceof AccountFailure && error.code === "project_consent_required") throw error;
    if (error instanceof AccountFailure && (error.code === "project_authority_required" || error.code === "project_verification_required"))
      throw new PreviewProblem("Certified did not confirm that this project is yours, so Weave cannot publish to it. Nothing was published.");
    throw new PreviewProblem("Weave could not link your project. Nothing was published. Try again.");
  }
  signal.throwIfAborted();
  const value = record(answer);
  if (value.status !== "linked" || !uuid(value.workspaceId) || value.projectUri !== projectUri || value.accessRole !== "admin")
    throw new PreviewProblem("Weave could not confirm the link to your project. Nothing was published. Try again.");
  return { ...plan, workspaceId: value.workspaceId };
}

/** One listing Weave holds for the project, as its state reads now. */
interface HeldListing extends PublishEntry { readonly status: string; readonly record: ListingFields }
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === "string");
const optional = (value: unknown) => value === undefined || typeof value === "string";

/** Every listing Weave holds for the project, through each page of its state. */
async function heldListings(workspaceId: string, requests: PublishRequests, signal: AbortSignal): Promise<HeldListing[]> {
  const unread = "Weave could not check what is already public. Nothing was published. Try again.";
  const held: HeldListing[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 20; page++) {
    let answer: Record<string, unknown>;
    try { answer = await requests.project({ action: "support_state", workspaceId, ...(cursor ? { cursor } : {}) }, signal); }
    catch (error) { throw error instanceof AccountFailure ? new PreviewProblem(unread) : error; }
    signal.throwIfAborted();
    if (answer.workspaceId !== workspaceId || !Array.isArray(answer.listings)) throw new PreviewProblem(unread);
    for (const input of answer.listings) {
      let item: Record<string, unknown>, fields: Record<string, unknown>;
      try { item = record(input); fields = record(item.record); } catch { throw new PreviewProblem(unread); }
      if ((item.kind !== "need" && item.kind !== "offer") || !uuid(item.entryId) || typeof item.status !== "string"
        || fields.kind !== item.kind || typeof fields.title !== "string" || !optional(fields.description) || !strings(fields.capitalForms)
        || (fields.lenses !== undefined && !strings(fields.lenses)) || !optional(fields.expiresAt)) throw new PreviewProblem(unread);
      held.push({ kind: item.kind, entryId: item.entryId, status: item.status, record: { kind: item.kind, title: fields.title,
        ...(fields.description === undefined ? {} : { description: fields.description as string }), capitalForms: fields.capitalForms,
        ...(fields.lenses === undefined ? {} : { lenses: fields.lenses as string[] }),
        ...(fields.expiresAt === undefined ? {} : { expiresAt: fields.expiresAt as string }) } });
    }
    if (answer.nextCursor === null) return held;
    if (typeof answer.nextCursor !== "string" || !answer.nextCursor) throw new PreviewProblem(unread);
    cursor = answer.nextCursor;
  }
  throw new PreviewProblem(unread);
}

/**
 * Asks the server to review each chosen need or offer exactly as the preview showed it, and keeps the
 * exact public records it returns with a new request ID each. One already public exactly as shown is kept
 * as it is and nothing is sent for it; one public with other details, or still on its way in or out,
 * must be withdrawn first, because publishing never replaces a listing by itself (DL-155). `only`
 * prepares just those entries again, as after a review lapsed; the others keep what they had.
 */
export async function prepareListings(
  plan: PublishPlan,
  requests: PublishRequests,
  signal: AbortSignal,
  only: readonly PublishEntry[] = plan.preview,
): Promise<PublishPlan> {
  const workspaceId = linkedWorkspace(plan);
  const held = await heldListings(workspaceId, requests, signal);
  const prepared: PreparedListing[] = [], unchanged: PublishEntry[] = [];
  for (const chosen of only) {
    const seen = plan.preview.find((item) => sameEntry(item, chosen));
    if (!seen) throw new PreviewProblem("A chosen need or offer is not in what you saw. Prepare the preview again. Nothing was published.");
    const current = held.find((item) => sameEntry(item, seen));
    const heldUp = () => new PreviewProblem(`Already public with other details, or still being published or withdrawn: ${seen.title}. Withdraw it under Public Listings first, then make it public again. Nothing was published.`);
    if (current && current.status !== "withdrawn") {
      if (current.status !== "published" || !showsPreview(current.record, seen)) throw heldUp();
      // Weave's stored state is not enough to call it public now: the record is read back from the repository.
      let check: Record<string, unknown>;
      try { check = await requests.project({ action: "support_reconcile", workspaceId, kind: seen.kind, entryId: seen.entryId }, signal); }
      catch (error) { throw error instanceof AccountFailure ? new PreviewProblem("Weave could not check what is already public. Nothing was published. Try again.") : error; }
      signal.throwIfAborted();
      if (check.status === "published") {
        unchanged.push({ kind: seen.kind, entryId: seen.entryId });
        continue;
      }
      // Removed outside Weave since, so it is published again below; anything else waits for its withdrawal.
      if (check.status !== "withdrawn") throw heldUp();
    }
    let answer: Record<string, unknown>;
    try {
      answer = await requests.project(reviewCommand(workspaceId, seen), signal);
    } catch (error) {
      throw error instanceof AccountFailure ? new PreviewProblem(reviewRefusal(error.code)) : error;
    }
    signal.throwIfAborted();
    const unchecked = "Weave could not check the preview. Nothing was published. Try again.";
    let review: PublicReview;
    try { review = publicListingReview(answer, DRAFT_REVISION, DRAFT_REVISION); }
    catch { throw new PreviewProblem(unchecked); }
    const lapses = record(answer).reviewExpiresAt;
    if (review.record.kind !== seen.kind || review.record.projectUri !== plan.projectUri
      || typeof lapses !== "string" || !Number.isFinite(Date.parse(lapses))) throw new PreviewProblem(unchecked);
    const item: PreparedListing = { kind: seen.kind, entryId: seen.entryId, review, requestId: crypto.randomUUID(), reviewExpiresAt: lapses };
    // The server builds the public record from the fields sent. It must be what the person saw, or nothing is published.
    if (!matchesPreview(item, plan.preview))
      throw new PreviewProblem("What Weave would publish differs from what you saw. Nothing was published. Try again.");
    prepared.push(item);
  }
  const again = (item: PublishEntry) => only.some((entry) => sameEntry(entry, item));
  // A listing still public for a need or offer the preview leaves out (closed or removed on this device) does not
  // follow the draft (DL-155), so the person is told, and withdraws it under Public Listings.
  const stillPublic = held.filter((item) => item.status !== "withdrawn" && !plan.preview.some((seen) => sameEntry(seen, item)))
    .map((item) => ({ kind: item.kind, entryId: item.entryId, title: item.record.title }));
  return {
    ...plan,
    stillPublic,
    unchanged: [...plan.unchanged.filter((item) => !again(item)), ...unchanged],
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
  // A draft's review conflicts only with a listing already public at its address.
  if (code === "support_conflict")
    return "This need or offer is already public, and must be withdrawn under Public Listings before it is published again. Nothing was published.";
  if (code === "invalid_support_command")
    return "Weave could not accept this need or offer as it is. Check it on your card, then try again. Nothing was published.";
  if (code === "rate_limited") return "Too many previews were prepared in a short time. Wait a few minutes, then try again. Nothing was published.";
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
  requests: PublishRequests,
  signal: AbortSignal,
  keep: (plan: PublishPlan) => void,
): Promise<PublishPlan> {
  const workspaceId = linkedWorkspace(plan);
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
  requests: PublishRequests,
  signal: AbortSignal,
  keep: (plan: PublishPlan) => void,
): Promise<PublishPlan> {
  const workspaceId = linkedWorkspace(plan);
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
