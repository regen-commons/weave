// GET /api/public-projects: the listed public Certified projects Weave indexes, newest first.
// Shared by the handler, which parses requests, and the app, which parses responses.
import { parseProjectUri, PROJECT_COLLECTION } from "./project-uri.ts";

/** The record collection a project's address names. */
export { PROJECT_COLLECTION };

/**
 * A public project's part of its Weave address, `/initiatives/<account>-<record>` (22 November 2026): the
 * project's PLC account and its record key, both lower-case base32, joined by a hyphen neither contains.
 * Every project the index listed that day has one. A `did:web` account or a key that is not a timestamp
 * ID has none, and its card keeps its name unlinked.
 */
const PLC_ACCOUNT = /^did:plc:([a-z2-7]{24})$/u;
const TIMESTAMP_KEY = /^[a-z2-7]{13}$/u;
const PROJECT_SLUG = /^([a-z2-7]{24})-([a-z2-7]{13})$/u;

export function projectSlug(uri: string): string | null {
  if (!uri.startsWith("at://")) return null;
  const [did, collection, key, ...rest] = uri.slice(5).split("/");
  const account = PLC_ACCOUNT.exec(did ?? "")?.[1];
  return account && collection === PROJECT_COLLECTION && key && TIMESTAMP_KEY.test(key) && !rest.length ? `${account}-${key}` : null;
}

/** The project an address part names, or null where it names none. */
export function projectUriOf(slug: string): string | null {
  const parts = PROJECT_SLUG.exec(slug);
  return parts ? `at://did:plc:${parts[1]}/${PROJECT_COLLECTION}/${parts[2]}` : null;
}

/**
 * A project's own words, each said once. A Certified project often has a short description that is its
 * long one cut off with an ellipsis, so a passage that only begins another is left out.
 */
export function projectPassages(card: Pick<PublicProjectCard, "passages">): string[] {
  const opening = (passage: string) => passage.trim().replace(/(\.\.\.|…)$/u, "").trim();
  return card.passages.filter((passage, index) => {
    const start = opening(passage);
    return !card.passages.some((other, at) => at !== index && other.trim() !== passage.trim() && other.trim().startsWith(start))
      && card.passages.findIndex((other) => other.trim() === passage.trim()) === index;
  });
}

export const PUBLIC_PROJECT_PAGE_SIZE = 12;
export const PUBLIC_PROJECT_PAGE_MAX = 24;
const maxQuery = 100;
const maxTerms = 6;
/** Fits the longest project address `parseProjectUri` accepts, about 610 characters once encoded. */
const maxCursor = 1024;
const sharedAtPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/u;
const controls = /[\p{Cc}\p{Cf}]/u;
/** Search ignores case and combining marks, so "sao" finds "São". */
const marks = /\p{M}/gu;
export const searchText = (value: string) => value.normalize("NFKD").replace(marks, "").toLowerCase();

/**
 * A kind of group a publisher's Certified organization says it is, as the index stores it: lower case
 * words in any language joined by hyphens, such as `nonprofit` or `grupo-comunitário`. Upstream values
 * are free text, so the list offers only the kinds its projects carry.
 */
const keyPattern = /^\p{L}[\p{L}\p{M}\p{N}]*(?:-[\p{L}\p{M}\p{N}]+)*$/u;
const isKey = (value: unknown, max: number): value is string =>
  typeof value === "string" && value.length <= max && keyPattern.test(value) && value === value.normalize("NFC").toLowerCase();
const ORGANIZATION_TYPE_MAX = 40;
/** The most kinds one project's publisher keeps. */
export const ORGANIZATION_TYPES_MAX = 5;
/** The most kinds a page offers to filter on. */
export const ORGANIZATION_TYPE_OPTIONS_MAX = 24;
export const isOrganizationType = (value: unknown): value is string => isKey(value, ORGANIZATION_TYPE_MAX);
/**
 * Kinds of group written in another language for a kind the list already holds, read as that kind. The
 * maker decided on 21 November 2026 to show them as one, reversing the 20 November decision to keep them
 * apart. Across the 1,021 listed projects that day, `grupo-comunitário` was on 4 and `grupo-comunitario`
 * on 1, beside `community-group` on 260. The index keeps what the publisher wrote; the list reads it.
 */
