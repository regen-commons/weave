import { PROJECT_EXTRACTION_VERSION, sha256 } from "./project-index-source.ts";
import { PROJECT_MODEL_VERSION, validatedProjectVector } from "./project-index-vector.ts";
import type { ProjectEmbedder, ProjectEmbedding } from "./project-index-vector.ts";
import type { ProjectManifest, ProjectPermission, ProjectRead } from "./project-index-source.ts";

export type ProjectCheckpoint = {
  revision: string;
  offset: number;
  retryAfter: number | null;
};
export type ProjectIndexStore = {
  open(manifest: ProjectManifest, hash: string): Promise<ProjectCheckpoint>;
  hasEmbedding?(uri: string, contentHash: string, modelVersion: string): Promise<boolean>;
  commit(input: {
    checkpoint: ProjectCheckpoint;
    permission: ProjectPermission;
    read: ProjectRead;
    embedding?: ProjectEmbedding;
    nextOffset: number;
    completedAt: string | null;
    retryAfter: string | null;
    checkedAt: string;
  }): Promise<(ProjectCheckpoint & { sourceStatus?: ProjectRead["status"]; embedded?: number }) | null>;
};

export async function refreshProjectIndex(input: {
  manifest: ProjectManifest;
  store: ProjectIndexStore;
  source: { get(permission: ProjectPermission): Promise<ProjectRead> };
  batchSize: number;
  embedder?: ProjectEmbedder;
  now?: () => number;
  timeBudgetMs?: number;
}) {
  if (!Number.isInteger(input.batchSize) || input.batchSize < 1 || input.batchSize > 25)
    throw Error("invalid_batch_size");
  if (input.embedder && (input.embedder.modelVersion !== PROJECT_MODEL_VERSION || !input.store.hasEmbedding))
    throw Error("incompatible_project_model");
  const now = input.now ?? Date.now;
  const deadline = now() + (input.timeBudgetMs ?? 40_000);
  const hash = sha256(JSON.stringify([PROJECT_EXTRACTION_VERSION, input.manifest.permissions]));
  const permissions = input.manifest.permissions;
  let checkpoint = await input.store.open(input.manifest, hash);
  const report = { indexed: 0, restricted: 0, missing: 0, failed: 0, scanned: 0, embedded: 0, embeddingFailures: 0, status: "bounded" };
  if (checkpoint.retryAfter !== null && checkpoint.retryAfter > now())
    return { ...report, status: "backoff" };

  for (let count = 0; count < input.batchSize && now() < deadline; count++) {
    const permission = permissions[checkpoint.offset];
    if (!permission) break;
    const read = await input.source.get(permission);
    let embedding: ProjectEmbedding | undefined;
    if (input.embedder && read.status === "indexed" && read.passages.length
      && !(await input.store.hasEmbedding?.(permission.uri, read.contentHash, PROJECT_MODEL_VERSION))) {
      try {
        const vectors = [];
        for (const { passage } of read.passages) {
          if (now() >= deadline) throw Error("embedding_time_budget");
          vectors.push(validatedProjectVector(await input.embedder.embed(passage)));
        }
        embedding = { modelVersion: PROJECT_MODEL_VERSION, vectors };
      } catch {
        report.embeddingFailures++;
      }
    }
    const time = now();
    const retryAfter = read.status === "failed" && read.retryAfterMs !== undefined
      ? new Date(time + read.retryAfterMs).toISOString() : null;
    const endOfSweep = !retryAfter && checkpoint.offset + 1 === permissions.length;
    const nextOffset = retryAfter ? checkpoint.offset : endOfSweep ? 0 : checkpoint.offset + 1;
    const checkedAt = new Date(time).toISOString();
    const result = await input.store.commit({
      checkpoint,
      permission,
      read,
      embedding,
      nextOffset,
      completedAt: endOfSweep ? checkedAt : null,
      retryAfter,
      checkedAt,
    });
    if (!result) return { ...report, status: "contended" };
    report[result.sourceStatus ?? read.status]++;
    report.embedded += result.embedded ?? embedding?.vectors.length ?? 0;
    report.scanned++;
    checkpoint = result;
    if (retryAfter) return { ...report, status: "backoff" };
    if (endOfSweep) return { ...report, status: report.failed ? "partial" : "bounded" };
  }
  return { ...report, status: permissions.length ? "partial" : "bounded" };
}
