import assert from "node:assert/strict";
import { test } from "node:test";
import { isWarmRequest } from "./certified-project-consent.ts";

const ORIGIN = "https://weave.regencommons.com";
const post = (body: string, headers: Record<string, string> = {}) => new Request(`${ORIGIN}/api/certified-project-consent`, {
  method: "POST",
  headers: { origin: ORIGIN, "content-type": "application/json", "content-length": String(body.length), ...headers },
  body,
});

test("only a same-origin JSON POST of exactly {warm: true} is a warm request", async () => {
  assert.equal(await isWarmRequest(post('{"warm":true}')), true);
  assert.equal(await isWarmRequest(post('{"warm":true}', { "content-type": "application/json; charset=utf-8" })), true);
});

test("anything else goes to the consent handler, which checks it as before", async () => {
  for (const [body, headers, why] of [
    ['{"warm":true,"action":"membership"}', {}, "more than warm"],
    ['{"action":"membership"}', {}, "a real start"],
    ['{"warm":"true"}', {}, "warm not true"],
    ['[{"warm":true}]', {}, "not an object"],
    ["{warm:true}", {}, "not JSON"],
    ['{"warm":true}', { origin: "https://elsewhere.example" }, "another origin"],
    ['{"warm":true}', { "content-type": "text/plain" }, "not JSON content"],
    [`{"warm":true,"pad":"${"x".repeat(80)}"}`, {}, "too long"],
  ] as const) assert.equal(await isWarmRequest(post(body, headers)), false, why);
  assert.equal(await isWarmRequest(new Request(`${ORIGIN}/api/certified-project-consent`, { method: "GET", headers: { origin: ORIGIN } })), false, "not a POST");
});

test("reading a warm check leaves the request's body for the consent handler", async () => {
  const request = post('{"action":"membership"}');
  assert.equal(await isWarmRequest(request), false);
  assert.deepEqual(await request.json(), { action: "membership" });
});
