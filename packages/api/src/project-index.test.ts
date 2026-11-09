import assert from "node:assert/strict";
import test from "node:test";
import {
  createHypercertsSource, extractCollection, parseProjectPermissions, parseProjectUri,
} from "./project-index-source.ts";
import { refreshProjectIndex } from "./project-index.ts";
import type { ProjectIndexStore } from "./project-index.ts";

const did = "did:plc:pktwukejt6bnubpkhldnaeyc";
const nsid = "org.hypercerts.collection";
const uri = `at://${did}/${nsid}/test-project`;
const cid = "bafyreicr6uunzpaa7hzwbkvctviqz6pvnab5sziptgdqwe5jboqlhm55vi";
const now = () => Date.parse("2026-11-08T23:00:00Z");
const fetchedAt = new Date(now()).toISOString();
const permission = { uri, redisplayUntil: "2026-12-01T00:00:00Z" };
const fixture = () => ({
  uri, cid, did, indexedAt: "2026-11-08T22:30:00.123456789+00:00",
  author: { did, profile: null, organization: null as null | object },
  record: {
    $type: nsid, type: "project", title: "Illustrated pollinator atlas", createdAt: "2026-11-05T12:00:00Z",
    shortDescription: "We map pollinator habitat across urban gardens. Email us at example@example.com.",
    description: { $type: "org.hypercerts.defs#descriptionString", value: "We map pollinator habitat across urban gardens. Our field teams survey bumblebee nesting sites." },
  },
});
const json = (data: unknown, init?: ResponseInit) => Response.json(data, init);

test("validates DID identity, deduplicates passages and retains exact field provenance without contacts", () => {
  assert.throws(() => parseProjectUri(`at://actor.certified.one/${nsid}/test-project`), /invalid_project_uri/u);
  assert.throws(() => extractCollection({ ...fixture(), did: "did:web:another.example" }, uri, fetchedAt));
  const result = extractCollection(fixture(), uri, fetchedAt);
  assert.equal(result.status, "indexed");
  if (result.status !== "indexed") return;
  assert.deepEqual(result.passages.map(({ fieldPath, passage, kind }) => ({ fieldPath, passage, kind })), [
    { fieldPath: "$.shortDescription", passage: "We map pollinator habitat across urban gardens.", kind: "work" },
    { fieldPath: "$.description.value", passage: "Our field teams survey bumblebee nesting sites.", kind: "work" },
  ]);
  const refreshed = extractCollection(fixture(), uri, "2026-11-09T00:00:00Z");
  if (refreshed.status !== "indexed") assert.fail("expected an indexed project");
  assert.equal(refreshed.contentHash, result.contentHash);
  assert.equal(refreshed.passages[0]?.id, result.passages[0]?.id);
  assert.equal(new URL(result.passages[0]?.sourceUrl ?? "").searchParams.get("uri"), uri);
  const updated = fixture();
  updated.record.shortDescription = "We document migratory bird populations across the estuary.";
  const changed = extractCollection(updated, uri, fetchedAt);
  if (changed.status !== "indexed") assert.fail("expected an indexed project");
  assert.notEqual(changed.contentHash, result.contentHash);
  assert.notEqual(changed.passages[0]?.id, result.passages[0]?.id);
  assert.throws(() => parseProjectPermissions({ version: 1, generation: 1, projects: [permission, permission] }), /duplicate_permission/u);
});

test("suppresses explicit upstream discovery restrictions", () => {
  const view = fixture();
  view.author.organization = {
    did, uri: `at://${did}/app.certified.actor.organization/self`,
    record: { $type: "app.certified.actor.organization", visibility: "unlisted" },
  };
  assert.deepEqual(extractCollection(view, uri, fetchedAt), { status: "restricted", code: "not_discoverable" });
});

test("only documented RecordNotFound suppresses an indexed project as missing", async () => {
  for (const status of [400, 404]) {
    const source = createHypercertsSource({ now, fetch: async () => json({ error: "RecordNotFound" }, { status }) });
    assert.deepEqual(await source.get(permission), { status: "missing", code: "record_not_found" });
  }
  const source = createHypercertsSource({ now, fetch: async () => new Response("missing", { status: 404 }) });
  assert.equal((await source.get(permission)).status, "failed");
});

test("uses a fixed origin and a bounded response, retries a temporary outage and preserves Retry-After", async () => {
  let calls = 0;
  const source = createHypercertsSource({
    now, wait: async () => undefined,
    fetch: async (url, options) => {
      assert.equal(new URL(String(url)).origin, "https://api.hypercerts.dev");
      assert.equal(options?.redirect, "error");
      return ++calls === 1 ? json({}, { status: 503 }) : json({ collection: fixture() });
    },
  });
  assert.equal((await source.get(permission)).status, "indexed");
  assert.equal(calls, 2);
  const throttled = createHypercertsSource({
    now, fetch: async () => json({}, { status: 429, headers: { "Retry-After": "120" } }),
  });
  assert.deepEqual(await throttled.get(permission), { status: "failed", code: "source_rate_limited", retryAfterMs: 120_000 });
  const oversized = createHypercertsSource({ now, fetch: async () => new Response("x".repeat(600 * 1024)) });
  assert.deepEqual(await oversized.get(permission), { status: "failed", code: "invalid_source_record" });
});

