// POST /api/feedback passes one piece of feedback from Weave's feedback sheet to the Regen Commons
// website's own /api/feedback, server to server, so Weave's feedback reaches the stewards' desk with the
// website's (the owner's request of 24 November 2026). It needs no sign-in, so nothing in it depends on
// who is asking.
//
// It sends only the message, its categories and the Weave page's address under /weave, to one fixed
// address. No cookie, no header of the person's and no address of theirs goes with it. It stores
// nothing, and logs only the status of a post the website did not confirm. What bounds its use is the
// same-origin check, the size of one body, a count per connection and per instance held in memory, and
// the website's own count of three an hour. That count is by the address that posts, which is Weave's
// server for every Weave user, so when the website refuses, the sheet offers the website's own form.
//
// Only the production deployment posts to the live website. A preview answers that feedback is
// unavailable, and off Vercel (a dev server, the interface checks) it posts to the loopback address in
// WEAVE_FEEDBACK_UPSTREAM or answers the same.
import { randomUUID } from "node:crypto";
import { FEEDBACK, feedbackFrom, isRequestId, type Feedback, type FeedbackFailure } from "./feedback-contract.ts";
import { callerAddress, createRateLimiter, type RateLimiter, type RateWindow } from "./mcp-limit.ts";

/** Counts per function instance, like the MCP endpoint's: a second layer behind the website's own count. */
export const FEEDBACK_LIMITS = {
  /** Every post from one connection that gets past the origin check, retries and refusals included. */
  caller: { limit: 3, windowMs: 60 * 60_000 },
  /** Posts this instance passes on to the website, from everyone. */
  all: { limit: 30, windowMs: 60 * 60_000 },
} as const satisfies Record<string, RateWindow>;

/** How long the website has to answer. Inside the sheet's own wait. */
export const UPSTREAM_TIMEOUT_MS = 10_000;

/** Posts one piece of feedback to the website and gives back its status and parsed body. */
export type SendFeedback = (feedback: Feedback, requestId: string, signal: AbortSignal) => Promise<{ status: number; body: unknown }>;

class FeedbackError extends Error {
  readonly status: number;
  readonly code: FeedbackFailure;
  readonly retryAfterSeconds: number | undefined;
  constructor(status: number, code: FeedbackFailure, retryAfterSeconds?: number) {
    super(code);
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** Reads at most `limit` bytes of a request body as text, and gives up on one that arrives too slowly. */
async function boundedText(request: Request, limit: number, timeoutMs: number): Promise<string> {
  if (Number(request.headers.get("content-length") ?? 0) > limit) throw new FeedbackError(413, "body_too_large");
  const reader = request.body?.getReader();
  if (!reader) throw new FeedbackError(400, "invalid_feedback");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void reader.cancel();
  }, timeoutMs);
  try {
    while (true) {
      const result = await reader.read();
      if (timedOut) throw new FeedbackError(408, "request_timeout");
      if (result.done) break;
      bytes += result.value.byteLength;
      if (bytes > limit) {
        void reader.cancel();
        throw new FeedbackError(413, "body_too_large");
      }
      chunks.push(result.value);
    }
  } catch (error) {
    if (error instanceof FeedbackError) throw error;
    throw new FeedbackError(timedOut ? 408 : 400, timedOut ? "request_timeout" : "invalid_feedback");
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks));
}

