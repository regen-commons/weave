// GET /api/public-initiative?uri=<project AT URI> answers one public initiative for signed-out visitors: the
// project the public list shows at that address, with only the needs and offers Weave published to its public
// repository and confirmed by reading them back. Until WEAVE_PUBLIC_PROJECTS_ENABLED=true and
// WEAVE_INDEX_DATABASE_URL are set it answers `{ status: "off" }`, as the public list answers an `off` page.
// Nothing is cached, in the browser or the CDN, so a withdrawal or an expiry is gone from the next answer.
import { record } from "./account-contract.ts";
import { createCertifiedProjectProvider, organizationLinks, type CertifiedProjectProvider } from "./certified-project-provider.ts";
import { parseProjectUri } from "./project-uri.ts";
import {
  parsePublicInitiative, parsePublicInitiativeQuery, parsePublicSupportListing, PUBLIC_INITIATIVE_LISTINGS_MAX,
  PUBLISHER_LINKS_MAX, isPublicInitiativeLink, type PublicInitiative, type PublicInitiativeLink,
  type PublicInitiativeOff, type PublicSupportListing,
} from "./public-initiative-contract.ts";
import { connectPublicInitiativeReader, type PublicInitiativeReader, type StoredInitiative } from "./public-initiative-store.ts";
import {
  isOrganizationType, isProjectLabel, isWorkScope, ORGANIZATION_TYPES_MAX, organizationTypeOf, projectPassages, WORK_SCOPES_MAX,
} from "./public-projects-contract.ts";
import { parseSupportListing } from "./support-publication.ts";

/**
 * The read has a 4 s statement timeout, but a database that stops answering never times a statement out.
 * A read still running after this long fails, so visitors get a quick 503 instead of a hanging page.
 */
const LOAD_TIMEOUT_MS = 5_000;
/** Publisher links are read live and are optional: a slower read leaves them out rather than delaying the page. */
const LINKS_TIMEOUT_MS = 1_500;
const ORGANIZATION = "app.certified.actor.organization";
/** Every answer, error or not: no browser or CDN copy can outlive a withdrawal. */
const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const UNAVAILABLE = { error: "public_initiative_unavailable" };

function respond(status: number, body: unknown) {
  return Response.json(body, { status, headers: { ...HEADERS, ...(status === 405 ? { Allow: "GET" } : {}) } });
}

/** Reads the publisher's links for a project's repository DID. May reject or ignore the signal; the handler bounds it. */
export type PublisherLinkReader = (did: string, signal: AbortSignal) => Promise<unknown>;

/**
 * The web addresses on the organization record of the project's own repository, read through the Certified
 * read boundary: only plc.directory and the allowed PDS hosts are asked. An organization that is not public
 * shows none. A link's label is the record's own when it gives a valid one, otherwise the address's host.
 * Banners, avatars and every other image stay out: open decision D30 bars third-party images.
 */
export function readPublisherLinks(provider: Pick<CertifiedProjectProvider, "readRepoRecord">): PublisherLinkReader {
  return async (did, signal) => {
    const read = await provider.readRepoRecord(did, ORGANIZATION, "self", signal);
    if (!read.ok) return [];
    const value = read.value.value;
    if (value.$type !== ORGANIZATION || (value.visibility !== undefined && value.visibility !== "public") || value.unlisted === true)
      return [];
    return organizationLinks(value).map(({ url, label }): PublicInitiativeLink => ({ label: label ?? new URL(url).hostname, url }));
  };
}

function within<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error("timeout")), ms); });
  return Promise.race([work, late]).finally(() => clearTimeout(timer));
}

/** The links a page may show, or none when they cannot be read in time. Never an error. */
async function publisherLinks(read: PublisherLinkReader | null, did: string, request: Request, ms: number) {
  if (!read) return [];
  const stop = new AbortController();
  try {
    const links = await within(read(did, AbortSignal.any([request.signal, stop.signal, AbortSignal.timeout(ms)])), ms);
    if (!Array.isArray(links)) return [];
    const shown: PublicInitiativeLink[] = [];
    for (const link of links) {
      if (isPublicInitiativeLink(link) && !shown.some(({ url }) => url === link.url)) shown.push({ label: link.label, url: link.url });
      if (shown.length === PUBLISHER_LINKS_MAX) break;
    }
    return shown;
  } catch {
    return [];
  } finally {
    stop.abort();
  }
}

/**
 * The project as the index holds it, for exactly the address asked for. The name, words, dates and source
 * must be sound or the answer fails; a publisher, place or kind the app would refuse is left out, as the
 * public list leaves it out.
 */
function projectOf(value: unknown, uri: string) {
  const o = record(value);
  if (o.uri !== uri || !Array.isArray(o.passages) || !o.passages.every((passage) => typeof passage === "string"))
    throw Error("invalid_stored_project");
  return {
    uri, name: o.name, description: projectPassages({ passages: o.passages as string[] }),
    focus: [...new Set(Array.isArray(o.workScopes) ? o.workScopes.filter(isWorkScope) : [])].slice(0, WORK_SCOPES_MAX),
    organizationTypes: [...new Set(Array.isArray(o.organizationTypes)
      ? o.organizationTypes.filter(isOrganizationType).map(organizationTypeOf) : [])].slice(0, ORGANIZATION_TYPES_MAX),
    ...(isProjectLabel(o.publisher) ? { publisher: o.publisher } : {}),
    ...(isProjectLabel(o.place) ? { place: o.place } : {}),
    sharedAt: o.sharedAt, checkedAt: o.checkedAt, sourceUrl: o.sourceUrl,
  };
}

