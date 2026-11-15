import type { createHypercertsSource } from "./project-index-source.ts";

type Source = Pick<ReturnType<typeof createHypercertsSource>, "listProjects">;
type Listing = Awaited<ReturnType<Source["listProjects"]>>;
export type ListedProject = Extract<Listing, { status: "ok" }>["results"][number];
export type TraversalResult = {
  /** Complete only when the source omitted the final cursor. Anything else is not the source's whole view. */
  status: "complete" | "partial" | "failed";
  code: string | null;
  pages: number;
};

/** Page sizes to fall back to when a page is larger than its byte budget. */
const smallerPages = [25, 5, 1];
/** The longest wait the traversal accepts before retrying a page, inside its two-minute budget. */
const maxRetryWaitMs = 30_000;

/**
 * Follows the source's opaque cursors from the first page until it omits one. A failed page, a repeated
 * cursor, the page budget or the deadline ends the traversal early, and the caller learns which. A page
 * that is too large is read again with fewer records. An outage or a rate limit is retried up to
 * `attempts` times after a growing pause, never shorter than the server's Retry-After and never longer
 * than 30 seconds. A refused or malformed page is not retried.
 */
export async function traverseProjectNetwork(options: {
  source: Source;
  maxPages: number;
  onPage(results: readonly ListedProject[]): void;
  limit?: number;
  attempts?: number;
  wait?: (ms: number) => Promise<void>;
  now?: () => number;
  deadline?: number;
}): Promise<TraversalResult> {
  const { source, maxPages, onPage } = options;
  const limit = options.limit ?? 5;
  const attempts = options.attempts ?? 1;
  if (!Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 10_000) throw Error("invalid_page_budget");
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 5) throw Error("invalid_page_budget");
  const now = options.now ?? Date.now;
  const wait = options.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const late = () => options.deadline !== undefined && now() >= options.deadline;
  const cursors = new Set<string>();
  let cursor: string | undefined;
  let pages = 0;
  for (let page = 0; page < maxPages; page++) {
    let size = limit;
    let listing: Listing;
    for (let attempt = 1; ; ) {
      if (late()) return { status: "partial", code: "traversal_time_budget", pages };
      listing = await source.listProjects(cursor, size);
      if (listing.status === "ok") break;
      if (listing.code === "source_response_too_large") {
        const smaller = smallerPages.find((value) => value < size);
        if (smaller === undefined) return { status: "failed", code: listing.code, pages };
        size = smaller;
        continue;
      }
      // A rate limit waits at least as long as the server asked; an outage backs off on its own schedule.
      const requested = listing.code === "source_rate_limited" && "requestedWaitMs" in listing
        && typeof listing.requestedWaitMs === "number" ? listing.requestedWaitMs : 0;
      const pause = Math.max(requested, 2000 * attempt);
      if (attempt >= attempts || (listing.code !== "source_unavailable" && listing.code !== "source_rate_limited")
        || pause > maxRetryWaitMs) return { status: "failed", code: listing.code, pages };
      attempt++;
      await wait(pause);
    }
    pages++;
    onPage(listing.results);
    if (!listing.cursor) return { status: "complete", code: null, pages };
    if (cursors.has(listing.cursor)) return { status: "failed", code: "source_cursor_cycle", pages };
    cursors.add(listing.cursor);
    cursor = listing.cursor;
  }
  return { status: "partial", code: "page_budget_exhausted", pages };
}