const ORGANIZATION_TYPE_ALIASES: ReadonlyMap<string, string> = new Map([
  ["grupo-comunitário", "community-group"],
  ["grupo-comunitario", "community-group"],
]);
/** The kind of group a stored or requested kind is read as. */
export const organizationTypeOf = (type: string): string => ORGANIZATION_TYPE_ALIASES.get(type) ?? type;

/**
 * A kind of work a project's own activity names: the key of a Certified work scope tag, such as
 * `restoration` or `biodiversity-monitoring`, in lower case words joined by hyphens. A tag's name can be
 * in any language ("Monitoreo de naturaleza"), but its key is a machine name shared by every translation,
 * so the list filters on keys and the app names them from the key.
 */
const WORK_SCOPE_MAX = 60;
/** The most kinds of work one project keeps. Ten was the most any listed project named on 21 November 2026. */
export const WORK_SCOPES_MAX = 10;
/** The most kinds of work a page offers to filter on. */
export const WORK_SCOPE_OPTIONS_MAX = 24;
export const isWorkScope = (value: unknown): value is string => isKey(value, WORK_SCOPE_MAX);

/**
 * The orders the list can be read in. Newest first is the default and is spelled by leaving `sort` out.
 * Each order is fixed and total, ties broken by address, so the cursor can continue it.
 */
export const PUBLIC_PROJECT_SORTS = ["newest", "oldest", "name"] as const;
export type PublicProjectSort = (typeof PUBLIC_PROJECT_SORTS)[number];
export const isPublicProjectSort = (value: unknown): value is PublicProjectSort =>
  PUBLIC_PROJECT_SORTS.includes(value as PublicProjectSort);
/** Where the next page starts: the last card's place in the order (its share date, or its name) and its address. */
export type PublicProjectCursor = { key: string; uri: string };
export type PublicProjectQuery = {
  /** The search as typed, trimmed. Empty lists every project. */
  q: string;
  /** Normalized words that must each appear in a project's name, publisher, place or description. */
  terms: string[];
  /** Only projects whose publisher says it is this kind of group. Projects that say nothing are left out. */
  organizationType: string | null;
  /** Only projects whose own activity names this kind of work. Projects that name none are left out. */
  workScope: string | null;
  sort: PublicProjectSort;
  cursor: PublicProjectCursor | null;
  limit: number;
  /**
   * One project by its address, for the page a link to it opens. Asked alone, so each project has one
   * cached address, and absent from every other query.
   */
  uri?: string;
};
const QUERY_KEYS = ["q", "organizationType", "workScope", "sort", "cursor", "limit", "uri"];

export function searchTerms(q: string): string[] {
  return [...new Set(searchText(q).split(/\s+/u).filter(Boolean))].slice(0, maxTerms);
}

const base64url = {
  encode: (text: string) => btoa(String.fromCodePoint(...new TextEncoder().encode(text)))
    .replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, ""),
  decode: (value: string) => {
    if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw Error("invalid_project_query");
    const binary = atob(value.replace(/-/gu, "+").replace(/_/gu, "/"));
    return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(binary, (char) => char.codePointAt(0)!));
  },
};

export function encodePublicProjectCursor({ key, uri }: PublicProjectCursor): string {
  return base64url.encode(JSON.stringify([key, uri]));
}

