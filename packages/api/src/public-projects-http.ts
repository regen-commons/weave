import {
  encodePublicProjectCursor, isOrganizationType, isProjectLabel, isWorkScope, ORGANIZATION_TYPE_OPTIONS_MAX, organizationTypeOf,
  parsePublicProjectQuery, searchText, WORK_SCOPE_OPTIONS_MAX, type PublicProjectCard, type PublicProjectCursor,
  type PublicProjectPage, type PublicProjectQuery, type PublicProjectSort,
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
  cards: (PublicProjectCard & { search: string; organizationTypes: string[]; workScopes: string[] })[];
  /** The kinds of group the shown projects' publishers name, most common first. */
  organizationTypes: string[];
  /** The kinds of work at least two shown projects name, most common first. */
  workScopes: string[];
  checkpoint: PublicProjectSnapshot["checkpoint"];
};
/**
 * A kind of work only one project names narrows the list to that project, so it is not offered. Publishers
 * make their own tags, and on 21 November 2026 about thirty of the kinds were named once each.
 */
const WORK_SCOPE_OFFER_MINIMUM = 2;

/**
 * The values the cards carry, most common first, ties by name, and `other`, which narrows to no
 * particular kind, always last. A value fewer than `minimum` cards carry is not offered.
 */
function offered(values: readonly (readonly string[])[], max: number, minimum = 1): string[] {
  const counts = new Map<string, number>();
  for (const list of values) for (const value of list) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].filter(([, n]) => n >= minimum)
    .sort(([a, m], [b, n]) => Number(a === "other") - Number(b === "other") || n - m || (a < b ? -1 : a > b ? 1 : 0))
    .slice(0, max).map(([value]) => value);
}
/** A card's place in an order: what the cursor records for it. */
const placeIn = (sort: PublicProjectSort, card: Pick<PublicProjectCard, "name" | "sharedAt" | "uri">): PublicProjectCursor =>
  ({ key: sort === "name" ? card.name : card.sharedAt, uri: card.uri });
/**
 * Names compare as people read them: case, accents and punctuation aside, numbers by value. Publishers put
 * titles in quotation marks, and "“Forest Friends”" belongs under F, not before every letter.
 */
const names = new Intl.Collator("en", { sensitivity: "base", numeric: true, ignorePunctuation: true });
const byAddress = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
/**
 * The order of two places in a sort: newest first, oldest first or name A to Z. Ties keep a fixed order by
 * address, which the cursor relies on.
 */
function compare(sort: PublicProjectSort, a: PublicProjectCursor, b: PublicProjectCursor): number {
  if (sort === "name") return names.compare(a.key, b.key) || byAddress(a.uri, b.uri);
  const oldestFirst = byAddress(a.key, b.key) || byAddress(a.uri, b.uri);
  return sort === "oldest" ? oldestFirst : -oldestFirst;
}

function prepare(snapshot: PublicProjectSnapshot): Prepared {
  const cards = snapshot.cards.map(({ text, publisher, place, organizationTypes, workScopes, ...card }) => {
    // The app refuses a whole page for one invalid value, so a stored value it would refuse is left out
    // here, and one bad row cannot send every visitor to the starter list. A row from before work scopes
    // were stored has none.
    const facts = { ...(isProjectLabel(publisher) ? { publisher } : {}), ...(isProjectLabel(place) ? { place } : {}) };
    const kinds = [...new Set(Array.isArray(organizationTypes) ? organizationTypes.filter(isOrganizationType).map(organizationTypeOf) : [])];
    const work = [...new Set(Array.isArray(workScopes) ? workScopes.filter(isWorkScope) : [])];
    return {
      ...card, ...facts, organizationTypes: kinds, workScopes: work,
      search: searchText([card.name, facts.publisher, facts.place, text].filter(Boolean).join(" ")),
    };
  });
  return {
    cards: cards.sort((a, b) => compare("newest", placeIn("newest", a), placeIn("newest", b))),
    organizationTypes: offered(cards.map(({ organizationTypes }) => organizationTypes), ORGANIZATION_TYPE_OPTIONS_MAX),
    workScopes: offered(cards.map(({ workScopes }) => workScopes), WORK_SCOPE_OPTIONS_MAX, WORK_SCOPE_OFFER_MINIMUM),
    checkpoint: snapshot.checkpoint,
  };
}

/**
 * One page of the matching cards after the cursor, and how many match in all. A query for one address
 * gets that project's card, or none where the list does not show it, as after its publisher withdrew it.
 */
export function selectPublicProjects(prepared: Prepared, query: PublicProjectQuery) {
  const { organizationType, workScope, terms, uri } = query;
  const matched = uri ? prepared.cards.filter((card) => card.uri === uri)
    : terms.length || organizationType || workScope
    ? prepared.cards.filter(({ search, organizationTypes, workScopes }) => terms.every((term) => search.includes(term))
      && (!organizationType || organizationTypes.includes(organizationType))
      && (!workScope || workScopes.includes(workScope)))
    : prepared.cards;
  // Cards are kept newest first; another order is sorted per request, a thousand cards at most.
  const { sort, cursor } = query;
  const ordered = sort === "newest" ? matched : [...matched].sort((a, b) => compare(sort, placeIn(sort, a), placeIn(sort, b)));
  const rest = cursor ? ordered.filter((card) => compare(sort, cursor, placeIn(sort, card)) < 0) : ordered;
  return {
    projects: rest.slice(0, query.limit)
      .map(({ search: _search, organizationTypes: _types, workScopes: _work, ...card }): PublicProjectCard => card),
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
        ...(prepared.workScopes.length ? { workScopes: prepared.workScopes } : {}),
      },
      projects,
      next: more && last ? encodePublicProjectCursor(placeIn(query.sort, last)) : null,
    };
    return respond(200, page, CACHED);
  };
}
