import { record, uuid } from "./account-contract.ts";
import type { PartnerKind } from "./partner-matcher.ts";
import { connectRestrictedIndexDatabase } from "./project-index-db.ts";
import { PROJECT_MODEL_VERSION, validatedProjectVector } from "./project-index-vector.ts";
import type { ProjectEmbedder } from "./project-index-vector.ts";

export const MAX_QUERY_EMBEDDING_BATCH = 25;
export type ReviewedQueryProjection = {
  initiativeId: string;
  kind: PartnerKind;
  entryId: string;
  revision: number;
  shareVersion: number;
  text: string;
};

type ReviewedQueryRef = Omit<ReviewedQueryProjection, "text">;

type ReviewedQueryEmbeddingStore = {
  pending(limit: number, modelVersion: string): Promise<unknown>;
  save(query: ReviewedQueryRef, modelVersion: string, vector: number[]): Promise<boolean>;
};

function pendingProjections(input: unknown, limit: number): ReviewedQueryProjection[] {
  if (!Array.isArray(input) || input.length > limit) throw Error("invalid_query_embedding_batch");
  return input.map((item: unknown) => {
    const projection = record(item);
    const { initiativeId, kind, entryId, revision, shareVersion, text } = projection;
    if (Object.keys(projection).length !== 6 || !uuid(initiativeId) || !uuid(entryId) || (kind !== "need" && kind !== "offer")
      || typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 1
      || typeof shareVersion !== "number" || !Number.isSafeInteger(shareVersion) || shareVersion < 1
      || typeof text !== "string" || !text.trim() || text.length > 1200)
      throw Error("invalid_query_embedding_projection");
    return { initiativeId, kind, entryId, revision, shareVersion, text };
  });
}

export async function connectReviewedQueryEmbeddingStore(url: string) {
  const sql = await connectRestrictedIndexDatabase(url, "weave_query_embedding_job");
  const store: ReviewedQueryEmbeddingStore = {
    async pending(limit, version) {
      const [result] = await sql<{ pending: unknown }[]>`
        select private.weave_matching_vector_pending(${version}, ${limit}::integer) as pending
      `;
      return result?.pending;
    },
    async save(query, version, vector) {
      const [result] = await sql<{ saved: boolean }[]>`
        select private.weave_matching_vector_store(
          ${query.initiativeId}::uuid, ${query.kind}, ${query.entryId}::uuid,
          ${query.revision}::bigint, ${query.shareVersion}::bigint,
          ${version}, ${JSON.stringify(vector)}::extensions.vector
        ) as saved
      `;
      if (typeof result?.saved !== "boolean") throw Error("invalid_query_embedding_receipt");
      return result.saved;
    },
  };
  return { store, close: () => sql.end({ timeout: 3 }) };
}

export async function runReviewedQueryEmbeddingBatch(input: {
  batchSize: number;
  store: ReviewedQueryEmbeddingStore;
  embedder: ProjectEmbedder;
  now?: () => number;
}) {
  if (!Number.isInteger(input.batchSize) || input.batchSize < 1 || input.batchSize > MAX_QUERY_EMBEDDING_BATCH)
    throw Error("invalid_query_embedding_batch_size");
  const { store, embedder } = input;
  if (embedder.modelVersion !== PROJECT_MODEL_VERSION) throw Error("incompatible_project_model");
  const now = input.now ?? Date.now;
  const deadline = now() + 40_000;
  const queries = pendingProjections(await store.pending(input.batchSize, PROJECT_MODEL_VERSION), input.batchSize);
  const report = { selected: queries.length, saved: 0, stale: 0, embeddingFailures: 0, deferred: 0 };
  for (const { text, ...ref } of queries) {
    if (now() >= deadline) break;
    let vector: number[];
    try {
      vector = validatedProjectVector(await embedder.embed(text));
    } catch {
      report.embeddingFailures++;
      // A failed local runtime can affect every query. Leave the batch retryable.
      break;
    }
    if (now() >= deadline) break;
    if (await store.save(ref, PROJECT_MODEL_VERSION, vector)) report.saved++;
    else report.stale++;
  }
  report.deferred = report.selected - report.saved - report.stale - report.embeddingFailures;
  return report;
}
