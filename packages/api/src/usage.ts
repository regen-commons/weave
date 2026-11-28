import postgres from "postgres";
import { callerAddress, createRateLimiter } from "./mcp-limit.ts";

const EVENTS = new Set([
  "sign-in-started", "sign-in-handoff", "sign-in-start-failed", "sign-in-completed",
  "sign-in-cancelled", "sign-in-expired", "sign-in-failed",
  "funding-search-started", "funding-search-results", "funding-search-empty", "funding-search-unavailable",
  "initiative-search-started", "initiative-search-results", "initiative-search-empty", "initiative-search-unavailable",
]);
const burst = { limit: 40, windowMs: 60_000 };
const capacity = { limit: 300, windowMs: 60_000 };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const maxClockSkew = 5 * 60_000;
type UsageEvent = { event: string; attempt: string; timestamp: number };
type Capture = (event: UsageEvent) => Promise<void>;

function parseUsage(value: unknown, now = Date.now()): UsageEvent | null {
  if (!Array.isArray(value) || value.length !== 3) return null;
  const [event, attempt, timestamp]: unknown[] = value;
  if (typeof event !== "string" || !EVENTS.has(event) || typeof attempt !== "string" || !uuid.test(attempt) ||
      typeof timestamp !== "number" || !Number.isSafeInteger(timestamp)) return null;
  return { event, attempt, timestamp: Math.abs(timestamp - now) <= maxClockSkew ? timestamp : now };
}

function response(status: number) {
  return new Response(null, { status, headers: { "Cache-Control": "no-store" } });
}

/** Bodies contain a short tuple of event name, attempt ID and timestamp. Bound the stream even when Content-Length is missing. */
async function readEvent(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const timer = setTimeout(() => { void reader.cancel().catch(() => {}); }, 1000);
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) return JSON.parse(text + decoder.decode()) as unknown;
      bytes += part.value.byteLength;
      if (bytes > 128) {
        void reader.cancel().catch(() => {});
        return null;
      }
      text += decoder.decode(part.value, { stream: true });
    }
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}

export function createUsageHandler(capture: Capture | null, limiter = createRateLimiter()) {
  return async function POST(request: Request): Promise<Response> {
    if (!capture) return response(204);
    if (request.headers.get("sec-gpc") === "1") return response(204);
    if (request.headers.get("origin") !== new URL(request.url).origin) return response(403);
    if (request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json")
      return response(415);
    if (!limiter.caller(callerAddress(request), burst).ok || !limiter.ceiling("usage", capacity).ok)
      return response(429);
    const event = parseUsage(await readEvent(request));
    if (!event) return response(400);
    try {
      await capture(event);
      return response(204);
    } catch {
      return response(503);
    }
  };
}

function usageDatabase(env: NodeJS.ProcessEnv) {
  if (env.VERCEL_ENV !== "production" || !env.WEAVE_OBSERVABILITY_DATABASE_URL) return null;
  const database = new URL(env.WEAVE_OBSERVABILITY_DATABASE_URL);
  if (!["postgres:", "postgresql:"].includes(database.protocol) ||
      database.searchParams.has("ssl") || database.searchParams.has("sslmode"))
    throw Error("invalid_observability_database_configuration");
  return postgres(String(database), {
    ssl: { rejectUnauthorized: true, ca: env.WEAVE_OBSERVABILITY_DATABASE_CA_PEM, servername: database.hostname },
    max: 1, prepare: false, connect_timeout: 2, idle_timeout: 15, onnotice: () => {},
  });
}

const database = (() => {
  try {
    return usageDatabase(process.env);
  } catch {
    // A bad monitoring configuration must not stop account or API requests.
    console.warn("invalid_observability_database_configuration");
    return null;
  }
})();
/** The browser's cookies, URL, IP and user agent never enter this upstream request. */
export function postHogCapture(host: "https://us.i.posthog.com" | "https://eu.i.posthog.com",
  token: string, fetcher: typeof fetch = fetch): Capture {
  return async ({ event, attempt, timestamp }) => {
    const result = await fetcher(`${host}/i/v0/e/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "omit",
      redirect: "error",
      signal: AbortSignal.timeout(2000),
      body: JSON.stringify({
        api_key: token,
        event: `weave-${event}`,
        distinct_id: attempt,
        timestamp: new Date(timestamp).toISOString(),
        properties: { $process_person_profile: false, $geoip_disable: true },
      }),
    });
    try {
      if (!result.ok) throw Error("usage_capture_unavailable");
    } finally {
      await result.body?.cancel();
    }
  };
}

function configuredCapture(env: NodeJS.ProcessEnv): Capture | null {
  const host = env.WEAVE_POSTHOG_HOST;
  const token = env.WEAVE_POSTHOG_PROJECT_TOKEN;
  return env.VERCEL_ENV === "production" && token &&
    (host === "https://us.i.posthog.com" || host === "https://eu.i.posthog.com")
      ? postHogCapture(host, token) : null;
}

export const POST = createUsageHandler(configuredCapture(process.env));

const apiLimit = createRateLimiter();
/** Count application 5xx in production while preserving the response or exception. */
export function observeApi<Args extends unknown[]>(
  route: string, handler: (...args: Args) => Response | Promise<Response>,
) {
  if (!database) return handler;
  const countFailure = async () => {
    if (!apiLimit.ceiling("api-errors", capacity).ok) return;
    const record = database`select weave.count_api_failure(${route})`;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        record,
        new Promise<void>(resolve => { timeout = setTimeout(resolve, 500); }),
      ]);
    } catch {
      // Monitoring must not change the application's response or surface database errors.
    } finally {
      clearTimeout(timeout);
    }
  };
  return async (...args: Args): Promise<Response> => {
    let result: Response;
    try {
      result = await handler(...args);
    } catch (error) {
      await countFailure();
      throw error;
    }
    if (result.status >= 500) await countFailure();
    return result;
  };
}
