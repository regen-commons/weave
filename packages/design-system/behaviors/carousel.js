// Carousel behaviour shared by React and the static pattern library: a preview row of cards that
// swipes sideways on a phone (DL-090) gives a small bounce when it reaches its start or its end, and
// again when a finger, a wheel or a trackpad pushes on past an end it is already at (DL-128).
//
// The behaviour only says which end was reached: it sets `data-bounce="start"` or `"end"` on the
// list for one bounce and clears it when the animation ends. The stylesheet draws the bounce, with
// the system's spacing and motion tokens, and draws nothing under reduced motion. The row's own
// overscroll is turned off in the stylesheet, so a phone's native stretch or rubber band never
// plays on top of this one. Nothing happens where the list does not scroll, as on a wide screen,
// where the same list is a grid.

/** How far, in CSS pixels, a finger must push past an end before the row bounces. */
const PUSH = 24;
/** Without `scrollend`, a row that has not scrolled for this many milliseconds has come to rest. */
const REST = 120;
/**
 * After a bounce, pushes are let go for this many milliseconds, so a trackpad's momentum, which
 * goes on sending for a while, bounces the row once and not over and over.
 */
const SETTLE = 600;

/** Which end a row's scroll position is at, if either: within a pixel, as browsers round. */
export function edgeAt(position, scrollWidth, clientWidth) {
  if (scrollWidth - clientWidth <= 1) return null;
  if (position <= 1) return "start";
  if (position >= scrollWidth - clientWidth - 1) return "end";
  return null;
}

/**
 * Which end to bounce when a row comes to rest: the end it was moving towards, once it is there.
 * A row put at an end without moving there, such as on load, does not bounce.
 */
export function restingBounce(edge, direction) {
  if (edge === "start" && direction < 0) return "start";
  if (edge === "end" && direction > 0) return "end";
  return null;
}

/** Which end a push bounces: one the row is already at, pushed on past it. */
export function pushBounce(edge, delta) {
  if (edge === "start" && delta < 0) return "start";
  if (edge === "end" && delta > 0) return "end";
  return null;
}

/**
 * Connects a list to its bounce. Returns `dispose`, which removes every listener and timer; call
 * it on unmount.
 */
export function bounceAtEdges(list) {
  const view = list.ownerDocument.defaultView;
  if (!view) return { dispose() {} };
  const still = view.matchMedia("(prefers-reduced-motion: reduce)");
  const cleanup = [];
  let last = list.scrollLeft;
  let direction = 0;
  let restTimer = 0;
  let touch = null;
  let pushedAt = -Infinity;

  const listen = (target, type, listener, options) => {
    target.addEventListener(type, listener, options);
    cleanup.push(() => target.removeEventListener(type, listener, options));
  };
  const edge = () => edgeAt(list.scrollLeft, list.scrollWidth, list.clientWidth);

  function bounce(end) {
    if (!end || still.matches || list.dataset.bounce) return;
    list.dataset.bounce = end;
  }

  /** A push past an end bounces once, then waits for the push to settle. */
  function push(end) {
    if (!end) return;
    const now = Date.now();
    if (now - pushedAt < SETTLE) {
      pushedAt = now;
      return;
    }
    pushedAt = now;
    bounce(end);
  }

  function rested() {
    restTimer = 0;
    bounce(restingBounce(edge(), direction));
    direction = 0;
  }

  listen(list, "scroll", () => {
    const now = list.scrollLeft;
    if (now !== last) direction = Math.sign(now - last);
    last = now;
    // Browsers without scrollend say the row has rested once it has been still a moment.
    if (!("onscrollend" in view)) {
      if (restTimer) view.clearTimeout(restTimer);
      restTimer = view.setTimeout(rested, REST);
    }
  }, { passive: true });
  listen(list, "scrollend", rested, { passive: true });

  // A wheel or a trackpad that pushes sideways past an end the row is already at.
  listen(list, "wheel", (event) => {
    if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
    push(pushBounce(edge(), event.deltaX));
  }, { passive: true });

  // A finger that pushes past an end: once per touch, after it has pushed a little way.
  listen(list, "touchstart", (event) => {
    const point = event.touches[0];
    touch = point ? { x: point.clientX, y: point.clientY, edge: edge(), done: false } : null;
  }, { passive: true });
  listen(list, "touchmove", (event) => {
    const point = event.touches[0];
    if (!touch || touch.done || !point) return;
    const dx = touch.x - point.clientX;
    if (Math.abs(dx) < PUSH || Math.abs(dx) < Math.abs(touch.y - point.clientY)) return;
    const end = pushBounce(touch.edge, dx);
    if (end && edge() === touch.edge) {
      touch.done = true;
      push(end);
    }
  }, { passive: true });
  listen(list, "touchend", () => { touch = null; }, { passive: true });

  // The bounce has played: clear it, so the next one can play.
  listen(list, "animationend", (event) => {
    if (event.animationName.startsWith("rc-bounce")) delete list.dataset.bounce;
  });
  listen(list, "animationcancel", (event) => {
    if (event.animationName.startsWith("rc-bounce")) delete list.dataset.bounce;
  });

  return {
    dispose() {
      if (restTimer) view.clearTimeout(restTimer);
      for (const undo of cleanup.splice(0)) undo();
      delete list.dataset.bounce;
    },
  };
}
