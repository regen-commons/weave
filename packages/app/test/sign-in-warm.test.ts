import assert from "node:assert/strict";
import { test } from "node:test";
import { createSignInWarmer } from "../src/account/warm.ts";

const settled = () => new Promise<void>(resolve => setImmediate(resolve));

test("a page readies sign-in once, then again only after four minutes", async () => {
  const bodies: unknown[] = [];
  let now = 0;
  const warm = createSignInWarmer(async body => { bodies.push(body); return { warm: true }; }, () => now).sight;
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

test("a pointer or keyboard on Sign In readies it again after 45 seconds, so Certified's nonce is fresh", async () => {
  const bodies: unknown[] = [];
  let now = 0;
  const { sight, intent } = createSignInWarmer(async body => { bodies.push(body); return { warm: true }; }, () => now);
  sight();
  now += 30_000; intent(); sight();
  assert.equal(bodies.length, 1, "sight and intent share one clock");
  now += 15_000; intent();
  assert.equal(bodies.length, 2, "reaching Sign In 45 seconds after the last warm-up asks again");
  now += 60_000; sight();
  assert.equal(bodies.length, 2, "coming into view still waits four minutes");
  now += 1_000; intent(); intent();
  assert.equal(bodies.length, 3);
  assert.ok(bodies.every(body => JSON.stringify(body) === '{"warm":true}'));
  await settled();
});

test("a warm request that fails is silent and lets the next sight of Sign In ask again", async () => {
  let calls = 0, fail = true;
  const warm = createSignInWarmer(async () => { calls++; if (fail) throw new Error("offline"); return {}; }, () => 0).sight;
  assert.doesNotThrow(warm);
  await settled();
  fail = false;
  warm();
  assert.equal(calls, 2, "nothing was readied, so it is not counted as done");
  await settled();
  warm();
  assert.equal(calls, 2);
});

test("Sign In on Your Initiatives readies project access too, and no other page or the account fixture does", async () => {
  const { readFileSync } = await import("node:fs");
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
  const warm = read("../src/account/warm.ts");
  assert.match(warm, /export const warmProjectConsent = createSignInWarmer\(\(body\) => accountRequest\("", body, "\/api\/certified-project-consent"\)\)\.sight;/u);
  const button = read("../src/account/SignInButton.tsx");
  assert.match(button, /const warm = offered \? warmSignInOnIntent : undefined;/u);
  // Every sign-in goes on to project access (DL-137), but a signed-out visit elsewhere wakes no second function.
  assert.match(button, /if \(!offered\) return;\s*warmSignIn\(\);[\s\S]*?if \(!state\?\.fixture && window\.location\.pathname === pathTo\("your-initiatives"\)\) warmProjectConsent\(\);/u);
});
