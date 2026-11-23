// Mycelium behaviour shared by React and the static pattern library: the website's branching growth
// (canvas.js on regencommons.com), with its step, thickness, length, branching, marks and six thread
// colours, adapted to an application (DL-106).
//
// It draws as the website does. The canvas holds one canvas pixel for each CSS pixel, so a phone's or
// a sharp screen's own scaling softens and widens every line. New growth leaves trails: each frame
// the picture so far is rubbed out a little and every live tuft is drawn over it again, which is the
// website's loop. A moving mouse grows tufts where it goes, and so does a finger. Growth uses the
// website's depth 1 on Home and depth 2 everywhere else.
//
// Four things are the app's own. A light resting network lies under the trails, so a phone with no
// mouse is never blank; it is quieter under the column that holds the content and whole beside it
// (DL-071), and quieter still on a page with fields to fill in, where new growth keeps to the
// margins (DL-135). For the first five seconds after the app opens, and never again, a tuft grows on
// its own every few seconds (DL-128), on a phone and wherever a mouse has held
// still. New growth lingers: a tuft lives twice as long as the website's and its trail fades more
// slowly, so each strand stays a while after it appears (DL-128). And drawing stops:
// once the last trail has faded nothing runs until something grows again, and nothing runs while
// the page is hidden or the canvas is off screen. Under reduced motion the resting network is drawn
// at once and nothing more grows.
//
// The canvas lies behind everything in its region and knows nothing of what is on it: a card, a
// field or a button covers the threads that pass under it. Behind a whole page the stylesheet fixes
// it to the window, so pages scroll over it, as on the website. Colours come from the canvas's
// --mycelium-1 to --mycelium-6 custom properties, so the theme decides them. The canvas is
// decorative and takes no pointer.

const TAU = Math.PI * 2;
const RIGHT_ANGLE = Math.PI / 2;
/** The website's six thread colours, read from the custom properties the CSS sets on the canvas. */
const COLOURS = 6;
/**
 * The website's depths 1 and 2, unchanged: how far a branch reaches, how often it forks, how
 * strongly a new tuft is drawn each frame and how much of that it loses each frame.
 */
export const DEPTHS = {
  1: { reach: 50, forkRate: 0.012, opacity: 0.22, fadeRate: 0.0014 },
  2: { reach: 60, forkRate: 0.015, opacity: 0.25, fadeRate: 0.0012 },
};
/**
 * The share of the trails so far that goes each frame: a little over half the website's 0.035, so a
 * strand fades out slowly after its tuft has gone (DL-128).
 */
export const TRAIL_FADE = 0.02;
/** A tuft lives this many times as long as the website's: its strength falls this much more slowly (DL-128). */
export const LINGER = 2;
/** Once nothing is alive the last of the trails goes faster, so no ghost of them is left. */
const LAST_FADE = 0.2;
/** Frames with nothing alive before the fade quickens, and before the trails are cleared. */
const QUIET_FRAMES = 150;
const CLEAR_FRAMES = 210;
/** A mouse or a finger must travel this far, in CSS pixels, before it grows a new tuft, as on the website. */
const SPACING = 45;
/** At most this many new tufts live at once; the oldest goes first. They live longer than the website's, so more are kept. */
const LIVE_TUFTS = 40;
/**
 * The resting network has one seed for about this many CSS pixels of its region: about the same
 * closeness on a desk as on a phone, so a wide window is as full as a narrow one (DL-128).
 */
const REST_AREA = { phone: 30000, wide: 28000 };
/** How strongly the resting network shows. */
const REST_ALPHA = 0.4;
/** The share of its strength the resting network keeps under the column that holds the content. */
const UNDER_CONTENT = 0.45;
/**
 * On a quiet page, such as a step with fields to fill in, the share the resting network keeps under
 * the column, so no thread competes with a label or a hint (DL-135).
 */
