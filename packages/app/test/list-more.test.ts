// A long list fills in as a person reaches its end, for as long as there is more, without trapping the keyboard (DL-101, DL-130).
import assert from "node:assert/strict";
import { test } from "node:test";
import { AHEAD_MARGIN, loadsUnasked, shownLine } from "../src/list-more.ts";

const scrolling = { more: true, busy: false, keyboardInList: false };

test("the next batch arrives on its own while a person scrolls with more to come", () => {
  assert.equal(loadsUnasked(scrolling), true);
  assert.equal(loadsUnasked({ ...scrolling, more: false }), false, "nothing more to bring");
  assert.equal(loadsUnasked({ ...scrolling, busy: true }), false, "one batch at a time");
});

test("the keyboard is never run past the list's end: tabbing through cards brings nothing unasked", () => {
  assert.equal(loadsUnasked({ ...scrolling, keyboardInList: true }), false);
});

test("scrolling never meets a step: batch after batch arrives until the list is whole (DL-130)", () => {
  const total = 771;
  const batch = 24;
  let shown = batch;
  while (loadsUnasked({ ...scrolling, more: shown < total })) shown = Math.min(total, shown + batch);
  assert.equal(shown, total);
});

test("the end is noticed below the window only, and by a fixed distance", () => {
  assert.match(AHEAD_MARGIN, /^0px 0px \d+px 0px$/u);
});

test("the line at the list's end says how much of it is on the page", () => {
  assert.equal(shownLine(24, 771, "programs"), "Showing 24 of 771 programs.");
  assert.equal(shownLine(1200, 12345, "projects"), "Showing 1,200 of 12,345 projects.");
  assert.equal(shownLine(40, 40, "projects"), "Showing all 40 projects.");
  assert.equal(shownLine(41, 40, "projects"), "Showing all 40 projects.", "never more than the whole");
  assert.equal(shownLine(1, 1, "funds"), "Showing the only fund.", "a list of one names its one thing");
});