export function createFeedbackHandlers({
  send,
  limiter,
  bodyTimeoutMs = 10_000,
  log = (status) => console.warn(JSON.stringify({ event: "feedback_upstream", status })),
}: {
  /** null: there is nowhere to send feedback from this deployment. */
  send: SendFeedback | null;
  limiter: RateLimiter;
  bodyTimeoutMs?: number;
  /** Told the website's status, and nothing else, when it did not confirm a post. */
  log?: (status: number) => void;
}) {
  const answer = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
  return {
    async POST(request: Request): Promise<Response> {
      try {
        if (request.method !== "POST") throw new FeedbackError(405, "method_not_allowed");
        // Only Weave's own page may send feedback: another site's script cannot set this origin.
        if (request.headers.get("origin") !== new URL(request.url).origin) throw new FeedbackError(403, "origin_required");
        const caller = limiter.caller(`feedback ${callerAddress(request)}`, FEEDBACK_LIMITS.caller);
        if (!caller.ok) throw new FeedbackError(429, "rate_limited", caller.retryAfterSeconds);
        const type = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
        if (type !== "application/json") throw new FeedbackError(415, "json_required");
        let body: unknown;
        try {
          body = JSON.parse(await boundedText(request, FEEDBACK.maxBytes, bodyTimeoutMs));
        } catch (error) {
          if (error instanceof FeedbackError) throw error;
          throw new FeedbackError(400, "invalid_feedback");
        }
        // A filled honeypot is a form filler, not a person: it is thanked, and nothing leaves.
        if (body && typeof body === "object" && (body as Record<string, unknown>)[FEEDBACK.honeypot]) return answer(200, { ok: true });
        const feedback = feedbackFrom(body);
        if (!feedback) throw new FeedbackError(400, "invalid_feedback");
        const key = request.headers.get("idempotency-key");
        if (key !== null && !isRequestId(key)) throw new FeedbackError(400, "invalid_request_id");
        if (!send) throw new FeedbackError(503, "feedback_unavailable");
        const all = limiter.ceiling("feedback", FEEDBACK_LIMITS.all);
        if (!all.ok) throw new FeedbackError(429, "rate_limited", all.retryAfterSeconds);
        let sent: { status: number; body: unknown };
        try {
          sent = await send(feedback, key ?? randomUUID(), AbortSignal.any([request.signal, AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)]));
        } catch {
          log(0);
          throw new FeedbackError(502, "feedback_unavailable");
        }
        if (sent.status === 200 && (sent.body as { ok?: unknown } | null)?.ok === true) return answer(200, { ok: true });
        log(sent.status);
        // The website counts by the address that posts to it, which is Weave's server for everyone using
        // Weave. Its refusal is not about this person's connection, so it is not reported as theirs: the
        // sheet offers the website's own form, which counts the person's own address.
        throw new FeedbackError(502, "feedback_unavailable");
      } catch (error) {
        const known = error instanceof FeedbackError ? error : new FeedbackError(502, "feedback_unavailable");
        return answer(known.status, { error: known.code }, {
          ...(known.status === 405 ? { Allow: "POST" } : {}),
          ...(known.retryAfterSeconds ? { "Retry-After": String(known.retryAfterSeconds) } : {}),
        });
      }
    },
  };
}

/**
 * Posts to one address with nothing but the feedback, its content type and its request key: no cookie,
 * no header from the person's request, and no redirect followed. The website's answer is read only for
 * its status and its `ok`, from its first 4 kB. The address is fixed and the request's timeout bounds the read.
 */
export function websiteSender(upstream: string, fetcher: typeof fetch = fetch): SendFeedback {
  return async (feedback, requestId, signal) => {
    const response = await fetcher(upstream, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": requestId },
      body: JSON.stringify(feedback),
      redirect: "error",
      credentials: "omit",
      signal,
    });
    const text = (await response.text()).slice(0, 4096);
    let body: unknown = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
    return { status: response.status, body };
  };
}

/**
 * Where this deployment sends feedback. In Vercel's production deployment, always the website's fixed
 * address. A preview deployment sends nowhere, so checking a pull request never files feedback with the
 * stewards. Off Vercel, only a loopback address named in WEAVE_FEEDBACK_UPSTREAM, such as the interface
 * checks' stand-in, and otherwise nowhere: a local run never posts to the live website.
 */
export function configuredUpstream(env: Record<string, string | undefined> = process.env): string | null {
  if (env.VERCEL) return env.VERCEL_ENV === "production" ? FEEDBACK.upstream : null;
  const named = env.WEAVE_FEEDBACK_UPSTREAM;
  if (!named) return null;
  try {
    const url = new URL(named);
    return url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ? url.href : null;
  } catch {
    return null;
  }
}

const limiter = createRateLimiter();

export function POST(request: Request): Promise<Response> {
  const upstream = configuredUpstream();
  return createFeedbackHandlers({ send: upstream ? websiteSender(upstream) : null, limiter }).POST(request);
}
