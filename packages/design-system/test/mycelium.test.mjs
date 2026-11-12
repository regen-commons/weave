import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SCROLL_SPACING,
  densityFor,
  growsFromPointer,
  growsFromScroll,
  growsOnItsOwn,
  logoNetwork,
  occupancy,
  scrolledEnough,
  seedNetwork,
  seededRandom,
  settle,
  shows,
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

test("threads start at the hero's sides and stay near it", () => {
  const width = 1280;
  const height = 520;
  const branches = grow(width, height, 3);
  const roots = branches.filter((branch) => branch.generation === 0);
  assert.ok(
    roots.every((branch) => branch.points[0] <= width * 0.2 || branch.points[0] >= width * 0.8),
    "seeds sit at the sides, clear of the heading and search",
  );
  for (const branch of branches)
    for (let i = 0; i < branch.points.length; i += 2) {
      assert.ok(branch.points[i] >= -20 && branch.points[i] <= width + 20);
      assert.ok(branch.points[i + 1] >= -20 && branch.points[i + 1] <= height + 20);
    }
});

test("on a phone, threads start beside the edges, down the region's whole height (DL-066)", () => {
  const width = 360;
  const height = 520;
  const roots = grow(width, height, 3).filter((branch) => branch.generation === 0);
  assert.ok(roots.length > 0);
  for (const root of roots) assert.ok(root.points[0] <= width * 0.1 || root.points[0] >= width * 0.9, "beside the edge");
  assert.ok(roots.some((root) => root.points[1] > height * 0.5), "no longer only in the top corners");
});

test("a longer page grows as much for each stretch of its height as a hero does", () => {
  assert.deepEqual(densityFor(1280), densityFor(1280, 520), "a hero is the size the densities were tuned for");
  assert.equal(densityFor(1280, 3120).seeds, densityFor(1280).seeds * 6);
  assert.equal(densityFor(360, 4680).seeds, densityFor(360).seeds * 9);
  assert.equal(densityFor(360, 4680).limit, densityFor(360).limit * 9);
  assert.equal(densityFor(1280, 200).seeds, densityFor(1280).seeds, "a short region never grows less than a hero");
});

test("the map of content marks what a box covers and nothing else", () => {
  const ground = occupancy(120, 60, [{ left: 30, top: 12, right: 66, bottom: 30 }], 6);
  assert.equal(ground.isFree(29, 20), true);
  assert.equal(ground.isFree(30, 12), false);
  assert.equal(ground.isFree(65, 29), false);
  assert.equal(ground.isFree(66, 20), true, "the box ends where it says");
  assert.equal(ground.isFree(40, 31), true);
  assert.equal(ground.isFree(-5, 20), true, "outside the region is free: growth is cut off there anyway");
  assert.equal(ground.isFree(500, 500), true);
  const beyond = occupancy(60, 60, [{ left: -40, top: -40, right: 9, bottom: 9 }, { left: 200, top: 0, right: 260, bottom: 60 }], 6);
  assert.equal(beyond.isFree(3, 3), false, "a box that starts outside still covers what it reaches");
  assert.equal(beyond.isFree(30, 30), true, "a box wholly outside covers nothing");
});

test("growth goes around content: no thread starts on it or crosses it (DL-066)", () => {
  const width = 360;
  const height = 1560;
  // A phone page: a column of content with a gutter each side and a gap between its sections.
  const blocks = [0, 1, 2, 3].map((index) => ({ left: 16, top: 40 + index * 380, right: 344, bottom: 360 + index * 380 }));
  const ground = occupancy(width, height, blocks);
  const random = seededRandom(7);
  const density = densityFor(width, height);
  const branches = settle(seedNetwork(width, height, random, density, ground.isFree), width, height, random, density, ground.isFree);
  assert.ok(branches.length > 0, "the gutters and gaps leave room to grow");
  assert.ok(branches.every((branch) => !branch.growing), "growth comes to rest");
  let points = 0;
  for (const branch of branches)
    for (let i = 0; i < branch.points.length; i += 2) {
      points++;
      assert.ok(ground.isFree(branch.points[i], branch.points[i + 1]), `a thread is on content at ${branch.points[i]}, ${branch.points[i + 1]}`);
    }
  assert.ok(points > branches.length * 3, "threads still grow some way before they rest");
  assert.ok(branches.some((branch) => branch.points[1] > height * 0.6), "growth reaches the lower part of a long page");
  const filled = occupancy(width, height, [{ left: 0, top: 0, right: width, bottom: height }]);
  assert.deepEqual(seedNetwork(width, height, seededRandom(7), density, filled.isFree), [], "a region with no free ground grows nothing");
});

test("a computed colour shows unless it is transparent", () => {
  assert.equal(shows("rgb(0, 0, 0)"), true, "black has no alpha part and shows");
  assert.equal(shows("rgba(0, 0, 0, 0)"), false);
  assert.equal(shows("rgba(12, 34, 56, 0.4)"), true);
  assert.equal(shows("rgb(0 0 0 / 0)"), false);
  assert.equal(shows("color(srgb 0.1 0.2 0.3 / 0.5)"), true);
  assert.equal(shows("transparent"), false);
  assert.equal(shows(""), false);
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
