import { observeApi } from "./usage.ts";
import { renewalSettings } from "./account-runtime.ts";
import { withRenewedSession } from "./account-session.ts";
import { performance } from "node:perf_hooks";
import { serverTiming, withServerTiming } from "./certified/server-timing.ts";
import { projectRuntime, projectUnavailable } from "./project-runtime.ts";

// Renews a lapsed access token first, so a 401 here means the session ended, as from /api/account.
const consent = withRenewedSession(
  async (request: Request) => (await projectRuntime())?.auth.consent(request) ?? projectUnavailable(), renewalSettings);

/** The most a warm request's body may hold: `{"warm":true}` and a little room. */
const WARM_BODY_LIMIT = 64;

/**
 * Whether this is the page asking the function to start before it is needed: a same-origin JSON
 * POST whose body is exactly `{"warm":true}`. Consent follows sign-in, and the first request after
 * a quiet spell waited over a second for the function to start, before the page could leave for
 * Certified. A warm request reads no session, sets no cookie and starts no consent. It does build the
 * project runtime and ready Certified's metadata and a DPoP nonce.
 */
export async function isWarmRequest(request: Request): Promise<boolean> {
  if (request.method !== "POST") return false;
  if (request.headers.get("origin") !== new URL(request.url).origin) return false;
  if (request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") return false;
  const length = Number(request.headers.get("content-length") ?? Number.NaN);
  if (!Number.isFinite(length) || length > WARM_BODY_LIMIT) return false;
  try {
    const body: unknown = JSON.parse(await request.clone().text());
    return typeof body === "object" && body !== null && !Array.isArray(body) &&
      Object.keys(body).length === 1 && (body as Record<string, unknown>).warm === true;
  } catch {
    return false;
  }
}

/** Whether this instance has answered a request before, for the timing label only. */
let served = false;

async function post(request: Request): Promise<Response> {
  const timing = serverTiming(), cold = !served;
  served = true;
  if (await isWarmRequest(request)) {
    // Also readies Certified's metadata (kept five minutes) and a DPoP nonce (one minute) for the
    // permission start that follows a sign-in. Neither result changes the answer.
    const auth = await timing.time("runtime", async () => (await projectRuntime())?.auth, cold ? "cold" : "warm");
    if (auth) {
      const started = performance.now(), outcome = await auth.prime();
      timing.add("prime", performance.now() - started, outcome);
    }
    return withServerTiming(new Response(JSON.stringify({ warm: true }), {
      status: 200,
      headers: { "Cache-Control": "no-store", "Content-Type": "application/json", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" },
    }), timing);
  }
  timing.add("instance", 0, cold ? "cold" : "warm");
  const response = await consent(request);
  // The consent's own steps already set theirs; this adds whether the instance was new.
  const own = response.headers.get("Server-Timing");
  try { response.headers.set("Server-Timing", [timing.header(), own].filter(Boolean).join(", ")); } catch { /* Timing never changes an answer. */ }
  return response;
}

export const POST = observeApi("certified-project-consent", post);
