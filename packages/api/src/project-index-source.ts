import { createHash } from "node:crypto";
import { record } from "./account-contract.ts";
import type { ProjectEvidence } from "./partner-matcher.ts";
import { PARTNER_CONCEPT_VERSION } from "./partner-concepts.ts";
import { parseProjectUri, PROJECT_COLLECTION as collection, PROJECT_DID as did } from "./project-uri.ts";
import { isOrganizationType, ORGANIZATION_TYPES_MAX, PROJECT_LABEL_MAX } from "./public-projects-contract.ts";

export { parseProjectUri };
const origin = "https://api.hypercerts.dev";
const getCollection = `${collection}.getCollection`;
const maxResponseBytes = 512 * 1024;
/**
 * A list page carries up to `limit` full records. Twenty-five measured at most 300 KB on 15 November.
 * A page of one record gets the most room, so a single large record can still be passed by its cursor.
 */
export const listPageBytes = (limit: number) => limit === 1 ? 4 * 1024 * 1024 : Math.max(maxResponseBytes, limit * 80 * 1024);
const cidPattern = /^b[a-z2-7]{40,100}$/u;
// The projection version also invalidates stored lexical text on the next permitted refresh. v4 reads
// the publisher's name, the project's place and the publisher's kind of group as well.
export const PROJECT_EXTRACTION_VERSION = `hypercerts-collection-v4-${PARTNER_CONCEPT_VERSION}`;

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/**
 * A date a publisher or the index wrote. It must also be one Postgres can read, since the index casts
 * these values: Postgres has no year 0000 and no offsets beyond 15:59, which JavaScript accepts.
 */
function timestamp(value: unknown): string {
  const match = typeof value === "string"
    ? /^(\d{4})-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-](\d{2}):\d{2})$/u.exec(value) : null;
  if (!match || typeof value !== "string" || !Number.isFinite(Date.parse(value)) || Number(match[1]) < 1
    || Number(match[2] ?? 0) > 15) throw Error("invalid_source_date");
  const day = value.slice(0, 10);
  if (!new Date(`${day}T00:00:00Z`).toISOString().startsWith(day)) throw Error("invalid_source_date");
  return value;
}

export type ProjectPermission = { uri: string; redisplayUntil: string };
export type ProjectManifest = { generation: number; permissions: ProjectPermission[] };
export function parseProjectPermissions(input: unknown): ProjectManifest {
  const manifest = record(input);
  if (manifest.version !== 1 || typeof manifest.generation !== "number" || !Number.isSafeInteger(manifest.generation)
    || manifest.generation < 1 || manifest.generation > 2147483647
    || !Array.isArray(manifest.projects) || manifest.projects.length > 10_000)
    throw Error("invalid_permission_manifest");
  const permissions = manifest.projects.map((entry: unknown) => {
    const item = record(entry);
    return {
      uri: parseProjectUri(item.uri).uri,
      redisplayUntil: new Date(timestamp(item.redisplayUntil)).toISOString(),
    };
  }).sort((a, b) => a.uri < b.uri ? -1 : a.uri > b.uri ? 1 : 0);
  if (new Set(permissions.map(({ uri }) => uri)).size !== permissions.length) throw Error("duplicate_permission");
  return { generation: manifest.generation, permissions };
}

type SourceError = "source_access_denied" | "source_unavailable" | "source_rate_limited" | "invalid_source_record";
/**
 * What a public list card says about a project besides its own words: who shared it and where it is.
 * Each is optional, and a malformed or unsafe value is left out rather than failing the project.
 * They come from records other than the collection (the publisher's profile and organization, and
 * the place the collection links to), so they are not part of the content hash: a publisher can
 * rename itself without changing the collection's CID.
 */
