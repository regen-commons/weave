import assert from "node:assert/strict";
import { test } from "node:test";
import { densityFor, growsFromPointer, seedNetwork, seededRandom, settle } from "../behaviors/mycelium.js";

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

test("on a phone, threads start in the hero's corners, clear of its words", () => {
  const width = 360;
  const height = 520;
  const roots = grow(width, height, 3).filter((branch) => branch.generation === 0);
  assert.ok(roots.length > 0);
  for (const root of roots) {
    const [x, y] = root.points;
    assert.ok(x <= width * 0.1 || x >= width * 0.9, "beside the edge");
    assert.ok(y <= height * 0.12 || y >= height * 0.88, "above the heading or below the links");
  }
});

test("only a mouse grows more, and never under reduced motion; touch never does", () => {
  assert.equal(growsFromPointer("mouse", true, false), true);
  assert.equal(growsFromPointer("touch", true, false), false, "a finger scrolling a phone draws nothing");
  assert.equal(growsFromPointer("pen", true, false), false);
  assert.equal(growsFromPointer("mouse", false, false), false, "a coarse pointer does not grow it");
  assert.equal(growsFromPointer("mouse", true, true), false, "reduced motion keeps it at rest");
});
