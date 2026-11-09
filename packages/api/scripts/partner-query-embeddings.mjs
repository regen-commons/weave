import {
  connectReviewedQueryEmbeddingStore,
  MAX_QUERY_EMBEDDING_BATCH,
  runReviewedQueryEmbeddingBatch,
} from "../src/partner-matcher-query-job.ts";

const stableErrors = new Set([
  "invalid_query_embedding_batch_size", "query_embedding_database_url_required",
  "invalid_index_database_url", "index_database_role_required", "query_embedding_model_unavailable",
  "invalid_query_embedding_batch", "invalid_query_embedding_projection", "incompatible_project_model",
]);

async function main() {
  const [size = "10", ...rest] = process.argv.slice(2);
  const batchSize = Number(size);
  if (rest.length || !/^\d+$/u.test(size) || batchSize < 1 || batchSize > MAX_QUERY_EMBEDDING_BATCH)
    throw Error("invalid_query_embedding_batch_size");
  const url = process.env.WEAVE_QUERY_EMBEDDING_DATABASE_URL;
  if (!url) throw Error("query_embedding_database_url_required");
  const start = performance.now();
  const connection = await connectReviewedQueryEmbeddingStore(url);
  try {
    const embedder = await import("./project-embedding.mjs")
      .then(({ createPinnedProjectEmbedder }) => createPinnedProjectEmbedder())
      .catch(() => { throw Error("query_embedding_model_unavailable"); });
    try {
      const result = await runReviewedQueryEmbeddingBatch({ batchSize, store: connection.store, embedder });
      console.log(JSON.stringify({ ...result, durationMs: Math.round(performance.now() - start),
        modelVersion: embedder.modelVersion }));
      if (result.embeddingFailures) process.exitCode = 1;
    } finally {
      await embedder.close();
    }
  } finally {
    await connection.close();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    error: error instanceof Error && stableErrors.has(error.message) ? error.message : "query_embedding_job_failed",
  }));
  process.exitCode = 1;
});
