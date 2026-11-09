import assert from "node:assert/strict";
import test from "node:test";
import { runReviewedQueryEmbeddingBatch } from "./partner-matcher-query-job.ts";
import { PROJECT_MODEL_VERSION } from "./project-index-vector.ts";

const approved = {
  initiativeId: "00000000-0000-4000-8000-000000000001",
  kind: "need",
  entryId: "00000000-0000-4000-8000-000000000002",
  revision: 7,
  shareVersion: 5,
  text: "Mapmaking tools. For wetland restoration.",
};
const changedDuringInference = { ...approved, revision: 8, shareVersion: 6 };
const vector = [1, ...Array<number>(255).fill(0)];
const embedder = { modelVersion: PROJECT_MODEL_VERSION, embed: async () => vector };

test("embeds exactly the reviewed projection and reports a stale compare-and-save separately", async () => {
  const seen: string[] = [];
  const result = await runReviewedQueryEmbeddingBatch({
    batchSize: 2,
    embedder: { ...embedder, async embed(text) { seen.push(text); return vector; } },
    store: {
      async pending(limit, modelVersion) {
        assert.equal(limit, 2);
        assert.equal(modelVersion, PROJECT_MODEL_VERSION);
        return [approved, changedDuringInference];
      },
      async save(query, version, embedding) {
        assert.equal(version, PROJECT_MODEL_VERSION);
        assert.deepEqual(embedding, vector);
        assert.equal(query.entryId, approved.entryId);
        assert.equal(Object.hasOwn(query, "text"), false);
        return query.revision === approved.revision && query.shareVersion === approved.shareVersion;
      },
    },
  });
  assert.deepEqual(seen, [approved.text, changedDuringInference.text]);
  assert.deepEqual(result, { selected: 2, saved: 1, stale: 1, embeddingFailures: 0, deferred: 0 });
});

test("rejects excessive batches, unexpected projection fields and incompatible models before inference", async () => {
  const input = {
    batchSize: 1,
    embedder: { ...embedder, async embed() { assert.fail("inference must not run"); } },
    store: {
      async pending() { return [{ ...approved, privateNotes: "never pass to the model" }]; },
      async save() { assert.fail("write must not run"); },
    },
  };
  await assert.rejects(runReviewedQueryEmbeddingBatch({ ...input, batchSize: 26 }), /invalid_query_embedding_batch_size/u);
  await assert.rejects(runReviewedQueryEmbeddingBatch(input), /invalid_query_embedding_projection/u);
  await assert.rejects(runReviewedQueryEmbeddingBatch({ ...input, embedder: { ...embedder, modelVersion: "other" } }),
    /incompatible_project_model/u);
});

test("bad local vectors stay pending and leave lexical search usable", async () => {
  const result = await runReviewedQueryEmbeddingBatch({
    batchSize: 2,
    embedder: { ...embedder, embed: async () => [0] },
    store: {
      pending: async () => [approved, changedDuringInference],
      async save() { assert.fail("bad vectors cannot be stored"); },
    },
  });
  assert.deepEqual(result, { selected: 2, saved: 0, stale: 0, embeddingFailures: 1, deferred: 1 });
});

test("a batch time budget prevents late writes", async () => {
  let clock = 0;
  const result = await runReviewedQueryEmbeddingBatch({
    batchSize: 1,
    now: () => clock,
    embedder: { ...embedder, embed: async () => { clock += 40_000; return vector; } },
    store: {
      pending: async () => [approved],
      async save() { assert.fail("late embeddings must stay pending"); },
    },
  });
  assert.deepEqual(result, { selected: 1, saved: 0, stale: 0, embeddingFailures: 0, deferred: 1 });
});
