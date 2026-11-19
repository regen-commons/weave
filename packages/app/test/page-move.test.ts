// On a phone a page deeper in is pushed on and the way back up pops it off (DL-094). Which a move
// is comes from the pages themselves; the router names it while the change is drawn.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { pageMove } from "../src/routes.ts";

test("a page under the one on screen is pushed on, and going back up pops it off", () => {
  const deeper: readonly [string, string][] = [
    ["/", "/start/initiative"],
    ["/your-initiatives", "/your-initiative"],
    ["/your-initiative", "/partners"],
    ["/your-initiatives", "/settings"],
    ["/your-initiatives", "/partners"],
    ["/your-initiatives", "/workspaces/3f2b6c1e-8a4d-4e2f-9b1a-5c7d8e9f0a1b"],
  ];
  for (const [from, to] of deeper) {
    assert.equal(pageMove(from, to), "push", `${from} to ${to}`);
    assert.equal(pageMove(to, from), "pop", `${to} to ${from}`);
  }
});

test("describing an initiative is one way through: each later step is pushed on", () => {
  const steps = ["/start/initiative", "/start/initiative/check", "/start/needs", "/start/offers", "/your-initiative"];
  for (let at = 0; at < steps.length - 1; at++) {
    assert.equal(pageMove(steps[at]!, steps[at + 1]!), "push", `${steps[at]} on`);
    assert.equal(pageMove(steps[at + 1]!, steps[at]!), "pop", `${steps[at + 1]} back`);
  }
  // Needs and offers lead to the same step, whichever page of it was on screen.
  assert.equal(pageMove("/start/needs", "/your-initiative"), "push");
  assert.equal(pageMove("/your-initiative", "/start/initiative"), "pop");
});

test("a move across sections, to the same page, or to nowhere the app knows fades as it always did", () => {
  const across: readonly [string, string][] = [
    ["/", "/funding"], ["/funding", "/initiatives"], ["/initiatives", "/your-initiatives"], ["/settings", "/funding"],
    ["/funding", "/funding?q=water"], ["/", "/nowhere"], ["/nowhere", "/"], ["/funding", "/start/initiative"],
  ];
  for (const [from, to] of across) assert.equal(pageMove(from, to), "fade", `${from} to ${to}`);
  // The address's filter does not change what the move is.
  assert.equal(pageMove("/your-initiatives?fixture=draft", "/settings?fixture=draft"), "push");
});

test("the router names the move while it is drawn, and only the app's own way back is drawn as a pop", () => {
  const router = readFileSync(fileURLToPath(new URL("../src/router.tsx", import.meta.url)), "utf8");
  assert.ok(router.includes("const move: PageMove = pageMove(from, to);"));
  assert.ok(router.includes("else root.dataset.pageMove = move;"));
  // A sheet, reduced motion and a browser with no view transitions are drawn at once.
  assert.match(router, /const still = isSheet\(from\) \|\| isSheet\(to\) \|\| window\.matchMedia\("\(prefers-reduced-motion: reduce\)"\)\.matches;\s*if \(still \|\| !document\.startViewTransition\) \{\s*update\(\);/u);
  // The name does not outlive the change, unless the next move has already named its own.
  assert.match(router, /if \(mine === drawing\) delete root\.dataset\.pageMove;/u);
  // The browser's Back and a phone's swipe bring their own motion, so only goBack marks the step.
  assert.match(router, /export function goBack\(hops: number\): void \{\s*ownBack = true;/u);
  assert.ok(router.includes("if (own && from !== shown) draw(notify, from, shown);\n  else notify();"));
  assert.equal(router.split("ownBack = true").length - 1, 1);
  // One listener hears a step through history, so every page learns of it inside the same change.
  assert.equal(router.split('addEventListener("popstate"').length - 1, 1);
});
