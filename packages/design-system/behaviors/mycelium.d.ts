export interface Mycelium {
  /** Stops drawing and removes every listener and observer. */
  dispose(): void;
}
/**
 * Grows the website's mycelium on a decorative canvas behind the home hero. It settles and stops
 * drawing; a mouse grows a little more that fades; touch never does; reduced motion draws it at
 * rest. Colours come from the canvas's --mycelium-1 to --mycelium-4. Dispose on unmount.
 */
export function growMycelium(canvas: HTMLCanvasElement, options?: { seed?: number; strength?: number }): Mycelium;

export interface Density {
  readonly seeds: number;
  readonly reach: number;
  readonly forkRate: number;
  readonly limit: number;
  /** A phone grows from the hero's corners instead of its sides. */
  readonly corners: boolean;
}
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
export function densityFor(width: number): Density;
export function seedNetwork(width: number, height: number, random: () => number, density?: Density): Branch[];
export function advance(branches: Branch[], width: number, height: number, random: () => number, density: Density): boolean;
export function settle(branches: Branch[], width: number, height: number, random: () => number, density: Density): Branch[];
/** Only a mouse on a fine pointer, with motion allowed, grows a tuft. */
export function growsFromPointer(pointerType: string, finePointer: boolean, reducedMotion: boolean): boolean;
