import {
  encodePublicProjectCursor, ORGANIZATION_TYPE_OPTIONS_MAX, parsePublicProjectQuery, searchText,
  type PublicProjectCard, type PublicProjectPage, type PublicProjectQuery,
} from "./public-projects-contract.ts";
import type { PublicProjectReader, PublicProjectSnapshot } from "./public-projects-store.ts";

/** A daily refresh can start up to an hour late, so the list is overdue after 26 hours. */
const STALE_AFTER_MS = 26 * 60 * 60 * 1000;
/**
 * Each function instance reads the whole list at most once a minute and answers every search and page
 * from that copy, so visitors' searches never reach the shared database.
 */
const SNAPSHOT_MS = 60_000;
/**
 * The read has a 4 s statement timeout, but a database that stops answering never times a statement out.
 * A read still running after this long fails, so requests get a quick 503 instead of hanging.
 */
const LOAD_TIMEOUT_MS = 6_000;
/**
 * Browsers keep a page for a minute. The CDN keeps it for five and may serve it for ten more while it
 * refreshes. With the instance copy, a withdrawal reaches every reader within about seventeen minutes of
 * the refresh that made it.
 */
const CACHED = { "Cache-Control": "public, max-age=60", "CDN-Cache-Control": "public, max-age=300, stale-while-revalidate=600" };
const NOT_CACHED = { "Cache-Control": "no-store" };

function respond(status: number, body: unknown, cache: Record<string, string> = NOT_CACHED) {
  return Response.json(body, { status, headers: {
    ...cache, "X-Content-Type-Options": "nosniff", ...(status === 405 ? { Allow: "GET" } : {}),
  } });
}

export function indexStatus(checkpoint: PublicProjectSnapshot["checkpoint"], now: number): PublicProjectPage["index"]["status"] {
  if (!checkpoint?.completedAt || checkpoint.offset !== 0) return "partial";
  return now - Date.parse(checkpoint.completedAt) > STALE_AFTER_MS ? "stale" : "bounded";
}

type Prepared = {
  cards: (PublicProjectCard & { search: string; organizationTypes: string[] })[];
  /** The kinds of group the shown projects' publishers name, most common first. */
  organizationTypes: string[];
  checkpoint: PublicProjectSnapshot["checkpoint"];
};
/** Newest first; ties keep a fixed order by address, which the cursor relies on. */
const later = (a: Pick<PublicProjectCard, "sharedAt" | "uri">, b: Pick<PublicProjectCard, "sharedAt" | "uri">) =>
  a.sharedAt !== b.sharedAt ? a.sharedAt > b.sharedAt : a.uri > b.uri;

function prepare(snapshot: PublicProjectSnapshot): Prepared {
  const cards = snapshot.cards.map(({ text, ...card }) => ({
    ...card, search: searchText([card.name, card.publisher, card.place, text].filter(Boolean).join(" ")),
  }));
  const counts = new Map<string, number>();
  for (const { organizationTypes } of cards)
    for (const type of organizationTypes) counts.set(type, (counts.get(type) ?? 0) + 1);
  // Most common first, ties by name, and `other`, which narrows to no particular kind, always last.
  const organizationTypes = [...counts]
    .sort(([a, m], [b, n]) => Number(a === "other") - Number(b === "other") || n - m || (a < b ? -1 : a > b ? 1 : 0))
    .slice(0, ORGANIZATION_TYPE_OPTIONS_MAX).map(([type]) => type);
  return { cards: cards.sort((a, b) => later(a, b) ? -1 : later(b, a) ? 1 : 0), organizationTypes, checkpoint: snapshot.checkpoint };
}

/** One page of the matching cards after the cursor, and how many match in all. */
export function selectPublicProjects(prepared: Prepared, query: PublicProjectQuery) {
  const { organizationType, terms } = query;
  const matched = terms.length || organizationType
    ? prepared.cards.filter(({ search, organizationTypes }) => terms.every((term) => search.includes(term))
      && (!organizationType || organizationTypes.includes(organizationType)))
    : prepared.cards;
  const rest = query.cursor ? matched.filter((card) => later(query.cursor!, card)) : matched;
  return {
    projects: rest.slice(0, query.limit).map(({ search: _search, organizationTypes: _types, ...card }): PublicProjectCard => card),
    more: rest.length > query.limit,
    total: matched.length,
  };
}

/**
 * Serves one page of shown projects. It needs no session and sets no cookie, so pages are cacheable.
 * Before the list is switched on it answers an empty `off` page, so the app keeps its starter list without
 * an error. Errors carry a stable code only, never a database message, and are not cached.
 */
export function createPublicProjectsHandler(options: {
  /** null while the list is not switched on. A connection failure rejects. */
  reader(): Promise<PublicProjectReader | null>;
  now?: () => number;
  loadTimeoutMs?: number;
}) {
  const now = options.now ?? Date.now;
  const loadTimeoutMs = options.loadTimeoutMs ?? LOAD_TIMEOUT_MS;
  let copy: { at: number; prepared: Promise<Prepared> } | undefined;
  function snapshot(reader: PublicProjectReader): Promise<Prepared> {
    if (copy && now() - copy.at < SNAPSHOT_MS) return copy.prepared;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error("load_timeout")), loadTimeoutMs); });
    const current = { at: now(), prepared: Promise.race([reader.load(), late]).then(prepare).finally(() => clearTimeout(timer)) };
    copy = current;
    // A failed read is tried again by the next request instead of being kept for a minute.
    current.prepared.catch(() => { if (copy === current) copy = undefined; });
    return current.prepared;
  }
  return async (request: Request): Promise<Response> => {
    if (request.method !== "GET") return respond(405, { error: "method_not_allowed" });
    let query;
    try { query = parsePublicProjectQuery(new URL(request.url)); }
    catch { return respond(400, { error: "invalid_project_query" }); }
    let prepared: Prepared;
    try {
      const reader = await options.reader();
      if (!reader) {
        const off: PublicProjectPage = { index: { status: "off", checkedAt: null, total: 0 }, projects: [], next: null };
        return respond(200, off);
      }
      prepared = await snapshot(reader);
    } catch {
      return respond(503, { error: "public_projects_unavailable" });
    }
    const { projects, more, total } = selectPublicProjects(prepared, query);
    const last = projects.at(-1);
    const page: PublicProjectPage = {
      index: {
        status: indexStatus(prepared.checkpoint, now()), checkedAt: prepared.checkpoint?.completedAt ?? null, total,
        ...(prepared.organizationTypes.length ? { organizationTypes: prepared.organizationTypes } : {}),
      },
      projects,
      next: more && last ? encodePublicProjectCursor({ sharedAt: last.sharedAt, uri: last.uri }) : null,
    };
    return respond(200, page, CACHED);
  };
}
