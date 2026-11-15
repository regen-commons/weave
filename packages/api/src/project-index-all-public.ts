import { refreshProjectIndex, type ProjectIndexStore } from "./project-index.ts";
import { isCertifiedTestHost, type AccountHost, type AccountHostResolver } from "./project-index-hosts.ts";
import type { createHypercertsSource, ProjectManifest, ProjectRead } from "./project-index-source.ts";
import { traverseProjectNetwork } from "./project-index-traversal.ts";
import { parseProjectUri } from "./project-uri.ts";

/**
 * Weave shows every listed public Certified project (user decision, 15 November 2026). A complete
 * traversal of the source's listing is the permission set: a project that disappears or becomes
 * unlisted is withdrawn by the next complete traversal. A project stays shown this long without a later
 * complete traversal confirming it, which bounds how long a failing source can keep stale projects up.
 */
export const ALL_PUBLIC_REDISPLAY_MS = 72 * 60 * 60 * 1000;
/** Twenty-five records a page took 46 pages and 18 seconds for the 1,131 records listed on 15 November. */
const PAGE_LIMIT = 25;
const PAGE_ATTEMPTS = 3;
/**
 * A complete-looking listing that would withdraw more than half of the shown projects is more likely a
 * source fault than a mass removal, so it is not applied, even if new projects keep the count up. Expiry
 * still removes them if it persists.
 */
const SHRINK_GUARD_MINIMUM = 20;
/** Account lookups at once. 1,068 accounts took 14 seconds at six on 15 November. */
const HOST_LOOKUPS = 6;

type Source = Pick<ReturnType<typeof createHypercertsSource>, "listProjects">;
type Indexed = Extract<ProjectRead, { status: "indexed" }>;
export type AllPublicStore = ProjectIndexStore & Required<Pick<ProjectIndexStore, "state">>;
export type AllPublicReport = Awaited<ReturnType<typeof refreshAllPublicProjects>>;

function counts() {
  return {
    mode: "all_public" as const,
    /** `complete` and `partial` replaced the permission set; `not_replaced` and `contended` changed nothing it shows. */
    status: "not_replaced" as "complete" | "partial" | "not_replaced" | "contended",
    code: null as string | null,
    pages: 0, records: 0, listed: 0, unlisted: 0, invalid: 0, duplicates: 0, withoutText: 0,
    /** Projects left out because their account is on a Certified test server, or has no usable server. */
    accounts: 0, testHosts: 0, withoutHost: 0,
    shownBefore: 0, withdrawn: 0, generation: null as number | null,
    indexed: 0, restricted: 0, missing: 0, failed: 0, scanned: 0,
  };
}

/** Applies a permission set and commits each project's read until the sweep ends or time runs out. */
async function apply(store: AllPublicStore, manifest: ProjectManifest, reads: Map<string, Indexed>,
  report: ReturnType<typeof counts>, deadline: number, now: () => number) {
  report.generation = manifest.generation;
  // Every read came from the completed traversal. Nothing is fetched again here.
  const source = { get: async ({ uri }: { uri: string }): Promise<ProjectRead> =>
    reads.get(uri) ?? { status: "failed", code: "source_unavailable" } };
  for (;;) {
    const result = await refreshProjectIndex({ manifest, store, source, batchSize: 25, now, readsInHand: true,
      timeBudgetMs: Math.max(0, deadline - now()) });
    for (const key of ["indexed", "restricted", "missing", "failed", "scanned"] as const) report[key] += result[key];
    if (result.status === "contended") return { ...report, status: "contended" as const, code: "index_contended" };
    if (result.swept) return { ...report, status: "complete" as const };
    if (!result.scanned || result.status === "backoff" || now() >= deadline)
      return { ...report, status: "partial" as const, code: "index_time_budget" };
  }
}

/**
 * Traverses the whole listing, then replaces the permission set with the listed public projects whose
 * accounts are not on a Certified test server, in a new generation. A failed or partial traversal, or an
 * account lookup that fails, changes nothing. The existing checkpoint, expiry and withdrawal handling
 * applies the set, and projects checked longest ago are committed first so a sweep cut short by time is
 * finished by the next run instead of starting over at the same place.
 */