export type ProjectFacts = {
  /** The publisher's display name on its Certified profile. */
  publisher: string | null;
  /** The place label of the location the collection pins. Context only: never read as a country or region. */
  place: string | null;
  /** The kinds of group the publisher's organization says it is, such as `nonprofit`, normalized and unique. */
  organizationTypes: string[];
};
export const NO_PROJECT_FACTS: ProjectFacts = Object.freeze({ publisher: null, place: null, organizationTypes: [] });
export type ProjectRead =
  | {
    status: "indexed"; cid: string; contentHash: string; sourceIndexedAt: string | null; fetchedAt: string;
    passages: ProjectEvidence[]; facts: ProjectFacts;
  }
  | { status: "missing" | "restricted"; code: "record_not_found" | "not_discoverable" }
  | { status: "failed"; code: SourceError; retryAfterMs?: number };

/** Reads a JSON body of at most `maxBytes`, failing before the rest arrives. */
export async function readBounded(response: Response, maxBytes: number): Promise<unknown> {
  const body = response.body;
  if (!body) throw Error("invalid_source_body");
  const reader = body.getReader();
  let size = 0;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let text = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw Error("source_response_too_large");
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

function backoff(value: string | null, now: number, fallback: number) {
  if (!value) return fallback;
  const duration = /^\d+$/u.test(value) ? Number(value) * 1000 : Date.parse(value) - now;
  return Number.isFinite(duration) ? Math.max(fallback, Math.min(duration, 24 * 60 * 60 * 1000)) : fallback;
}

type XrpcResult =
  | { status: "ok"; data: unknown }
  // A list page can be retried with fewer records. A single stored record keeps its stored code.
  | { status: "failed"; code: "source_response_too_large" }
  // `retryAfterMs` is the stored backoff for per-project reads; `requestedWaitMs` is what the server asked.
  | { status: "failed"; code: "source_rate_limited" | "source_unavailable"; retryAfterMs: number; requestedWaitMs?: number }
  | Extract<ProjectRead, { status: "failed" } | { status: "missing" | "restricted" }>;
export function createHypercertsSource(options: {
  fetch?: typeof fetch;
  now?: () => number;
  wait?: (ms: number) => Promise<void>;
} = {}) {
  const request = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const wait = options.wait ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  async function xrpc(method: string, params: URLSearchParams, maxBytes = maxResponseBytes): Promise<XrpcResult> {
    let failure: XrpcResult = { status: "failed", code: "source_unavailable", retryAfterMs: 30_000 };
    for (const delay of [0, 250]) {
      if (delay) await wait(delay);
      const signal = AbortSignal.timeout(6000);
      try {
        const response = await request(`${origin}/xrpc/${method}?${params}`, {
          headers: { accept: "application/json" },
          redirect: "error",
          cache: "no-store",
          signal,
        });
        if (response.status === 429) {
          await response.body?.cancel();
          const header = response.headers.get("Retry-After");
          return { status: "failed", code: "source_rate_limited", retryAfterMs: backoff(header, now(), 30_000),
            ...(header ? { requestedWaitMs: backoff(header, now(), 0) } : {}) };
        }
        if (response.status >= 500) {
          await response.body?.cancel();
          const retryAfter = response.headers.get("Retry-After");
          if (retryAfter) return { status: "failed", code: "source_unavailable",
            retryAfterMs: backoff(retryAfter, now(), 30_000), requestedWaitMs: backoff(retryAfter, now(), 0) };
          continue;
        }
        if (response.status === 401 || response.status === 403) {
          await response.body?.cancel();
          return { status: "failed", code: "source_access_denied", retryAfterMs: 300_000 };
        }
        let body: unknown;
        try {
          body = await readBounded(response, maxBytes);
        } catch (error) {
          if (signal.aborted) continue;
          if (!response.ok) return failure;
          if (error instanceof Error && error.message === "source_response_too_large")
            return { status: "failed", code: "source_response_too_large" };
          return { status: "failed", code: "invalid_source_record" };
        }
        if (response.ok) return { status: "ok", data: body };
        if (method === getCollection && [400, 404].includes(response.status)
          && record(body).error === "RecordNotFound") return { status: "missing", code: "record_not_found" };
        return failure;
      } catch {
        failure = { status: "failed", code: "source_unavailable", retryAfterMs: 30_000 };
      }
    }
    return failure;
  }

  async function listProjects(actor: string | undefined, cursor?: string, limit = 5) {
    if ((actor !== undefined && !did.test(actor)) || (cursor !== undefined && (!cursor || cursor.length > 1024))
      || !Number.isInteger(limit) || limit < 1 || limit > 100)
      throw Error("invalid_source_query");
    const params = new URLSearchParams({ types: "project", limit: String(limit), sortDirection: "asc" });
    if (actor) params.set("authors", actor);
    if (cursor) params.set("cursor", cursor);
    const result = await xrpc(`${collection}.listCollections`, params, listPageBytes(limit));
    if (result.status !== "ok") return result;
    try {
      const page = record(result.data);
      if (!Array.isArray(page.collections) || page.collections.length > limit
        || (page.cursor !== undefined && (typeof page.cursor !== "string" || !page.cursor || page.cursor.length > 1024
          || page.cursor === cursor))) throw Error("invalid_source_page");
      const results = page.collections.map((item: unknown) => {
        try {
          const { uri, did: publisher } = parseProjectUri(record(item).uri);
          if (actor !== undefined && publisher !== actor) throw Error("unexpected_publisher");
          return { uri, ...extractCollection(item, uri, new Date(now()).toISOString()) };
        } catch {
          return { uri: null, status: "failed", code: "invalid_source_record" } as const;
        }
      });
      return { status: "ok", results, cursor: page.cursor } as const;
    } catch {
      return { status: "failed", code: "invalid_source_record" } as const;
    }
  }

  return {
    async get(permission: ProjectPermission): Promise<ProjectRead> {
      const { uri } = parseProjectUri(permission.uri);
      if (Date.parse(permission.redisplayUntil) <= now())
        return { status: "restricted", code: "not_discoverable" };
      const result = await xrpc(getCollection, new URLSearchParams({ uri }));
      if (result.status === "failed" && result.code === "source_response_too_large")
        return { status: "failed", code: "invalid_source_record" };
      if (result.status === "failed")
        return result.retryAfterMs === undefined ? { status: "failed", code: result.code }
          : { status: "failed", code: result.code, retryAfterMs: result.retryAfterMs };
      if (result.status !== "ok") return result;
      try {
        return extractCollection(record(result.data).collection, uri, new Date(now()).toISOString());
      } catch {
        return { status: "failed", code: "invalid_source_record" };
      }
    },
    /** Enumerates the chosen index, not every repository on AT Protocol. */
    listProjects: (cursor?: string, limit?: number) => listProjects(undefined, cursor, limit),
    listPublisherProjects: (actor: string, cursor?: string) => listProjects(actor, cursor),
  };
}

// Store only plain text from approved fields. Drop contact details and embedded markup.
// A lone surrogate is not valid Unicode, and Postgres rejects it in jsonb.
const unsafePassage = /[<>\p{Cc}\p{Cf}\p{Surrogate}]|https?:|www\.|\bmailto:|[\p{L}\p{N}._+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}|(?:\+?\d[\s().-]*){8,}/iu;
function safePassages(value: string, max: number): string[] {
  const passages: string[] = [];
  const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
  for (const { segment } of segmenter.segment(value)) {
    const passage = segment.trim().replace(/\s+/gu, " ");
    if (passage.length >= 12 && passage.length <= 600 && !unsafePassage.test(passage))
      passages.push(passage);
    if (passages.length === max) break;
  }
  return passages;
}

const PROFILE = "app.certified.actor.profile";
const LOCATION = "app.certified.location";
const object = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

/** One line of plain text from another record, held to the same rules as a passage, or nothing. */
function safeLabel(value: unknown): string | null {
  if (typeof value !== "string" || value.length > PROJECT_LABEL_MAX * 4) return null;
  const label = value.trim().replace(/\s+/gu, " ");
  return label && label.length <= PROJECT_LABEL_MAX && !unsafePassage.test(label) ? label : null;
}

/** The display name on the publisher's own profile. A profile that names another account is not read. */
function publisherName(author: Record<string, unknown>, publisher: string): string | null {
  const profile = object(author.profile);
  const details = object(profile?.record);
  if (!profile || !details || (profile.did !== undefined && profile.did !== publisher)
    || (profile.uri !== undefined && profile.uri !== `at://${publisher}/${PROFILE}/self`)
    || (details.$type !== undefined && details.$type !== PROFILE)) return null;
  return safeLabel(details.displayName);
}

/**
 * The name of the place the collection pins with a strong reference. The listing hydrates the linked
 * record beside the collection as its own view, `location.record` with its address, version and
 * `record` (measured on 19 November 2026: 30 of 30 places). It is read only when the reference and the
 * view are both the exact version pinned, URI and CID, so a newer or other place is never shown in its
 * stead.
 */
function placeName(view: Record<string, unknown>, entry: Record<string, unknown>): string | null {
  const pinned = object(entry.location);
  const linked = object(view.location);
  const place = object(linked?.record);
  const details = object(place?.record);
  if (!pinned || !linked || !place || !details || typeof pinned.uri !== "string" || typeof pinned.cid !== "string"
    || linked.uri !== pinned.uri || linked.cid !== pinned.cid || place.uri !== pinned.uri || place.cid !== pinned.cid
    || (details.$type !== undefined && details.$type !== LOCATION)) return null;
  // A place label is a name, not a location fix. On 19 November 2026 every one with a digit in it, 12 of
  // 29, was a street address with a house number or postcode, a plus code or coordinates: precise enough
  // to find a home, so none is shown.
  const label = safeLabel(details.name);
  return label && !/\p{N}/u.test(label) ? label : null;
}

/**
 * Lower case words joined by hyphens, so `Non_Profit` and `non profit` are one kind of group. Values are
 * free text upstream, in any language: on 19 November they included `nonprofit`, `Nonprofit`,
 * `Grupo comunitário` and a leaked interface string with dots in it, which is left out.
 */
function organizationTypes(details: Record<string, unknown> | null): string[] {
  const values = details?.organizationType;
  if (!Array.isArray(values)) return [];
  const types = new Set<string>();
  for (const value of values.slice(0, 20)) {
    if (typeof value !== "string" || value.length > 80) continue;
    const type = value.normalize("NFC").trim().toLowerCase().replace(/[\s_]+/gu, "-");
    if (isOrganizationType(type)) types.add(type);
    if (types.size === ORGANIZATION_TYPES_MAX) break;
  }
  return [...types].sort();
}

/** Read only the direct narrative fields. Embedded URLs, facets, code and child lists are never followed. */
function leafletPassages(description: Record<string, unknown>): [string, string[]][] {
  if (!Array.isArray(description.blocks)) throw Error("invalid_description");
  const fields: [string, string[]][] = [];
  let characters = 20_000, remaining = 5;
  for (const [index, input] of description.blocks.slice(0, 100).entries()) {
    if (!characters || !remaining) break;
    try {
      const block = record(record(input).block);
      // This is an explicit disclosure boundary in the released Leaflet schema.
      if (block.$type === "pub.leaflet.blocks.membersOnlyDelimiter") break;
      if (block.$type !== "pub.leaflet.blocks.text" && block.$type !== "pub.leaflet.blocks.header") continue;
      if (typeof block.plaintext !== "string") continue;
      const value = block.plaintext.slice(0, characters).replace(/[\uD800-\uDBFF]$/u, "");
      characters -= Math.min(block.plaintext.length, characters);
      const passages = safePassages(value, remaining);
      if (passages.length) fields.push([`$.description.blocks[${index}].block.plaintext`, passages]);
      remaining -= passages.length;
    } catch { /* A malformed or unknown block cannot hide other permitted plain text. */ }
  }
  return fields;
}

export function extractCollection(input: unknown, expectedUri: string, fetchedAt: string): ProjectRead {
  const publisher = parseProjectUri(expectedUri).did;
  const view = record(input);
  const author = record(view.author);
  if (view.uri !== expectedUri || view.did !== publisher || author.did !== publisher
    || typeof view.cid !== "string" || !cidPattern.test(view.cid) || !Object.hasOwn(author, "organization"))
    throw Error("invalid_collection_view");
  let organization: Record<string, unknown> | null = null;
  if (author.organization !== null) {
    const linked = record(author.organization);
    organization = record(linked.record);
    if (linked.did !== publisher || linked.uri !== `at://${publisher}/app.certified.actor.organization/self`
      || organization.$type !== "app.certified.actor.organization") throw Error("invalid_organization");
    if ((organization.visibility !== undefined && organization.visibility !== "public") || organization.unlisted === true)
      return { status: "restricted", code: "not_discoverable" };
  }
  const entry = record(view.record);
  if (entry.$type !== collection) throw Error("invalid_collection_type");
  if (entry.type !== "project" || (entry.visibility !== undefined && entry.visibility !== "public"))
    return { status: "restricted", code: "not_discoverable" };
  if (typeof entry.title !== "string" || !entry.title.trim() || entry.title.length > 800
    || unsafePassage.test(entry.title)) throw Error("invalid_project_title");
  const projectName = entry.title.trim().slice(0, 300).replace(/[\uD800-\uDBFF]$/u, "");
  const sourceCreatedAt = timestamp(entry.createdAt);
  const sourceIndexedAt = view.indexedAt === null ? null : timestamp(view.indexedAt);
  const fields: [string, string[]][] = [];
  if (entry.shortDescription !== undefined) {
    if (typeof entry.shortDescription !== "string" || entry.shortDescription.length > 3000)
      throw Error("invalid_short_description");
    fields.push(["$.shortDescription", safePassages(entry.shortDescription, 5)]);
  }
  if (entry.description !== undefined) {
    const description = record(entry.description);
    if (description.$type === "org.hypercerts.defs#descriptionString") {
      if (typeof description.value !== "string" || description.value.length > 250_000)
        throw Error("invalid_description");
      fields.push(["$.description.value", safePassages(description.value.slice(0, 20_000), 5)]);
    } else if (description.$type === "pub.leaflet.pages.linearDocument"
      || (description.$type === undefined && Array.isArray(description.blocks))) {
      // Production API views also contain the legacy typeless blocks envelope.
      fields.push(...leafletPassages(description));
    }
  }
  const contentHash = sha256(JSON.stringify({ projectName, sourceCreatedAt, fields }));
  const unique = new Set<string>();
  const passages = fields.flatMap(([fieldPath, texts]) => texts.flatMap((passage): ProjectEvidence[] => {
    if (unique.has(passage)) return [];
    unique.add(passage);
    return [{
      id: sha256(JSON.stringify([expectedUri, fieldPath, passage])),
      projectUri: expectedUri,
      projectName,
      sourceUri: expectedUri,
      sourceUrl: `${origin}/xrpc/${getCollection}?${new URLSearchParams({ uri: expectedUri })}`,
      cid: view.cid as string,
      contentHash,
      fieldPath,
      passage,
      sourceCreatedAt,
      sourceIndexedAt,
      fetchedAt,
      extractionVersion: PROJECT_EXTRACTION_VERSION,
      kind: "work",
    }];
  }));
  const facts: ProjectFacts = {
    publisher: publisherName(author, publisher),
    place: placeName(view, entry),
    organizationTypes: organizationTypes(organization),
  };
  return { status: "indexed", cid: view.cid, contentHash, sourceIndexedAt, fetchedAt, passages, facts };
}
