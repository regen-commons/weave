export interface Mycelium {
  /** Stops drawing and removes every listener and observer. */
  dispose(): void;
}
/** The website's numbers for one depth of growth. */
export interface Depth {
  readonly reach: number;
  readonly forkRate: number;
  readonly opacity: number;
  readonly fadeRate: number;
}
/**
 * Grows the website's mycelium on a decorative canvas behind a region or a whole page, drawn as
 * the website draws it: one canvas pixel for each CSS pixel, and trails that fade (DL-106). A
 * mouse or a finger grows tufts where it moves; without a mouse one also grows on its own every
 * few seconds, in the first `OWN_GROWTH_FOR` milliseconds of a page only (WCAG 2.2.2). A light resting network lies under the trails, whole in the margins and quieter
 * under `column`, the element that holds the content, or a function that finds it (the element
 * after the canvas unless given). `depth` is the website's depth, or a function that gives it:
 * 1 on Home and 2 anywhere else. `quiet`, or a function that says so, marks a page with fields to
 * fill in: the resting network is quieter still under the column, and new growth keeps to margins
 * at least `QUIET_MARGIN` wide and stops at the column's edge (DL-135). Drawing stops once the trails have faded, while the page is
 * hidden and off screen. Reduced motion draws the resting network and nothing more. Colours come
 * from the canvas's --mycelium-1 to --mycelium-6. Dispose on unmount.
 */
export function growMycelium(
  canvas: HTMLCanvasElement,
  options?: {
    seed?: number;
    within?: Element;
    column?: Element | (() => Element | null);
    depth?: number | (() => number);
    quiet?: boolean | (() => boolean);
  },
): Mycelium;

export interface Density {
  readonly seeds: number;
  readonly reach: number;
  readonly forkRate: number;
  readonly limit: number;
  /** A column a tuft's branches stop at, on a quiet page. */
  readonly avoid?: { left: number; right: number } | null;
}
/** The website's depths 1 and 2. */
export const DEPTHS: { readonly 1: Depth; readonly 2: Depth };
/** The share of the trails so far that goes each frame: slower than the website's, so strands linger (DL-128). */
export const TRAIL_FADE: number;
/** How many times as long as the website's a tuft lives (DL-128). */
export const LINGER: number;
/** The website's depth for a page: 1 on Home, 2 on every other. */
export function depthFor(depth: number): Depth;
/** How much rests in a region this size, at a depth. */
export function restDensity(width: number, height: number, depth?: Depth): Density;
/**
 * How strongly the resting network shows at a place across its region, as a share of its full
 * strength: whole outside the column that holds the content, and quieter under it.
 */
export function restShare(x: number, column: { left: number; right: number }, under?: number): number;
/** On a quiet page, the share the resting network keeps under the column. */
export const QUIET_UNDER: number;
/** On a quiet page, the narrowest margin a new tuft grows in, in CSS pixels. */
export const QUIET_MARGIN: number;
/** Whether a place lies under the column. */
export function inColumn(x: number, column: { left: number; right: number }): boolean;
/** Where a tuft may start on a quiet page, from `pick` (0 to 1); null where no margin is wide enough. */
export function marginSpot(column: { left: number; right: number }, width: number, pick: number): number | null;
/** The same shares as the stops of a mask across a region this wide: a place from 0 to 1 and its share. */
export function restStops(column: { left: number; right: number }, width: number, under?: number): [number, number][];
/** A mouse or a finger leaves trails behind the page unless motion is reduced. */
export function growsTrails(reducedMotion: boolean): boolean;
/** Whether a mouse or a finger has travelled far enough since the last tuft to grow another. */
export function movedEnough(from: { x: number; y: number } | null, to: { x: number; y: number }): boolean;
/** How strongly a tuft is drawn each frame at an age in frames. */
export function tuftStrength(age: number, depth: Depth): number;
/** The share of the trails rubbed out in a frame, after so many frames with nothing alive. */
export function trailFade(quietFrames: number): number;
/** Whether the trails have had long enough with nothing alive to be cleared, and drawing to stop. */
export function trailsGone(quietFrames: number): boolean;
export interface Branch {
  points: number[];
  angle: number;
  step: number;
  width: number;
  length: number;
  generation: number;
  colour: number;
  growing: boolean;
}
export function seededRandom(seed: number): () => number;
export function seedNetwork(width: number, height: number, random: () => number, density?: Density): Branch[];
export function advance(branches: Branch[], width: number, height: number, random: () => number, density: Density): boolean;
export function settle(branches: Branch[], width: number, height: number, random: () => number, density: Density): Branch[];
/** Only a mouse on a fine pointer, with motion allowed, grows the logo. */
export function growsFromPointer(pointerType: string, finePointer: boolean, reducedMotion: boolean): boolean;
/** With motion allowed, tufts grow on their own, on a phone and on a desk. */
export function growsOnItsOwn(reducedMotion: boolean): boolean;
/** How long after a page opens, in milliseconds, a tuft may still grow on its own: five seconds (WCAG 2.2.2). */
export const OWN_GROWTH_FOR: number;
/** Whether a tuft may still grow on its own, so many milliseconds after the page opened. */
export function ownGrowthOpen(sinceOpened: number): boolean;
/** Whether a mouse last moved long enough ago, in milliseconds, for a tuft to grow on its own. */
export function mouseAtRest(sinceMove: number): boolean;
/** How strongly a new tuft of the logo shows at an age in frames. */
export function tuftAlpha(age: number): number;
/** The logo's resting network for a ring this many CSS pixels wide. */
export function logoNetwork(size: number): { branches: Branch[]; random: () => number; density: Density };
/**
 * The website's logo: a little mycelium inside a ring. It grows once when the page opens and rests;
 * a mouse over the logo fills the ring, fading when it leaves. Touch never grows it; reduced motion
 * draws it at rest. Dispose on unmount.
 */
export function growLogoMark(canvas: HTMLCanvasElement, options?: { hoverTarget?: Element }): Mycelium;
