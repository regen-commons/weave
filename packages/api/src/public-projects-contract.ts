// GET /api/public-projects: the listed public Certified projects Weave indexes, newest first.
// Shared by the handler, which parses requests, and the app, which parses responses.
import { parseProjectUri } from "./project-uri.ts";

export const PUBLIC_PROJECT_PAGE_SIZE = 12;
export const PUBLIC_PROJECT_PAGE_MAX = 24;
const maxQuery = 100;
const maxTerms = 6;
const maxCursor = 512;
const sharedAtPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/u;
const controls = /[\p{Cc}\p{Cf}]/u;
/** Search ignores case and combining marks, so "sao" finds "São". */
const marks = /\p{M}/gu;
export const searchText = (value: string) => value.normalize("NFKD").replace(marks, "").toLowerCase();

export type PublicProjectCursor = { sharedAt: string; uri: string };
export type PublicProjectQuery = {
  /** The search as typed, trimmed. Empty lists every project. */
  q: string;
  /** Normalized words that must each appear in a project's name or description. */
  terms: string[];
  cursor: PublicProjectCursor | null;
  limit: number;
};

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

/** Accepts only `q`, `cursor` and `limit`, each at most once, so every cached page has one address. */
export function parsePublicProjectQuery(url: URL): PublicProjectQuery {
  const keys = [...url.searchParams.keys()];
  if (keys.some((key) => !["q", "cursor", "limit"].includes(key)) || new Set(keys).size !== keys.length)
    throw Error("invalid_project_query");
  const q = (url.searchParams.get("q") ?? "").trim().replace(/\s+/gu, " ");
  if (q.length > maxQuery || controls.test(q)) throw Error("invalid_project_query");
  const limitText = url.searchParams.get("limit");
  const limit = limitText === null ? PUBLIC_PROJECT_PAGE_SIZE : /^\d{1,2}$/u.test(limitText) ? Number(limitText) : NaN;
  if (!Number.isInteger(limit) || limit < 1 || limit > PUBLIC_PROJECT_PAGE_MAX) throw Error("invalid_project_query");
  const cursorText = url.searchParams.get("cursor");
  return { q, terms: searchTerms(q), cursor: cursorText === null ? null : decodeCursor(cursorText), limit };
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
};
export type PublicProjectPage = {
  index: {
    /**
     * `bounded`: the last daily check finished. `partial`: it stopped early. `stale`: it is overdue.
     * `off`: the list is not switched on here, so the app shows its starter list without an error.
     */
    status: "bounded" | "partial" | "stale" | "off";
    checkedAt: string | null;
    /** Projects matching the search, or all shown projects without one. */
    total: number;
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
function card(value: unknown): PublicProjectCard {
  if (!value || typeof value !== "object") return fail();
  const o = value as Record<string, unknown>;
  let uri: string;
  try { uri = parseProjectUri(o.uri).uri; } catch { return fail(); }
  if (!Array.isArray(o.passages) || o.passages.length > 2) return fail();
  return {
    uri, name: text(o.name, 300), passages: o.passages.map((passage) => text(passage, 600)),
    sharedAt: isoDate(o.sharedAt), checkedAt: isoDate(o.checkedAt), sourceUrl: sourceUrl(o.sourceUrl),
  };
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
  return { index: { status, checkedAt: index.checkedAt === null ? null : isoDate(index.checkedAt), total }, projects, next };
}
