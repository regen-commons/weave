import type { createHypercertsSource, ProjectManifest } from "./project-index-source.ts";

type Source = Pick<ReturnType<typeof createHypercertsSource>, "listProjects">;

/** Read-only aggregate evidence. Public accessibility never creates a redisplay grant. */
export async function auditProjectNetwork(options: {
  source: Source;
  maxPages: number;
  manifest?: ProjectManifest;
  now?: () => number;
}) {
  if (!Number.isSafeInteger(options.maxPages) || options.maxPages < 1 || options.maxPages > 10_000)
    throw Error("invalid_page_budget");
  const now = options.now ?? Date.now;
  const startedAt = new Date(now()).toISOString();
  const report = {
    mode: "public_index_audit" as const,
    startedAt,
    finishedAt: startedAt,
    status: "partial" as "complete" | "partial" | "failed",
    code: null as string | null,
    pages: 0,
    records: 0,
    uniqueProjects: 0,
    duplicateRecords: 0,
    counts: { indexed: 0, restricted: 0, failed: 0, missing: 0 },
    extractablePassages: 0,
    permittedProjects: 0,
    permittedPassages: 0,
    oldestIndexedAt: null as string | null,
    newestIndexedAt: null as string | null,
    indexAgeMs: null as { min: number; max: number } | null,
    // createdAt is author-declared, and indexedAt is not a source modification time.
    propagationLagMs: null,
    relevance: null,
    domainCoverage: null,
    networkCoverage: "followed_pds_and_retained_collections_only" as const,
    consistentSnapshot: false,
  };
  const permissions = new Map((options.manifest?.permissions ?? []).map(p => [p.uri, p.redisplayUntil]));
  const seen = new Set<string>(), cursors = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < options.maxPages; page++) {
    const result = await options.source.listProjects(cursor);
    if (result.status !== "ok") {
      report.status = "failed";
      report.code = result.code;
      break;
    }
    report.pages++;
    for (const row of result.results) {
      report.records++;
      if (row.uri && seen.has(row.uri)) { report.duplicateRecords++; continue; }
      if (row.uri) { seen.add(row.uri); report.uniqueProjects++; }
      report.counts[row.status]++;
      if (row.status !== "indexed") continue;
      report.extractablePassages += row.passages.length;
      const until = row.uri && permissions.get(row.uri);
      if (until && Date.parse(until) > now()) {
        report.permittedProjects++;
        report.permittedPassages += row.passages.length;
      }
      if (row.sourceIndexedAt) {
        const date = new Date(row.sourceIndexedAt).toISOString();
        if (!report.oldestIndexedAt || date < report.oldestIndexedAt) report.oldestIndexedAt = date;
        if (!report.newestIndexedAt || date > report.newestIndexedAt) report.newestIndexedAt = date;
      }
    }
    if (!result.cursor) { report.status = "complete"; break; }
    if (cursors.has(result.cursor)) { report.status = "failed"; report.code = "source_cursor_cycle"; break; }
    cursors.add(result.cursor);
    cursor = result.cursor;
  }
  const finished = now();
  report.finishedAt = new Date(finished).toISOString();
  if (report.oldestIndexedAt && report.newestIndexedAt) report.indexAgeMs = {
    min: finished - Date.parse(report.newestIndexedAt), max: finished - Date.parse(report.oldestIndexedAt),
  };
  return report;
}
