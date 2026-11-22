import { createHash, timingSafeEqual } from "node:crypto";
import { refreshAllPublicProjects, type AllPublicStore } from "./project-index-all-public.ts";
import { createAccountHostResolver, type AccountHostResolver } from "./project-index-hosts.ts";
import { createHypercertsSource } from "./project-index-source.ts";

/**
 * The refresh starts no new work after four minutes, inside the 300-second limit of a Hobby function.
 * The traversal, the account lookups and the work scope reads share the first half: on 15 November the
 * first two took 18 and 14 seconds, and on 21 November the work scope reads took about 40.
 */
const RUN_BUDGET_MS = 240_000;
const TRAVERSAL_BUDGET_MS = 120_000;
const knownErrors = new Set(["index_database_role_required", "invalid_index_database_url", "obsolete_or_conflicting_manifest"]);

const digest = (value: string) => createHash("sha256").update(value).digest();
/** Compares fixed-length digests, so the check takes the same time for any header. */
const authorized = (header: string | null, secret: string) => timingSafeEqual(digest(header ?? ""), digest(`Bearer ${secret}`));

function respond(status: number, body: unknown) {
  return Response.json(body, { status, headers: {
    "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...(status === 405 ? { Allow: "GET" } : {}),
  } });
}

/**
 * Vercel Cron calls this once a day with `Authorization: Bearer $CRON_SECRET`. It runs only when
 * WEAVE_INDEX_REFRESH=all-public, so the schedule can stay deployed while the refresh is off. The
 * response and the one log line carry counts and codes, never project text, addresses or secrets.
 */
export function createProjectIndexRefreshHandler(options: {
  env: Record<string, string | undefined>;
  connect(url: string, ca: string | undefined): Promise<{ store: AllPublicStore; close(): Promise<void> }>;
  source?: Parameters<typeof refreshAllPublicProjects>[0]["source"];
  hosts?: AccountHostResolver;
  now?: () => number;
  wait?: (ms: number) => Promise<void>;
  log?: (line: string) => void;
}) {
  const now = options.now ?? Date.now;
  const log = options.log ?? ((line: string) => console.log(line));
  return async (request: Request): Promise<Response> => {
    if (request.method !== "GET") return respond(405, { error: "method_not_allowed" });
    const { env } = options;
    const secret = env.CRON_SECRET;
    if (!secret || secret.length < 16) return respond(503, { error: "project_index_refresh_unavailable" });
    if (!authorized(request.headers.get("authorization"), secret)) return respond(401, { error: "unauthorized" });
    if (env.WEAVE_INDEX_REFRESH !== "all-public") return respond(503, { error: "project_index_refresh_disabled" });
    const url = env.WEAVE_INDEX_DATABASE_URL;
    if (!url) return respond(503, { error: "project_index_refresh_unavailable" });

    const started = now();
    let connection: Awaited<ReturnType<typeof options.connect>> | undefined;
    try {
      connection = await options.connect(url, env.WEAVE_DATABASE_CA_PEM);
      const report = await refreshAllPublicProjects({
        source: options.source ?? createHypercertsSource({ now, wait: options.wait }), store: connection.store,
        hosts: options.hosts ?? createAccountHostResolver({ wait: options.wait }),
        deadline: started + RUN_BUDGET_MS, traversalDeadline: started + TRAVERSAL_BUDGET_MS, now, wait: options.wait,
      });
      const result = { ...report, durationMs: Math.round(now() - started) };
      log(JSON.stringify({ event: "project_index_refresh", ...result }));
      return respond(report.status === "complete" || report.status === "partial" ? 200 : 503, result);
    } catch (error) {
      const code = error instanceof Error && knownErrors.has(error.message) ? error.message : "project_index_refresh_failed";
      log(JSON.stringify({ event: "project_index_refresh", status: "failed", code, durationMs: Math.round(now() - started) }));
      return respond(503, { error: code });
    } finally {
      await connection?.close().catch(() => undefined);
    }
  };
}
