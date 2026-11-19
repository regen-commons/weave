// A long list fills in as a person reaches its end, without trapping the keyboard or hiding the footer (DL-101).
import assert from "node:assert/strict";
import { test } from "node:test";
import { AHEAD_MARGIN, AUTO_BATCHES, loadsUnasked, shownLine } from "../src/list-more.ts";

const scrolling = { more: true, busy: false, autoLeft: AUTO_BATCHES, keyboardInList: false };

test("the next batch arrives on its own while a person scrolls with more to come", () => {
  assert.equal(loadsUnasked(scrolling), true);
  assert.equal(loadsUnasked({ ...scrolling, more: false }), false, "nothing more to bring");
  assert.equal(loadsUnasked({ ...scrolling, busy: true }), false, "one batch at a time");
});

test("the keyboard is never run past the list's end: tabbing through cards brings nothing unasked", () => {
  assert.equal(loadsUnasked({ ...scrolling, keyboardInList: true }), false);
});

test("after a few batches the list waits for a press, so the footer can be reached", () => {
  assert.ok(AUTO_BATCHES >= 1 && AUTO_BATCHES <= 5);
  let autoLeft = AUTO_BATCHES;
  let loaded = 0;
  while (loadsUnasked({ ...scrolling, autoLeft })) {
    autoLeft -= 1;
    loaded += 1;
  }
  assert.equal(loaded, AUTO_BATCHES);
  assert.equal(loadsUnasked({ ...scrolling, autoLeft: 0 }), false);
});

test("the end is noticed below the window only, and by a fixed distance", () => {
  assert.match(AHEAD_MARGIN, /^0px 0px \d+px 0px$/u);
});

test("the line at the list's end says how much of it is on the page", () => {
  assert.equal(shownLine(24, 771, "programs"), "Showing 24 of 771 programs.");
  assert.equal(shownLine(1200, 12345, "projects"), "Showing 1,200 of 12,345 projects.");
  assert.equal(shownLine(40, 40, "projects"), "Showing all 40 projects.");
  assert.equal(shownLine(41, 40, "projects"), "Showing all 40 projects.", "never more than the whole");
});
