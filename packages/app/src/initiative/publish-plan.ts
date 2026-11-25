import { record, uuid } from "@weave/api/account-contract";
import type { DeviceDraft } from "../describe/contracts.ts";
import { publicListingReview, type PublicReview } from "../partners/public-support-state.ts";

/**
 * The public finish to the intake (QA notes, 25 November 2026): the person chooses needs and offers,
 * signs in with Certified, chooses one of their projects, sees exactly what will be public and where,
 * and confirms once. Weave then runs the reviewed publications and shows each entry's result.
 *
 * Signing in and Certified's permission screens leave the page, so the plan is kept in the tab's own
 * storage, under the draft's ID, until it is finished or abandoned. It holds no words of the draft:
 * the draft stays in the device's store and the public fields come back from the server's review.
 * Each prepared listing keeps the request ID its publication is sent with, so every retry of one
 * confirmation sends the same request and the server answers it once (support-publication.ts).
 */

export type PublishKind = "need" | "offer";
export interface PublishEntry { readonly kind: PublishKind; readonly entryId: string }

/** A kept need or offer on the card, and whether it can be made public as it stands. */
export interface PublishCandidate extends PublishEntry {
  readonly title: string;
  /** A public listing names at least one kind of support, as the server requires. */
  readonly publishable: boolean;
}

/** One listing the server reviewed, with the request its one publication is sent with. */
export interface PreparedListing extends PublishEntry {
  readonly review: PublicReview;
  readonly requestId: string;
  readonly savedRevision: number;
  readonly entryRevision: number;
  /** When the server's review lapses. Publishing after it needs a new review. */
  readonly reviewExpiresAt: string;
}

/**
 * Where one confirmed publication stands:
 * - `published`, `publish_pending`, `conflict`: the server's state for the listing.
 * - `unconfirmed`: the request was sent and no answer came back, so its outcome is unknown.
 * - `review_lapsed`: the server no longer holds the review and never took the request.
 */
export type ListingState = "published" | "publish_pending" | "conflict" | "unconfirmed" | "review_lapsed";
export interface ListingResult extends PublishEntry {
  readonly title: string;
  readonly state: ListingState;
  readonly problem: string | null;
}

export interface PublishPlan {
  readonly version: 1;
  readonly draftId: string;
  /** The account the plan belongs to: null until the person signs in, then theirs alone. */
  readonly owner: string | null;
  readonly selected: readonly PublishEntry[];
  readonly prepared: readonly PreparedListing[];
  /** Set once the person confirmed. From then on the plan only retries the same requests or checks them. */
  readonly confirmed: boolean;
  readonly results: readonly ListingResult[];
  /** Kept until this time, in milliseconds, so an abandoned plan does not reopen days later. */
  readonly until: number;
}

/** How long a plan waits for the person to come back from Certified. */
export const PLAN_LIFETIME_MS = 60 * 60_000;
const key = (draftId: string) => `weave-publish-plan/${draftId}`;
type PlanStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** The kept needs and offers of a card, in the card's order, each with whether it can be published. */
export function publishCandidates(draft: Pick<DeviceDraft, "needs" | "offers">): PublishCandidate[] {
  return (["needs", "offers"] as const).flatMap((list) =>
    draft[list].items
      .filter((item) => item.decision === "kept")
      .map((item) => ({
        kind: list === "needs" ? "need" as const : "offer" as const,
        entryId: item.id,
        title: item.value.title,
        publishable: item.value.capitalForms.length > 0,
      })),
  );
}

export const sameEntry = (a: PublishEntry, b: PublishEntry) => a.kind === b.kind && a.entryId === b.entryId;

export function newPlan(draftId: string, owner: string | null, selected: readonly PublishEntry[], now = Date.now()): PublishPlan {
  return { version: 1, draftId, owner, selected: [...selected], prepared: [], confirmed: false, results: [], until: now + PLAN_LIFETIME_MS };
}

