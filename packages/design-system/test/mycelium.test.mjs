import assert from "node:assert/strict";
import { test } from "node:test";
import { densityFor, growsFromPointer, growsOnItsOwn, logoNetwork, seedNetwork, seededRandom, settle, tuftAlpha } from "../behaviors/mycelium.js";

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

test("on a phone, threads start in the hero's top corners, clear of its words and links", () => {
  const width = 360;
  const height = 520;
  const roots = grow(width, height, 3).filter((branch) => branch.generation === 0);
  assert.ok(roots.length > 0);
  for (const root of roots) {
    const [x, y] = root.points;
    assert.ok(x <= width * 0.1 || x >= width * 0.9, "beside the edge");
    assert.ok(y <= height * 0.12, "beside the heading, never down by the links");
  }
});

test("only a mouse grows more, and never under reduced motion; touch never does", () => {
  assert.equal(growsFromPointer("mouse", true, false), true);
  assert.equal(growsFromPointer("touch", true, false), false, "a finger scrolling a phone draws nothing");
  assert.equal(growsFromPointer("pen", true, false), false);
  assert.equal(growsFromPointer("mouse", false, false), false, "a coarse pointer does not grow it");
  assert.equal(growsFromPointer("mouse", true, true), false, "reduced motion keeps it at rest");
});

test("without a mouse, tufts grow on their own, never under reduced motion; with one, only the mouse grows them", () => {
  assert.equal(growsOnItsOwn(false, false), true, "a phone grows tufts on its own");
  assert.equal(growsOnItsOwn(false, true), false, "reduced motion keeps it at rest");
  assert.equal(growsOnItsOwn(true, false), false, "a mouse grows them instead");
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
