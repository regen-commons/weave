import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  DEPTHS,
  LINGER,
  TRAIL_FADE,
  depthFor,
  growMycelium,
  growsFromPointer,
  growsOnItsOwn,
  growsTrails,
  inColumn,
  logoNetwork,
  marginSpot,
  QUIET_MARGIN,
  QUIET_UNDER,
  mouseAtRest,
  movedEnough,
  OWN_GROWTH_FOR,
  ownGrowthOpen,
  restDensity,
  restShare,
  restStops,
  seedNetwork,
  seededRandom,
  settle,
  trailFade,
  trailsGone,
  tuftAlpha,
  tuftStrength,
} from "../behaviors/mycelium.js";

const grow = (width, height, seed = 7) => {
  const random = seededRandom(seed);
  const density = restDensity(width, height);
  return settle(seedNetwork(width, height, random, density), width, height, random, density);
};

test("growth uses the website's depth 1 on Home and depth 2 everywhere else (DL-106)", () => {
  // canvas.js on regencommons.com, DEPTH_CONFIG rows 1 and 2.
  assert.deepEqual(DEPTHS[1], { reach: 50, forkRate: 0.012, opacity: 0.22, fadeRate: 0.0014 });
  assert.deepEqual(DEPTHS[2], { reach: 60, forkRate: 0.015, opacity: 0.25, fadeRate: 0.0012 });
  assert.equal(depthFor(1), DEPTHS[1], "Home");
  for (const other of [2, 3, 0, undefined]) assert.equal(depthFor(other), DEPTHS[2], "every other page, whatever is asked for");
  // The website rubs out 0.035 a frame. The app's strands linger: a slower fade, a longer life (DL-128).
  assert.ok(TRAIL_FADE > 0.015 && TRAIL_FADE < 0.035, `trails fade more slowly than the website's, not ${TRAIL_FADE}`);
  assert.equal(LINGER, 2, "a tuft lives twice as long as the website's");
});

test("the resting network settles into the same light network for the same window", () => {
  const wide = grow(1280, 800);
  assert.deepEqual(
    wide.map((branch) => branch.points.length),
    grow(1280, 800).map((branch) => branch.points.length),
    "the same seed grows the same network, so the still version never changes",
  );
  assert.ok(wide.every((branch) => !branch.growing), "growth comes to rest");
  assert.ok(wide.length <= restDensity(1280, 800).limit, "it stays sparse");
  assert.ok(wide.some((branch) => branch.generation > 0), "it forks");
  const phone = grow(390, 844);
  assert.ok(phone.length < wide.length, "a phone's window holds less");
});

test("the resting network is light: a seed for each stretch of the window, reaching and forking as the website's do", () => {
  const wide = restDensity(1280, 800, DEPTHS[1]);
  const phone = restDensity(390, 844, DEPTHS[1]);
  // A desk's window is as full as a phone's, not sparser (DL-128).
  assert.ok(wide.seeds >= 32 && wide.seeds <= 42, `a desk's window holds about thirty-five seeds, not ${wide.seeds}`);
  assert.ok(wide.seeds / (1280 * 800) >= phone.seeds / (390 * 844), "at least as close together as on a phone");
  assert.ok(phone.seeds >= 8 && phone.seeds <= 13, `a phone's holds about ten, so it is never blank, not ${phone.seeds}`);
  assert.equal(restDensity(120, 120).seeds, 4, "a small region still has a few");
  // Twice the window, twice the seeds: the window decides, not how long the page under it is.
  assert.ok(Math.abs(restDensity(1280, 1600).seeds - restDensity(1280, 800).seeds * 2) <= 1);
  for (const depth of [DEPTHS[1], DEPTHS[2]]) {
    const density = restDensity(1280, 800, depth);
    assert.equal(density.reach, depth.reach);
    assert.equal(density.forkRate, depth.forkRate);
  }
  assert.deepEqual(restDensity(1280, 800), restDensity(1280, 800, DEPTHS[2]), "depth 2 unless told it is Home");
});