test("publisher listing passes an opaque cursor without indexing unexpected records", async () => {
  const source = createHypercertsSource({
    now,
    fetch: async (url) => {
      const params = new URL(String(url)).searchParams;
      assert.equal(params.get("authors"), did);
      assert.equal(params.get("cursor"), "next+opaque");
      return json({ collections: [fixture(), { ...fixture(), uri: `at://did:web:other.example/${nsid}/x` }] });
    },
  });
  const result = await source.listPublisherProjects(did, "next+opaque");
  if (result.status !== "ok") assert.fail("expected validated publisher listing");
  assert.deepEqual(result.results.map((entry) => entry.status), ["indexed", "failed"]);
});

test("a restart resumes after durable commits and backoff neither advances nor deletes a source", async () => {
  const manifest = parseProjectPermissions({ version: 1, generation: 1, projects: [
    permission, { ...permission, uri: `at://${did}/${nsid}/z-project` },
  ] });
  let checkpoint = { revision: "1", offset: 0, retryAfter: null as number | null };
  const commits: string[] = [];
  const store: ProjectIndexStore = {
    open: async () => checkpoint,
    commit: async ({ checkpoint: expected, nextOffset, read, permission: current, retryAfter }) => {
      assert.equal(expected.revision, checkpoint.revision);
      commits.push(`${current.uri}:${read.status}`);
      checkpoint = { revision: String(Number(checkpoint.revision) + 1), offset: nextOffset,
        retryAfter: retryAfter ? Date.parse(retryAfter) : null };
      return checkpoint;
    },
  };
  const source = createHypercertsSource({
    now, fetch: async (url) => new URL(String(url)).searchParams.get("uri") === uri
      ? json({ collection: fixture() }) : json({}, { status: 429 }),
  });
  const input = { manifest, store, source, now, batchSize: 1 };
  assert.equal((await refreshProjectIndex(input)).status, "partial");
  assert.equal(checkpoint.offset, 1);
  assert.equal((await refreshProjectIndex(input)).status, "backoff");
  assert.equal(checkpoint.offset, 1);
  assert.equal((await refreshProjectIndex(input)).scanned, 0);
  assert.deepEqual(commits, [`${uri}:indexed`, `${manifest.permissions[1]?.uri}:failed`]);
});

test("uses the pinned embedding contract only for changed passages, with lexical fallback", async () => {
  const { PROJECT_MODEL_VERSION } = await import("./project-index-vector.ts");
  const manifest = parseProjectPermissions({ version: 1, generation: 1, projects: [permission] });
  let hasEmbedding = false, embedCalls = 0;
  const failures: boolean[] = [];
  const store: ProjectIndexStore = {
    open: async () => ({ revision: "1", offset: 0, retryAfter: null }),
    hasEmbedding: async (_uri, _contentHash, model) => {
      assert.equal(model, PROJECT_MODEL_VERSION);
      return hasEmbedding;
    },
    commit: async ({ checkpoint, read, embedding }) => {
      assert.equal(read.status, "indexed");
      failures.push(!embedding);
      return { ...checkpoint, offset: 0 };
    },
  };
  const source = { get: async () => extractCollection(fixture(), uri, fetchedAt) };
  const embedder = { modelVersion: PROJECT_MODEL_VERSION, embed: async () => {
    embedCalls++;
    return [1, ...Array<number>(255).fill(0)];
  } };
  const input = { manifest, store, source, embedder, now, batchSize: 1 };
  assert.equal((await refreshProjectIndex(input)).embedded, 2);
  hasEmbedding = true;
  assert.equal((await refreshProjectIndex(input)).embedded, 0);
  assert.equal(embedCalls, 2);
  hasEmbedding = false;
  const degraded = await refreshProjectIndex({ ...input, embedder: { ...embedder, embed: async () => [0] } });
  assert.equal(degraded.embeddingFailures, 1);
  assert.equal(degraded.indexed, 1);
  await assert.rejects(() => refreshProjectIndex({ ...input, embedder: { ...embedder, modelVersion: "other" } }),
    /incompatible_project_model/u);
  assert.deepEqual(failures, [false, true, true]);
});

test("an obsolete worker stops when its compare-and-swap loses the checkpoint", async () => {
  const manifest = parseProjectPermissions({ version: 1, generation: 1, projects: [permission] });
  const store: ProjectIndexStore = {
    open: async () => ({ revision: "1", offset: 0, retryAfter: null }),
    commit: async () => null,
  };
  const source = { get: async () => extractCollection(fixture(), uri, fetchedAt) };
  const result = await refreshProjectIndex({ manifest, store, source, now, batchSize: 1 });
  assert.equal(result.status, "contended");
  assert.equal(result.scanned, 0);
});
