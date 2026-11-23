import assert from "node:assert/strict";
import { test } from "node:test";
import { createSignInWarmer } from "../src/account/warm.ts";

const settled = () => new Promise<void>(resolve => setImmediate(resolve));

test("a page readies sign-in once, then again only after four minutes", async () => {
  const bodies: unknown[] = [];
  let now = 0;
  const warm = createSignInWarmer(async body => { bodies.push(body); return { warm: true }; }, () => now);
  warm(); warm(); warm();
  assert.deepEqual(bodies, [{ warm: true }], "every Sign In button on the page shares one request, which names no one and no task");
  now += 3 * 60_000;
  warm();
  assert.equal(bodies.length, 1);
  now += 61_000;
  warm();
  assert.equal(bodies.length, 2, "a tab left open is readied again when Sign In is reached later");
  await settled();
});

test("a warm request that fails is silent and lets the next sight of Sign In ask again", async () => {
  let calls = 0, fail = true;
  const warm = createSignInWarmer(async () => { calls++; if (fail) throw new Error("offline"); return {}; }, () => 0);
  assert.doesNotThrow(warm);
  await settled();
  fail = false;
  warm();
  assert.equal(calls, 2, "nothing was readied, so it is not counted as done");
  await settled();
  warm();
  assert.equal(calls, 2);
});
