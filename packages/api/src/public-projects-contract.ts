// GET /api/public-projects: the listed public Certified projects Weave indexes, newest first.
// Shared by the handler, which parses requests, and the app, which parses responses.
import { parseProjectUri } from "./project-uri.ts";

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
const organizationTypePattern = /^\p{L}[\p{L}\p{M}\p{N}]*(?:-[\p{L}\p{M}\p{N}]+)*$/u;
const ORGANIZATION_TYPE_MAX = 40;
/** The most kinds one project's publisher keeps. */
export const ORGANIZATION_TYPES_MAX = 5;
/** The most kinds a page offers to filter on. */
export const ORGANIZATION_TYPE_OPTIONS_MAX = 24;
export const isOrganizationType = (value: unknown): value is string =>
  typeof value === "string" && value.length <= ORGANIZATION_TYPE_MAX && organizationTypePattern.test(value)
    && value === value.normalize("NFC").toLowerCase();

export type PublicProjectCursor = { sharedAt: string; uri: string };
export type PublicProjectQuery = {
  /** The search as typed, trimmed. Empty lists every project. */
  q: string;
  /** Normalized words that must each appear in a project's name, publisher, place or description. */
  terms: string[];
  /** Only projects whose publisher says it is this kind of group. Projects that say nothing are left out. */
  organizationType: string | null;
  cursor: PublicProjectCursor | null;
  limit: number;
};
const QUERY_KEYS = ["q", "organizationType", "cursor", "limit"];

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

export function encodePublicProjectCursor({ sharedAt, uri }: PublicProjectCursor): string {
  return base64url.encode(JSON.stringify([sharedAt, uri]));
}

function decodeCursor(value: string): PublicProjectCursor {
  if (!value || value.length > maxCursor) throw Error("invalid_project_query");
  let parsed: unknown;
  try { parsed = JSON.parse(base64url.decode(value)); } catch { throw Error("invalid_project_query"); }
  if (!Array.isArray(parsed) || parsed.length !== 2) throw Error("invalid_project_query");
  const [sharedAt, uri] = parsed as unknown[];
  if (typeof sharedAt !== "string" || !sharedAtPattern.test(sharedAt) || !Number.isFinite(Date.parse(sharedAt)))
    throw Error("invalid_project_query");
  try { return { sharedAt, uri: parseProjectUri(uri).uri }; } catch { throw Error("invalid_project_query"); }
}

/**
 * Accepts only `q`, `organizationType`, `cursor` and `limit`, each at most once, so every cached page
 * has one address.
 */
export function parsePublicProjectQuery(url: URL): PublicProjectQuery {
  const keys = [...url.searchParams.keys()];
  if (keys.some((key) => !QUERY_KEYS.includes(key)) || new Set(keys).size !== keys.length)
    throw Error("invalid_project_query");
  const q = (url.searchParams.get("q") ?? "").trim().replace(/\s+/gu, " ");
  if (q.length > maxQuery || controls.test(q)) throw Error("invalid_project_query");
  const organizationType = url.searchParams.get("organizationType");
  if (organizationType !== null && !isOrganizationType(organizationType)) throw Error("invalid_project_query");
  const limitText = url.searchParams.get("limit");
  const limit = limitText === null ? PUBLIC_PROJECT_PAGE_SIZE : /^\d{1,2}$/u.test(limitText) ? Number(limitText) : NaN;
  if (!Number.isInteger(limit) || limit < 1 || limit > PUBLIC_PROJECT_PAGE_MAX) throw Error("invalid_project_query");
  const cursorText = url.searchParams.get("cursor");
  return {
    q, terms: searchTerms(q), organizationType, cursor: cursorText === null ? null : decodeCursor(cursorText), limit,
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

function organizationTypes(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > ORGANIZATION_TYPE_OPTIONS_MAX || !value.every(isOrganizationType)
    || new Set(value).size !== value.length) return fail();
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
      ...(index.organizationTypes === undefined ? {} : { organizationTypes: organizationTypes(index.organizationTypes) }),
    },
    projects, next,
  };
}