export const QUIET_UNDER = 0.2;
/** On a quiet page a new tuft grows only in a margin at least this wide, in CSS pixels, and never into the column. */
export const QUIET_MARGIN = 48;
/** The resting network eases to that share over this many CSS pixels inside the column's edges. */
const EASE = 32;
/** A tuft grows on its own after this many milliseconds, plus up to the spread. */
const OWN_GROWTH_AFTER = 1800;
const OWN_GROWTH_SPREAD = 1800;
/** A mouse that has moved within this many milliseconds is growing tufts itself, so none grows on its own. */
const MOUSE_REST = 2400;
/**
 * Growth that nobody asked for ends this many milliseconds after the canvas starts, which is when
 * the app opens: no tuft grows on its own after it, and the resting network is settled if it is
 * still growing in, so nothing moves by itself for longer than five seconds (WCAG 2.2.2, DL-128).
 * Trails that follow a mouse or a finger are a person's own doing and carry on.
 */
export const OWN_GROWTH_FOR = 5000;
/** A region that changes size is drawn again once it has held still this long, in milliseconds. */
const RESIZE_REST = 160;
/** Frames a new tuft of the logo takes to fade, and how strongly it starts. */
const TUFT_LIFE = 160;
const FRESH_ALPHA = 0.85;

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

/** The website's depth for a page: 1 on Home, 2 on every other, whatever else is asked for. */
export function depthFor(depth) {
  return depth === 1 ? DEPTHS[1] : DEPTHS[2];
}

/**
 * How much rests in a region this size, at a depth: a seed for each stretch of its area, a little
 * closer together on a phone, where there are no margins to show them whole. Branches reach and
 * fork as the website's do at that depth.
 */
