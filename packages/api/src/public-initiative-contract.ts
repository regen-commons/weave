// GET /api/public-initiative?uri=<project AT URI>: one public initiative, a Certified project the public list
// shows, with its current public needs and offers. Shared by the handler, which parses requests and checks
// what it answers, and the app, which parses answers. Free of Node APIs so the app can import it.
import { CAPITALS } from "./account-contract.ts";
import {
  isOrganizationType, isProjectLabel, isWorkScope, ORGANIZATION_TYPES_MAX, PROJECT_SOURCE_ORIGIN, projectSlug, WORK_SCOPES_MAX,
} from "./public-projects-contract.ts";

export const PUBLIC_INITIATIVE_PATH = "/api/public-initiative";
/** Where the app asks for one public initiative by its project's address. */
export const publicInitiativeUrl = (uri: string) => `${PUBLIC_INITIATIVE_PATH}?${new URLSearchParams({ uri })}`;

/** The record collection Weave publishes needs and offers to, as the draft Lexicon names it. */
export const SUPPORT_LISTING_COLLECTION = "com.regencommons.weave.supportListing";
/** The most passages of a project's own words the index keeps: five from each description field. */
export const PUBLIC_INITIATIVE_PASSAGES_MAX = 10;
/** The most needs, and the most offers, one answer carries. A saved card holds five of each. */
export const PUBLIC_INITIATIVE_LISTINGS_MAX = 50;
/** The most links a publisher's organization contributes, as a card keeps them. */
export const PUBLISHER_LINKS_MAX = 6;
/** The longest link label: an organization's own label is at most 80 characters, and a hostname at most 253. */
const LINK_LABEL_MAX = 253;

/** A web address on the publisher's Certified organization record, with the words to show for it. */
export type PublicInitiativeLink = { label: string; url: string };
export type PublicInitiativeProject = {
  uri: string;
  name: string;
  /** Every public passage of the project's own words, in reading order, each said once: the fuller description. */
  description: string[];
  /** The kinds of work the project's own activity names, as work scope keys. */
  focus: string[];
  /** The kinds of group the publisher's organization says it is. */
  organizationTypes: string[];
  /** The display name on the publisher's Certified profile. Absent when it has none. */
  publisher?: string;
  /** Where it is, as its publisher labelled the place. */
  place?: string;
  /**
   * Read live from the publisher's organization record. Empty when it has none, or when it could not be read
   * in time. The answer carries no banner, avatar or other image (open decision D30).
   */
  publisherLinks: PublicInitiativeLink[];
  /** When the project was shared on Certified. */
  sharedAt: string;
  /** When Weave last read the project. */
  checkedAt: string;
  sourceUrl: string;
};
/** One need or offer Weave published to the project's public repository and confirmed by reading it back. */
export type PublicSupportListing = {
  /** The listing's public AT URI, in the project's own repository. */
  uri: string;
  /** The version Weave read back. */
  cid: string;
  title: string;
  description: string | null;
  /** The forms of capital that apply. Order has no meaning. */
  capitalForms: string[];
  createdAt: string;
  updatedAt: string | null;
  /** Its optional end. An answer never carries one that has passed. */
  expiresAt: string | null;
};
export type PublicInitiative = {
  project: PublicInitiativeProject;
  /** Newest first. */
  needs: PublicSupportListing[];
  /** Newest first. */
  offers: PublicSupportListing[];
  /** When this answer was read. */
  checkedAt: string;
};
/** The public list is not switched on here, so there is no public initiative to show and no error either. */
export type PublicInitiativeOff = { status: "off" };
export type PublicInitiativeAnswer = PublicInitiative | PublicInitiativeOff;
export const isPublicInitiativeOff = (answer: PublicInitiativeAnswer): answer is PublicInitiativeOff => "status" in answer;

/**
 * Accepts exactly one parameter, `uri`, naming a project the way a public initiative's Weave address does:
 * a 24-character PLC account, the project collection and a 13-character timestamp key. Anything else,
 * including a `did:web` account or another collection, has no public initiative page.
 */
export function parsePublicInitiativeQuery(url: URL): string {
  const keys = [...url.searchParams.keys()];
  const uri = url.searchParams.get("uri");
  if (keys.length !== 1 || keys[0] !== "uri" || uri === null || projectSlug(uri) === null) throw Error("invalid_uri");
  return uri;
}

const fail = (): never => { throw Error("invalid_public_initiative"); };
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : fail();
const controls = /[\p{Cc}\p{Cf}]/u;
const labelBreaks = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;
function text(value: unknown, max: number): string {
  return typeof value === "string" && value.trim() && value.length <= max && !controls.test(value) ? value : fail();
}
function isoDate(value: unknown): string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/u.test(value) && Number.isFinite(Date.parse(value)) ? value : fail();
}
/** A record's own date, as the Lexicon's datetime fields carry it in UTC. */
function recordDate(value: unknown): string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/u.test(value)
    && Number.isFinite(Date.parse(value)) ? value : fail();
}
const graphemes = new Intl.Segmenter();
const bytes = new TextEncoder();
/** Lexicon text: within its grapheme and byte bounds, with no lone surrogate. */
function lexiconText(value: unknown, maxGraphemes: number, maxBytes: number): string {
  if (typeof value !== "string" || /\p{Surrogate}/u.test(value) || bytes.encode(value).length > maxBytes) return fail();
  let count = 0;
  for (const _ of graphemes.segment(value)) if (++count > maxGraphemes) return fail();
  return value;
}
function list<T>(value: unknown, max: number, item: (entry: unknown) => T): T[] {
  return Array.isArray(value) && value.length <= max ? value.map(item) : fail();
}
function unique<T>(items: T[], key: (item: T) => string = String): T[] {
  return new Set(items.map(key)).size === items.length ? items : fail();
}

