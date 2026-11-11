// Mycelium behaviour shared by React and the static pattern library: the website's branching growth
// (canvas.js on regencommons.com), with its step, thickness, length, branching, marks and six thread
// colours, adapted to an application hero. Small tufts grow from the hero's sides, or the top
// corners of a phone's, fork, take the odd circuit-like right angle and leave junction pads and tip bulbs. They
// come to rest at the strength of the website's growth part way through fading, and drawing stops.
// New tufts start bright and fade away while they grow, as the website's do: a moving mouse grows
// them, and where there is no mouse, on a phone, one grows on its own every few seconds. Touch never
// grows one. Under reduced motion the resting network is drawn at once and nothing more grows.
// Colours come from the canvas's --mycelium-1 to --mycelium-6 custom properties, so the theme
// decides them. The canvas is decorative: it takes no pointer, and the CSS keeps it behind the
// hero's text.

const TAU = Math.PI * 2;
const RIGHT_ANGLE = Math.PI / 2;
/** The website's six thread colours, read from the custom properties the CSS sets on the canvas. */
const COLOURS = 6;
/** Growth steps per drawn frame: the website's pace. */
const STEPS_PER_FRAME = 1;
/** A mouse must travel this far, in CSS pixels, before it grows a new tuft, as on the website. */
const POINTER_SPACING = 45;
/** At most this many new tufts live at once, as on the website; the oldest goes first. */
const LIVE_TUFTS = 30;
/** Frames a new tuft takes to fade away while it grows, about the website's. */
const TUFT_LIFE = 160;
/** How strongly the resting network shows: the website's growth part way through fading. */
const REST_ALPHA = 0.4;
/** How strongly a new tuft starts: the website's fresh growth. */
const FRESH_ALPHA = 0.85;
/** Without a mouse, a tuft grows on its own after this many milliseconds, plus up to the spread. */
const OWN_GROWTH_AFTER = 1500;
const OWN_GROWTH_SPREAD = 1500;

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
 * How much grows in a hero this wide: the website's tufts, a handful on each side. A phone's hero
 * is filled by its words, with its links along the bottom, so fewer tufts grow, from the top
 * corners beside the heading.
 */
export function densityFor(width) {
  return width < 600
    ? { seeds: 6, reach: 55, forkRate: 0.015, limit: 60, corners: true }
    : { seeds: 16, reach: 65, forkRate: 0.018, limit: 200, corners: false };
}

function newBranch(x, y, angle, generation, colour, random, reach) {
  return {
    points: [x, y],
    angle,
    step: 0.6 + random() * 1.0,
    width: Math.max(0.3, 1.2 - generation * 0.25 + random() * 0.4),
    length: Math.max(6, Math.round((reach * (0.5 + random() * 0.7)) / (1 + generation * 0.4))),
    generation,
    colour,
    growing: true,
  };
}

/** Puts out the first branches of one seed, spread around it as the website's are. */
function sow(branches, x, y, random, reach, colour = Math.floor(random() * COLOURS)) {
  const count = 2 + (random() < 0.3 ? 1 : 0);
  const start = random() * TAU;
  for (let i = 0; i < count; i++) {
    const angle = start + (i / count) * TAU + (random() - 0.5) * 0.8;
    branches.push(newBranch(x, y, angle, 0, colour, random, reach));
  }
}

/**
 * Seeds the hero's sides, or on a phone its top corners, so the middle, where the heading and
 * search sit, stays mostly clear. The CSS mask clears it the rest of the way.
 */
