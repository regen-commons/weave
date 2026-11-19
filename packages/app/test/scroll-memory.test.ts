// A page that is reloaded, or dropped in the background and loaded again, comes back where it was
// left (DL-092). The places are kept for the tab; this drives the keeping with a stand-in store.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { SCROLL_KEY, SCROLL_LIMIT, readPositions, remember, resumesPage, writePositions } from "../src/scroll-memory.ts";

function store(initial?: string) {
  const items = new Map<string, string>(initial === undefined ? [] : [[SCROLL_KEY, initial]]);
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  };
}

test("what a tab kept comes back as it was written, in the order the pages were left", () => {
  const tab = store();
  const positions = new Map<string, number>();
  remember(positions, "a", 1200);
  remember(positions, "b", 0);
  remember(positions, "c", 340.5);
  writePositions(tab, positions);
  assert.deepEqual([...readPositions(tab)], [["a", 1200], ["b", 0], ["c", 340.5]]);
  // Only keys and numbers are kept: no address and no words.
  assert.equal(tab.items.get(SCROLL_KEY), '[["a",1200],["b",0],["c",340.5]]');
});

test("a page left again is the newest, and only the newest pages are kept", () => {
  const positions = new Map<string, number>();
  for (let page = 0; page < SCROLL_LIMIT + 10; page++) remember(positions, `p${page}`, page);
  // The first page is visited once more, so it is not among the oldest.
  remember(positions, "p0", 900);
  const tab = store();
  writePositions(tab, positions);
  const kept = readPositions(tab);
  assert.equal(kept.size, SCROLL_LIMIT);
  assert.equal(kept.get("p0"), 900);
  assert.equal(kept.has("p1"), false, "the pages left longest ago go first");
  assert.equal(kept.get(`p${SCROLL_LIMIT + 9}`), SCROLL_LIMIT + 9);
});

test("anything in the store that is not a key and a place on a page is left out", () => {
  for (const junk of ["", "not json", "null", "{}", '"text"', "[1,2]", '{"a":1}']) {
    assert.equal(readPositions(store(junk)).size, 0, junk);
  }
  const mixed = '[["good",12],["negative",-4],["text","12"],[7,7],["huge",1e999],["short"],null,["also",0]]';
  assert.deepEqual([...readPositions(store(mixed))], [["good", 12], ["also", 0]]);
});

test("a store that refuses costs the place on the page and nothing else", () => {
  const closed = {
    getItem(): string | null { throw new Error("closed"); },
    setItem(): void { throw new Error("full"); },
  };
  assert.equal(readPositions(closed).size, 0);
  assert.doesNotThrow(() => writePositions(closed, new Map([["a", 1]])));
});

test("a reload and a return from another site resume a page, and a fresh visit starts at the top", () => {
  assert.equal(resumesPage("reload"), true);
  assert.equal(resumesPage("back_forward"), true);
  for (const fresh of ["navigate", "prerender", undefined]) assert.equal(resumesPage(fresh), false, String(fresh));
});

test("the router keeps the places when a page is hidden or left, and the app returns to one on load", () => {
  const source = (path: string) => readFileSync(fileURLToPath(new URL(`../src/${path}`, import.meta.url)), "utf8");
  const router = source("router.tsx");
  assert.ok(router.includes("const positions = stored ? readPositions(stored) : new Map<string, number>();"));
  // A load is a return only to a page this tab knows, so a first visit never jumps down a page.
  assert.ok(router.includes("returning = resumesPage(load?.type) && positions.has(entry);"));
  // A phone may drop a hidden page without ever saying it is leaving.
  assert.ok(router.includes('window.addEventListener("pagehide", keepPositions);'));
  assert.match(router, /addEventListener\("visibilitychange", \(\) => \{\s*if \(document\.visibilityState === "hidden"\) keepPositions\(\);/u);
  // The page settles on a move, and a load is not one, so the app settles once when it opens.
  assert.match(source("App.tsx"), /useEffect\(\(\) => \{\s*if \(wasReturn\(\)\) settleScroll\(\);\s*\}, \[\]\);/u);
});
