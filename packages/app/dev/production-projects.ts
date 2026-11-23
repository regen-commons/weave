// Development only, and only when asked for: reads the public project list from production, so
// the Initiatives page can be checked against real projects while everything else stays local.
// Nothing but that one GET leaves the dev server, and it carries nothing of the person's.
import { PUBLIC_ORIGIN } from "../src/public-origin.ts";

/** The environment flag that turns the read on. Off by default; the dev server never forwards without it. */
export const PRODUCTION_PROJECTS_FLAG = "WEAVE_PRODUCTION_PROJECTS";
/** The one entry that may be read from production. */
const ENTRY = "public-projects";
/**
 * The list's own parameters, and `uri` for the one-project lookup a record page makes. Anything
 * else in the address stays here.
 */
const PARAMETERS = ["q", "organizationType", "workScope", "sort", "cursor", "limit", "uri"] as const;
const TIMEOUT_MS = 8000;

/** Whether the dev server answers this entry from production: the public project list, with the flag on. */
export function readsProduction(flag: string | undefined, name: string): boolean {
  return flag === "1" && name === ENTRY;
}

/** The production address for a local request: the list's path and its own parameters, nothing else. */
export function productionProjectsUrl(local: URL): URL {
  const target = new URL(`/api/${ENTRY}`, PUBLIC_ORIGIN);
  for (const key of PARAMETERS) {
    const value = local.searchParams.get(key);
    if (value !== null) target.searchParams.set(key, value);
  }
  return target;
}

/**
 * The entry's handlers while the flag is on: GET alone, so the bridge refuses every other method
 * with 405 before anything is sent. The request that leaves is built here from nothing: no cookie,
 * no authorization and no header of the browser's goes with it, and a redirect is not followed.
 */
export function productionPublicProjects(request: typeof fetch = fetch): { GET(local: Request): Promise<Response> } {
  return {
    async GET(local) {
      const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
      try {
        const upstream = await request(productionProjectsUrl(new URL(local.url)), {
          method: "GET",
          headers: { accept: "application/json" },
          credentials: "omit",
          redirect: "error",
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        return new Response(await upstream.text(), {
          status: upstream.status,
          headers: { ...headers, "Content-Type": upstream.headers.get("content-type") ?? "application/json" },
        });
      } catch {
        // The page falls back to its starter list, as it does when the local list does not answer.
        return Response.json({ error: "production_projects_unavailable" }, { status: 502, headers });
      }
    },
  };
}