const entry = (value: unknown): PublishEntry => {
  const item = record(value);
  if ((item.kind !== "need" && item.kind !== "offer") || !uuid(item.entryId)) throw Error("invalid_plan");
  return { kind: item.kind, entryId: item.entryId };
};
const STATES: readonly ListingState[] = ["published", "publish_pending", "conflict", "unconfirmed", "review_lapsed"];

/** The stored plan, checked field by field. Anything else, or an old one, counts as no plan and is removed. */
export function readPlan(storage: PlanStorage | undefined, draftId: string, now = Date.now()): PublishPlan | null {
  let text: string | null = null;
  try { text = storage?.getItem(key(draftId)) ?? null; } catch { return null; }
  if (!text) return null;
  try {
    const value = record(JSON.parse(text));
    if (value.version !== 1 || value.draftId !== draftId || typeof value.until !== "number" || value.until <= now
      || (value.owner !== null && !uuid(value.owner)) || typeof value.confirmed !== "boolean"
      || !Array.isArray(value.selected) || !Array.isArray(value.prepared) || !Array.isArray(value.results)
      || value.selected.length > 50 || value.prepared.length > 50 || value.results.length > 50) throw Error("invalid_plan");
    const selected = value.selected.map(entry);
    const prepared = value.prepared.map((input): PreparedListing => {
      const item = record(input);
      const savedRevision = item.savedRevision, entryRevision = item.entryRevision;
      if (!uuid(item.requestId) || !Number.isSafeInteger(savedRevision) || !Number.isSafeInteger(entryRevision)
        || typeof item.reviewExpiresAt !== "string" || !Number.isFinite(Date.parse(item.reviewExpiresAt))) throw Error("invalid_plan");
      const review = record(item.review);
      // The review is checked again exactly as it was when the server sent it.
      const checked = publicListingReview({ ...review, audience: "public-atproto", expectedRevision: savedRevision, expectedEntryRevision: entryRevision,
        record: { ...record(review.record), $type: "com.regencommons.weave.supportListing", status: "open" } }, savedRevision as number, entryRevision as number);
      const { kind, entryId } = entry(item);
      if (checked.record.kind !== kind) throw Error("invalid_plan");
      return { kind, entryId, review: checked, requestId: item.requestId, savedRevision: savedRevision as number,
        entryRevision: entryRevision as number, reviewExpiresAt: item.reviewExpiresAt };
    });
    const results = value.results.map((input): ListingResult => {
      const item = record(input);
      if (typeof item.title !== "string" || !STATES.includes(item.state as ListingState)
        || (item.problem !== null && typeof item.problem !== "string")) throw Error("invalid_plan");
      return { ...entry(item), title: item.title, state: item.state as ListingState, problem: item.problem as string | null };
    });
    return { version: 1, draftId, owner: value.owner as string | null, selected, prepared, confirmed: value.confirmed, results, until: value.until };
  } catch {
    clearPlan(storage, draftId);
    return null;
  }
}

/** Stores the plan. False when the tab cannot store it, so the caller can say a sign-in would lose it. */
export function writePlan(storage: PlanStorage | undefined, plan: PublishPlan): boolean {
  try {
    if (!storage) return false;
    storage.setItem(key(plan.draftId), JSON.stringify(plan));
    return true;
  } catch {
    return false;
  }
}

export function clearPlan(storage: PlanStorage | undefined, draftId: string): void {
  try { storage?.removeItem(key(draftId)); } catch { /* Nothing stored, or nothing to remove. */ }
}

/** A plan made before sign-in becomes the account's; one made by another account is not this one's. */
export function adoptPlan(plan: PublishPlan | null, owner: string | null): PublishPlan | null {
  if (!plan) return null;
  if (!owner) return plan.owner === null ? plan : null;
  if (plan.owner === null) return { ...plan, owner };
  return plan.owner === owner ? plan : null;
}

