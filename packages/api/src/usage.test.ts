import assert from "node:assert/strict";
import test from "node:test";
import { createUsageHandler, postHogCapture } from "./usage.ts";

const origin = "https://weave.example";
const attempt = "d6b05316-22a9-4f55-aa1d-26898d3fc4bf";
const timestamp = Date.now();
const body = JSON.stringify(["sign-in-started", attempt, timestamp]);
function post(data: string, headers: Record<string, string> = {}) {
  return new Request(`${origin}/api/usage`, {
    method: "POST", body: data,
    headers: { Origin: origin, "Content-Type": "application/json", ...headers },
  });
}

test("usage accepts one allowlisted attempt step and drops extra data, cross-origin posts and GPC requests", async () => {
  const captured: unknown[] = [];
  const handle = createUsageHandler(async event => { captured.push(event); });
  assert.equal((await handle(post(body))).status, 204);
  assert.equal((await handle(post(JSON.stringify(["sign-in-started", attempt, timestamp, "private words"])))).status, 400);
  assert.equal((await handle(post(JSON.stringify(["sign-in-started", "some-account", timestamp])))).status, 400);
  assert.equal((await handle(post(JSON.stringify(["$autocapture", attempt, timestamp])))).status, 400);
  assert.equal((await handle(post(body, { Origin: "https://another.example" }))).status, 403);
  assert.equal((await handle(post(body, { "Sec-GPC": "1" }))).status, 204);
  assert.equal((await handle(post(JSON.stringify("x".repeat(129))))).status, 400);
  assert.deepEqual(captured, [{ event: "sign-in-started", attempt, timestamp }]);
});

test("PostHog receives only the fixed event, random attempt ID and timing with profiling and GeoIP off", async () => {
  const requests: Request[] = [];
  const capture = postHogCapture("https://eu.i.posthog.com", "synthetic-project-token", async (url, init) => {
    requests.push(new Request(url, init));
    return new Response(null, { status: 200 });
  });
  const handle = createUsageHandler(capture);
  assert.equal((await handle(post(body, {
    Cookie: "private=secret", Referer: "https://weave.example/?q=private", "X-Forwarded-For": "192.0.2.1",
    "User-Agent": "private browser",
  }))).status, 204);
  assert.equal(requests.length, 1);
  const [request] = requests;
  assert.equal(request!.url, "https://eu.i.posthog.com/i/v0/e/");
  assert.deepEqual([...request!.headers.entries()], [["content-type", "application/json"]]);
  assert.deepEqual(await request!.json(), {
    api_key: "synthetic-project-token", event: "weave-sign-in-started", distinct_id: attempt,
    timestamp: new Date(timestamp).toISOString(),
    properties: { $process_person_profile: false, $geoip_disable: true },
  });
});

test("usage limits a burst and keeps capture errors out of responses", async () => {
  const handle = createUsageHandler(async () => { throw new Error("private upstream error"); });
  for (let i = 0; i < 40; i++) {
    const response = await handle(post(body));
    assert.equal(response.status, 503);
    assert.equal(await response.text(), "");
  }
  assert.equal((await handle(post(body))).status, 429);
  assert.equal((await createUsageHandler(null)(post(body))).status, 204);
});
