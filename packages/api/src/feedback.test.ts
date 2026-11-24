// Feedback is a public write that Weave's server passes to another site, so every way in is checked before
// anything leaves, only the feedback itself reaches the website, every failure answers with a stable code,
// and nothing but a status is logged.
import assert from "node:assert/strict";
import { test } from "node:test";
import { configuredUpstream, createFeedbackHandlers, FEEDBACK_LIMITS, websiteSender, type SendFeedback } from "./feedback.ts";
import { FEEDBACK, FEEDBACK_CATEGORIES, feedbackFrom, parseFeedbackAnswer, weavePagePath, type Feedback } from "./feedback-contract.ts";
import { createRateLimiter } from "./mcp-limit.ts";
import { createRouter, ROUTE_KEY } from "./router.ts";

const ORIGIN = "https://weave.example";
const KEY = "0b7f4c1e-2f5d-4a8b-9c3d-1e2f3a4b5c6d";
const GOOD = { message: "  The funding list is great  ", categories: ["Idea", "Idea", "Bug"], page_path: "/funding" };

/** A website that records what it was sent and answers as told. */
function website(answer: () => Promise<{ status: number; body: unknown }> = async () => ({ status: 200, body: { ok: true } })) {
  const calls: { feedback: Feedback; requestId: string }[] = [];
  const send: SendFeedback = async (feedback, requestId) => {
    calls.push({ feedback, requestId });
    return answer();
  };
  return { send, calls };
}

function post({
  body = JSON.stringify(GOOD),
  headers = {},
  method = "POST",
}: { body?: string | Uint8Array | ReadableStream | null; headers?: Record<string, string | null>; method?: string } = {}): Request {
  const all = new Headers({ origin: ORIGIN, "content-type": "application/json", "idempotency-key": KEY, "x-forwarded-for": "203.0.113.7" });
  for (const [key, value] of Object.entries(headers)) {
    if (value === null) all.delete(key);
    else all.set(key, value);
  }
  return new Request(`${ORIGIN}${FEEDBACK.path}`, {
    method, headers: all, body: method === "GET" || body === null ? undefined : body, duplex: "half",
  } as RequestInit);
}

async function read(response: Response) {
  return { status: response.status, body: await response.json(), cache: response.headers.get("cache-control") };
}

function handlers(send: SendFeedback | null = website().send, options: { now?: () => number } = {}) {
  const logs: number[] = [];
  const made = createFeedbackHandlers({ send, limiter: createRateLimiter(options), log: (status) => logs.push(status) });
  return { ...made, logs };
}

test("feedback from Weave's own page reaches the website as the website's own form sends it, under /weave", async () => {
  const { send, calls } = website();
  const result = await read(await handlers(send).POST(post()));
  assert.deepEqual(result, { status: 200, body: { ok: true }, cache: "no-store" });
  assert.deepEqual(calls, [{
    feedback: { message: "The funding list is great", categories: ["Idea", "Bug"], page_path: "/weave/funding" },
    requestId: KEY,
  }], "trimmed, repeats dropped, the page under /weave and the browser's request key passed on");
});

test("only the feedback leaves: no cookie, no header of the person's, no redirect followed, one fixed address", async () => {
  const seen: { url: string; init: RequestInit }[] = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    seen.push({ url, init });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as unknown as typeof fetch;
  const answer = await websiteSender(FEEDBACK.upstream, fetcher)(
    { message: "Hello there", categories: [], page_path: "/weave" }, KEY, new AbortController().signal);
  assert.deepEqual(answer, { status: 200, body: { ok: true } });
  assert.equal(seen.length, 1);
  assert.equal(seen[0]!.url, "https://regencommons.com/api/feedback");
  assert.deepEqual(seen[0]!.init.headers, { "Content-Type": "application/json", "Idempotency-Key": KEY });
  assert.equal(seen[0]!.init.redirect, "error");
  assert.equal(seen[0]!.init.credentials, "omit");
  assert.deepEqual(JSON.parse(String(seen[0]!.init.body)), { message: "Hello there", categories: [], page_path: "/weave" });
});

test("a website answer that is not JSON, or is huge, is read as not confirmed", async () => {
  const huge = (async () => new Response(`{"ok":true,"pad":"${"x".repeat(10_000)}"}`, { status: 200 })) as unknown as typeof fetch;
  assert.deepEqual(await websiteSender(FEEDBACK.upstream, huge)({ message: "abc", categories: [], page_path: "/weave" }, KEY, AbortSignal.timeout(1000)),
    { status: 200, body: null });
  const html = (async () => new Response("<html>", { status: 200 })) as unknown as typeof fetch;
  const send = websiteSender(FEEDBACK.upstream, html);
  const { POST, logs } = handlers(send);
  assert.deepEqual((await read(await POST(post()))).body, { error: "feedback_unavailable" });
  assert.deepEqual(logs, [200], "only the status is logged");
});

