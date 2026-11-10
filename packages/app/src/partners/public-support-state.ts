import { record, uuid } from "@weave/api/account-contract";
import { CAPITALS } from "../capitals.ts";
import { fullDate } from "../home.ts";

export const publicSupportStatuses: Record<string, string> = {
  published: "Public on AT Protocol", publish_pending: "Publication awaiting confirmation",
  withdrawal_pending: "Withdrawal awaiting confirmation", withdrawn: "Public withdrawal confirmed", conflict: "Public record changed elsewhere",
};
export type PublicListing = { kind: "need" | "offer"; entryId: string; status: string; title: string; problem: string | null };
export type PublicReview = { reviewId: string; destination: string; record: {
  projectUri: string; kind: "need" | "offer"; title: string; description?: string; capitalForms: string[];
  createdAt: string; updatedAt?: string; expiresAt?: string;
} };
const invalid = (): never => { throw Error("invalid_public_support_response"); };
const date = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/u.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().startsWith(value.slice(0, 10));
const text = (value: unknown, max: number): value is string => typeof value === "string" && value.length <= max;

export function publicListingPage(input: unknown, workspaceId: string) {
  const value = record(input);
  if (value.workspaceId !== workspaceId || !Array.isArray(value.listings) || value.listings.length > 100
      || (value.nextCursor !== null && (!text(value.nextCursor, 4096) || !value.nextCursor))) return invalid();
  const listings = value.listings.map((input): PublicListing => {
    const listing = record(input), publicRecord = record(listing.record);
    if (!uuid(listing.entryId) || (listing.kind !== "need" && listing.kind !== "offer")
        || typeof listing.status !== "string" || !Object.hasOwn(publicSupportStatuses, listing.status)
        || !text(publicRecord.title, 1400)) return invalid();
    return { kind: listing.kind, entryId: listing.entryId, status: listing.status, title: publicRecord.title,
      problem: typeof listing.problem === "string" ? listing.problem : null };
  });
  if (new Set(listings.map(row => `${row.kind}/${row.entryId}`)).size !== listings.length) return invalid();
  return { listings, nextCursor: value.nextCursor as string | null };
}

export function publicListingReview(input: unknown, savedRevision: number, entryRevision: number): PublicReview {
  const value = record(input), listing = record(value.record);
  const allowed = ["$type", "projectUri", "kind", "title", "description", "capitalForms", "status", "createdAt", "updatedAt", "expiresAt"];
  if (!uuid(value.reviewId) || value.audience !== "public-atproto" || !text(value.destination, 300)
      || !/^did:[a-z]+:[^/\s]+$/u.test(value.destination)
      || value.expectedRevision !== savedRevision || value.expectedEntryRevision !== entryRevision
      || Object.keys(listing).some(key => !allowed.includes(key)) || listing.$type !== "com.regencommons.weave.supportListing"
      || typeof listing.projectUri !== "string" || !listing.projectUri.startsWith(`at://${value.destination}/org.hypercerts.collection/`)
      || (listing.kind !== "need" && listing.kind !== "offer") || !text(listing.title, 1400) || !listing.title.trim()
      || (listing.description !== undefined && !text(listing.description, 6000))
      || !Array.isArray(listing.capitalForms) || !listing.capitalForms.length || listing.capitalForms.length > 8
      || listing.capitalForms.some(form => !CAPITALS.some(capital => capital.key === form))
      || new Set(listing.capitalForms).size !== listing.capitalForms.length || listing.status !== "open"
      || !date(listing.createdAt) || (listing.updatedAt !== undefined && !date(listing.updatedAt))
      || (listing.expiresAt !== undefined && !date(listing.expiresAt))) return invalid();
  return { reviewId: value.reviewId, destination: value.destination, record: {
    projectUri: listing.projectUri, kind: listing.kind, title: listing.title,
    ...(listing.description === undefined ? {} : { description: listing.description as string }),
    capitalForms: [...listing.capitalForms] as string[], createdAt: listing.createdAt,
    ...(listing.updatedAt === undefined ? {} : { updatedAt: listing.updatedAt as string }),
    ...(listing.expiresAt === undefined ? {} : { expiresAt: listing.expiresAt as string }),
  } };
}

/** Only reviewed public fields are shown; protocol keys and future private fields cannot become labels. */
export function publicReviewFacts({ record }: PublicReview) {
  const day = (value: string) => fullDate(new Date(value).toISOString().slice(0, 10));
  return [
    { term: "Listing", value: record.kind === "need" ? "What you need" : "What you can offer" },
    { term: "Title", value: record.title },
    ...(record.description ? [{ term: "Description", value: record.description }] : []),
    { term: "Kind of support", value: CAPITALS.filter(capital => record.capitalForms.includes(capital.key)).map(capital => capital.title).join(", ") },
    { term: "Availability", value: "Open" },
    { term: "First published", value: day(record.createdAt) },
    ...(record.updatedAt ? [{ term: "Last updated", value: day(record.updatedAt) }] : []),
    { term: "Sharing ends", value: record.expiresAt ? day(record.expiresAt) : "When you close or withdraw the listing" },
    { term: "Certified project", value: record.projectUri },
  ];
}

export function publicPublicationFeedback(status: unknown, problem: unknown) {
  if ((problem === "project_consent_required" || problem === "authorization_required")
      && (status === "publish_pending" || status === "withdrawal_pending")) return {
    consent: status === "withdrawal_pending" ? "withdraw-support" as const : "publish-support" as const,
    notice: status === "withdrawal_pending" ? "Withdrawal is waiting for Certified permission." : "Publishing is waiting for Certified permission.",
  };
  if (problem === "support_group_lifecycle_unverified") return { consent: null,
    notice: "Public publishing for groups is paused until safe withdrawal is verified. Your Weave entries are unchanged." };
  if (status === "withdrawal_pending" && problem === "forbidden") return { consent: null,
    notice: "A Certified group admin or the original publisher needs to confirm this withdrawal." };
  return { consent: null, notice: status === "published" ? "Published and read back from its repository."
    : status === "withdrawn" ? "Public withdrawal confirmed." : "The request is saved. Check its status again." };
}
