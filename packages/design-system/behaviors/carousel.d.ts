export interface Carousel {
  dispose(): void;
}
export type Edge = "start" | "end";
/** Which end a row's scroll position is at, if either. */
export function edgeAt(position: number, scrollWidth: number, clientWidth: number): Edge | null;
/** Which end to bounce when a row comes to rest: the end it was moving towards, once it is there. */
export function restingBounce(edge: Edge | null, direction: number): Edge | null;
/** Which end a push bounces: one the row is already at, pushed on past it. */
export function pushBounce(edge: Edge | null, delta: number): Edge | null;
/**
 * Give a preview row that swipes sideways a small bounce at its start and its end (DL-128). It
 * sets `data-bounce` on the list for the stylesheet to draw, never under reduced motion. Dispose on
 * unmount.
 */
export function bounceAtEdges(list: HTMLElement): Carousel;
