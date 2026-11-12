import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SCROLL_SPACING,
  densityFor,
  growsFromPointer,
  growsFromScroll,
  growsOnItsOwn,
  logoNetwork,
  restShare,
  scrolledEnough,
  seedNetwork,
  seededRandom,
  settle,
  tuftAlpha,
} from "../behaviors/mycelium.js";

const grow = (width, height, seed = 7) => {
  const random = seededRandom(seed);
  const density = densityFor(width);
  return settle(seedNetwork(width, height, random, density), width, height, random, density);
};

test("the mycelium settles into the same sparse network for the same hero", () => {
  const wide = grow(1280, 520);
  assert.deepEqual(
    wide.map((branch) => branch.points.length),
    grow(1280, 520).map((branch) => branch.points.length),
    "the same seed grows the same network, so the still version never changes",
  );
  assert.ok(wide.every((branch) => !branch.growing), "growth comes to rest");
  assert.ok(wide.length <= densityFor(1280).limit, "it stays sparse");
  assert.ok(wide.some((branch) => branch.generation > 0), "it forks");
  const phone = grow(360, 640);
  assert.ok(phone.length <= densityFor(360).limit && phone.length < wide.length, "a phone grows less");
});

test("threads start all over a region, under its content as well as beside it (DL-071)", () => {
  const width = 1280;
  const height = 520;
  const branches = grow(width, height, 3);
  const roots = branches.filter((branch) => branch.generation === 0);
  const share = (from, to) => roots.filter((branch) => branch.points[0] >= width * from && branch.points[0] < width * to).length / roots.length;
  assert.ok(share(0.3, 0.7) > 0.2, "seeds sit under the middle of the page, where the content is");
  assert.ok(share(0, 0.2) > 0.05 && share(0.8, 1) > 0.05, "and still down both sides");
  for (const branch of branches)
    for (let i = 0; i < branch.points.length; i += 2) {
      assert.ok(branch.points[i] >= -20 && branch.points[i] <= width + 20);
      assert.ok(branch.points[i + 1] >= -20 && branch.points[i + 1] <= height + 20);
    }
});

test("on a phone, threads start across the whole width and down the region's whole height", () => {
  const width = 360;
  const height = 1560;
  const random = seededRandom(3);
  const density = densityFor(width, height);
  const branches = settle(seedNetwork(width, height, random, density), width, height, random, density);
  const roots = branches.filter((branch) => branch.generation === 0);
  // A phone's content fills the width but for a gutter each side: growth must run under it to be there at all.
  assert.ok(roots.filter((root) => root.points[0] > 16 && root.points[0] < width - 16).length > roots.length / 2, "most start under the column of content");
  assert.ok(roots.some((root) => root.points[1] > height * 0.6), "and they reach the lower part of a long page");
  assert.ok(branches.every((branch) => !branch.growing), "growth comes to rest");
});

test("a longer page grows as much for each stretch of its height as a hero does", () => {
  assert.deepEqual(densityFor(1280), densityFor(1280, 520), "a hero is the size the densities were tuned for");
  assert.equal(densityFor(1280, 3120).seeds, densityFor(1280).seeds * 6);
  assert.equal(densityFor(360, 4680).seeds, densityFor(360).seeds * 9);
  assert.equal(densityFor(360, 4680).limit, densityFor(360).limit * 9);
  assert.equal(densityFor(1280, 338).seeds, Math.round(densityFor(1280).seeds * 0.65), "a shorter region grows fewer, so its words are no more crowded");
  assert.equal(densityFor(1280, 100).seeds, densityFor(1280).seeds / 2, "but never less than half a hero's");
});