export function restDensity(width, height, depth = DEPTHS[2]) {
  const seeds = Math.max(4, Math.round((width * height) / (width < 600 ? REST_AREA.phone : REST_AREA.wide)));
  return { seeds, reach: depth.reach, forkRate: depth.forkRate, limit: seeds * 12 };
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

/** Seeds a region all over, across its whole width and down its whole height (DL-071). */
export function seedNetwork(width, height, random, density = restDensity(width, height)) {
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
    // A tuft on a quiet page stops at the column's edge and never grows across the fields (DL-135).
    if (density.avoid && inColumn(x, density.avoid)) {
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

/** Whether a pointer grows the logo: only a mouse, only where the pointer is fine, and never under reduced motion. */
export function growsFromPointer(pointerType, finePointer, reducedMotion) {
  return pointerType === "mouse" && finePointer && !reducedMotion;
}

/** Whether a mouse or a finger leaves trails behind the page: always, but for reduced motion. */
export function growsTrails(reducedMotion) {
  return !reducedMotion;
}

/**
 * Whether new tufts grow on their own: with motion allowed, on a phone and on a desk alike, so a
 * wide window is never still for long. Where a mouse has just moved it grows them instead (DL-128).
 */
export function growsOnItsOwn(reducedMotion) {
  return !reducedMotion;
}

/** Whether growth nobody asked for may still happen, so many milliseconds after the canvas started (DL-128). */
export function ownGrowthOpen(sinceStart) {
  return sinceStart < OWN_GROWTH_FOR;
}

/** Whether a mouse last moved long enough ago, in milliseconds, for a tuft to grow on its own. */
export function mouseAtRest(sinceMove) {
  return sinceMove >= MOUSE_REST;
}

/** Whether a mouse or a finger has travelled far enough since the last tuft to grow another. */
export function movedEnough(from, to) {
  return !from || Math.hypot(to.x - from.x, to.y - from.y) >= SPACING;
}

/**
 * How strongly a tuft is drawn each frame at an age in frames: the website's opacity, less its fade
 * for each frame, slowed by LINGER so the tuft stays a while (DL-128).
 */
export function tuftStrength(age, depth) {
  return Math.max(0, depth.opacity - (depth.fadeRate / LINGER) * age);
}

/**
 * The share of the trails rubbed out in a frame, after so many frames with nothing alive: the
 * website's while anything grows and for a while after, then more, so the last of them goes.
 */
export function trailFade(quietFrames) {
  return quietFrames > QUIET_FRAMES ? LAST_FADE : TRAIL_FADE;
}

/** Whether the trails have had long enough with nothing alive to be cleared, and drawing to stop. */
export function trailsGone(quietFrames) {
  return quietFrames > CLEAR_FRAMES;
}

/** How strongly a new tuft of the logo shows at an age in frames: bright at first, gone after its life. */
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
export function restShare(x, column, under = UNDER_CONTENT) {
  const inside = Math.min(x - column.left, column.right - x);
  return inside <= 0 ? 1 : under + (1 - under) * (1 - Math.min(1, inside / EASE));
}

/** Whether a place across the region lies under the column that holds the content. */
export function inColumn(x, column) {
  return x > column.left && x < column.right;
}

/**
 * Where a tuft may start on a quiet page: a place in a margin at least QUIET_MARGIN wide, chosen by
 * `pick`, a number from 0 to 1. Null where neither margin is that wide, as on a phone, whose
 * column runs to the screen's edges: there nothing new grows over the fields (DL-135).
 */
export function marginSpot(column, width, pick) {
  const margins = [
    [0, Math.max(0, column.left)],
    [Math.min(width, column.right), width],
  ].filter(([from, to]) => to - from >= QUIET_MARGIN);
  if (!margins.length) return null;
  const total = margins.reduce((sum, [from, to]) => sum + to - from, 0);
  let at = pick * total;
  for (const [from, to] of margins) {
    if (at < to - from) return from + at;
    at -= to - from;
  }
  const [from, to] = margins[margins.length - 1];
  return (from + to) / 2;
}

/**
 * The same shares as the stops of a mask across a region this wide: each a place from 0 to 1 and
 * the share that shows there. A column too narrow to ease into and out of leaves the region whole.
 */
export function restStops(column, width, under = UNDER_CONTENT) {
  if (!(width > 0) || column.right - column.left < 2 * EASE) return [[0, 1], [1, 1]];
  const at = (x) => Math.min(1, Math.max(0, x / width));
  return [column.left, column.left + EASE, column.right - EASE, column.right].map((x) => [at(x), restShare(x, column, under)]);
}

const whole = () => 1;

/** How strongly a branch shows: later forks are lighter, as on the website. */
function strength(branch, base) {
  return base * (1 - branch.generation * 0.2);
}

/** `share` says how much of that strength shows at a place across the region. */
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

/** The logo's way: a segment at a time, so each can take its own strength. */
function drawNetwork(context, branches, colours, base, share = whole) {
  context.lineCap = "round";
  context.lineJoin = "round";
  for (const branch of branches) {
    for (let i = 1; i < branch.points.length / 2; i++) drawSegment(context, branch, i, colours, base, share);
    drawMarks(context, branch, colours, base, share);
  }
  context.globalAlpha = 1;
}

/** The website's way: each branch as one line from end to end, with its pad and its bulb. */
function drawBranches(context, branches, colours, base) {
  context.lineCap = "round";
  context.lineJoin = "round";
  for (const branch of branches) {
    const points = branch.points;
    if (points.length < 4 || strength(branch, base) <= 0) continue;
    context.globalAlpha = Math.min(1, strength(branch, base));
    context.strokeStyle = colours[branch.colour];
    context.lineWidth = branch.width;
    context.beginPath();
    context.moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) context.lineTo(points[i], points[i + 1]);
    context.stroke();
    drawMarks(context, branch, colours, Math.min(1, base));
  }
  context.globalAlpha = 1;
}

/**
 * Starts the growth on a canvas. `within` is the region it lies under, the canvas's parent unless
 * given. `column` is the element that holds the content, or a function that finds it: the element
 * after the canvas unless given, as a page's column is. The resting network is quieter under it and
 * whole beside it, and it is found again whenever the region's children change, as they do between
 * pages. `depth` is the website's depth, or a function that gives it: 1 on Home, 2 anywhere else.
 * Returns `dispose`, which stops drawing and removes every listener and observer; call it on unmount.
 */
export function growMycelium(canvas, { seed = 7, within = canvas.parentElement ?? canvas, column: holder, depth: depthName = 2, quiet: quietName = false, now = () => Date.now() } = {}) {
  const context = canvas.getContext("2d");
  const view = canvas.ownerDocument.defaultView;
  if (!context || !view) return { dispose() {} };
  const documentElement = canvas.ownerDocument.documentElement;
  const still = view.matchMedia("(prefers-reduced-motion: reduce)");
  const darkScheme = view.matchMedia("(prefers-color-scheme: dark)");
  // Two pictures kept off screen: the resting network, drawn when it changes, and the trails,
  // rubbed out a little every frame. The canvas on the page shows one over the other.
  const rest = canvas.ownerDocument.createElement("canvas");
  const trails = canvas.ownerDocument.createElement("canvas");
  const restContext = rest.getContext("2d");
  const trailContext = trails.getContext("2d");
  if (!restContext || !trailContext) return { dispose() {} };
  const cleanup = [];
  const depth = () => depthFor(typeof depthName === "function" ? depthName() : depthName);
  const quietPage = () => !!(typeof quietName === "function" ? quietName() : quietName);
  let width = 0;
  let height = 0;
  let density = restDensity(0, 0);
  let random = seededRandom(seed);
  let branches = [];
  let tufts = [];
  let colours = [];
  let trailsDrawn = false;
  let quiet = 0;
  let disposed = false;
  let frame = 0;
  let shown = !canvas.ownerDocument.hidden;
  let onScreen = true;
  let lastMove = null;
  /** When a mouse or a finger last grew a tuft, in milliseconds, so one grown on its own waits for it to rest. */
  let movedAt = -Infinity;
  /** When the canvas started, and whether growth nobody asked for has ended for good (DL-128). */
  const startedAt = now();
  let ownEnded = false;
  let ownTimer = 0;
  let resizeTimer = 0;

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
    // One canvas pixel for each CSS pixel, as the website draws: the screen's own scaling does the
    // softening, and a long or sharp screen costs no more to draw.
    for (const surface of [canvas, rest, trails]) {
      surface.width = width;
      surface.height = height;
    }
    trailsDrawn = false;
    density = restDensity(width, height, depth());
  }

  /** The two sides of the column that holds the content, across the canvas. */
  function columnSides() {
    const held = (typeof holder === "function" ? holder() : holder) ?? canvas.nextElementSibling ?? within;
    const box = canvas.getBoundingClientRect();
    const inner = held === canvas ? box : held.getBoundingClientRect();
    return { left: inner.left - box.left, right: inner.right - box.left };
  }

  /** Draws the resting network into its own picture, quieter under the column that holds the content. */
  function paintRest() {
    restContext.clearRect(0, 0, width, height);
    drawBranches(restContext, branches, colours, REST_ALPHA);
    const mask = restContext.createLinearGradient(0, 0, width, 0);
    for (const [place, share] of restStops(columnSides(), width, quietPage() ? QUIET_UNDER : UNDER_CONTENT)) mask.addColorStop(place, `rgba(0, 0, 0, ${share})`);
    restContext.globalCompositeOperation = "destination-in";
    restContext.fillStyle = mask;
    restContext.fillRect(0, 0, width, height);
    restContext.globalCompositeOperation = "source-over";
  }

  /** Shows the resting network with the trails over it. */
  function show() {
    context.clearRect(0, 0, width, height);
    context.drawImage(rest, 0, 0);
    if (trailsDrawn) context.drawImage(trails, 0, 0);
  }

  const resting = () => !branches.some((branch) => branch.growing);

  function stop() {
    if (frame) view.cancelAnimationFrame(frame);
    frame = 0;
  }

  function schedule() {
    if (frame || disposed || !shown || !onScreen) return;
    // Under reduced motion the network is sown at rest and nothing grows, so there is never anything to draw.
    if (resting() && !tufts.length && !trailsDrawn) return;
    frame = view.requestAnimationFrame(tick);
  }

  /** One frame: grow the resting network a little while it is new, and fade and redraw the trails. */
  function tick() {
    frame = 0;
    if (!ownEnded && !ownGrowthOpen(now() - startedAt)) endOwnGrowth();
    if (!resting()) {
      advance(branches, width, height, random, density);
      paintRest();
    }
    if (trailsDrawn) {
      // The website's loop. It fills with the page's colour; this rubs the trails out instead, so
      // whatever lies behind the canvas shows through and no colour has to be known.
      quiet = tufts.length ? 0 : quiet + 1;
      trailContext.globalCompositeOperation = "destination-out";
      trailContext.fillStyle = `rgba(0, 0, 0, ${trailFade(quiet)})`;
      trailContext.fillRect(0, 0, width, height);
      trailContext.globalCompositeOperation = "source-over";
      tufts = tufts.filter((tuft) => {
        tuft.age += 1;
        const base = tuftStrength(tuft.age, tuft.depth);
        if (base <= 0) return false;
        advance(tuft.branches, width, height, Math.random, tuft.density);
        drawBranches(trailContext, tuft.branches, colours, base);
        return true;
      });
      if (trailsGone(quiet)) {
        trailContext.clearRect(0, 0, width, height);
        trailsDrawn = false;
        quiet = 0;
      }
    }
    show();
    schedule();
  }

  /** Seeds the resting network and brings it to rest at once, or leaves it to grow in. */
  function sowRest(atOnce) {
    random = seededRandom(seed);
    branches = seedNetwork(width, height, random, density);
    if (atOnce) settle(branches, width, height, random, density);
    tufts = [];
    quiet = 0;
    trailContext.clearRect(0, 0, width, height);
    paintRest();
    show();
  }

  function grow(atOnce = false) {
    stop();
    resize();
    readColours();
    sowRest(atOnce || still.matches);
    schedule();
    planOwnGrowth();
  }

  /**
   * Grows a new tuft that is drawn bright and fades while it grows, as the website's do. On a quiet
   * page it grows only beside the column, and stops at its edge (DL-135).
   */
  function sprout(x, y, own = false) {
    const avoid = quietPage() ? columnSides() : null;
    if (avoid && inColumn(x, avoid)) return;
    const tuftDepth = depth();
    const tuftBranches = [];
    sow(tuftBranches, x, y, Math.random, tuftDepth.reach);
    tufts.push({ own, branches: tuftBranches, age: 0, depth: tuftDepth, density: { reach: tuftDepth.reach, forkRate: tuftDepth.forkRate, limit: 24, avoid } });
    if (tufts.length > LIVE_TUFTS) tufts.shift();
    trailsDrawn = true;
    schedule();
  }

  /** A mouse or a finger moving over the region grows a tuft every little way, under whatever it is over. */
  function onMove(clientX, clientY) {
    if (!growsTrails(still.matches) || !shown || !onScreen) return;
    const box = canvas.getBoundingClientRect();
    const at = { x: clientX - box.left, y: clientY - box.top };
    if (at.x < 0 || at.y < 0 || at.x > box.width || at.y > box.height) return;
    if (!movedEnough(lastMove, at)) return;
    lastMove = at;
    movedAt = now();
    sprout(at.x, at.y);
  }

  /**
   * A tuft grows on its own every few seconds, somewhere in the part of the canvas that is in the
   * window, while the page is shown and no mouse or finger has just grown one. It stops under
   * reduced motion (DL-048, DL-128).
   */
  function planOwnGrowth() {
    if (ownTimer || disposed || !shown || !onScreen || !growsOnItsOwn(still.matches)) return;
    // Nothing grows on its own after the first five seconds: not on a new page, nor when the page
    // is shown or scrolled into view again, nor after a resize (DL-128).
    if (ownEnded || !ownGrowthOpen(now() - startedAt)) return;
    ownTimer = view.setTimeout(() => {
      ownTimer = 0;
      const box = canvas.getBoundingClientRect();
      const top = Math.max(0, -box.top);
      const bottom = Math.min(height, view.innerHeight - box.top);
      const x = quietPage() ? marginSpot(columnSides(), width, Math.random()) : Math.random() * width;
      if (x !== null && bottom > top && resting() && mouseAtRest(now() - movedAt) && ownGrowthOpen(now() - startedAt)) sprout(x, top + Math.random() * (bottom - top), true);
      planOwnGrowth();
    }, OWN_GROWTH_AFTER + Math.random() * OWN_GROWTH_SPREAD);
  }

  function stopOwnGrowth() {
    if (ownTimer) view.clearTimeout(ownTimer);
    ownTimer = 0;
  }

  /**
   * Five seconds in, growth nobody asked for ends for good: no tuft is planned, a resting network
   * still growing in is settled at once, and tufts that grew on their own are let go. With no trail
   * of a person's own left, the last of the trails fades at the quick rate and is cleared (DL-128).
   */
  function endOwnGrowth() {
    ownEnded = true;
    stopOwnGrowth();
    if (!resting()) {
      settle(branches, width, height, random, density);
      paintRest();
    }
    const before = tufts.length;
    tufts = tufts.filter((tuft) => !tuft.own);
    if (before && !tufts.length) quiet = QUIET_FRAMES;
  }

  /** A new theme draws the same network in the new colours, and lets go of trails in the old ones. */
  function recolour() {
    readColours();
    tufts = [];
    trailContext.clearRect(0, 0, width, height);
    trailsDrawn = false;
    paintRest();
    show();
  }

  /** The column that holds the content changed, as it does between pages: the same network, measured again. */
  function measure() {
    if (disposed) return;
    paintRest();
    show();
  }

  grow();

  // The website listens on the window for a mouse and for a finger, and so does this.
  listen(view, "mousemove", (event) => onMove(event.clientX, event.clientY), { passive: true });
  listen(view, "touchmove", (event) => {
    const touch = event.touches[0];
    if (touch) onMove(touch.clientX, touch.clientY);
  }, { passive: true });
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
  // Motion turned off or on: draw it at rest and start again from there.
  listen(still, "change", () => {
    stopOwnGrowth();
    grow(true);
  });
  listen(darkScheme, "change", recolour);

  const themeWatch = new view.MutationObserver(recolour);
  // A pinned theme arrives as data-theme on the page (DL-004).
  themeWatch.observe(documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  cleanup.push(() => themeWatch.disconnect());

  // The region's own children change between pages, and the column with them.
  const columnWatch = new view.MutationObserver(measure);
  columnWatch.observe(within, { childList: true });
  cleanup.push(() => columnWatch.disconnect());

  if (typeof view.IntersectionObserver === "function") {
    const visibility = new view.IntersectionObserver((entries) => {
      for (const entry of entries) onScreen = entry.isIntersecting;
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
    // A window being dragged to a new size changes it many times: the network is drawn again, at
    // rest, once the size has held still. A phone's address bar does not change a canvas that is
    // fixed to the window at its largest height.
    const sizes = new view.ResizeObserver(() => {
      const box = canvas.getBoundingClientRect();
      if (Math.abs(box.width - width) < 1 && Math.abs(box.height - height) < 1) return;
      if (resizeTimer) view.clearTimeout(resizeTimer);
      resizeTimer = view.setTimeout(() => {
        resizeTimer = 0;
        if (!disposed) grow(true);
      }, RESIZE_REST);
    });
    sizes.observe(canvas);
    cleanup.push(() => sizes.disconnect());
  }

  return {
    dispose() {
      disposed = true;
      stop();
      stopOwnGrowth();
      if (resizeTimer) view.clearTimeout(resizeTimer);
      for (const undo of cleanup.splice(0)) undo();
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