/** A cursor made for one order is refused in another, since its key would mean something else there. */
function decodeCursor(value: string, sort: PublicProjectSort): PublicProjectCursor {
  if (!value || value.length > maxCursor) throw Error("invalid_project_query");
  let parsed: unknown;
  try { parsed = JSON.parse(base64url.decode(value)); } catch { throw Error("invalid_project_query"); }
  if (!Array.isArray(parsed) || parsed.length !== 2) throw Error("invalid_project_query");
  const [key, uri] = parsed as unknown[];
  const valid = typeof key === "string" && (sort === "name"
    ? key.trim() !== "" && key.length <= 300 && !controls.test(key)
    : sharedAtPattern.test(key) && Number.isFinite(Date.parse(key)));
  if (!valid) throw Error("invalid_project_query");
  try { return { key, uri: parseProjectUri(uri).uri }; } catch { throw Error("invalid_project_query"); }
}

/**
 * Accepts only `q`, `organizationType`, `workScope`, `sort`, `cursor` and `limit`, each at most once, or
 * `uri` on its own, so every cached page has one address.
 */
export function parsePublicProjectQuery(url: URL): PublicProjectQuery {
  const keys = [...url.searchParams.keys()];
  if (keys.some((key) => !QUERY_KEYS.includes(key)) || new Set(keys).size !== keys.length)
    throw Error("invalid_project_query");
  const uriText = url.searchParams.get("uri");
  if (uriText !== null) {
    if (keys.length !== 1) throw Error("invalid_project_query");
    let uri: string;
    try { uri = parseProjectUri(uriText).uri; } catch { throw Error("invalid_project_query"); }
    return { q: "", terms: [], organizationType: null, workScope: null, sort: "newest", cursor: null, limit: 1, uri };
  }
  const q = (url.searchParams.get("q") ?? "").trim().replace(/\s+/gu, " ");
  if (q.length > maxQuery || controls.test(q)) throw Error("invalid_project_query");
  const typeText = url.searchParams.get("organizationType");
  if (typeText !== null && !isOrganizationType(typeText)) throw Error("invalid_project_query");
  // An address shared before two kinds were read as one still finds the projects.
  const organizationType = typeText === null ? null : organizationTypeOf(typeText);
  const workScope = url.searchParams.get("workScope");
  if (workScope !== null && !isWorkScope(workScope)) throw Error("invalid_project_query");
  const sortText = url.searchParams.get("sort");
  if (sortText !== null && !isPublicProjectSort(sortText)) throw Error("invalid_project_query");
  const sort = sortText ?? "newest";
  const limitText = url.searchParams.get("limit");
  const limit = limitText === null ? PUBLIC_PROJECT_PAGE_SIZE : /^\d{1,2}$/u.test(limitText) ? Number(limitText) : NaN;
  if (!Number.isInteger(limit) || limit < 1 || limit > PUBLIC_PROJECT_PAGE_MAX) throw Error("invalid_project_query");
  const cursorText = url.searchParams.get("cursor");
  return {
    q, terms: searchTerms(q), organizationType, workScope, sort,
    cursor: cursorText === null ? null : decodeCursor(cursorText, sort), limit,
  };
}

export type PublicProjectCard = {
  uri: string;
  name: string;
  /** The project's own words, in reading order, from its public Certified record. */
  passages: string[];
  /** When the project was shared on Certified, never later than when the source indexed it. */
  sharedAt: string;
  /** When Weave last read the project. */
  checkedAt: string;
  sourceUrl: string;
  /** Who shared it: the display name on the publisher's Certified profile. Absent when it has none. */
  publisher?: string;
  /** Where it is, as its publisher labelled the place. Context only, never a country or region. */
  place?: string;
};
export type PublicProjectPage = {
  index: {
    /**
     * `bounded`: the last daily check finished. `partial`: it stopped early. `stale`: it is overdue.
     * `off`: the list is not switched on here, so the app shows its starter list without an error.
     */
    status: "bounded" | "partial" | "stale" | "off";
    checkedAt: string | null;
    /** Projects matching the search and filter, or all shown projects without them. */
    total: number;
    /**
     * The kinds of group the shown projects' publishers name, most common first, whatever the search.
     * A list that names none, or a server from before the filter, leaves it out, and the app offers no filter.
     */
    organizationTypes?: string[];
    /**
     * The kinds of work at least two shown projects name, most common first, whatever the search. A list
     * with none, or a server from before this filter, leaves it out, and the app offers no filter.
     */
    workScopes?: string[];
  };
  projects: PublicProjectCard[];
  next: string | null;
};

