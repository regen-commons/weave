// Mycelium behaviour shared by React and the static pattern library: the website's branching growth
// (canvas.js on regencommons.com), with its step, thickness, length, branching, marks and six thread
// colours, adapted to an application. Small tufts grow all over a region, fork, take the odd
// circuit-like right angle and leave junction pads and tip bulbs. They come to rest at the strength
// of the website's growth part way through fading, and drawing stops.
//
// Growth runs underneath the page's content, as the website's does (DL-071). The canvas lies behind
// everything in its region and knows nothing of what is on it: a card, a field or a button covers
// the threads that pass under it, and words set on the page itself have them behind. That lets one
// canvas lie under a whole page.
//
// New tufts start bright and fade away while they grow, as the website's do. A moving mouse grows
// them wherever it goes. Where there is no mouse, on a phone, scrolling grows them under the part of
// the page in view, and one grows on its own every few seconds where the page opens. Under reduced motion the
// resting network is drawn at once and nothing more grows. Colours come from the canvas's
// --mycelium-1 to --mycelium-6 custom properties, so the theme decides them. The canvas is
// decorative: it takes no pointer, and the CSS keeps it behind the page's content.

const TAU = Math.PI * 2;
const RIGHT_ANGLE = Math.PI / 2;
/** The website's six thread colours, read from the custom properties the CSS sets on the canvas. */
const COLOURS = 6;
/** Growth steps per drawn frame: the website's pace. */
const STEPS_PER_FRAME = 1;
/** A mouse must travel this far, in CSS pixels, before it grows a new tuft, as on the website. */
const POINTER_SPACING = 45;
/** A page must scroll this far, in CSS pixels, before it grows a new tuft where there is no mouse. */
export const SCROLL_SPACING = 70;
/** At most this many new tufts live at once, as on the website; the oldest goes first. */
const LIVE_TUFTS = 30;
/** Frames a new tuft takes to fade away while it grows, about the website's. */
const TUFT_LIFE = 160;
/** How strongly the resting network shows: the website's growth part way through fading. */
const REST_ALPHA = 0.4;
/** How strongly a new tuft starts: the website's fresh growth. */
const FRESH_ALPHA = 0.85;
/** The share of its strength the resting network keeps under the column that holds the content. */
const UNDER_CONTENT = 0.45;
/** The resting network eases to that share over this many CSS pixels inside the column's edges. */
const EASE = 32;
/** Without a mouse, a tuft grows on its own after this many milliseconds, plus up to the spread. */
const OWN_GROWTH_AFTER = 1500;
const OWN_GROWTH_SPREAD = 1500;
/** A long page's canvas draws at a lower density before it would hold more pixels than this. */
const MAX_PIXELS = 6_000_000;
/** The height the densities were tuned for: a wide screen's hero. */
const TUNED_HEIGHT = 520;

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
 * How much grows in a region this size: the website's tufts, spread over a hero, and as many again
 * for each further stretch of a longer page. A shorter region grows fewer, so the words on it are
 * no more crowded, down to half a hero's. A phone's region is a quarter as wide, so it grows fewer,
 * a little shorter.
 */