test("a filled honeypot is thanked and nothing leaves", async () => {
  const { send, calls } = website();
  const result = await read(await handlers(send).POST(post({ body: JSON.stringify({ ...GOOD, website_confirm: "yes" }) })));
  assert.deepEqual(result.body, { ok: true });
  assert.equal(calls.length, 0);
  // An empty honeypot, as a person's browser sends it, is ordinary feedback, and is not passed on.
  const empty = website();
  await handlers(empty.send).POST(post({ body: JSON.stringify({ ...GOOD, website_confirm: "" }) }));
  assert.equal(empty.calls.length, 1);
  assert.equal("website_confirm" in empty.calls[0]!.feedback, false);
});

test("every bad request is refused with a stable code before anything leaves", async () => {
  const cases: [string, Request, number, string][] = [
    ["another site", post({ headers: { origin: "https://elsewhere.example" } }), 403, "origin_required"],
    ["no origin", post({ headers: { origin: null } }), 403, "origin_required"],
    ["not JSON", post({ headers: { "content-type": "text/plain" } }), 415, "json_required"],
    ["broken JSON", post({ body: "{" }), 400, "invalid_feedback"],
    ["no body", post({ body: null }), 400, "invalid_feedback"],
    ["an array", post({ body: "[]" }), 400, "invalid_feedback"],
    ["too short", post({ body: JSON.stringify({ ...GOOD, message: "  hi  " }) }), 400, "invalid_feedback"],
    ["too long", post({ body: JSON.stringify({ ...GOOD, message: "a".repeat(5001) }) }), 400, "invalid_feedback"],
    ["a NUL character", post({ body: JSON.stringify({ ...GOOD, message: "abc\u0000def" }) }), 400, "invalid_feedback"],
    ["half a surrogate pair", post({ body: JSON.stringify({ ...GOOD, message: "abc\ud83d def" }) }), 400, "invalid_feedback"],
    ["a message that is not text", post({ body: JSON.stringify({ ...GOOD, message: 42 }) }), 400, "invalid_feedback"],
    ["an unknown category", post({ body: JSON.stringify({ ...GOOD, categories: ["Praise"] }) }), 400, "invalid_feedback"],
    ["categories that are not a list", post({ body: JSON.stringify({ ...GOOD, categories: "Bug" }) }), 400, "invalid_feedback"],
    ["too many categories", post({ body: JSON.stringify({ ...GOOD, categories: [...FEEDBACK_CATEGORIES, "Bug"] }) }), 400, "invalid_feedback"],
    ["no page", post({ body: JSON.stringify({ ...GOOD, page_path: undefined }) }), 400, "invalid_feedback"],
    ["a page with a query", post({ body: JSON.stringify({ ...GOOD, page_path: "/funding?fixture=draft" }) }), 400, "invalid_feedback"],
    ["another host", post({ body: JSON.stringify({ ...GOOD, page_path: "//evil.example" }) }), 400, "invalid_feedback"],
    ["a full address", post({ body: JSON.stringify({ ...GOOD, page_path: "https://evil.example/" }) }), 400, "invalid_feedback"],
    ["a request key that is not one", post({ headers: { "idempotency-key": "../../x" } }), 400, "invalid_request_id"],
    ["a body over 32 kB", post({ body: JSON.stringify({ ...GOOD, pad: "x".repeat(FEEDBACK.maxBytes) }) }), 413, "body_too_large"],
    ["a body that says it is over 32 kB", post({ headers: { "content-length": String(FEEDBACK.maxBytes + 1) } }), 413, "body_too_large"],
  ];
  for (const [name, request, status, error] of cases) {
    const { send, calls } = website();
    const result = await read(await handlers(send).POST(request));
    assert.deepEqual({ status: result.status, body: result.body, cache: result.cache }, { status, body: { error }, cache: "no-store" }, name);
    assert.equal(calls.length, 0, `${name}: nothing leaves`);
  }
});