const fail = (): never => { throw Error("invalid_public_projects"); };
function text(value: unknown, max: number): string {
  return typeof value === "string" && value.trim() && value.length <= max && !controls.test(value) ? value : fail();
}
function isoDate(value: unknown): string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/u.test(value) && Number.isFinite(Date.parse(value)) ? value : fail();
}
function sourceUrl(value: unknown): string {
  const url = new URL(text(value, 2048));
  // The list links only to the public read API the index came from.
  return url.origin === "https://api.hypercerts.dev" && !url.username && !url.password ? url.href : fail();
}
/** The longest publisher name or place label a card carries. The index leaves out a longer one, never cuts it. */
export const PROJECT_LABEL_MAX = 120;
/** A publisher name or place label as a card may carry it. */
export const isProjectLabel = (value: unknown): value is string =>
  typeof value === "string" && value.trim() !== "" && value.length <= PROJECT_LABEL_MAX && !controls.test(value);
function card(value: unknown): PublicProjectCard {
  if (!value || typeof value !== "object") return fail();
  const o = value as Record<string, unknown>;
  let uri: string;
  try { uri = parseProjectUri(o.uri).uri; } catch { return fail(); }
  if (!Array.isArray(o.passages) || o.passages.length > 2) return fail();
  return {
    uri, name: text(o.name, 300), passages: o.passages.map((passage) => text(passage, 600)),
    sharedAt: isoDate(o.sharedAt), checkedAt: isoDate(o.checkedAt), sourceUrl: sourceUrl(o.sourceUrl),
    // Absent from a server that predates them. Present, they must be valid like every other part.
    ...(o.publisher === undefined ? {} : { publisher: text(o.publisher, PROJECT_LABEL_MAX) }),
    ...(o.place === undefined ? {} : { place: text(o.place, PROJECT_LABEL_MAX) }),
  };
}

/** A page's offered choices: unique, each one the list can read, and no more than it offers. */
function choices(value: unknown, max: number, valid: (item: unknown) => item is string): string[] {
  if (!Array.isArray(value) || value.length > max || !value.every(valid) || new Set(value).size !== value.length) return fail();
  return value;
}

export function parsePublicProjectPage(value: unknown): PublicProjectPage {
  if (!value || typeof value !== "object") return fail();
  const o = value as Record<string, unknown>;
  const index = o.index && typeof o.index === "object" ? o.index as Record<string, unknown> : fail();
  const status = index.status === "bounded" || index.status === "partial" || index.status === "stale" || index.status === "off"
    ? index.status : fail();
  const total = typeof index.total === "number" && Number.isSafeInteger(index.total) && index.total >= 0 ? index.total : fail();
  if (!Array.isArray(o.projects) || o.projects.length > PUBLIC_PROJECT_PAGE_MAX) return fail();
  const projects = o.projects.map(card);
  if (new Set(projects.map(({ uri }) => uri)).size !== projects.length || projects.length > total) return fail();
  const next = o.next === null ? null : text(o.next, maxCursor);
  return {
    index: {
      status, checkedAt: index.checkedAt === null ? null : isoDate(index.checkedAt), total,
      ...(index.organizationTypes === undefined ? {}
        : { organizationTypes: choices(index.organizationTypes, ORGANIZATION_TYPE_OPTIONS_MAX, isOrganizationType) }),
      ...(index.workScopes === undefined ? {} : { workScopes: choices(index.workScopes, WORK_SCOPE_OPTIONS_MAX, isWorkScope) }),
    },
    projects, next,
  };
}