export async function refreshAllPublicProjects(input: {
  source: Source;
  store: AllPublicStore;
  hosts: AccountHostResolver;
  deadline: number;
  traversalDeadline?: number;
  maxPages?: number;
  allowShrink?: boolean;
  now?: () => number;
  wait?: (ms: number) => Promise<void>;
}) {
  const now = input.now ?? Date.now;
  const report = counts();
  const views = new Map<string, Indexed | null>();
  const traversal = await traverseProjectNetwork({
    source: input.source, maxPages: input.maxPages ?? 400, limit: PAGE_LIMIT, attempts: PAGE_ATTEMPTS,
    wait: input.wait, now, deadline: input.traversalDeadline ?? input.deadline,
    onPage(results) {
      for (const row of results) {
        report.records++;
        if (!row.uri) { report.invalid++; continue; }
        if (views.has(row.uri)) report.duplicates++;
        // Pages are not an atomic snapshot. The later view of a record is the newer one.
        views.set(row.uri, row.status === "indexed" ? row : null);
      }
    },
  });
  report.pages = traversal.pages;
  const reads = new Map<string, Indexed>();
  for (const [uri, view] of views) if (view) reads.set(uri, view);
  report.listed = reads.size;
  report.unlisted = views.size - reads.size;
  if (traversal.status !== "complete") return { ...report, code: traversal.code ?? "traversal_incomplete" };

  // Accounts on Certified's development and test servers hold test data and are left out. A lookup that
  // fails now makes the run incomplete, so a directory outage can never withdraw a real project.
  const accounts = [...new Set([...reads.keys()].map((uri) => parseProjectUri(uri).did))];
  report.accounts = accounts.length;
  const hosts = new Map<string, AccountHost>();
  const lookupDeadline = input.traversalDeadline ?? input.deadline;
  let late = false;
  await Promise.all(Array.from({ length: Math.min(HOST_LOOKUPS, accounts.length) }, async () => {
    for (let did = accounts.pop(); did !== undefined; did = accounts.pop()) {
      if (now() >= lookupDeadline) { late = true; return; }
      hosts.set(did, await input.hosts.resolve(did).catch((): AccountHost => ({ status: "failed" })));
    }
  }));
  if (late) return { ...report, code: "traversal_time_budget" };
  if ([...hosts.values()].some(({ status }) => status === "failed")) return { ...report, code: "account_host_unavailable" };
  for (const uri of [...reads.keys()]) {
    const host = hosts.get(parseProjectUri(uri).did);
    if (host?.status === "found" && !isCertifiedTestHost(host.host)) continue;
    reads.delete(uri);
    if (host?.status === "found") report.testHosts++;
    else report.withoutHost++;
  }
  report.withoutText = [...reads.values()].filter(({ passages }) => !passages.length).length;

  const state = await input.store.state();
  const shown = state.projects.filter((project) => project.shown);
  report.shownBefore = shown.length;
  report.withdrawn = shown.filter(({ uri }) => !reads.has(uri)).length;
  if (!input.allowShrink && shown.length >= SHRINK_GUARD_MINIMUM && report.withdrawn * 2 > shown.length)
    return { ...report, code: "suspicious_shrink" };

  const checked = new Map(state.projects.map(({ uri, checkedAt }) => [uri, Date.parse(checkedAt)]));
  const redisplayUntil = new Date(now() + ALL_PUBLIC_REDISPLAY_MS).toISOString();
  const permissions = [...reads.keys()]
    .sort((a, b) => (checked.get(a) ?? -Infinity) - (checked.get(b) ?? -Infinity) || (a < b ? -1 : a > b ? 1 : 0))
    .map((uri) => ({ uri, redisplayUntil }));
  return apply(input.store, { generation: state.generation + 1, permissions }, reads, report, input.deadline, now);
}

/** Withdraws every project at once, for rollback. Stop the scheduled refresh first or it adds them back. */
export async function withdrawAllPublicProjects(input: { store: AllPublicStore; now?: () => number }) {
  const now = input.now ?? Date.now;
  const report = counts();
  const state = await input.store.state();
  report.shownBefore = state.projects.filter(({ shown }) => shown).length;
  report.withdrawn = report.shownBefore;
  return apply(input.store, { generation: state.generation + 1, permissions: [] }, new Map(), report, now() + 30_000, now);
}
