// A bottom sheet under a finger and over a keyboard (DL-091). The behaviour runs against a
// stand-in for the dialog, with the touches and the visual viewport a phone would report.
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { connectSheet } from "../behaviors/sheet.js";

const HEIGHT = 500;

class FakeElement {
  scrollTop = 0;
  constructor(parent = null, matches = []) {
    this.parentElement = parent;
    this.matches = matches;
  }
  /** Finds the nearest of this and its parents that one of the selector's parts names. */
  closest(selector) {
    if (selector === "dialog") return this.dialog;
    for (let element = this; element; element = element.parentElement) {
      if (element.matches?.some((name) => selector.includes(name))) return element;
    }
    return null;
  }
  get dialog() {
    let element = this;
    while (element.parentElement) element = element.parentElement;
    return element;
  }
}

class FakeDialog extends EventTarget {
  open = true;
  scrollTop = 0;
  parentElement = null;
  dataset = {};
  properties = {};
  scrolledIntoView = [];
  style = {
    setProperty: (name, value) => { this.properties[name] = value; },
    removeProperty: (name) => { delete this.properties[name]; },
  };
  ownerDocument = { activeElement: null };
  /** Whether it is drawn as a bottom sheet: the grip shows only there. */
  sheet = true;
  getAnimations() { return []; }
  getBoundingClientRect() { return { left: 0, right: 360, top: 280, bottom: 780, width: 360, height: HEIGHT }; }
  querySelector() { return this.sheet ? { sheet: true } : null; }
  contains(element) { return element?.dialog === this; }
  closest(selector) { return selector === "dialog" ? this : null; }
  get dialog() { return this; }
  close() { this.open = false; this.dispatchEvent(new Event("close")); }
}

class FakeViewport extends EventTarget {
  height = 780;
  offsetTop = 0;
  scale = 1;
  report(change) {
    Object.assign(this, change);
    this.dispatchEvent(new Event("resize"));
  }
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 0));
const connected = [];
function connect({ viewport } = {}) {
  globalThis.HTMLDialogElement = class {};
  globalThis.getComputedStyle = (element) => ({ display: element.sheet ? "block" : "none" });
  globalThis.innerHeight = 780;
  globalThis.visualViewport = viewport;
  const dialog = new FakeDialog();
  const sheet = connectSheet(dialog);
  connected.push(sheet);
  return { dialog, sheet, content: new FakeElement(dialog) };
}
afterEach(() => {
  for (const sheet of connected.splice(0)) sheet.dispose();
  for (const name of ["HTMLDialogElement", "getComputedStyle", "innerHeight", "visualViewport"]) delete globalThis[name];
});

/** One finger's event on `target`, at `y`, `at` milliseconds in. `prevented` says whether the page was refused the pan. */
function touch(dialog, type, target, { x = 180, y, at = 0, cancelable = true, fingers = 1 }) {
  const finger = { identifier: 1, clientX: x, clientY: y };
  const event = Object.assign(new Event(type, { cancelable }), {
    touches: type === "touchend" || type === "touchcancel" ? [] : Array(fingers).fill(finger),
    changedTouches: [finger],
  });
  Object.defineProperty(event, "target", { value: target });
  Object.defineProperty(event, "timeStamp", { value: at });
  dialog.dispatchEvent(event);
  return { prevented: event.defaultPrevented };
}

test("a finger that pulls the content down from its top pulls the sheet, and far enough dismisses it", async () => {
  const { dialog, content } = connect();
  touch(dialog, "touchstart", content, { y: 400 });
  const first = touch(dialog, "touchmove", content, { y: 410, at: 40 });
  assert.equal(first.prevented, true, "the page is refused the pan, so nothing scrolls or bounces under the sheet");
  assert.equal(dialog.properties["--sheet-drag"], "0px", "the sheet starts from where the finger is, with no jump");
  touch(dialog, "touchmove", content, { y: 430, at: 400 });
  assert.equal(dialog.properties["--sheet-drag"], "20px");
  // Slowly, to just past three tenths of the sheet's height.
  touch(dialog, "touchmove", content, { y: 410 + HEIGHT * 0.3 + 1, at: 2000 });
  touch(dialog, "touchend", content, { y: 410 + HEIGHT * 0.3 + 1, at: 2100 });
  await settled();
  assert.equal(dialog.open, false);
});

