import { record, uuid } from "@weave/api/account-contract";
import type { DeviceDraft } from "../describe/contracts.ts";
import { publicListingReview, type PublicReview } from "../partners/public-support-state.ts";
import { TID } from "./tid.ts";

/**
 * The public finish to the intake (DL-148, revised 25 November 2026: "put the whole draft on Certified").
 * The person sees their initiative as its public page will show it, then confirms once. Weave then creates
 * a personal Certified project from the draft (unless the card is already linked to one), links the project
 * in Weave so it can keep a record of what it publishes there, has the server review each need and offer
 * exactly as the preview showed it, checks that each review is what was previewed, and publishes them.
 * Nothing is saved privately first: the draft stays on this device (DL-155).
 *
 * Signing in and Certified's permission screen leave the page, so the plan is kept in the tab's own storage
 * under the draft's ID until it is finished or abandoned. It keeps what was previewed and the record keys
 * the project and its place are created at, chosen before anything is sent, so a retried creation names
 * the same records and can never make a second project. Each prepared listing keeps the request ID its
 * publication is sent with, so a retry sends the same request and the server answers it once.
 */

export type PublishKind = "need" | "offer";
export interface PublishEntry { readonly kind: PublishKind; readonly entryId: string }

/**
 * A draft's review names no saved revision. The server answers 0 for both, and an answer naming another
 * is not a review of the draft, so it is refused.
 */
export const DRAFT_REVISION = 0;

