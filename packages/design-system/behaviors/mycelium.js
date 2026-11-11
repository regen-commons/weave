// Mycelium behaviour shared by React and the static pattern library: the website's branching growth
// (canvas.js on regencommons.com), adapted to an application hero. A few seeds grow from the sides,
// fork, take the odd circuit-like right angle, leave small junction pads and tip bulbs, and fade
// towards their tips. The growth settles and drawing stops. Where the pointer is fine and motion is
// welcome, moving over the hero grows a little more, which fades away again; touch never does.
// Under reduced motion the settled network is drawn at once. Colours come from the canvas's
// --mycelium-1 to --mycelium-4 custom properties, so the theme decides them. The canvas is
// decorative: it takes no pointer, and the CSS keeps it behind the hero's text.

const TAU = Math.PI * 2;
const RIGHT_ANGLE = Math.PI / 2;
/** Four thread colours, read from the custom properties the CSS sets on the canvas. */
const COLOURS = 4;
/** Growth steps per drawn frame, so the network settles within a few seconds. */
const STEPS_PER_FRAME = 2;
/** A pointer must travel this far, in CSS pixels, before it grows a new tuft. */
const POINTER_SPACING = 64;
/** At most this many pointer tufts live at once; the oldest goes first. */
const POINTER_TUFTS = 8;
/** Frames a pointer tuft takes to fade once it has finished growing. */
const TUFT_FADE = 90;

/** A small seeded generator, so the settled network looks the same on every visit and in tests. */
export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * How much grows in a hero this wide. A phone's hero is filled by its words, so fewer, shorter
 * threads grow from its four corners; a wide hero grows from its sides.
 */
export function densityFor(width) {
  return width < 600
    ? { seeds: 4, reach: 60, forkRate: 0.025, limit: 40, corners: true }
    : { seeds: 4, reach: 105, forkRate: 0.028, limit: 100, corners: false };
}

function newBranch(x, y, angle, generation, colour, random, reach) {
  return {
    points: [x, y],
    angle,
    step: 1.4 + random() * 1.2,
    width: Math.max(0.5, 1.3 - generation * 0.3 + random() * 0.3),
    length: Math.max(6, Math.round((reach * (0.55 + random() * 0.6)) / (1 + generation * 0.45))),
    generation,
    colour,
    growing: true,
  };
}

/** Puts out the first branches of one seed, spread around it as the website's are. */
function sow(branches, x, y, random, reach, colour = Math.floor(random() * COLOURS)) {
  const count = 2 + (random() < 0.35 ? 1 : 0);
  const start = random() * TAU;
  for (let i = 0; i < count; i++) {
    const angle = start + (i / count) * TAU + (random() - 0.5) * 0.8;
    branches.push(newBranch(x, y, angle, 0, colour, random, reach));
  }
}

/**
 * Seeds the hero's sides, or on a phone its corners, so the middle, where the heading and search
 * sit, stays mostly clear. The CSS mask clears it the rest of the way.
 */
export function seedNetwork(width, height, random, density = densityFor(width)) {
  const branches = [];
  const inset = density.corners ? 0.1 : 0.2;
  for (let i = 0; i < density.seeds; i++) {
    const left = i % 2 === 0;
    const x = left ? random() * width * inset : width - random() * width * inset;
    const top = i % 4 < 2;
    const y = density.corners
      ? height * (top ? random() * 0.12 : 1 - random() * 0.12)
      : height * (0.2 + random() * 0.75);
    sow(branches, x, y, random, density.reach);
  }
  return branches;
}

/**
 * Grows every growing branch one step: a small wobble, now and then a right-angle turn, and
 * sometimes a fork. A branch stops at its length or past the edge. Returns true while any grows.
 */