test("a body over the limit that does not say its length is stopped once it passes 32 kB", async () => {
  let pulled = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulled += 1;
      if (pulled > 100) return controller.close();
      controller.enqueue(new Uint8Array(1024).fill(32));
    },
  });
  const { send, calls } = website();
  const result = await read(await handlers(send).POST(post({ body: stream, headers: { "content-length": null } })));
  assert.deepEqual(result.body, { error: "body_too_large" });
  assert.ok(pulled <= 34, `stopped reading at the limit, not after ${pulled} kB`);
  assert.equal(calls.length, 0);
});

test("a body that never finishes arriving is given up on", async () => {
  const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode("{")); } });
  const made = createFeedbackHandlers({ send: website().send, limiter: createRateLimiter(), bodyTimeoutMs: 20, log: () => {} });
  const result = await read(await made.POST(post({ body: stream })));
  assert.deepEqual({ status: result.status, body: result.body }, { status: 408, body: { error: "request_timeout" } });
});

test("one connection can send a few in an hour, the next is refused, and another connection is not held up", async () => {
  let now = 1_000_000;
  const { send, calls } = website();
  const { POST } = handlers(send, { now: () => now });
  for (let i = 0; i < FEEDBACK_LIMITS.caller.limit; i += 1) assert.equal((await POST(post())).status, 200);
  const refused = await POST(post());
  assert.equal(refused.status, 429);
  assert.deepEqual(await refused.json(), { error: "rate_limited" });
  assert.ok(Number(refused.headers.get("retry-after")) > 0);
  assert.equal(calls.length, FEEDBACK_LIMITS.caller.limit);
  assert.equal((await POST(post({ headers: { "x-forwarded-for": "198.51.100.9" } }))).status, 200, "another connection");
  now += FEEDBACK_LIMITS.caller.windowMs;
  assert.equal((await POST(post())).status, 200, "the hour has passed");
  // A refusal counts too, so a stream of bad posts is held up the same way.
  const bad = handlers(website().send);
  for (let i = 0; i < FEEDBACK_LIMITS.caller.limit; i += 1) await bad.POST(post({ body: "{" }));
  assert.equal((await bad.POST(post())).status, 429);
});

test("one instance passes on only so many an hour from everyone", async () => {
  const { send, calls } = website();
  const { POST } = handlers(send);
  for (let i = 0; i < FEEDBACK_LIMITS.all.limit; i += 1)
    assert.equal((await POST(post({ headers: { "x-forwarded-for": `198.51.100.${i}` } }))).status, 200);
  const refused = await POST(post({ headers: { "x-forwarded-for": "192.0.2.1" } }));
  assert.equal(refused.status, 429);
  assert.equal(calls.length, FEEDBACK_LIMITS.all.limit);
});

test("the website's refusals and failures come back as stable codes, and only the status is logged", async () => {
  const cases: [string, () => Promise<{ status: number; body: unknown }>, number, string, number][] = [
    // The website counts Weave's server, not this person, so its refusal is never reported as theirs.
    ["its own count", async () => ({ status: 429, body: { error: "rate_limited" } }), 502, "feedback_unavailable", 429],
    ["its database is down", async () => ({ status: 503, body: { error: "provider_unavailable", detail: "secret stuff" } }), 502, "feedback_unavailable", 503],
    ["it refused the shape", async () => ({ status: 400, body: { error: "invalid_feedback" } }), 502, "feedback_unavailable", 400],
    ["200 without ok", async () => ({ status: 200, body: { saved: true } }), 502, "feedback_unavailable", 200],
    ["the network failed", async () => { throw new Error("ECONNRESET at 10.0.0.1"); }, 502, "feedback_unavailable", 0],
  ];
  for (const [name, answer, status, error, logged] of cases) {
    const { send } = website(answer);
    const { POST, logs } = handlers(send);
    const result = await read(await POST(post()));
    assert.deepEqual({ status: result.status, body: result.body }, { status, body: { error } }, name);
    assert.deepEqual(logs, [logged], `${name}: one log line, the status alone`);
  }
});

test("the default log line is the website's status and nothing of the feedback", async () => {
  const lines: unknown[][] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => { lines.push(args); };
  try {
    const made = createFeedbackHandlers({ send: website(async () => ({ status: 503, body: {} })).send, limiter: createRateLimiter() });
    await made.POST(post());
  } finally {
    console.warn = original;
  }
  assert.deepEqual(lines, [[JSON.stringify({ event: "feedback_upstream", status: 503 })]]);
  assert.doesNotMatch(JSON.stringify(lines), /funding list|203\.0\.113/u);
});

