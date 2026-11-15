import type { createHypercertsSource, ProjectManifest } from "./project-index-source.ts";
import { traverseProjectNetwork } from "./project-index-traversal.ts";

type Source = Pick<ReturnType<typeof createHypercertsSource>, "listProjects">;

/** Read-only aggregate evidence. It reads and counts; it never changes what Weave shows. */
export async function auditProjectNetwork(options: {
  source: Source;
  maxPages: number;
  manifest?: ProjectManifest;
  now?: () => number;
}) {
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
  const seen = new Set<string>();
  const traversal = await traverseProjectNetwork({ source: options.source, maxPages: options.maxPages, now, onPage(results) {
    for (const row of results) {
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
  } });
  report.status = traversal.status;
  report.code = traversal.code;
  report.pages = traversal.pages;
  const finished = now();
  report.finishedAt = new Date(finished).toISOString();
  if (report.oldestIndexedAt && report.newestIndexedAt) report.indexAgeMs = {
    min: finished - Date.parse(report.newestIndexedAt), max: finished - Date.parse(report.oldestIndexedAt),
  };
  return report;
}
