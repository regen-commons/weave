export interface Mycelium {
  /** Stops drawing and removes every listener and observer. */
  dispose(): void;
}
/**
 * Grows the website's mycelium on a decorative canvas behind a region or a whole page. It grows
 * all over, underneath the content of `within` (the canvas's parent unless given), then settles
 * and stops drawing; at rest it shows whole in the margins and quieter under that column. New
 * tufts start bright and fade: a mouse grows them wherever it moves; without a mouse, scrolling
 * grows them under the part in view, and one grows on its own every few seconds inside the element
 * marked `data-mycelium-own`. Reduced motion draws it at rest. Colours come from the canvas's
 * --mycelium-1 to --mycelium-6. Dispose on unmount.
 */
export function growMycelium(canvas: HTMLCanvasElement, options?: { seed?: number; within?: Element }): Mycelium;

export interface Density {
  readonly seeds: number;
  readonly reach: number;
  readonly forkRate: number;
  readonly limit: number;
}
/** A page must scroll this far, in CSS pixels, before it grows a new tuft where there is no mouse. */
export const SCROLL_SPACING: number;
/**
 * How strongly the resting network shows at a place across its region, as a share of its full
 * strength: whole outside the column that holds the content, and quieter under it.
 */
export function restShare(x: number, column: { left: number; right: number }): number;
/** Without a mouse, and with motion allowed, scrolling grows tufts. */
export function growsFromScroll(finePointer: boolean, reducedMotion: boolean): boolean;
/** Whether the page has scrolled far enough since the last tuft to grow another. */
export function scrolledEnough(from: number, to: number): boolean;
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
export function densityFor(width: number, height?: number): Density;
export function seedNetwork(width: number, height: number, random: () => number, density?: Density): Branch[];
export function advance(branches: Branch[], width: number, height: number, random: () => number, density: Density): boolean;
export function settle(branches: Branch[], width: number, height: number, random: () => number, density: Density): Branch[];
/** Only a mouse on a fine pointer, with motion allowed, grows a tuft. */
export function growsFromPointer(pointerType: string, finePointer: boolean, reducedMotion: boolean): boolean;
/** Without a mouse, and with motion allowed, tufts grow on their own. */
export function growsOnItsOwn(finePointer: boolean, reducedMotion: boolean): boolean;
/** How strongly a new tuft shows at an age in frames. */
export function tuftAlpha(age: number): number;
/** The logo's resting network for a ring this many CSS pixels wide. */
export function logoNetwork(size: number): { branches: Branch[]; random: () => number; density: Density };
/**
 * The website's logo: a little mycelium inside a ring. It grows once when the page opens and rests;
 * a mouse over the logo fills the ring, fading when it leaves. Touch never grows it; reduced motion
 * draws it at rest. Dispose on unmount.
 */
export function growLogoMark(canvas: HTMLCanvasElement, options?: { hoverTarget?: Element }): Mycelium;
