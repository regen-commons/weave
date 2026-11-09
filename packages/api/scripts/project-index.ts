import { open } from "node:fs/promises";
import { connectProjectIndex } from "../src/project-index-postgres.ts";
import { createHypercertsSource, parseProjectPermissions } from "../src/project-index-source.ts";
import { refreshProjectIndex } from "../src/project-index.ts";

async function manifestFile(path: string) {
  if (/(?:^|[\/\\])\.env(?:\.|$)/iu.test(path)) throw Error("invalid_manifest_path");
  const handle = await open(path, "r");
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > 512 * 1024) throw Error("invalid_manifest_size");
    const buffer = Buffer.alloc(stat.size + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead !== stat.size) throw Error("invalid_manifest_size");
    return parseProjectPermissions(JSON.parse(buffer.subarray(0, bytesRead).toString("utf8")));
  } finally {
    await handle.close();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const embeddings = args.at(-1) === "--embeddings";
  if (embeddings) args.pop();
  const [mode, value, batch, ...rest] = args;
  const source = createHypercertsSource();
  if (mode === "--probe-publisher" && value && !batch && !embeddings) {
    const counts = { indexed: 0, restricted: 0, failed: 0, missing: 0 };
    let cursor: string | undefined;
    let pages = 0;
    for (let page = 0; page < 2; page++) {
      const result = await source.listPublisherProjects(value, cursor);
      if (result.status !== "ok") {
        console.log(JSON.stringify({ mode: "read_only", pages, counts, status: result.code }));
        process.exitCode = 1;
        return;
      }
      pages++;
      for (const row of result.results) counts[row.status]++;
      cursor = result.cursor;
      if (!cursor) break;
    }
    console.log(JSON.stringify({ mode: "read_only", pages, counts, more: Boolean(cursor) }));
    return;
  }
  if (mode !== "--refresh" || !value || rest.length) throw Error("index_arguments_required");
  const batchSize = batch === undefined ? 10 : Number(batch);
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 25) throw Error("invalid_batch_size");
  const manifest = await manifestFile(value);
  const url = process.env.WEAVE_INDEX_DATABASE_URL;
  if (!url) throw Error("index_database_url_required");
  const start = performance.now();
  const connection = await connectProjectIndex(url);
  try {
    const embedder = embeddings ? await import("./project-embedding.mjs")
      .then(({ createPinnedProjectEmbedder }) => createPinnedProjectEmbedder()).catch(() => undefined) : undefined;
    try {
      const result = await refreshProjectIndex({ manifest, source, store: connection.store, batchSize, embedder });
      console.log(JSON.stringify({ ...result, modelVersion: embedder?.modelVersion ?? null,
        modelUnavailable: embeddings && !embedder, durationMs: Math.round(performance.now() - start) }));
    } finally {
      await embedder?.close();
    }
  } finally {
    await connection.close();
  }
}

const codes = new Set([
  "index_arguments_required", "invalid_manifest_path", "invalid_manifest_size", "invalid_permission_manifest",
  "duplicate_permission", "invalid_project_uri", "invalid_source_date", "invalid_batch_size",
  "index_database_url_required", "invalid_index_database_url", "index_database_role_required",
  "obsolete_or_conflicting_manifest", "invalid_source_query",
]);
main().catch((error: unknown) => {
  console.error(JSON.stringify({
    error: error instanceof Error && codes.has(error.message) ? error.message : "index_job_failed",
  }));
  process.exitCode = 1;
});