test("a press that wobbles is still a press", async () => {
  // A few pixels under a finger that never meant to move: nobody takes the gesture.
  const still = connect();
  touch(still.dialog, "touchstart", still.content, { y: 400 });
  assert.equal(touch(still.dialog, "touchmove", still.content, { x: 182, y: 403, at: 5 }).prevented, false);
  touch(still.dialog, "touchend", still.content, { y: 403, at: 60 });
  await settled();
  assert.equal(still.dialog.properties["--sheet-drag"], undefined);
  assert.equal(still.dialog.open, true);
  // A little further and very fast is as quick as a flick, and travels nowhere near as far.
  const quick = connect();
  touch(quick.dialog, "touchstart", quick.content, { y: 400 });
  touch(quick.dialog, "touchmove", quick.content, { y: 408, at: 5 });
  touch(quick.dialog, "touchmove", quick.content, { y: 420, at: 9 });
  touch(quick.dialog, "touchend", quick.content, { y: 420, at: 12 });
  await settled();
  assert.equal(quick.dialog.open, true, "12 px in 4 ms");
  assert.equal(quick.dialog.properties["--sheet-drag"], "0px");
});

test("a short pull settles back, and a flick dismisses from any height", async () => {
  const slow = connect();
  touch(slow.dialog, "touchstart", slow.content, { y: 400 });
  touch(slow.dialog, "touchmove", slow.content, { y: 410, at: 500 });
  touch(slow.dialog, "touchmove", slow.content, { y: 450, at: 1000 });
  touch(slow.dialog, "touchend", slow.content, { y: 450, at: 1100 });
  await settled();
  assert.equal(slow.dialog.open, true);
  assert.equal(slow.dialog.properties["--sheet-drag"], "0px", "it goes back where it was");
  assert.ok("settling" in slow.dialog.dataset);

  const fast = connect();
  touch(fast.dialog, "touchstart", fast.content, { y: 400 });
  touch(fast.dialog, "touchmove", fast.content, { y: 410, at: 10 });
  touch(fast.dialog, "touchmove", fast.content, { y: 450, at: 40 });
  touch(fast.dialog, "touchend", fast.content, { y: 450, at: 50 });
  await settled();
  assert.equal(fast.dialog.open, false, "40 px in 30 ms");
});

test("the content keeps a gesture that is its own: scrolled content, a finger going up or sideways", async () => {
  // Content that is scrolled has somewhere to go back to, whether it is the sheet or a list inside it.
  for (const where of ["sheet", "inner"]) {
    const { dialog, content } = connect();
    const list = new FakeElement(content);
    if (where === "sheet") dialog.scrollTop = 120;
    else content.scrollTop = 40;
    touch(dialog, "touchstart", list, { y: 400 });
    const move = touch(dialog, "touchmove", list, { y: 460, at: 40 });
    assert.equal(move.prevented, false, `${where}: the content scrolls`);
    assert.equal(dialog.properties["--sheet-drag"], undefined);
  }
  for (const [name, to] of [["up", { y: 380 }], ["sideways", { x: 240, y: 410 }]]) {
    const { dialog, content } = connect();
    touch(dialog, "touchstart", content, { y: 400 });
    const move = touch(dialog, "touchmove", content, { ...to, at: 40 });
    assert.equal(move.prevented, false, name);
    // The gesture stays the content's, even if the finger then comes back down.
    assert.equal(touch(dialog, "touchmove", content, { y: 500, at: 80 }).prevented, false, `${name}, then down`);
    touch(dialog, "touchend", content, { y: 500, at: 90 });
    await settled();
    assert.equal(dialog.open, true);
  }
});