export function advance(branches, width, height, random, density) {
  let growing = false;
  const count = branches.length;
  for (let i = 0; i < count; i++) {
    const branch = branches[i];
    if (!branch.growing) continue;
    const points = branch.points;
    const segments = points.length / 2 - 1;
    if (segments >= branch.length) {
      branch.growing = false;
      continue;
    }
    branch.angle += (random() - 0.5) * 0.35;
    if (random() < 0.018) branch.angle = Math.round(branch.angle / RIGHT_ANGLE) * RIGHT_ANGLE + (random() - 0.5) * 0.15;
    const x = points[points.length - 2] + Math.cos(branch.angle) * branch.step;
    const y = points[points.length - 1] + Math.sin(branch.angle) * branch.step;
    if (x < -20 || x > width + 20 || y < -20 || y > height + 20) {
      branch.growing = false;
      continue;
    }
    points.push(x, y);
    growing = true;
    if (branch.generation < 3 && segments > 8 && branches.length < density.limit && random() < density.forkRate) {
      const turn = (random() < 0.5 ? 1 : -1) * (0.4 + random() * 0.8);
      branches.push(newBranch(x, y, branch.angle + turn, branch.generation + 1, branch.colour, random, density.reach));
    }
  }
  return growing || branches.length > count;
}

/**
 * Whether a pointer move may grow a tuft: only a mouse, only where the pointer is fine, and never
 * under reduced motion. Touch never grows one, so scrolling a phone draws nothing.
 */
export function growsFromPointer(pointerType, finePointer, reducedMotion) {
  return pointerType === "mouse" && finePointer && !reducedMotion;
}

/** Grows a network to rest at once, for reduced motion, a resize and the tests. */
export function settle(branches, width, height, random, density) {
  // A bound, in case a future change could keep a branch growing forever.
  for (let i = 0; i < 2000 && advance(branches, width, height, random, density); i++);
  return branches;
}

/** How strongly a segment shows: lighter for later forks and towards the tip, as the website fades. */
function strength(branch, index, base) {
  const along = index / Math.max(1, branch.length);
  return base * (1 - branch.generation * 0.2) * (1 - along * 0.55);
}

function drawSegment(context, branch, index, colours, base) {
  const points = branch.points;
  context.globalAlpha = Math.max(0, strength(branch, index, base));
  context.strokeStyle = colours[branch.colour];
  context.lineWidth = branch.width;
  context.beginPath();
  context.moveTo(points[index * 2 - 2], points[index * 2 - 1]);
  context.lineTo(points[index * 2], points[index * 2 + 1]);
  context.stroke();
}

/** A junction pad where a fork starts, and a bulb at a finished tip: the circuit and synapse marks. */
function drawMarks(context, branch, colours, base) {
  const points = branch.points;
  const colour = colours[branch.colour];
  const alpha = base * (1 - branch.generation * 0.2);
  context.fillStyle = colour;
  if (branch.generation > 0 && points.length > 4) {
    context.globalAlpha = alpha * 0.5;
    context.beginPath();
    context.arc(points[0], points[1], 2 + branch.width, 0, TAU);
    context.fill();
    context.globalAlpha = alpha * 0.8;
    context.beginPath();
    context.arc(points[0], points[1], 1, 0, TAU);
    context.fill();
  }
  if (!branch.growing && points.length > 8) {
    context.globalAlpha = alpha * 0.45;
    context.beginPath();
    context.arc(points[points.length - 2], points[points.length - 1], 1.5 + branch.width * 0.5, 0, TAU);
    context.fill();
  }
}

function drawNetwork(context, branches, colours, base) {
  context.lineCap = "round";
  context.lineJoin = "round";
  for (const branch of branches) {
    for (let i = 1; i < branch.points.length / 2; i++) drawSegment(context, branch, i, colours, base);
    drawMarks(context, branch, colours, base);
  }
  context.globalAlpha = 1;
}

/**
 * Starts the growth on a canvas. Returns `dispose`, which stops drawing and removes every listener
 * and observer; call it on unmount.
 */