const newestFirst = (a: PublicSupportListing, b: PublicSupportListing) =>
  Date.parse(b.createdAt) - Date.parse(a.createdAt) || (a.uri < b.uri ? -1 : a.uri > b.uri ? 1 : 0);

/**
 * The listings to show, checked again here whatever the store returned: each must be a valid open listing
 * record under the draft Lexicon, name exactly this project, be of the kind it is filed as, sit in the
 * project's own repository and not have expired by `at`. Any that fails is left out, not the whole answer.
 */
function currentListings(value: unknown, uri: string, at: number) {
  if (!Array.isArray(value)) throw Error("invalid_stored_listings");
  const did = parseProjectUri(uri).did;
  const needs: PublicSupportListing[] = [], offers: PublicSupportListing[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    try {
      const row = record(item);
      const listing = parseSupportListing(row.record);
      if (row.kind !== listing.kind || listing.projectUri !== uri
        || (listing.expiresAt !== undefined && Date.parse(listing.expiresAt) <= at)) continue;
      const shown = parsePublicSupportListing({
        uri: row.uri, cid: row.cid, title: listing.title, description: listing.description ?? null,
        capitalForms: listing.capitalForms, createdAt: listing.createdAt, updatedAt: listing.updatedAt ?? null,
        expiresAt: listing.expiresAt ?? null,
      }, did);
      if (seen.has(shown.uri)) continue;
      seen.add(shown.uri);
      (listing.kind === "need" ? needs : offers).push(shown);
    } catch { /* Not a listing this page may show, so it is left out. */ }
  }
  return {
    needs: needs.sort(newestFirst).slice(0, PUBLIC_INITIATIVE_LISTINGS_MAX),
    offers: offers.sort(newestFirst).slice(0, PUBLIC_INITIATIVE_LISTINGS_MAX),
  };
}

/**
 * Serves one public initiative. It needs no session and sets no cookie. Errors carry a stable code only,
 * never a database or provider message, and nothing is logged.
 */
export function createPublicInitiative(options: {
  /** null while the public list is not switched on. A connection failure rejects. */
  reader(): Promise<PublicInitiativeReader | null>;
  /** null when Weave has no Certified read boundary configured, and the page shows no publisher links. */
  links(): PublisherLinkReader | null;
  now?: () => number;
  loadTimeoutMs?: number;
  linksTimeoutMs?: number;
}) {
  const now = options.now ?? Date.now;
  const loadTimeoutMs = options.loadTimeoutMs ?? LOAD_TIMEOUT_MS;
  const linksTimeoutMs = options.linksTimeoutMs ?? LINKS_TIMEOUT_MS;
  return async (request: Request): Promise<Response> => {
    if (request.method !== "GET") return respond(405, { error: "method_not_allowed" });
    let uri: string;
    try { uri = parsePublicInitiativeQuery(new URL(request.url)); }
    catch { return respond(400, { error: "invalid_uri" }); }
    let stored: StoredInitiative | null;
    try {
      const reader = await options.reader();
      if (!reader) return respond(200, { status: "off" } satisfies PublicInitiativeOff);
      stored = await within(reader.load(uri), loadTimeoutMs);
    } catch {
      return respond(503, UNAVAILABLE);
    }
    if (!stored) return respond(404, { error: "not_found" });
    let project: ReturnType<typeof projectOf>;
    try { project = projectOf(stored.project, uri); } catch { return respond(503, UNAVAILABLE); }
    let links: PublicInitiativeLink[] = [];
    try { links = await publisherLinks(options.links(), parseProjectUri(uri).did, request, linksTimeoutMs); } catch { /* None. */ }
    // Expiry is judged when the answer is made, after the slowest read.
    const at = now();
    let answer: PublicInitiative;
    try {
      const parsed = parsePublicInitiative({
        project: { ...project, publisherLinks: links }, ...currentListings(stored.listings, uri, at),
        checkedAt: new Date(at).toISOString(),
      });
      if ("status" in parsed) throw Error("invalid_public_initiative");
      answer = parsed;
    } catch {
      return respond(503, UNAVAILABLE);
    }
    return respond(200, answer);
  };
}

let reader: Promise<PublicInitiativeReader> | undefined;
function currentReader(): Promise<PublicInitiativeReader | null> {
  const url = process.env.WEAVE_INDEX_DATABASE_URL;
  if (process.env.WEAVE_PUBLIC_PROJECTS_ENABLED !== "true" || !url) return Promise.resolve(null);
  const current = reader ??= connectPublicInitiativeReader(url, { ca: process.env.WEAVE_DATABASE_CA_PEM });
  // A failed connection is retried by a later request instead of being kept.
  return current.catch((error: unknown) => {
    if (reader === current) reader = undefined;
    throw error;
  });
}

let links: PublisherLinkReader | null | undefined;
function currentLinks(): PublisherLinkReader | null {
  if (links !== undefined) return links;
  const groupServiceOrigin = process.env.WEAVE_CERTIFIED_GROUP_ORIGIN;
  const groupPdsOrigin = process.env.WEAVE_CERTIFIED_GROUP_PDS_ORIGIN;
  try {
    links = groupServiceOrigin && groupPdsOrigin ? readPublisherLinks(createCertifiedProjectProvider({
      groupServiceOrigin, groupPdsOrigin, timeoutMs: LINKS_TIMEOUT_MS,
      pdsOrigins: process.env.WEAVE_CERTIFIED_PROJECT_PDS_ORIGINS?.split(",").map((origin) => origin.trim()).filter(Boolean),
      // A public record is read with no one's authority, so no service token is ever minted here.
      serviceAuth: async () => null,
    })) : null;
  } catch {
    links = null;
  }
  return links;
}

export const GET = createPublicInitiative({ reader: currentReader, links: currentLinks });
