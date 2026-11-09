import { createHash } from "node:crypto";
import { record } from "./account-contract.ts";
import type { ProjectEvidence } from "./partner-matcher.ts";

const origin = "https://api.hypercerts.dev";
const collection = "org.hypercerts.collection";
const getCollection = `${collection}.getCollection`;
const maxResponseBytes = 512 * 1024;
const did = /^did:(?:plc:[a-z2-7]{24}|web:[A-Za-z0-9][A-Za-z0-9._:%-]{0,252})$/u;
const cidPattern = /^b[a-z2-7]{40,100}$/u;
const recordKey = /^[A-Za-z0-9._:~-]{1,128}$/u;
export const PROJECT_EXTRACTION_VERSION = "hypercerts-collection-v1";

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export function parseProjectUri(value: unknown): { uri: string; did: string } {
  if (typeof value !== "string" || !value.startsWith("at://")) throw Error("invalid_project_uri");
  const [actor, nsid, key, ...rest] = value.slice(5).split("/");
  if (!actor || !did.test(actor) || nsid !== collection || !key || !recordKey.test(key)
    || key === "." || key === ".." || rest.length) throw Error("invalid_project_uri");
  return { uri: value, did: actor };
}

function timestamp(value: unknown): string {
  if (typeof value !== "string"
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/u.test(value)
    || !Number.isFinite(Date.parse(value))) throw Error("invalid_source_date");
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
    || !Array.isArray(manifest.projects) || manifest.projects.length > 1000)
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
export type ProjectRead =
  | { status: "indexed"; cid: string; contentHash: string; sourceIndexedAt: string | null; fetchedAt: string; passages: ProjectEvidence[] }
  | { status: "missing" | "restricted"; code: "record_not_found" | "not_discoverable" }
  | { status: "failed"; code: SourceError; retryAfterMs?: number };

async function readBounded(response: Response): Promise<unknown> {
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
      if (size > maxResponseBytes) throw Error("source_response_too_large");
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
  | Extract<ProjectRead, { status: "failed" } | { status: "missing" | "restricted" }>;
export function createHypercertsSource(options: {
  fetch?: typeof fetch;
  now?: () => number;
  wait?: (ms: number) => Promise<void>;
} = {}) {
  const request = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const wait = options.wait ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  async function xrpc(method: string, params: URLSearchParams): Promise<XrpcResult> {
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
          return { status: "failed", code: "source_rate_limited",
            retryAfterMs: backoff(response.headers.get("Retry-After"), now(), 30_000) };
        }
        if (response.status >= 500) {
          await response.body?.cancel();
          const retryAfter = response.headers.get("Retry-After");
          if (retryAfter) return { status: "failed", code: "source_unavailable",
            retryAfterMs: backoff(retryAfter, now(), 30_000) };
          continue;
        }
        if (response.status === 401 || response.status === 403) {
          await response.body?.cancel();
          return { status: "failed", code: "source_access_denied", retryAfterMs: 300_000 };
        }
        let body: unknown;
        try {
          body = await readBounded(response);
        } catch {
          if (signal.aborted) continue;
          if (!response.ok) return failure;
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

  return {
    async get(permission: ProjectPermission): Promise<ProjectRead> {
      const { uri } = parseProjectUri(permission.uri);
      if (Date.parse(permission.redisplayUntil) <= now())
        return { status: "restricted", code: "not_discoverable" };
      const result = await xrpc(getCollection, new URLSearchParams({ uri }));
      if (result.status !== "ok") return result;
      try {
        return extractCollection(record(result.data).collection, uri, new Date(now()).toISOString());
      } catch {
        return { status: "failed", code: "invalid_source_record" };
      }
    },
    async listPublisherProjects(actor: string, cursor?: string) {
      if (!did.test(actor) || (cursor !== undefined && (!cursor || cursor.length > 1024)))
        throw Error("invalid_source_query");
      const params = new URLSearchParams({ authors: actor, types: "project", limit: "5" });
      if (cursor) params.set("cursor", cursor);
      const result = await xrpc(`${collection}.listCollections`, params);
      if (result.status !== "ok") return result;
      try {
        const page = record(result.data);
        if (!Array.isArray(page.collections) || page.collections.length > 5
          || (page.cursor !== undefined && (typeof page.cursor !== "string" || !page.cursor || page.cursor.length > 1024
            || page.cursor === cursor))) throw Error("invalid_source_page");
        const results = page.collections.map((item: unknown) => {
          try {
            const { uri, did: publisher } = parseProjectUri(record(item).uri);
            if (publisher !== actor) throw Error("unexpected_publisher");
            return extractCollection(item, uri, new Date(now()).toISOString());
          } catch {
            return { status: "failed", code: "invalid_source_record" } as const;
          }
        });
        return { status: "ok", results, cursor: page.cursor } as const;
      } catch {
        return { status: "failed", code: "invalid_source_record" } as const;
      }
    },
  };
}

// Store only plain text from approved fields. Drop contact details and embedded markup.
const unsafePassage = /[<>\p{Cc}\p{Cf}]|https?:|www\.|\bmailto:|[\p{L}\p{N}._+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}|(?:\+?\d[\s().-]*){8,}/iu;
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

export function extractCollection(input: unknown, expectedUri: string, fetchedAt: string): ProjectRead {
  const publisher = parseProjectUri(expectedUri).did;
  const view = record(input);
  const author = record(view.author);
  if (view.uri !== expectedUri || view.did !== publisher || author.did !== publisher
    || typeof view.cid !== "string" || !cidPattern.test(view.cid) || !Object.hasOwn(author, "organization"))
    throw Error("invalid_collection_view");
  if (author.organization !== null) {
    const organization = record(author.organization);
    const details = record(organization.record);
    if (organization.did !== publisher || organization.uri !== `at://${publisher}/app.certified.actor.organization/self`
      || details.$type !== "app.certified.actor.organization") throw Error("invalid_organization");
    if (details.visibility !== undefined && details.visibility !== "public")
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
  return { status: "indexed", cid: view.cid, contentHash, sourceIndexedAt, fetchedAt, passages };
}