export function growMycelium(canvas, { seed = 7, strength: base = 0.75 } = {}) {
  const context = canvas.getContext("2d");
  const view = canvas.ownerDocument.defaultView;
  if (!context || !view) return { dispose() {} };
  const documentElement = canvas.ownerDocument.documentElement;
  const still = view.matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = view.matchMedia("(hover: hover) and (pointer: fine)");
  const darkScheme = view.matchMedia("(prefers-color-scheme: dark)");
  const cleanup = [];
  let width = 0;
  let height = 0;
  let density = densityFor(0);
  let random = seededRandom(seed);
  let branches = [];
  let tufts = [];
  let colours = [];
  let settledImage = null;
  let paints = 0;
  let disposed = false;
  let frame = 0;
  let shown = !canvas.ownerDocument.hidden;
  let onScreen = true;
  let lastPointer = null;

  const listen = (target, type, listener, options) => {
    target.addEventListener(type, listener, options);
    cleanup.push(() => target.removeEventListener(type, listener, options));
  };

  function readColours() {
    const style = view.getComputedStyle(canvas);
    colours = Array.from({ length: COLOURS }, (_, i) => style.getPropertyValue(`--mycelium-${i + 1}`).trim() || style.color);
  }

  function resize() {
    const box = canvas.getBoundingClientRect();
    width = Math.max(1, Math.round(box.width));
    height = Math.max(1, Math.round(box.height));
    // A phone draws at a lower density: the threads are thin enough not to need more.
    const ratio = Math.min(view.devicePixelRatio || 1, width < 600 ? 1.5 : 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    density = densityFor(width);
  }

  /** Keeps one picture of the settled network, closing the one it replaces. */
  function keep(image) {
    settledImage?.close?.();
    settledImage = image;
  }

  /** Draws the settled network once, keeps it as an image for pointer tufts to draw over, and rests. */
  function paintSettled() {
    context.clearRect(0, 0, width, height);
    drawNetwork(context, branches, colours, base);
    keep(null);
    if (typeof view.createImageBitmap !== "function") return;
    const paint = ++paints;
    view.createImageBitmap(canvas).then(
      (image) => {
        // A later paint, or dispose, may have come first: keep only the newest picture.
        if (disposed || paint !== paints) image.close();
        else keep(image);
      },
      () => {},
    );
  }

  function seedAndSettle() {
    random = seededRandom(seed);
    branches = settle(seedNetwork(width, height, random, density), width, height, random, density);
    tufts = [];
    paintSettled();
  }

  function stop() {
    if (frame) view.cancelAnimationFrame(frame);
    frame = 0;
  }

  function busy() {
    return branches.some((branch) => branch.growing) || tufts.length > 0;
  }

  function schedule() {
    if (frame || !shown || !onScreen || still.matches || !busy()) return;
    frame = view.requestAnimationFrame(tick);
  }

  /** One frame: grow the first network a little, or redraw the settled image under fading tufts. */
  function tick() {
    frame = 0;
    if (branches.some((branch) => branch.growing)) {
      context.lineCap = "round";
      context.lineJoin = "round";
      for (let step = 0; step < STEPS_PER_FRAME; step++) {
        const before = branches.map((branch) => ({ length: branch.points.length, growing: branch.growing }));
        const growing = advance(branches, width, height, random, density);
        branches.forEach((branch, i) => {
          const was = before[i] ?? { length: 2, growing: true };
          for (let point = was.length / 2; point < branch.points.length / 2; point++) drawSegment(context, branch, point, colours, base);
          // Each pad and bulb is drawn once, as its branch comes to rest.
          if (was.growing && !branch.growing) drawMarks(context, branch, colours, base);
        });
        if (!growing) break;
      }
      context.globalAlpha = 1;
      if (!branches.some((branch) => branch.growing)) paintSettled();
    } else {
      context.clearRect(0, 0, width, height);
      if (settledImage) context.drawImage(settledImage, 0, 0, width, height);
      else drawNetwork(context, branches, colours, base);
      tufts = tufts.filter((tuft) => {
        if (tuft.branches.some((branch) => branch.growing)) advance(tuft.branches, width, height, Math.random, tuft.density);
        else tuft.age += 1;
        const fade = 1 - tuft.age / TUFT_FADE;
        if (fade <= 0) return false;
        drawNetwork(context, tuft.branches, colours, base * fade);
        return true;
      });
    }
    schedule();
  }

  function grow() {
    stop();
    resize();
    readColours();
    if (still.matches) {
      seedAndSettle();
      return;
    }
    random = seededRandom(seed);
    branches = seedNetwork(width, height, random, density);
    tufts = [];
    context.clearRect(0, 0, width, height);
    schedule();
  }

  /** A fine pointer moving over the hero grows a small tuft that fades again. Touch never does. */
  function onPointerMove(event) {
    if (!growsFromPointer(event.pointerType, finePointer.matches, still.matches)) return;
    if (branches.some((branch) => branch.growing)) return;
    const box = canvas.getBoundingClientRect();
    const x = event.clientX - box.left;
    const y = event.clientY - box.top;
    if (lastPointer && Math.hypot(x - lastPointer.x, y - lastPointer.y) < POINTER_SPACING) return;
    lastPointer = { x, y };
    const tuftDensity = { ...density, reach: density.reach * 0.45, limit: 12 };
    const tuftBranches = [];
    sow(tuftBranches, x, y, Math.random, tuftDensity.reach);
    tufts.push({ branches: tuftBranches, age: 0, density: tuftDensity });
    if (tufts.length > POINTER_TUFTS) tufts.shift();
    schedule();
  }

  /** A new theme repaints the same network in the new colours. */
  function recolour() {
    readColours();
    if (branches.some((branch) => branch.growing)) settle(branches, width, height, random, density);
    paintSettled();
  }

  grow();

  const host = canvas.parentElement ?? canvas;
  listen(host, "pointermove", onPointerMove, { passive: true });
  listen(canvas.ownerDocument, "visibilitychange", () => {
    shown = !canvas.ownerDocument.hidden;
    if (shown) schedule();
    else stop();
  });
  listen(still, "change", () => {
    if (!still.matches) return;
    // Motion turned off: show the rest of the growth at once and draw nothing more.
    stop();
    settle(branches, width, height, random, density);
    tufts = [];
    paintSettled();
  });
  listen(darkScheme, "change", recolour);

  const themeWatch = new view.MutationObserver(recolour);
  // A pinned theme arrives as data-theme on the page (DL-004).
  themeWatch.observe(documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  cleanup.push(() => themeWatch.disconnect());

  if (typeof view.IntersectionObserver === "function") {
    const visibility = new view.IntersectionObserver((entries) => {
      onScreen = entries.some((entry) => entry.isIntersecting);
      if (onScreen) schedule();
      else stop();
    });
    visibility.observe(canvas);
    cleanup.push(() => visibility.disconnect());
  }

  if (typeof view.ResizeObserver === "function") {
    let known = { width, height };
    const sizes = new view.ResizeObserver(() => {
      const box = canvas.getBoundingClientRect();
      const changedWidth = Math.abs(box.width - known.width) > known.width * 0.08;
      const changedHeight = Math.abs(box.height - known.height) > known.height * 0.15;
      if (!changedWidth && !changedHeight) return;
      stop();
      resize();
      known = { width, height };
      // A new size grows the network again at rest: a phone's address bar should not restart it.
      seedAndSettle();
    });
    sizes.observe(canvas);
    cleanup.push(() => sizes.disconnect());
  }

  return {
    dispose() {
      disposed = true;
      stop();
      for (const undo of cleanup.splice(0)) undo();
      keep(null);
    },
  };
}