test("a pull leaves alone what it must: a field, a second finger, a wide dialog, a pan the browser already has", async () => {
  // A finger on a field places the caret or picks a value.
  const typing = connect();
  const field = new FakeElement(typing.content, ["textarea"]);
  touch(typing.dialog, "touchstart", field, { y: 400 });
  assert.equal(touch(typing.dialog, "touchmove", field, { y: 600, at: 40 }).prevented, false, "a field");
  // Two fingers are a pinch.
  const pinch = connect();
  touch(pinch.dialog, "touchstart", pinch.content, { y: 400, fingers: 2 });
  assert.equal(touch(pinch.dialog, "touchmove", pinch.content, { y: 600, at: 40 }).prevented, false, "two fingers");
  // A centred dialog on a wide screen is not a sheet.
  const wide = connect();
  wide.dialog.sheet = false;
  touch(wide.dialog, "touchstart", wide.content, { y: 400 });
  assert.equal(touch(wide.dialog, "touchmove", wide.content, { y: 600, at: 40 }).prevented, false, "a wide dialog");
  // Once the browser is scrolling, the move cannot be refused, and the sheet does not half-follow.
  const late = connect();
  touch(late.dialog, "touchstart", late.content, { y: 400 });
  touch(late.dialog, "touchmove", late.content, { y: 600, at: 40, cancelable: false });
  assert.equal(late.dialog.properties["--sheet-drag"], undefined, "a pan the browser has");
  // A gesture the system takes away never dismisses, however far it went.
  const taken = connect();
  touch(taken.dialog, "touchstart", taken.content, { y: 400 });
  touch(taken.dialog, "touchmove", taken.content, { y: 410, at: 100 });
  touch(taken.dialog, "touchmove", taken.content, { y: 700, at: 2000 });
  assert.equal(taken.dialog.properties["--sheet-drag"], "290px");
  touch(taken.dialog, "touchcancel", taken.content, { y: 700, at: 2100 });
  await settled();
  assert.equal(taken.dialog.open, true, "a cancelled touch");
  assert.equal(taken.dialog.properties["--sheet-drag"], "0px");
});

test("a sheet stands on the on-screen keyboard and fits in what is left of the window", () => {
  const viewport = new FakeViewport();
  const { dialog, content } = connect({ viewport });
  const field = new FakeElement(content, ["textarea"]);
  field.scrollIntoView = (options) => dialog.scrolledIntoView.push(options);
  dialog.ownerDocument.activeElement = field;
  // The keyboard takes 300 px of a 780 px window.
  viewport.report({ height: 480 });
  assert.equal(dialog.properties["--sheet-keyboard"], "300px");
  assert.equal(dialog.properties["--sheet-room"], "480px");
  assert.deepEqual(dialog.scrolledIntoView, [{ block: "nearest" }], "the field being typed in stays in view");
  // The browser moves the visible part down the window to show a field: the keyboard's top is
  // further down by as much, and the room in view is the same.
  viewport.report({ offsetTop: 120 });
  assert.equal(dialog.properties["--sheet-keyboard"], "180px");
  assert.equal(dialog.properties["--sheet-room"], "480px");
  // The keyboard goes, and the sheet is back at the bottom edge.
  viewport.report({ height: 780, offsetTop: 0 });
  assert.equal(dialog.properties["--sheet-keyboard"], undefined);
  assert.equal(dialog.properties["--sheet-room"], undefined);
});

test("only a keyboard lifts a sheet: not a browser bar, a zoom, a wide dialog or a closed one", () => {
  const cases = [
    ["a browser bar", (viewport) => viewport.report({ height: 724 })],
    ["zoomed in", (viewport) => viewport.report({ height: 390, scale: 2 })],
    ["a wide dialog", (viewport, dialog) => { dialog.sheet = false; viewport.report({ height: 480 }); }],
    ["a closed dialog", (viewport, dialog) => { dialog.open = false; viewport.report({ height: 480 }); }],
  ];
  for (const [name, change] of cases) {
    const viewport = new FakeViewport();
    const { dialog } = connect({ viewport });
    change(viewport, dialog);
    assert.equal(dialog.properties["--sheet-keyboard"], undefined, name);
  }
  // A sheet that closes with the keyboard up does not keep the lift for the next time it opens.
  const viewport = new FakeViewport();
  const { dialog } = connect({ viewport });
  viewport.report({ height: 480 });
  dialog.close();
  assert.equal(dialog.properties["--sheet-keyboard"], undefined);
  assert.equal(dialog.properties["--sheet-room"], undefined);
});

test("a browser with no visual viewport keeps the sheet at the bottom edge", () => {
  const { dialog } = connect();
  assert.equal(dialog.properties["--sheet-keyboard"], undefined);
});