test("threads start all over a region, under its content as well as beside it (DL-071)", () => {
  const width = 1280;
  const height = 800;
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

test("on a phone, threads start across the whole width and down the window's whole height", () => {
  const width = 390;
  const height = 844;
  const branches = grow(width, height, 3);
  const roots = branches.filter((branch) => branch.generation === 0);
  // A phone's content fills the width but for a gutter each side: growth must run under it to be there at all.
  assert.ok(roots.filter((root) => root.points[0] > 16 && root.points[0] < width - 16).length > roots.length / 2, "most start under the column of content");
  assert.ok(roots.some((root) => root.points[1] > height * 0.6), "and they reach the lower part of the window");
  assert.ok(branches.every((branch) => !branch.growing), "growth comes to rest");
});

test("at rest the network shows whole in the margins and quieter under the content (DL-071)", () => {
  const column = { left: 128, right: 1152 };
  assert.equal(restShare(40, column), 1, "the left margin shows it whole");
  assert.equal(restShare(1200, column), 1, "and so does the right");
  assert.equal(restShare(128, column), 1, "up to the column's own edge");
  const under = restShare(640, column);
  assert.equal(under, 0.45, "under the content it keeps 45 percent of its strength");
  assert.equal(restShare(400, column), under, "by the same amount across the column");
  assert.equal(restShare(900, column), under);
  const easing = [130, 140, 150, 160].map((x) => restShare(x, column));
  assert.ok(easing.every((share, i) => share < 1 && share >= under && (i === 0 || share <= easing[i - 1])), "it eases down inside the edge, with no hard line");
  assert.equal(restShare(column.left + 10, column), restShare(column.right - 10, column), "the same at both sides");
  // A phone's column runs almost edge to edge, so nearly all of its network is the quiet kind.
  assert.equal(restShare(180, { left: 16, right: 344 }), under);
  assert.equal(restShare(0, { left: 0, right: 0 }), 1, "a region with no column measured shows whole");
});

test("the mask over the resting network has the same shares at the column's edges", () => {
  const column = { left: 128, right: 1152 };
  assert.deepEqual(restStops(column, 1280), [[0.1, 1], [0.125, 0.45], [0.875, 0.45], [0.9, 1]]);
  // Each stop is what restShare says of that place, and they run in order across the region.
  for (const [place, share] of restStops(column, 1280)) assert.equal(share, restShare(place * 1280, column));
  const phone = restStops({ left: 16, right: 374 }, 390);
  assert.ok(phone.every(([place], i) => place >= 0 && place <= 1 && (i === 0 || place >= phone[i - 1][0])));
  assert.deepEqual(restStops({ left: 0, right: 0 }, 390), [[0, 1], [1, 1]], "no column measured leaves it whole");
  assert.deepEqual(restStops({ left: 100, right: 140 }, 390), [[0, 1], [1, 1]], "and so does one too narrow to ease into");
  assert.deepEqual(restStops(column, 0), [[0, 1], [1, 1]]);
});

test("a mouse or a finger leaves trails every 45 px, and never under reduced motion (DL-106)", () => {
  assert.equal(growsTrails(false), true);
  assert.equal(growsTrails(true), false, "reduced motion keeps it at rest");
  assert.equal(movedEnough(null, { x: 10, y: 10 }), true, "the first move grows one");
  assert.equal(movedEnough({ x: 0, y: 0 }, { x: 44, y: 0 }), false);
  assert.equal(movedEnough({ x: 0, y: 0 }, { x: 45, y: 0 }), true);
  assert.equal(movedEnough({ x: 0, y: 0 }, { x: 27, y: 36 }), true, "in any direction");
});

test("tufts grow on their own on a phone and a desk, never under reduced motion, and wait while a mouse is moving", () => {
  assert.equal(growsOnItsOwn(false), true, "a phone and a desk grow tufts on their own");
  assert.equal(growsOnItsOwn(true), false, "reduced motion keeps it at rest");
  assert.equal(mouseAtRest(Infinity), true, "no mouse has moved");
  assert.equal(mouseAtRest(500), false, "a mouse that just moved grows them instead");
  assert.equal(mouseAtRest(5000), true, "and once it rests they grow again");
});

test("a tuft is drawn at the website's strength and loses the website's share of it more slowly, so it lingers", () => {
  for (const depth of [DEPTHS[1], DEPTHS[2]]) {
    assert.equal(tuftStrength(0, depth), depth.opacity);
    assert.ok(Math.abs(tuftStrength(10, depth) - (depth.opacity - (10 * depth.fadeRate) / LINGER)) < 1e-12);
    const life = Math.ceil((depth.opacity / depth.fadeRate) * LINGER);
    assert.ok(tuftStrength(life - 2, depth) > 0);
    assert.equal(tuftStrength(life + 1, depth), 0);
    assert.equal(tuftStrength(life * 3, depth), 0, "and stays gone");
    assert.ok(life > 300 && life < 480, `it lives five to eight seconds, not ${life} frames`);
  }
});

test("trails fade slowly while anything grows and for a while after, then faster, and are cleared so drawing can stop", () => {
  assert.equal(trailFade(0), TRAIL_FADE);
  assert.equal(trailFade(120), TRAIL_FADE, "for a while after the last tuft, so a strand fades out slowly");
  assert.ok(trailFade(160) > TRAIL_FADE * 3, "then the last of them goes faster, so no ghost stays");
  assert.equal(trailsGone(120), false);
  assert.equal(trailsGone(200), false);
  assert.equal(trailsGone(260), true);
  // By the time they are cleared the quick fade has left under one part in 255 of them.
  let left = 1;
  for (let frame = 1; !trailsGone(frame); frame++) left *= 1 - trailFade(frame);
  assert.ok(left < 1 / 255, `what is cleared is already invisible, not ${left}`);
});

test("the logo is grown by a mouse only, and its new growth starts bright and fades", () => {
  assert.equal(growsFromPointer("mouse", true, false), true);
  assert.equal(growsFromPointer("touch", true, false), false, "a finger never grows the logo");
  assert.equal(growsFromPointer("pen", true, false), false);
  assert.equal(growsFromPointer("mouse", false, false), false, "a coarse pointer does not grow it");
  assert.equal(growsFromPointer("mouse", true, true), false, "reduced motion keeps it at rest");
  const alphas = [0, 40, 80, 120, 159, 160, 400].map(tuftAlpha);
  assert.ok(alphas[0] > 0.4, "fresh growth outshines what is at rest");
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

// A stand-in for a window, a document and a canvas: enough to run the growth a frame at a time.
function stage({ width = 1280, height = 800, reducedMotion = false, finePointer = true, pixelRatio = 3, inset = 128 } = {}) {
  const media = {
    "(prefers-reduced-motion: reduce)": reducedMotion,
    "(hover: hover) and (pointer: fine)": finePointer,
    "(prefers-color-scheme: dark)": false,
  };
  const listeners = new Map();
  const listening = (target) => ({
    addEventListener(type, listener) { listeners.set(listener, `${target}:${type}`); },
    removeEventListener(type, listener) { listeners.delete(listener); },
  });
  const painted = { operations: [], images: 0 };
  const context = () => {
    const record = { clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, arc() {}, fill() {}, fillRect() {},
      drawImage() { painted.images += 1; }, createLinearGradient: () => ({ addColorStop() {} }) };
    return new Proxy(record, { set(target, key, value) {
      if (key === "globalCompositeOperation") painted.operations.push(value);
      target[key] = value;
      return true;
    } });
  };
  const view = {
    devicePixelRatio: pixelRatio,
    innerHeight: height,
    frame: null,
    timers: [],
    observers: 0,
    ...listening("window"),
    matchMedia: (query) => ({ matches: media[query] ?? false, ...listening(query) }),
    getComputedStyle: () => ({ getPropertyValue: () => "#345", color: "#000" }),
    requestAnimationFrame(callback) { view.frame = callback; return 1; },
    cancelAnimationFrame() { view.frame = null; },
    setTimeout(callback) { view.timers.push(callback); return view.timers.length; },
    clearTimeout(id) { view.timers[id - 1] = null; },
    MutationObserver: class { observe() { view.observers += 1; } disconnect() { view.observers -= 1; } },
  };
  const box = { left: 0, top: 0, right: width, bottom: height, width, height };
  const element = () => ({ width: 0, height: 0, getContext: context, getBoundingClientRect: () => box });
  const document = { defaultView: view, documentElement: {}, hidden: false, createElement: element, ...listening("document") };
  const canvas = { ...element(), ownerDocument: document, parentElement: { getBoundingClientRect: () => box }, nextElementSibling: { getBoundingClientRect: () => ({ ...box, left: inset, right: width - inset }) } };
  /** Runs frames until none is asked for, and says how many ran. */
  const run = (limit = 2000) => {
    let frames = 0;
    while (view.frame && frames < limit) {
      const callback = view.frame;
      view.frame = null;
      callback();
      frames += 1;
    }
    return frames;
  };
  const send = (type, event) => { for (const [listener, key] of listeners) if (key === `window:${type}`) listener(event); };
  return { canvas, view, painted, listeners, run, send };
}

test("the canvas holds one canvas pixel for each CSS pixel, however sharp the screen (DL-106)", () => {
  for (const pixelRatio of [1, 2, 3]) {
    const { canvas } = stage({ width: 390, height: 844, pixelRatio });
    const growth = growMycelium(canvas);
    assert.deepEqual([canvas.width, canvas.height], [390, 844], `at ${pixelRatio}x`);
    growth.dispose();
  }
});

test("a mouse leaves a trail that is faded, never cleared and restored, and drawing stops once it has gone", () => {
  const { canvas, view, painted, run, send } = stage();
  const growth = growMycelium(canvas);
  const first = run();
  assert.ok(first > 20 && first < 400, `the resting network grows in and rests, in ${first} frames`);
  assert.equal(view.frame, null, "and nothing is drawn after it");
  assert.equal(painted.operations.includes("destination-out"), false, "with no trail there is nothing to fade");

  send("mousemove", { clientX: 300, clientY: 300 });
  assert.ok(view.frame, "a move over the page starts drawing");
  const life = run();
  const longest = Math.ceil((DEPTHS[2].opacity / DEPTHS[2].fadeRate) * LINGER);
  assert.ok(life > longest && life < longest + 260, `the tuft lives, its trail fades, and drawing stops: ${life} frames`);
  assert.equal(view.frame, null, "nothing runs once the trail has gone");
  assert.ok(painted.operations.includes("destination-out"), "the trail was rubbed out a little each frame");

  send("mousemove", { clientX: 320, clientY: 300 });
  assert.equal(view.frame, null, "a move of under 45 px grows nothing");
  send("mousemove", { clientX: 400, clientY: 300 });
  assert.ok(view.frame, "and a further one does");
  send("mousemove", { clientX: 5000, clientY: 300 });
  growth.dispose();
});

test("a finger leaves a trail where it moves, as on the website", () => {
  const { canvas, view, run, send } = stage({ width: 390, height: 844, finePointer: true });
  const growth = growMycelium(canvas);
  run();
  send("touchmove", { touches: [{ clientX: 120, clientY: 500 }] });
  assert.ok(view.frame, "a finger moving over the page starts drawing");
  run();
  send("touchmove", { touches: [] });
  assert.equal(view.frame, null, "a touch that has ended grows nothing");
  growth.dispose();
});

test("under reduced motion the resting network is drawn at once and nothing ever moves", () => {
  const { canvas, view, painted, send } = stage({ reducedMotion: true, finePointer: false });
  const growth = growMycelium(canvas);
  assert.equal(view.frame, null, "no frame is asked for");
  assert.ok(painted.images >= 1, "the resting network is on the canvas");
  send("mousemove", { clientX: 300, clientY: 300 });
  send("touchmove", { touches: [{ clientX: 120, clientY: 500 }] });
  assert.equal(view.frame, null, "a mouse and a finger grow nothing");
  assert.equal(view.timers.filter(Boolean).length, 0, "and nothing is set to grow on its own");
  growth.dispose();
});

test("a tuft grows on its own on a desk too, but not while the mouse is growing them", () => {
  const desk = stage({ finePointer: true });
  const onDesk = growMycelium(desk.canvas);
  desk.run();
  const [waits] = desk.view.timers.filter(Boolean);
  assert.ok(waits, "a desk waits to grow one, so a still window is not bare (DL-128)");
  waits();
  assert.ok(desk.view.frame, "and then grows it");
  desk.run();
  desk.send("mousemove", { clientX: 300, clientY: 300 });
  desk.run();
  const next = desk.view.timers.filter(Boolean).at(-1);
  next();
  assert.equal(desk.view.frame, null, "a mouse that has just moved grows them instead");
  onDesk.dispose();

  const phone = stage({ width: 390, height: 844, finePointer: false });
  const onPhone = growMycelium(phone.canvas);
  phone.run();
  const [grows] = phone.view.timers.filter(Boolean);
  assert.ok(grows, "a phone waits to grow one");
  grows();
  assert.ok(phone.view.frame, "and then grows it");
  onPhone.dispose();
});

test("growth on its own ends five seconds after a page opens, and a mouse still grows trails (WCAG 2.2.2)", () => {
  assert.equal(OWN_GROWTH_FOR, 5000);
  assert.equal(ownGrowthOpen(4999), true);
  assert.equal(ownGrowthOpen(5000), false, "nothing starts on its own once five seconds have passed");

  const { canvas, view, run, send } = stage();
  const growth = growMycelium(canvas);
  run();
  const [own, end] = view.timers.filter(Boolean);
  own();
  assert.ok(view.frame, "a tuft grows on its own in the first seconds");
  end();
  const after = run();
  assert.ok(after < 100, `what grew on its own goes quickly once the time is up: ${after} frames`);
  assert.equal(view.frame, null, "and then nothing moves");
  const waiting = view.timers.filter((timer) => timer && timer !== own && timer !== end);
  assert.equal(waiting.length, 0, "and nothing is set to grow on its own again");
  send("mousemove", { clientX: 300, clientY: 300 });
  assert.ok(view.frame, "a mouse still leaves its trail");
  growth.dispose();

  const early = stage();
  const growing = growMycelium(early.canvas);
  const [, stopAt] = early.view.timers.filter(Boolean);
  stopAt();
  assert.ok(early.run() <= 2, "a resting network still growing in comes to rest at once");
  growing.dispose();
});

test("disposing stops drawing and leaves no listener, observer or timer behind", () => {
  const { canvas, view, listeners, send } = stage({ finePointer: false });
  const growth = growMycelium(canvas);
  send("mousemove", { clientX: 300, clientY: 300 });
  assert.ok(listeners.size > 0 && view.observers > 0);
  growth.dispose();
  assert.equal(view.frame, null);
  assert.equal(listeners.size, 0);
  assert.equal(view.observers, 0);
  assert.equal(view.timers.filter(Boolean).length, 0);
});

test("the page's growth never reads the screen's pixel ratio or keeps a picture to restore; the logo keeps its sharpness", () => {
  const source = readFileSync(new URL("../behaviors/mycelium.js", import.meta.url), "utf8");
  const [page, logo] = source.split("export function growLogoMark");
  assert.doesNotMatch(page.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, ""), /devicePixelRatio|createImageBitmap|scrollY/);
  assert.match(logo, /devicePixelRatio/, "a brand mark this small is drawn sharp");
});

test("on a quiet page the resting network is quieter under the column, and new growth keeps to wide margins (DL-135)", () => {
  const column = { left: 80, right: 1200 };
  assert.ok(QUIET_UNDER < 0.45, "quieter than a page with nothing to fill in");
  assert.equal(restShare(640, column, QUIET_UNDER), QUIET_UNDER);
  assert.equal(restShare(40, column, QUIET_UNDER), 1, "whole in the margins");
  assert.deepEqual(restStops(column, 1280, QUIET_UNDER).map(([, share]) => share), [1, QUIET_UNDER, QUIET_UNDER, 1]);
  assert.equal(inColumn(640, column), true);
  assert.equal(inColumn(40, column), false);
  // A desk's margins hold a tuft; a phone's column runs to its edges and holds none.
  for (const pick of [0, 0.25, 0.5, 0.75, 0.999]) {
    const x = marginSpot(column, 1280, pick);
    assert.ok(x !== null && !inColumn(x, column), `${pick} lands in a margin, at ${x}`);
  }
  assert.equal(marginSpot({ left: 0, right: 360 }, 360, 0.5), null, "a phone grows nothing new over its fields");
  assert.equal(marginSpot({ left: QUIET_MARGIN - 1, right: 360 - QUIET_MARGIN + 1 }, 360, 0.5), null, "nor in a margin too narrow");
  // A tuft's branches stop at the column's edge.
  const branches = [];
  const random = seededRandom(3);
  const density = { reach: 60, forkRate: 0.015, limit: 24, avoid: column };
  for (let i = 0; i < 6; i++) branches.push({ points: [76, 300 + i * 20], angle: 0, step: 1, width: 1, length: 80, generation: 0, colour: 0, growing: true });
  settle(branches, 1280, 800, random, density);
  for (const branch of branches) for (let i = 0; i < branch.points.length; i += 2) assert.ok(!inColumn(branch.points[i], column), "no point inside the column");
});

test("on a quiet page a mouse over the fields grows nothing, and one in the margin does", () => {
  const { canvas, view, run, send } = stage({ inset: 80 });
  const growth = growMycelium(canvas, { quiet: true });
  run();
  send("mousemove", { clientX: 640, clientY: 300 });
  assert.equal(view.frame, null, "over the column");
  send("mousemove", { clientX: 30, clientY: 300 });
  assert.ok(view.frame, "in the margin");
  growth.dispose();

  const phone = stage({ width: 360, height: 780, finePointer: false, inset: 0 });
  const onPhone = growMycelium(phone.canvas, { quiet: () => true });
  phone.run();
  const [grows] = phone.view.timers.filter(Boolean);
  grows();
  assert.equal(phone.view.frame, null, "a phone's form step grows nothing on its own");
  onPhone.dispose();
});
