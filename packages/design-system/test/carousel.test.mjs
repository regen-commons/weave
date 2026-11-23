import assert from "node:assert/strict";
import { test } from "node:test";
import { bounceAtEdges, edgeAt, pushBounce, restingBounce } from "../behaviors/carousel.js";

test("a row knows which end it is at, within a pixel, and a row that does not scroll is at neither", () => {
  assert.equal(edgeAt(0, 1200, 360), "start");
  assert.equal(edgeAt(0.6, 1200, 360), "start", "browsers round scroll positions");
  assert.equal(edgeAt(400, 1200, 360), null);
  assert.equal(edgeAt(840, 1200, 360), "end");
  assert.equal(edgeAt(839.4, 1200, 360), "end");
  assert.equal(edgeAt(0, 360, 360), null, "a wide screen's grid does not scroll");
});

test("a row bounces at the end it was moving towards, and not where it was put without moving", () => {
  assert.equal(restingBounce("start", -1), "start");
  assert.equal(restingBounce("end", 1), "end");
  assert.equal(restingBounce("start", 0), null, "on load, at the start, nothing bounces");
  assert.equal(restingBounce("start", 1), null);
  assert.equal(restingBounce(null, 1), null, "coming to rest between the ends");
});

test("a push bounces only past an end the row is already at", () => {
  assert.equal(pushBounce("start", -30), "start");
  assert.equal(pushBounce("end", 30), "end");
  assert.equal(pushBounce("start", 30), null, "a push into the row scrolls it");
  assert.equal(pushBounce(null, 30), null);
});

function stage({ reducedMotion = false, scrollend = true } = {}) {
  const listeners = new Map();
  const timers = [];
  const view = {
    matchMedia: () => ({ matches: reducedMotion }),
    setTimeout(callback) { timers.push(callback); return timers.length; },
    clearTimeout(id) { timers[id - 1] = null; },
    ...(scrollend ? { onscrollend: null } : {}),
  };
  const list = {
    scrollLeft: 0,
    scrollWidth: 1200,
    clientWidth: 360,
    dataset: {},
    ownerDocument: { defaultView: view },
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type) { listeners.delete(type); },
  };
  const send = (type, event = {}) => listeners.get(type)?.(event);
  const scrollTo = (position) => { list.scrollLeft = position; send("scroll"); };
  return { list, listeners, timers, send, scrollTo };
}

test("swiping to the end bounces the cards once, and the stylesheet's animation clears it for the next", () => {
  const { list, send, scrollTo } = stage();
  const row = bounceAtEdges(list);
  scrollTo(400);
  send("scrollend");
  assert.equal(list.dataset.bounce, undefined, "between the ends nothing bounces");
  scrollTo(840);
  send("scrollend");
  assert.equal(list.dataset.bounce, "end");
  send("animationend", { animationName: "rc-card-arrive" });
  assert.equal(list.dataset.bounce, "end", "another animation ending leaves it");
  send("animationend", { animationName: "rc-bounce-end" });
  assert.equal(list.dataset.bounce, undefined);
  scrollTo(0);
  send("scrollend");
  assert.equal(list.dataset.bounce, "start", "and back at the start, it bounces there");
  row.dispose();
});

test("without scrollend, a row that has been still a moment has come to rest", () => {
  const { list, timers, scrollTo } = stage({ scrollend: false });
  const row = bounceAtEdges(list);
  scrollTo(840);
  timers.filter(Boolean).at(-1)();
  assert.equal(list.dataset.bounce, "end");
  row.dispose();
});

test("a finger or a wheel pushing past an end bounces once, not over and over", () => {
  const { list, send } = stage();
  const row = bounceAtEdges(list);
  send("touchstart", { touches: [{ clientX: 100, clientY: 300 }] });
  send("touchmove", { touches: [{ clientX: 110, clientY: 300 }] });
  assert.equal(list.dataset.bounce, undefined, "a short push is not one yet");
  send("touchmove", { touches: [{ clientX: 140, clientY: 300 }] });
  assert.equal(list.dataset.bounce, "start", "pulling the first card further from the start");
  send("animationend", { animationName: "rc-bounce-start" });
  send("touchmove", { touches: [{ clientX: 200, clientY: 300 }] });
  assert.equal(list.dataset.bounce, undefined, "once per touch");
  send("touchend");

  send("touchstart", { touches: [{ clientX: 100, clientY: 300 }] });
  send("touchmove", { touches: [{ clientX: 110, clientY: 360 }] });
  assert.equal(list.dataset.bounce, undefined, "a finger scrolling the page bounces nothing");
  send("touchend");

  send("wheel", { deltaX: -2, deltaY: 30 });
  assert.equal(list.dataset.bounce, undefined, "a wheel scrolling the page bounces nothing");
  row.dispose();
});

test("under reduced motion nothing bounces, and disposing leaves no listener or mark behind", () => {
  const still = stage({ reducedMotion: true });
  const row = bounceAtEdges(still.list);
  still.scrollTo(840);
  still.send("scrollend");
  assert.equal(still.list.dataset.bounce, undefined);
  row.dispose();
  assert.equal(still.listeners.size, 0);

  const moving = stage();
  const other = bounceAtEdges(moving.list);
  moving.scrollTo(840);
  moving.send("scrollend");
  other.dispose();
  assert.equal(moving.list.dataset.bounce, undefined);
  assert.equal(moving.listeners.size, 0);
});