/** What the person does next, from what the plan holds and what Weave knows now. */
export type PublishStep = "choose" | "sign-in" | "project" | "group" | "prepare" | "review" | "results";

export function publishStep(plan: PublishPlan | null, now: {
  readonly signedIn: boolean;
  /** The Certified project the card is linked to, if any. */
  readonly project: { readonly uri: string; readonly group: string | null } | null;
}): PublishStep {
  if (!plan || !plan.selected.length) return "choose";
  if (plan.confirmed) return "results";
  if (!now.signedIn) return "sign-in";
  if (!now.project) return "project";
  if (now.project.group) return "group";
  return plan.prepared.length === plan.selected.length ? "review" : "prepare";
}

/**
 * Whether the prepared reviews can still be confirmed: every one is for the card's saved revision and
 * the project the card is linked to now, and none has lapsed. Otherwise the preview is prepared again,
 * so an unreviewed revision can never be published.
 */
export function reviewsCurrent(plan: PublishPlan, saved: { readonly revision: number } | null, projectUri: string | null, now = Date.now()): boolean {
  return !!saved && !!projectUri && plan.prepared.length === plan.selected.length && plan.prepared.every((item) =>
    item.savedRevision === saved.revision && item.review.record.projectUri === projectUri && Date.parse(item.reviewExpiresAt) > now + 15_000);
}

/** The exact publication request for one prepared listing. Retrying sends this again, unchanged. */
export function publishCommand(workspaceId: string, item: PreparedListing) {
  return { action: "support_publish" as const, workspaceId, reviewId: item.review.reviewId, requestId: item.requestId,
    audience: "public-atproto" as const, confirmPublic: true as const };
}

/** The server's answer for one listing, as a result. An unknown status is kept as unconfirmed. */
export function listingResult(item: PreparedListing, answer: unknown): ListingResult {
  const value = record(answer);
  const status = value.status;
  const state: ListingState = status === "published" || status === "publish_pending" || status === "conflict" ? status : "unconfirmed";
  return { kind: item.kind, entryId: item.entryId, title: item.review.record.title, state,
    problem: typeof value.problem === "string" ? value.problem : null };
}

/** Results that still need something: a check, the same request again, or Certified's permission. */
export const unfinished = (results: readonly ListingResult[]) => results.filter((result) => result.state !== "published");
export const needsPermission = (results: readonly ListingResult[]) => results.some((result) =>
  result.state === "publish_pending" && (result.problem === "authorization_required" || result.problem === "project_consent_required"));

/** One line per entry after the confirmation, so confirmed and pending listings are told apart. */
export function resultLine(result: ListingResult): string {
  switch (result.state) {
    case "published":
      return "Public. Weave read it back from your project's repository.";
    case "publish_pending":
      return result.problem === "authorization_required" || result.problem === "project_consent_required"
        ? "Waiting for Certified's permission to publish. Nothing is public yet."
        : "Sent, and waiting to be confirmed. Check again in a moment.";
    case "conflict":
      return "The public record was changed outside Weave. Check it on Certified before publishing again.";
    case "unconfirmed":
      return "Weave could not confirm this one. Try again: the same request is sent, so it is never published twice.";
    case "review_lapsed":
      return "Its preview lapsed before it was sent, so nothing was published. Prepare the preview again to publish it.";
  }
}

/** The one line the result step opens with, counted against every listing the person confirmed, sent or not yet. */
export function resultsSummary(results: readonly ListingResult[], total = results.length): string {
  const done = results.filter((result) => result.state === "published").length;
  if (done === total) return `${done === 1 ? "Your listing is" : `All ${done} listings are`} public, and Weave read ${done === 1 ? "it" : "each one"} back from your project's repository.`;
  const sending = total - results.length;
  return `${done} of ${total} ${total === 1 ? "listing is" : "listings are"} confirmed public.${sending > 0 ? ` ${sending} still ${sending === 1 ? "is" : "are"} being sent.` : " The rest say what is left."}`;
}