export function seedNetwork(width, height, random, density = densityFor(width)) {
  const branches = [];
  const inset = density.corners ? 0.1 : 0.2;
  for (let i = 0; i < density.seeds; i++) {
    const left = i % 2 === 0;
    const x = left ? random() * width * inset : width - random() * width * inset;
    const y = density.corners ? height * random() * 0.12 : height * (0.2 + random() * 0.75);
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

/** Whether new tufts grow on their own: only where there is no mouse to grow them, with motion allowed. */
export function growsOnItsOwn(finePointer, reducedMotion) {
  return !finePointer && !reducedMotion;
}

/** How strongly a new tuft shows at an age in frames: bright at first, gone after its life. */
export function tuftAlpha(age) {
  return FRESH_ALPHA * Math.max(0, 1 - age / TUFT_LIFE);
}

/** Grows a network to rest at once, for reduced motion, a resize and the tests. */
export function settle(branches, width, height, random, density) {
  // A bound, in case a future change could keep a branch growing forever.
  for (let i = 0; i < 2000 && advance(branches, width, height, random, density); i++);
  return branches;
}

/** How strongly a branch shows: later forks are lighter, as on the website. */
function strength(branch, base) {
  return base * (1 - branch.generation * 0.2);
}

function drawSegment(context, branch, index, colours, base) {
  const points = branch.points;
  context.globalAlpha = Math.max(0, strength(branch, base));
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
  const alpha = strength(branch, base);
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
    context.globalAlpha = alpha * 0.6;
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
export function growMycelium(canvas, { seed = 7 } = {}) {
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
  let ownTimer = 0;

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
    drawNetwork(context, branches, colours, REST_ALPHA);
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
    planOwnGrowth();
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
          for (let point = was.length / 2; point < branch.points.length / 2; point++) drawSegment(context, branch, point, colours, REST_ALPHA);
          // Each pad and bulb is drawn once, as its branch comes to rest.
          if (was.growing && !branch.growing) drawMarks(context, branch, colours, REST_ALPHA);
        });
        if (!growing) break;
      }
      context.globalAlpha = 1;
      if (!branches.some((branch) => branch.growing)) {
        paintSettled();
        planOwnGrowth();
      }
    } else {
      context.clearRect(0, 0, width, height);
      if (settledImage) context.drawImage(settledImage, 0, 0, width, height);
      else drawNetwork(context, branches, colours, REST_ALPHA);
      // New tufts grow and fade at once, as the website's do, and leave the resting network as it was.
      tufts = tufts.filter((tuft) => {
        tuft.age += 1;
        const alpha = tuftAlpha(tuft.age);
        if (alpha <= 0) return false;
        if (tuft.branches.some((branch) => branch.growing)) advance(tuft.branches, width, height, Math.random, tuft.density);
        drawNetwork(context, tuft.branches, colours, alpha);
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

  /** Grows a new tuft that starts bright and fades away while it grows. */
  function sprout(x, y) {
    const tuftDensity = { ...density, limit: 16 };
    const tuftBranches = [];
    sow(tuftBranches, x, y, Math.random, tuftDensity.reach);
    tufts.push({ branches: tuftBranches, age: 0, density: tuftDensity });
    if (tufts.length > LIVE_TUFTS) tufts.shift();
    schedule();
  }

  /** A mouse moving over the hero grows a tuft every little way, as on the website. Touch never does. */
  function onPointerMove(event) {
    if (!growsFromPointer(event.pointerType, finePointer.matches, still.matches)) return;
    if (branches.some((branch) => branch.growing)) return;
    const box = canvas.getBoundingClientRect();
    const x = event.clientX - box.left;
    const y = event.clientY - box.top;
    if (lastPointer && Math.hypot(x - lastPointer.x, y - lastPointer.y) < POINTER_SPACING) return;
    lastPointer = { x, y };
    sprout(x, y);
  }

  /** Where a tuft grows on its own: where the resting network grows, clear of the words. */
  function ownPoint() {
    const left = Math.random() < 0.5;
    if (density.corners) {
      const x = left ? Math.random() * width * 0.12 : width - Math.random() * width * 0.12;
      return [x, Math.random() * height * 0.15];
    }
    const x = left ? Math.random() * width * 0.2 : width - Math.random() * width * 0.2;
    return [x, height * (0.15 + Math.random() * 0.75)];
  }

  /**
   * Without a mouse, a tuft grows on its own every few seconds while the hero is on screen and the
   * page is shown. It waits for the first growth to rest, and stops under reduced motion.
   */
  function planOwnGrowth() {
    if (ownTimer || !shown || !onScreen || !growsOnItsOwn(finePointer.matches, still.matches)) return;
    if (branches.some((branch) => branch.growing)) return;
    ownTimer = view.setTimeout(() => {
      ownTimer = 0;
      const [x, y] = ownPoint();
      sprout(x, y);
      planOwnGrowth();
    }, OWN_GROWTH_AFTER + Math.random() * OWN_GROWTH_SPREAD);
  }

  function stopOwnGrowth() {
    if (ownTimer) view.clearTimeout(ownTimer);
    ownTimer = 0;
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
    if (shown) {
      schedule();
      planOwnGrowth();
    } else {
      stop();
      stopOwnGrowth();
    }
  });
  listen(still, "change", () => {
    if (!still.matches) {
      planOwnGrowth();
      return;
    }
    // Motion turned off: show the rest of the growth at once and draw nothing more.
    stop();
    stopOwnGrowth();
    settle(branches, width, height, random, density);
    tufts = [];
    paintSettled();
  });
  // A mouse plugged in or taken away decides whether tufts grow on their own.
  listen(finePointer, "change", () => {
    if (finePointer.matches) stopOwnGrowth();
    else planOwnGrowth();
  });
  listen(darkScheme, "change", recolour);

  const themeWatch = new view.MutationObserver(recolour);
  // A pinned theme arrives as data-theme on the page (DL-004).
  themeWatch.observe(documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  cleanup.push(() => themeWatch.disconnect());

  if (typeof view.IntersectionObserver === "function") {
    const visibility = new view.IntersectionObserver((entries) => {
      onScreen = entries.some((entry) => entry.isIntersecting);
      if (onScreen) {
        schedule();
        planOwnGrowth();
      } else {
        stop();
        stopOwnGrowth();
      }
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
      stopOwnGrowth();
      for (const undo of cleanup.splice(0)) undo();
      keep(null);
    },
  };
}