test("with nowhere to send, feedback is refused as unavailable and nothing leaves", async () => {
  const result = await read(await handlers(null).POST(post()));
  assert.deepEqual({ status: result.status, body: result.body }, { status: 503, body: { error: "feedback_unavailable" } });
});

test("only production posts to the website; a preview nowhere; elsewhere only to a loopback stand-in, or nowhere", () => {
  assert.equal(configuredUpstream({ VERCEL: "1", VERCEL_ENV: "production" }), "https://regencommons.com/api/feedback");
  assert.equal(configuredUpstream({ VERCEL: "1", VERCEL_ENV: "production", WEAVE_FEEDBACK_UPSTREAM: "http://127.0.0.1:9/x" }),
    "https://regencommons.com/api/feedback", "a deployment cannot be pointed elsewhere");
  for (const env of ["preview", "development", undefined])
    assert.equal(configuredUpstream({ VERCEL: "1", VERCEL_ENV: env, WEAVE_FEEDBACK_UPSTREAM: "http://127.0.0.1:9/x" }), null,
      `a ${env ?? "unnamed"} deployment files nothing with the stewards`);
  assert.equal(configuredUpstream({}), null, "a local run never posts to the live website");
  assert.equal(configuredUpstream({ WEAVE_FEEDBACK_UPSTREAM: "http://127.0.0.1:4799/api/feedback" }), "http://127.0.0.1:4799/api/feedback");
  assert.equal(configuredUpstream({ WEAVE_FEEDBACK_UPSTREAM: "http://localhost:4799/" }), "http://localhost:4799/");
  for (const elsewhere of ["https://regencommons.com/api/feedback", "http://evil.example/", "http://127.0.0.1.evil.example/", "not a url", "file:///etc/passwd"])
    assert.equal(configuredUpstream({ WEAVE_FEEDBACK_UPSTREAM: elsewhere }), null, elsewhere);
});

test("the contract follows the website's: its categories, limits and page rule", () => {
  assert.deepEqual([...FEEDBACK_CATEGORIES], ["Bug", "Idea", "Technical suggestion", "Feature request", "Security consideration", "Other", "Fine Tuning"]);
  assert.equal(weavePagePath("/"), "/weave");
  assert.equal(weavePagePath("/funding/local-nlnet"), "/weave/funding/local-nlnet");
  for (const bad of ["", "funding", "//x", "/a b", "/a?b", "/a#b", "/a\\b", `/${"a".repeat(495)}`]) assert.equal(weavePagePath(bad), null, bad);
  assert.equal(weavePagePath(`/${"a".repeat(493)}`)?.length, 500, "the longest the website keeps");
  // Every page path this makes passes the website's own pattern (feedback-contract.js, regen-commons/website).
  const website = /^\/(?!\/)[^\s?#\\]*$/;
  for (const path of ["/", "/funding", "/start/initiative", "/initiatives/at%3A%2F%2Fx"]) assert.match(weavePagePath(path)!, website);
  assert.equal(feedbackFrom({ message: "abc", categories: [], page_path: "/" })?.page_path, "/weave");
  assert.equal(feedbackFrom({ message: "Sementes \u{1F331} boas", categories: [], page_path: "/" })?.message, "Sementes \u{1F331} boas",
    "a whole emoji is fine");
  assert.equal(feedbackFrom({ message: "abc", categories: [], page_path: "/weave/x" })?.page_path, "/weave/weave/x",
    "the prefix is the server's: a client cannot name a website page");
  assert.deepEqual(parseFeedbackAnswer(200, { ok: true }), { ok: true });
  assert.deepEqual(parseFeedbackAnswer(429, { error: "rate_limited" }), { ok: false, error: "rate_limited" });
  assert.deepEqual(parseFeedbackAnswer(500, "<html>"), { ok: false, error: "feedback_unavailable" });
  assert.deepEqual(parseFeedbackAnswer(400, { error: "something_new" }), { ok: false, error: "feedback_unavailable" });
});

test("the router hands a post to feedback at its own address, and only a POST", async () => {
  const { send, calls } = website();
  const made = createFeedbackHandlers({ send, limiter: createRateLimiter(), log: () => {} });
  const router = createRouter({ feedback: { methods: ["POST"], load: async () => made } });
  const response = await router(new Request(`${ORIGIN}/api/router?${ROUTE_KEY}=feedback`, {
    method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" }, body: JSON.stringify(GOOD),
  }));
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal((await router(new Request(`${ORIGIN}/api/router?${ROUTE_KEY}=feedback`))).status, 405);
});