/** One listing the server reviewed, with the request its one publication is sent with. */
export interface PreparedListing extends PublishEntry {
  readonly review: PublicReview;
  readonly requestId: string;
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

/** A need or offer exactly as the preview showed it: the fields its public listing carries. */
export interface PreviewListing extends PublishEntry {
  readonly title: string;
  readonly description: string | null;
  readonly capitalForms: readonly string[];
  /** The card's types of work, which every listing from it carries. */
  readonly lenses: readonly string[];
}

/** The personal Certified project to create from the draft, with the record keys its one creation uses. */
export interface ProjectCreation {
  readonly requestId: string;
  readonly projectRkey: string;
  /** The key of its place record, or null where the draft names no place. */
  readonly locationRkey: string | null;
  readonly title: string;
  readonly description: string;
  readonly place: string | null;
}

export interface PublishPlan {
  /** 3 since DL-155: the listings are reviewed from the draft. A plan from an earlier build is not continued. */
  readonly version: 3;
  readonly draftId: string;
  /** The account the plan belongs to: null until the person signs in, then theirs alone. */
  readonly owner: string | null;
  /** What the person saw and confirmed. A review that differs from it stops the publication. */
  readonly preview: readonly PreviewListing[];
  /** The project to create, or null to publish to the project the card is linked to. */
  readonly creation: ProjectCreation | null;
  /** The project the listings go to, once created or known. */
  readonly projectUri: string | null;
  /** Weave's link to that project, where it keeps its record of the listings, once the project is linked. */
  readonly workspaceId: string | null;
  /** Set by the one confirmation. From then on the plan goes on by itself, after Certified's screens too. */
  readonly confirmed: boolean;
  /** Entries already public exactly as the preview shows them, read back from the repository, so nothing is sent for them. */
  readonly unchanged: readonly PublishEntry[];
  /** Listings still public for needs or offers the preview leaves out, closed or removed on this device, to withdraw. */
  readonly stillPublic: readonly (PublishEntry & { readonly title: string })[];
  readonly prepared: readonly PreparedListing[];
  readonly results: readonly ListingResult[];
  /** Kept until this time, in milliseconds, so an abandoned plan does not reopen days later. */
  readonly until: number;
}

/** How long a plan waits for the person to come back from Certified. */
export const PLAN_LIFETIME_MS = 60 * 60_000;
const key = (draftId: string) => `weave-publish-plan/${draftId}`;
type PlanStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/**
 * The draft's kept needs and offers as their public listings will read, in the card's order, and the ones
 * left out: those no longer open (met, withdrawn or expired), since a listing is published as open, and those
 * with no kind of support, which a listing needs. Each listing carries the card's types of work.
 */
export function publishPreview(draft: Pick<DeviceDraft, "needs" | "offers" | "confirmed">): {
  listings: PreviewListing[]; withoutKind: PublishEntry[]; closed: PublishEntry[];
} {
  const kept = (["needs", "offers"] as const).flatMap((list) =>
    draft[list].items.filter((item) => item.decision === "kept").map((item) => ({ list, item })));
  const lenses = [...draft.confirmed?.lenses ?? []];
  const listings: PreviewListing[] = [], withoutKind: PublishEntry[] = [], closed: PublishEntry[] = [];
  for (const { list, item } of kept) {
    const kind = list === "needs" ? "need" as const : "offer" as const;
    if (item.value.status !== "open") { closed.push({ kind, entryId: item.id }); continue; }
    if (!item.value.capitalForms.length) { withoutKind.push({ kind, entryId: item.id }); continue; }
    const description = typeof item.value.description === "string" && item.value.description.trim() ? item.value.description : null;
    listings.push({ kind, entryId: item.id, title: item.value.title, description, capitalForms: [...item.value.capitalForms], lenses: [...lenses] });
  }
  return { listings, withoutKind, closed };
}

const graphemes = new Intl.Segmenter();
/** The longest project name Certified takes, in characters as a reader counts them. A card's name can be longer. */
export const PROJECT_NAME_LIMIT = 80;
/** Whether a card's name fits a Certified project record: 1 to 80 characters (graphemes), 800 bytes, one line. */
export function projectNameFits(name: string): boolean {
  const value = name.trim();
  return !!value && !/\p{Cc}/u.test(value) && new TextEncoder().encode(value).length <= 800
    && [...graphemes.segment(value)].length <= PROJECT_NAME_LIMIT;
}
/** The card's places as one line of up to 120 characters, keeping whole places only. */
function placeLine(locations: readonly string[]): string | null {
  let line = "";
  for (const location of locations.map((item) => item.replace(/\s+/gu, " ").trim()).filter(Boolean)) {
    const next = line ? `${line}, ${location}` : location;
    if (next.length > 120) break;
    line = next;
  }
  return line || null;
}

/** The project Weave creates from the draft: its confirmed name, description and places, as the card shows them. */
export function projectFromDraft(draft: Pick<DeviceDraft, "confirmed">, keys: () => string, requestId: string = crypto.randomUUID()): ProjectCreation | null {
  const card = draft.confirmed;
  if (!card || !projectNameFits(card.name)) return null;
  const place = placeLine(card.locations);
  return { requestId, projectRkey: keys(), locationRkey: place ? keys() : null, title: card.name.trim(), description: card.description.trim(), place };
}

export const sameEntry = (a: PublishEntry, b: PublishEntry) => a.kind === b.kind && a.entryId === b.entryId;

export function newPlan(draftId: string, owner: string | null, preview: readonly PreviewListing[], creation: ProjectCreation | null,
  projectUri: string | null = null, now = Date.now()): PublishPlan {
  return { version: 3, draftId, owner, preview: [...preview], creation, projectUri, workspaceId: null, confirmed: false, unchanged: [], stillPublic: [], prepared: [],
    results: [], until: now + PLAN_LIFETIME_MS };
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
    if (value.version !== 3 || value.draftId !== draftId || typeof value.until !== "number" || value.until <= now
      || (value.owner !== null && !uuid(value.owner)) || typeof value.confirmed !== "boolean"
      || !Array.isArray(value.preview) || !Array.isArray(value.unchanged) || !Array.isArray(value.stillPublic) || !Array.isArray(value.prepared) || !Array.isArray(value.results)
      || value.preview.length > 50 || value.unchanged.length > 50 || value.stillPublic.length > 100 || value.prepared.length > 50 || value.results.length > 50
      || (value.projectUri !== null && (typeof value.projectUri !== "string" || !value.projectUri.startsWith("at://")))
      || (value.workspaceId !== null && !uuid(value.workspaceId)) || (value.workspaceId !== null && value.projectUri === null)) throw Error("invalid_plan");
    const strings = (list: unknown): list is string[] => Array.isArray(list) && list.every((item) => typeof item === "string");
    const preview = value.preview.map((input): PreviewListing => {
      const item = record(input);
      if (typeof item.title !== "string" || (item.description !== null && typeof item.description !== "string")
        || !strings(item.capitalForms) || !strings(item.lenses)) throw Error("invalid_plan");
      return { ...entry(item), title: item.title, description: item.description as string | null,
        capitalForms: [...item.capitalForms], lenses: [...item.lenses] };
    });
    const creation = value.creation === null ? null : (() => {
      const item = record(value.creation);
      if (!uuid(item.requestId) || typeof item.projectRkey !== "string" || !TID.test(item.projectRkey)
        || (item.locationRkey !== null && (typeof item.locationRkey !== "string" || !TID.test(item.locationRkey)))
        || typeof item.title !== "string" || typeof item.description !== "string"
        || (item.place !== null && typeof item.place !== "string") || (item.place === null) !== (item.locationRkey === null)) throw Error("invalid_plan");
      return { requestId: item.requestId, projectRkey: item.projectRkey, locationRkey: item.locationRkey as string | null,
        title: item.title, description: item.description, place: item.place as string | null };
    })();
    const prepared = value.prepared.map((input): PreparedListing => {
      const item = record(input);
      if (!uuid(item.requestId) || typeof item.reviewExpiresAt !== "string" || !Number.isFinite(Date.parse(item.reviewExpiresAt))) throw Error("invalid_plan");
      const review = record(item.review);
      // The review is checked again exactly as it was when the server sent it.
      const checked = publicListingReview({ ...review, audience: "public-atproto", expectedRevision: DRAFT_REVISION, expectedEntryRevision: DRAFT_REVISION,
        record: { ...record(review.record), $type: "com.regencommons.weave.supportListing", status: "open" } }, DRAFT_REVISION, DRAFT_REVISION);
      const { kind, entryId } = entry(item);
      if (checked.record.kind !== kind) throw Error("invalid_plan");
      return { kind, entryId, review: checked, requestId: item.requestId, reviewExpiresAt: item.reviewExpiresAt };
    });
    const results = value.results.map((input): ListingResult => {
      const item = record(input);
      if (typeof item.title !== "string" || !STATES.includes(item.state as ListingState)
        || (item.problem !== null && typeof item.problem !== "string")) throw Error("invalid_plan");
      return { ...entry(item), title: item.title, state: item.state as ListingState, problem: item.problem as string | null };
    });
    const unchanged = value.unchanged.map(entry);
    const stillPublic = value.stillPublic.map((input) => {
      const item = record(input);
      if (typeof item.title !== "string") throw Error("invalid_plan");
      return { ...entry(item), title: item.title };
    });
    return { version: 3, draftId, owner: value.owner as string | null, preview, creation, projectUri: value.projectUri as string | null,
      workspaceId: value.workspaceId as string | null, confirmed: value.confirmed, unchanged, stillPublic, prepared, results, until: value.until };
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

/**
 * What the dialog does next. Before the confirmation it shows the preview (or asks to sign in first);
 * after it, it goes on by itself: create the project, link the card and Weave to it, have each listing
 * reviewed from the draft, then publish them.
 */
export type PublishStep = "preview" | "sign-in" | "create" | "link" | "review" | "publish" | "done";

export function nextStep(plan: PublishPlan | null, now: {
  readonly signedIn: boolean;
  /** The Certified project the card is linked to now, if any. */
  readonly linked: string | null;
}): PublishStep {
  if (!plan?.confirmed) return now.signedIn || !plan ? "preview" : "sign-in";
  if (!now.signedIn) return "sign-in";
  if (plan.creation && !plan.projectUri) return "create";
  if (now.linked !== plan.projectUri || !plan.workspaceId) return "link";
  if (plan.prepared.length + plan.unchanged.length < plan.preview.length) return "review";
  if (plan.results.length < plan.prepared.length) return "publish";
  return "done";
}

/** The same strings, in any order, each once. */
const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((item) => b.includes(item));

/** The public fields of a listing record, as a review or the server's state carries them. */
export interface ListingFields {
  readonly kind: PublishKind;
  readonly title: string;
  readonly description?: string;
  readonly capitalForms: readonly string[];
  readonly lenses?: readonly string[];
  readonly expiresAt?: string;
}
/** True when a listing record says exactly what the preview showed for that need or offer, and stays open until withdrawn. */
export function showsPreview(listing: ListingFields, seen: PreviewListing): boolean {
  return listing.kind === seen.kind && listing.title === seen.title && (listing.description ?? null) === seen.description
    && sameSet(listing.capitalForms, seen.capitalForms) && sameSet(listing.lenses ?? [], seen.lenses) && listing.expiresAt === undefined;
}

/** True when the server's review of a listing is exactly what the preview showed, so nothing unseen is published. */
export function matchesPreview(prepared: PreparedListing, preview: readonly PreviewListing[]): boolean {
  const seen = preview.find((item) => sameEntry(item, prepared));
  return !!seen && showsPreview(prepared.review.record, seen);
}

/** Every listing's outcome: the results of those sent, and those already public as shown, which count as published. */
export function settledResults(plan: PublishPlan): ListingResult[] {
  return [...plan.results, ...plan.unchanged.map((entry): ListingResult => ({ ...entry,
    title: plan.preview.find((item) => sameEntry(item, entry))?.title ?? "", state: "published", problem: null }))];
}

/**
 * The review of one need or offer exactly as the preview showed it. The server builds its public record from
 * these fields alone; nothing is read from a private save (DL-155). A listing stays open until it is withdrawn.
 */
export function reviewCommand(workspaceId: string, item: PreviewListing) {
  return { action: "support_review" as const, workspaceId, kind: item.kind, entryId: item.entryId, expiresAt: null,
    entry: { title: item.title, ...(item.description ? { description: item.description } : {}), capitalForms: [...item.capitalForms],
      ...(item.lenses.length ? { lenses: [...item.lenses] } : {}) } };
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