/** A publisher link as a page may show it: an http or https address without credentials, and a one-line label. */
export function isPublicInitiativeLink(value: unknown): value is PublicInitiativeLink {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const { label, url } = value as Record<string, unknown>;
  if (typeof label !== "string" || label !== label.trim() || !label || [...label].length > LINK_LABEL_MAX
    || labelBreaks.test(label) || /\p{Surrogate}/u.test(label)) return false;
  if (typeof url !== "string" || url.length > 2048 || /[\s\p{Cc}]/u.test(url)) return false;
  try {
    const parsed = new URL(url);
    return (parsed.protocol === "https:" || parsed.protocol === "http:") && !parsed.username && !parsed.password;
  } catch { return false; }
}

function project(value: unknown): PublicInitiativeProject {
  const o = object(value);
  const uri = typeof o.uri === "string" && projectSlug(o.uri) !== null ? o.uri : fail();
  let source: URL;
  try { source = new URL(text(o.sourceUrl, 2048)); } catch { return fail(); }
  // A page links only to the public read API the index came from.
  if (source.origin !== PROJECT_SOURCE_ORIGIN || source.username || source.password) return fail();
  const label = (field: unknown) => isProjectLabel(field) ? field : fail();
  return {
    uri, name: text(o.name, 300),
    description: list(o.description, PUBLIC_INITIATIVE_PASSAGES_MAX, (passage) => text(passage, 600)),
    focus: unique(list(o.focus, WORK_SCOPES_MAX, (scope) => isWorkScope(scope) ? scope : fail())),
    organizationTypes: unique(list(o.organizationTypes, ORGANIZATION_TYPES_MAX, (kind) => isOrganizationType(kind) ? kind : fail())),
    ...(o.publisher === undefined ? {} : { publisher: label(o.publisher) }),
    ...(o.place === undefined ? {} : { place: label(o.place) }),
    publisherLinks: unique(list(o.publisherLinks, PUBLISHER_LINKS_MAX,
      (link) => isPublicInitiativeLink(link) ? { label: link.label, url: link.url } : fail()), ({ url }) => url),
    sharedAt: isoDate(o.sharedAt), checkedAt: isoDate(o.checkedAt), sourceUrl: source.href,
  };
}

const LISTING_KEY = /^[2-7a-j][2-7a-z]{12}$/u;
const CID = /^b[a-z2-7]{40,100}$/u;
/** One listing, published in the repository of the project whose DID is given. Throws on anything else. */
export function parsePublicSupportListing(value: unknown, did: string): PublicSupportListing {
  const o = object(value);
  const prefix = `at://${did}/${SUPPORT_LISTING_COLLECTION}/`;
  const uri = typeof o.uri === "string" && o.uri.startsWith(prefix) && LISTING_KEY.test(o.uri.slice(prefix.length)) ? o.uri : fail();
  const cid = typeof o.cid === "string" && CID.test(o.cid) ? o.cid : fail();
  const title = lexiconText(o.title, 140, 1400);
  if (!title.trim()) return fail();
  const capitalForms = unique(list(o.capitalForms, 8, (form) => typeof form === "string" && CAPITALS.includes(form) ? form : fail()));
  if (!capitalForms.length) return fail();
  const createdAt = recordDate(o.createdAt);
  const updatedAt = o.updatedAt === null ? null : recordDate(o.updatedAt);
  const expiresAt = o.expiresAt === null ? null : recordDate(o.expiresAt);
  if ((updatedAt !== null && Date.parse(updatedAt) < Date.parse(createdAt))
    || (expiresAt !== null && Date.parse(expiresAt) <= Date.parse(createdAt))) return fail();
  return { uri, cid, title, description: o.description === null ? null : lexiconText(o.description, 600, 6000),
    capitalForms, createdAt, updatedAt, expiresAt };
}

/** Reads an answer: one public initiative, or `off`. Throws on anything else, so a page never shows part of a bad answer. */
export function parsePublicInitiative(value: unknown): PublicInitiativeAnswer {
  const o = object(value);
  if (o.status === "off") return { status: "off" };
  const shown = project(o.project);
  const did = shown.uri.slice(5, shown.uri.indexOf("/", 5));
  const needs = list(o.needs, PUBLIC_INITIATIVE_LISTINGS_MAX, (entry) => parsePublicSupportListing(entry, did));
  const offers = list(o.offers, PUBLIC_INITIATIVE_LISTINGS_MAX, (entry) => parsePublicSupportListing(entry, did));
  unique([...needs, ...offers], ({ uri }) => uri);
  return { project: shown, needs, offers, checkedAt: isoDate(o.checkedAt) };
}
