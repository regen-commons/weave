import { record, uuid } from "@weave/api/account-contract";
import { publicListingPage, publicSupportStatuses } from "../partners/public-support-state.ts";
import { publicListingsLine } from "./status.ts";

export type ProjectRequest = (body: Record<string, unknown>, signal: AbortSignal) => Promise<Record<string, unknown>>;

/** Where a project's public listings stand, and Weave's link to the project that holds them. */
export interface ProjectListings {
  readonly workspaceId: string;
  readonly line: string;
}

/**
 * The public listings Weave holds for a person's own project, found by the project alone, so they can be
 * checked and withdrawn with no saved card (DL-155). Your Initiative shows them beside a card linked to the
 * project, which on another device means starting one from the project in Your Initiatives. Null when Weave
 * has no link to the project or nothing from it is public or on its way, so the page shows no row.
 */
export async function projectListings(projectUri: string, request: ProjectRequest, signal: AbortSignal): Promise<ProjectListings | null> {
  const link = record(await request({ action: "lookup", projectUri }, signal));
  signal.throwIfAborted();
  if (link.status !== "linked") return null;
  if (!uuid(link.workspaceId) || link.projectUri !== projectUri) throw Error("invalid_project_link");
  // Every page, so a public listing behind a page of withdrawn ones is still counted.
  const listings: { status: string }[] = [];
  let cursor: string | null = null;
  for (let pages = 0; ; pages++) {
    if (pages === 20) throw Error("too_many_listing_pages");
    const page = publicListingPage(await request({ action: "support_state", workspaceId: link.workspaceId, ...(cursor ? { cursor } : {}) }, signal),
      link.workspaceId);
    signal.throwIfAborted();
    listings.push(...page.listings);
    cursor = page.nextCursor;
    if (!cursor) break;
  }
  const current = listings.filter((listing) => listing.status !== "withdrawn");
  if (!current.length) return null;
  // Anything still on its way in or out, or changed elsewhere, is said before the count of what is public.
  const waiting = current.find((listing) => listing.status !== "published");
  const count = current.filter((listing) => listing.status === "published").length;
  return { workspaceId: link.workspaceId,
    line: waiting ? publicSupportStatuses[waiting.status]! : publicListingsLine(count) };
}
