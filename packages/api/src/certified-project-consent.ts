import { renewalSettings } from "./account-runtime.ts";
import { withRenewedSession } from "./account-session.ts";
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
 * Certified. A warm request reads no session, sets no cookie and starts nothing.
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

export async function POST(request: Request): Promise<Response> {
  if (await isWarmRequest(request)) {
    return new Response(JSON.stringify({ warm: true }), {
      status: 200,
      headers: { "Cache-Control": "no-store", "Content-Type": "application/json", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" },
    });
  }
  return consent(request);
}