test("at rest the network shows whole in the margins and quieter under the content (DL-071)", () => {
  const column = { left: 128, right: 1152 };
  assert.equal(restShare(40, column), 1, "the left margin shows it whole");
  assert.equal(restShare(1200, column), 1, "and so does the right");
  assert.equal(restShare(128, column), 1, "up to the column's own edge");
  const under = restShare(640, column);
  assert.ok(under > 0 && under < 1, "under the content it is quieter, and still there");
  assert.equal(restShare(400, column), under, "by the same amount across the column");
  assert.equal(restShare(900, column), under);
  const easing = [130, 140, 150, 160].map((x) => restShare(x, column));
  assert.ok(easing.every((share, i) => share < 1 && share >= under && (i === 0 || share <= easing[i - 1])), "it eases down inside the edge, with no hard line");
  assert.equal(restShare(column.left + 10, column), restShare(column.right - 10, column), "the same at both sides");
  // A phone's column runs almost edge to edge, so nearly all of its network is the quiet kind.
  assert.equal(restShare(180, { left: 16, right: 344 }), under);
  assert.equal(restShare(0, { left: 0, right: 0 }), 1, "a region with no column measured shows whole");
});

test("only a mouse grows more, and never under reduced motion; touch never does", () => {
  assert.equal(growsFromPointer("mouse", true, false), true);
  assert.equal(growsFromPointer("touch", true, false), false, "a finger grows nothing where it touches");
  assert.equal(growsFromPointer("pen", true, false), false);
  assert.equal(growsFromPointer("mouse", false, false), false, "a coarse pointer does not grow it");
  assert.equal(growsFromPointer("mouse", true, true), false, "reduced motion keeps it at rest");
});

test("without a mouse, tufts grow on their own, never under reduced motion; with one, only the mouse grows them", () => {
  assert.equal(growsOnItsOwn(false, false), true, "a phone grows tufts on its own");
  assert.equal(growsOnItsOwn(false, true), false, "reduced motion keeps it at rest");
  assert.equal(growsOnItsOwn(true, false), false, "a mouse grows them instead");
});

test("where there is no mouse, scrolling grows tufts, a little way at a time, never under reduced motion (DL-066)", () => {
  assert.equal(growsFromScroll(false, false), true, "a phone grows tufts as its page scrolls");
  assert.equal(growsFromScroll(false, true), false, "reduced motion keeps it at rest");
  assert.equal(growsFromScroll(true, false), false, "with a mouse, the mouse grows them");
  assert.equal(scrolledEnough(400, 400 + SCROLL_SPACING - 1), false);
  assert.equal(scrolledEnough(400, 400 + SCROLL_SPACING), true);
  assert.equal(scrolledEnough(400, 400 - SCROLL_SPACING), true, "scrolling back up grows them too");
  assert.ok(SCROLL_SPACING >= 45, "no denser than a mouse grows them");
});

test("a new tuft starts brighter than the resting network and fades away", () => {
  const ages = [0, 40, 80, 120, 159, 160, 400];
  const alphas = ages.map(tuftAlpha);
  assert.ok(alphas[0] > 0.4, "fresh growth outshines the resting network");
  assert.ok(alphas.every((alpha, i) => i === 0 || alpha <= alphas[i - 1]), "it only fades");
  assert.equal(tuftAlpha(160), 0);
  assert.equal(tuftAlpha(400), 0, "and stays gone");
});

test("the logo grows threads from its centre in several colours, and rests the same way every time", () => {
  const rested = (size) => {
    const { branches, random, density } = logoNetwork(size);
    return settle(branches, size, size, random, density);
  };
  const branches = rested(32);
  const roots = branches.filter((branch) => branch.generation === 0);
  assert.ok(roots.length >= 6, "six threads or more");
  assert.ok(roots.every((branch) => branch.points[0] === 16 && branch.points[1] === 16), "from the centre");
  assert.ok(new Set(roots.map((branch) => branch.colour)).size >= 3, "in several colours");
  assert.ok(branches.every((branch) => !branch.growing), "it comes to rest");
  assert.deepEqual(rested(32).map((branch) => branch.points.length), branches.map((branch) => branch.points.length));
});
