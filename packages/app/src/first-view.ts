// The page's first view, drawn at build time (dev/prerender.ts), is replaced by the app's own drawing.
// This readies the root for it: a view drawn for another address goes at once, as it does when the
// server sent Home's file for an address with no file of its own, and the marks that kept the view
// inert, and hidden away from Home, come off.

/** The part of the app's root element this reads and changes. */
export interface FirstViewRoot {
  readonly dataset: { firstView?: string };
  removeAttribute(name: string): void;
  replaceChildren(): void;
}

const trimmed = (path: string): string => (path.length > 1 ? path.replace(/\/+$/u, "") : path);

/** The address whose first view the app's first draw replaces, until that page is on screen. */
let kept: string | undefined;

export function retireFirstView(root: FirstViewRoot, pathname: string): void {
  const drawnFor = root.dataset.firstView;
  if (drawnFor === undefined) return;
  if (trimmed(drawnFor) === trimmed(pathname)) kept = trimmed(pathname);
  else root.replaceChildren();
  root.removeAttribute("data-first-view");
  root.removeAttribute("inert");
}

/**
 * Whether the page at this address replaces its own first view, which has already arrived on
 * screen. The app's first draw then does not arrive a second time (ui/Page.tsx).
 */
export const replacesFirstView = (pathname: string): boolean => kept !== undefined && kept === trimmed(pathname);

/** The first draw is on screen; a later visit to the same address arrives as usual. */
export function firstViewReplaced(): void {
  kept = undefined;
}