export function densityFor(width, height = TUNED_HEIGHT) {
  const stretch = Math.max(0.5, height / TUNED_HEIGHT);
  return width < 600
    ? { seeds: Math.round(9 * stretch), reach: 55, forkRate: 0.015, limit: Math.round(90 * stretch) }
    : { seeds: Math.round(24 * stretch), reach: 65, forkRate: 0.018, limit: Math.round(300 * stretch) };
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
 * Seeds a region all over, across its whole width and down its whole height, so the network lies
 * under the content and not only beside it (DL-071).
 */
export function seedNetwork(width, height, random, density = densityFor(width, height)) {
  const branches = [];
  for (let i = 0; i < density.seeds; i++) sow(branches, random() * width, height * (0.02 + random() * 0.96), random, density.reach);
  return branches;
}

/**
 * Grows every growing branch one step: a small wobble, now and then a right-angle turn, and
 * sometimes a fork. A branch stops at its length or past the region's edge. Returns true while any
 * grows.
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
 * under reduced motion. A finger never grows one where it touches; on a phone the page's own
 * scrolling does (see growsFromScroll).
 */
export function growsFromPointer(pointerType, finePointer, reducedMotion) {
  return pointerType === "mouse" && finePointer && !reducedMotion;
}

/** Whether new tufts grow on their own: only where there is no mouse to grow them, with motion allowed. */
export function growsOnItsOwn(finePointer, reducedMotion) {
  return !finePointer && !reducedMotion;
}

/** Whether scrolling grows tufts: where there is no mouse to grow them, with motion allowed (DL-066). */
export function growsFromScroll(finePointer, reducedMotion) {
  return !finePointer && !reducedMotion;
}

/** Whether the page has scrolled far enough since the last tuft to grow another. */
export function scrolledEnough(from, to) {
  return Math.abs(to - from) >= SCROLL_SPACING;
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

/**
 * How strongly the resting network shows at a place across its region, as a share of its full
 * strength: whole in the page's margins, and quieter under the column that holds the content, so
 * the threads that pass under words never compete with them (DL-071). `column` is that column's
 * two sides, in the same coordinates as `x`.
 */
export function restShare(x, column) {
  const inside = Math.min(x - column.left, column.right - x);
  return inside <= 0 ? 1 : 1 - (1 - UNDER_CONTENT) * Math.min(1, inside / EASE);
}

const whole = () => 1;

/** How strongly a branch shows: later forks are lighter, as on the website. */
function strength(branch, base) {
  return base * (1 - branch.generation * 0.2);
}

/** `share` says how much of that strength shows at a place across the region; new tufts show whole. */
function drawSegment(context, branch, index, colours, base, share = whole) {
  const points = branch.points;
  context.globalAlpha = Math.max(0, strength(branch, base) * share(points[index * 2]));
  context.strokeStyle = colours[branch.colour];
  context.lineWidth = branch.width;
  context.beginPath();
  context.moveTo(points[index * 2 - 2], points[index * 2 - 1]);
  context.lineTo(points[index * 2], points[index * 2 + 1]);
  context.stroke();
}

/** A junction pad where a fork starts, and a bulb at a finished tip: the circuit and synapse marks. */
function drawMarks(context, branch, colours, base, share = whole) {
  const points = branch.points;
  const colour = colours[branch.colour];
  context.fillStyle = colour;
  if (branch.generation > 0 && points.length > 4) {
    const alpha = strength(branch, base) * share(points[0]);
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
    context.globalAlpha = strength(branch, base) * share(points[points.length - 2]) * 0.6;
    context.beginPath();
    context.arc(points[points.length - 2], points[points.length - 1], 1.5 + branch.width * 0.5, 0, TAU);
    context.fill();
  }
}

function drawNetwork(context, branches, colours, base, share = whole) {
  context.lineCap = "round";
  context.lineJoin = "round";
  for (const branch of branches) {
    for (let i = 1; i < branch.points.length / 2; i++) drawSegment(context, branch, i, colours, base, share);
    drawMarks(context, branch, colours, base, share);
  }
  context.globalAlpha = 1;
}

/**
 * Starts the growth on a canvas. `within` is the region it lies under, the canvas's parent unless
 * given: a mouse moving anywhere over it grows tufts. `own` is where tufts grow on their own where
 * there is no mouse, the whole of `within` unless an element inside it is marked
 * `data-mycelium-own`. Returns `dispose`, which stops drawing and removes every listener and
 * observer; call it on unmount.
 */
export function growMycelium(canvas, { seed = 7, within = canvas.parentElement ?? canvas } = {}) {
  const context = canvas.getContext("2d");
  const view = canvas.ownerDocument.defaultView;
  if (!context || !view) return { dispose() {} };
  const documentElement = canvas.ownerDocument.documentElement;
  const still = view.matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = view.matchMedia("(hover: hover) and (pointer: fine)");
  const darkScheme = view.matchMedia("(prefers-color-scheme: dark)");
  const own = within.querySelector?.("[data-mycelium-own]") ?? within;
  const cleanup = [];
  let width = 0;
  let height = 0;
  let ratio = 1;
  let density = densityFor(0);
  // The column that holds the content: the region itself, which the canvas may be wider than.
  let column = { left: 0, right: 0 };
  const rest = (x) => restShare(x, column);
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
  let ownOnScreen = true;
  let lastPointer = null;
  let lastScroll = view.scrollY;
  let lastBand = null;
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
    // A phone draws at a lower density: the threads are thin enough not to need more. So does a
    // page long enough that its canvas would otherwise hold more pixels than a phone can spare.
    ratio = Math.min(view.devicePixelRatio || 1, width < 600 ? 1.5 : 2, Math.sqrt(MAX_PIXELS / (width * height)));
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    density = densityFor(width, height);
    const inner = within === canvas ? box : within.getBoundingClientRect();
    column = { left: inner.left - box.left, right: inner.right - box.left };
  }

  /** Keeps one picture of the settled network, closing the one it replaces. */
  function keep(image) {
    settledImage?.close?.();
    settledImage = image;
  }

  /** Draws the settled network once, keeps it as an image for new tufts to draw over, and rests. */
  function paintSettled() {
    context.clearRect(0, 0, width, height);
    drawNetwork(context, branches, colours, REST_ALPHA, rest);
    lastBand = null;
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

  /** The part of the canvas in the window, with a margin, in the canvas's own coordinates. */
  function band() {
    const box = canvas.getBoundingClientRect();
    const top = Math.max(0, Math.floor(-box.top - 120));
    const bottom = Math.min(height, Math.ceil(view.innerHeight - box.top + 120));
    return bottom > top ? { top, bottom } : null;
  }

  /** Puts the settled picture back over one stretch of the canvas, clearing whatever tufts drew there. */
  function restore({ top, bottom }) {
    context.clearRect(0, top, width, bottom - top);
    if (settledImage) context.drawImage(settledImage, 0, top * ratio, width * ratio, (bottom - top) * ratio, 0, top, width, bottom - top);
  }

  /** One frame: grow the first network a little, or redraw the settled picture under fading tufts. */
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
          for (let point = was.length / 2; point < branch.points.length / 2; point++) drawSegment(context, branch, point, colours, REST_ALPHA, rest);
          // Each pad and bulb is drawn once, as its branch comes to rest.
          if (was.growing && !branch.growing) drawMarks(context, branch, colours, REST_ALPHA, rest);
        });
        if (!growing) break;
      }
      context.globalAlpha = 1;
      if (!branches.some((branch) => branch.growing)) {
        paintSettled();
        planOwnGrowth();
      }
    } else {
      // New tufts live beside the window, so only that stretch of a long page is redrawn: the one
      // drawn last time, in case the page has scrolled since, and the one in view now.
      const now = band();
      if (settledImage) {
        if (lastBand) restore(lastBand);
        if (now) restore(now);
      } else {
        context.clearRect(0, 0, width, height);
        drawNetwork(context, branches, colours, REST_ALPHA, rest);
      }
      lastBand = now;
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

  /** A mouse moving over the region grows a tuft every little way, under whatever it is over, as on the website. */
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

  /** A point anywhere across the canvas between two heights, or nothing when there is no height between them. */
  function pointBetween(top, bottom) {
    return bottom > top ? [Math.random() * width, top + Math.random() * (bottom - top)] : null;
  }

  /** The part of an element that is in the window, in the canvas's own coordinates. */
  function inView(element) {
    const box = canvas.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    return [Math.max(0, rect.top, box.top) - box.top, Math.min(view.innerHeight, rect.bottom, box.bottom) - box.top];
  }

  /**
   * Where there is no mouse, scrolling grows a tuft every little way, under the part of the page
   * in view. It waits for the first growth to rest and never grows under reduced motion (DL-066).
   */
  function onScroll() {
    const at = view.scrollY;
    if (!growsFromScroll(finePointer.matches, still.matches) || !shown) {
      lastScroll = at;
      return;
    }
    if (!scrolledEnough(lastScroll, at) || branches.some((branch) => branch.growing)) return;
    lastScroll = at;
    const point = pointBetween(...inView(canvas));
    if (point) sprout(...point);
  }

  /**
   * Without a mouse, a tuft grows on its own every few seconds where the page opens, while that
   * part is on screen and the page is shown. It waits for the first growth to rest, and stops under
   * reduced motion (DL-048).
   */
  function planOwnGrowth() {
    if (ownTimer || !shown || !ownOnScreen || !growsOnItsOwn(finePointer.matches, still.matches)) return;
    if (branches.some((branch) => branch.growing)) return;
    ownTimer = view.setTimeout(() => {
      ownTimer = 0;
      const point = pointBetween(...inView(own));
      if (point) sprout(...point);
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

  /** The region changed size, as when a list loads into a page: grow the network again, at rest. */
  function regrow() {
    stop();
    resize();
    seedAndSettle();
  }

  grow();

  listen(within, "pointermove", onPointerMove, { passive: true });
  listen(view, "scroll", onScroll, { passive: true });
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
      for (const entry of entries) {
        if (entry.target === canvas) onScreen = entry.isIntersecting;
        if (entry.target === own) ownOnScreen = entry.isIntersecting;
      }
      if (onScreen) schedule();
      else stop();
      if (ownOnScreen) planOwnGrowth();
      else stopOwnGrowth();
    });
    visibility.observe(canvas);
    if (own !== canvas) visibility.observe(own);
    cleanup.push(() => visibility.disconnect());
  }

  if (typeof view.ResizeObserver === "function") {
    let known = { width, height };
    const sizes = new view.ResizeObserver(() => {
      const box = canvas.getBoundingClientRect();
      const changedWidth = Math.abs(box.width - known.width) > known.width * 0.08;
      const changedHeight = Math.abs(box.height - known.height) > known.height * 0.15;
      if (!changedWidth && !changedHeight) return;
      // A new size grows the network again at rest: a phone's address bar should not restart it.
      regrow();
      known = { width, height };
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

/** The logo grows once per page load; a logo drawn after that starts at rest. */
let logoGrown = false;
/** Steps of the logo's own growth, so the picture is the same on every visit. */
const LOGO_SEED = 11;
/** Six short threads from the centre, two to each of three colours, as the website's logo starts. */
const LOGO_SOWS = 3;
/** The logo's resting threads are drawn near full strength: at this size they are the brand mark. */
const LOGO_ALPHA = 0.9;
/** Under a mouse, a new tuft every this many frames, up to this many, filling the ring. */
const LOGO_SPROUT_EVERY = 4;
const LOGO_TUFTS = 36;

function logoDensity(size) {
  return { seeds: LOGO_SOWS, reach: size * 0.42, forkRate: 0.08, limit: 30 };
}

/** The logo's resting network for a ring this many CSS pixels wide: threads from the centre. */
export function logoNetwork(size) {
  const random = seededRandom(LOGO_SEED);
  const density = logoDensity(size);
  const branches = [];
  for (let i = 0; i < LOGO_SOWS; i++) sow(branches, size / 2, size / 2, random, density.reach, (i * 2) % COLOURS);
  return { branches, random, density };
}

/**
 * The website's logo: a little mycelium inside a ring (DL-054). It grows once from the centre when
 * the page opens and rests. A mouse over the logo grows it to fill the ring, and the new growth fades
 * when the mouse leaves. Touch never grows it, and under reduced motion it is drawn at rest. It draws
 * nothing while the page is hidden. Colours come from the canvas's --mycelium-1 to --mycelium-6.
 */
export function growLogoMark(canvas, { hoverTarget = canvas.parentElement ?? canvas } = {}) {
  const context = canvas.getContext("2d");
  const view = canvas.ownerDocument.defaultView;
  if (!context || !view) return { dispose() {} };
  const still = view.matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = view.matchMedia("(hover: hover) and (pointer: fine)");
  const darkScheme = view.matchMedia("(prefers-color-scheme: dark)");
  const cleanup = [];
  let size = 0;
  let colours = [];
  let network = logoNetwork(1);
  let tufts = [];
  let frame = 0;
  let hovered = false;
  let sinceSprout = 0;
  let shown = !canvas.ownerDocument.hidden;

  const listen = (target, type, listener) => {
    target.addEventListener(type, listener);
    cleanup.push(() => target.removeEventListener(type, listener));
  };
  function readColours() {
    const style = view.getComputedStyle(canvas);
    colours = Array.from({ length: COLOURS }, (_, i) => style.getPropertyValue(`--mycelium-${i + 1}`).trim() || style.color);
  }
  function resize() {
    size = Math.max(1, Math.round(canvas.getBoundingClientRect().width));
    const ratio = Math.min(view.devicePixelRatio || 1, 2);
    canvas.width = canvas.height = Math.round(size * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  function paint() {
    context.clearRect(0, 0, size, size);
    context.save();
    context.beginPath();
    context.arc(size / 2, size / 2, size / 2, 0, TAU);
    context.clip();
    drawNetwork(context, network.branches, colours, LOGO_ALPHA);
    for (const tuft of tufts) drawNetwork(context, tuft.branches, colours, tuftAlpha(tuft.age));
    context.restore();
  }
  function stop() {
    if (frame) view.cancelAnimationFrame(frame);
    frame = 0;
  }
  function growing() {
    return network.branches.some((branch) => branch.growing);
  }
  function schedule() {
    if (frame || !shown || still.matches) return;
    if (!growing() && !tufts.length && !hovered) return;
    frame = view.requestAnimationFrame(tick);
  }
  function tick() {
    frame = 0;
    if (growing()) advance(network.branches, size, size, network.random, network.density);
    else logoGrown = true;
    if (hovered && ++sinceSprout >= LOGO_SPROUT_EVERY) {
      sinceSprout = 0;
      const angle = Math.random() * TAU;
      const distance = Math.random() * size * 0.3;
      const tuftBranches = [];
      sow(tuftBranches, size / 2 + Math.cos(angle) * distance, size / 2 + Math.sin(angle) * distance, Math.random, size * 0.3);
      tufts.push({ branches: tuftBranches, age: 0, density: { ...network.density, reach: size * 0.3, limit: 8 } });
      if (tufts.length > LOGO_TUFTS) tufts.shift();
    }
    tufts = tufts.filter((tuft) => {
      tuft.age += 1;
      if (tuftAlpha(tuft.age) <= 0) return false;
      if (tuft.branches.some((branch) => branch.growing)) advance(tuft.branches, size, size, Math.random, tuft.density);
      return true;
    });
    paint();
    schedule();
  }
  function start() {
    stop();
    resize();
    readColours();
    network = logoNetwork(size);
    tufts = [];
    if (still.matches || logoGrown) {
      settle(network.branches, size, size, network.random, network.density);
      logoGrown = true;
      paint();
      return;
    }
    paint();
    schedule();
  }
  function recolour() {
    readColours();
    paint();
  }

  start();
  listen(hoverTarget, "pointerenter", (event) => {
    if (!growsFromPointer(event.pointerType, finePointer.matches, still.matches)) return;
    hovered = true;
    schedule();
  });
  listen(hoverTarget, "pointerleave", () => {
    hovered = false;
  });
  listen(canvas.ownerDocument, "visibilitychange", () => {
    shown = !canvas.ownerDocument.hidden;
    if (shown) schedule();
    else stop();
  });
  listen(still, "change", () => {
    if (!still.matches) return;
    stop();
    hovered = false;
    tufts = [];
    settle(network.branches, size, size, network.random, network.density);
    paint();
  });
  listen(darkScheme, "change", recolour);
  const themeWatch = new view.MutationObserver(recolour);
  themeWatch.observe(canvas.ownerDocument.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  cleanup.push(() => themeWatch.disconnect());

  return {
    dispose() {
      stop();
      for (const undo of cleanup.splice(0)) undo();
    },
  };
}
