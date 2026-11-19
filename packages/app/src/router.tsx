// A small history router for the shell. Replace it with a router library when pages
// need nested layouts or data loading; until then this keeps the app dependency-free.
// The prototype build (vite.config.ts) keeps the route in the URL fragment instead of the
// path, so the app runs from one static file inside a review page.
import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from "react";

import {
  fixtureHref, matchRoute, nextVisit, pageMove, readVisit, routeFromFragment, splitRoute, type PageMove, type Visit,
} from "./routes.ts";

import { flushSync } from "react-dom";
import { leavesWeave } from "./links.ts";
import { readPositions, remember, resumesPage, writePositions } from "./scroll-memory.ts";

const listeners = new Set<() => void>();

/** The current route, such as `/your-initiative?fixture=draft`. */
export function currentRoute(): string {
  return __WEAVE_PROTOTYPE__
    ? routeFromFragment(window.location.hash)
    : window.location.pathname + window.location.search;
}
export const routePath = (): string => splitRoute(currentRoute()).pathname;
export const routeSearch = (): string => splitRoute(currentRoute()).search;
const address = (route: string): string => (__WEAVE_PROTOTYPE__ ? `#${route}` : route);

/**
 * Back and Forward return a page to where the person left it, as native apps do. Each history
 * entry carries a key, and where each one was scrolled is kept for the tab, so a page that is
 * reloaded, or that a phone dropped in the background, comes back there too (DL-092). The key
 * only has to be unique in this tab.
 */
function tabStorage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}
const stored = tabStorage();
const positions = stored ? readPositions(stored) : new Map<string, number>();
let made = 0;
const newKey = (): string => `${Date.now().toString(36)}-${(made++).toString(36)}`;
let entry = "";
let returning = false;
function entryKey(): string {
  const state: unknown = window.history.state;
  const fields = typeof state === "object" && state !== null ? (state as Record<string, unknown>) : {};
  if (typeof fields.key === "string") return fields.key;
  const key = newKey();
  window.history.replaceState({ ...fields, key }, "");
  return key;
}
function returned(): void {
  const next = entryKey();
  // In the prototype a Back also fires a hash change, which is the same move.
  if (next === entry) return;
  remember(positions, entry, window.scrollY);
  entry = next;
  returning = true;
}
window.history.scrollRestoration = "manual";
entry = entryKey();
// A load can be a return as well: a reload, or Back from another site, to a page this tab knows.
const [load] = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
returning = resumesPage(load?.type) && positions.has(entry);
// Written when the page is hidden or left: the last moment a phone promises before it drops a page.
function keepPositions(): void {
  remember(positions, entry, window.scrollY);
  const storage = tabStorage();
  if (storage) writePositions(storage, positions);
}
window.addEventListener("pagehide", keepPositions);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") keepPositions();
});

const isSheet = (route: string): boolean => !!matchRoute(splitRoute(route).pathname)?.sheet;
function notify(): void {
  for (const listener of listeners) listener();
}
/**
 * Draws a change of page: a cross-fade, or on a phone a push or a pop (DL-094). The move is named on
 * the root while the change is drawn, which is all the stylesheet needs. A sheet slides over its
 * page and away again and the page under it does not change, so that is drawn at once, as is
 * every change where motion is reduced or the browser has no view transitions.
 */
let drawing = 0;
function draw(update: () => void, from: string, to: string): void {
  const still = isSheet(from) || isSheet(to) || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (still || !document.startViewTransition) {
    update();
    return;
  }
  const root = document.documentElement;
  const move: PageMove = pageMove(from, to);
  const mine = ++drawing;
  if (move === "fade") delete root.dataset.pageMove;
  else root.dataset.pageMove = move;
  const transition = document.startViewTransition(() => flushSync(update));
  // A transition cut short by the next move, or by the window changing, is not an error.
  transition.ready.catch(() => undefined);
  // The next move may already have named its own.
  const clear = () => {
    if (mine === drawing) delete root.dataset.pageMove;
  };
  transition.finished.then(clear, clear);
}

/** The page on screen, so a step through history knows what it left. */
let shown = currentRoute();
/** Set by the app's own way back. The browser's Back, and a phone's swipe, bring their own motion or none. */
let ownBack = false;
function stepped(): void {
  returned();
  const from = shown;
  shown = currentRoute();
  const own = ownBack;
  ownBack = false;
  if (own && from !== shown) draw(notify, from, shown);
  else notify();
}
// One listener for the whole app, so the move is known by the time any page renders.
window.addEventListener("popstate", stepped);
if (__WEAVE_PROTOTYPE__) window.addEventListener("hashchange", stepped);

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** The current route, kept in step with links and the back button. */
export function usePathname(): string {
  return useSyncExternalStore(subscribe, currentRoute, () => "/");
}

/** How the page on screen was reached, read from its history entry. */
export const currentVisit = (): Visit | null => readVisit(window.history.state);

/**
 * Moves to `to`. `still` moves without a page transition: for an address that stands for another,
 * such as /start/new for step 1 of a new card, there is no move to draw, and a transition would
 * wait for a frame that a tab opened in the background does not draw until it is shown.
 */
export function navigate(to: string, replace = false, still = false): void {
  const here = currentRoute();
  if (to === here) return;
  const visit = nextVisit(here, currentVisit(), to, replace);
  remember(positions, entry, window.scrollY);
  const key = replace ? entry : newKey();
  const update = () => {
    window.history[replace ? "replaceState" : "pushState"]({ ...visit, key }, "", address(to));
    entry = key;
    returning = false;
    shown = to;
    notify();
  };
  if (still) update();
  else draw(update, here, to);
}

/** Steps back through history, as the back link and a closing sheet do. The step is the app's own, so a phone draws it as a pop. */
export function goBack(hops: number): void {
  ownBack = true;
  // A step with nowhere to go fires nothing, and must not leave the next Back looking like this one.
  window.setTimeout(() => (ownBack = false), 1000);
  window.history.go(-hops);
}

/** Whether the page on screen was reached with Back or Forward, so it shows as it was left. */
export const wasReturn = (): boolean => returning;

/**
 * Puts the page where it belongs after a move: a new page starts at the top, and Back, Forward or
 * a reload returns to where the person left it. A list can still be filling in, so it keeps trying for a
 * moment until the page is long enough.
 */
export function settleScroll(): void {
  const top = returning ? positions.get(entry) : undefined;
  if (top === undefined) {
    window.scrollTo(0, 0);
    return;
  }
  let frames = 0;
  const attempt = () => {
    window.scrollTo(0, top);
    if (Math.abs(window.scrollY - top) > 1 && ++frames < 60) requestAnimationFrame(attempt);
  };
  attempt();
}

/** Brings the page back to the top, as tapping the tab you are on does in a native app. */
export function scrollToTop(): void {
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: 0, behavior: still ? "auto" : "smooth" });
}

/** The address a page last wrote for itself, such as a filter. Writing it is not a move to another page. */
let quietRoute: string | null = null;
export const wroteQuietly = (route: string): boolean => route === quietRoute;

/** Updates the address without changing page, as list filters do. */
export function replaceRouteQuietly(route: string): void {
  window.history.replaceState(window.history.state, "", address(route));
  quietRoute = currentRoute();
  shown = quietRoute;
}

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

/**
 * A plain anchor that changes page without a reload when it points inside the app. A link to
 * another site opens in a new tab and says so to assistive technology.
 */
export function Link({ href, onClick, children, ...props }: LinkProps) {
  href = fixtureHref(href, routeSearch(), import.meta.env.DEV);
  // Mail links and downloads load the ordinary way.
  const inApp = href.startsWith("/") && !href.startsWith("//") && props.download === undefined;
  const outside = leavesWeave(href);
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    const modified = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
    if (event.defaultPrevented || event.button !== 0 || modified || props.target || !inApp) return;
    event.preventDefault();
    navigate(href);
  }
  return (
    <a
      href={inApp ? address(href) : href}
      onClick={handleClick}
      {...(outside ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      {...props}
    >
      {children}
      {outside && <span className="rc-visually-hidden"> (opens in a new tab)</span>}
    </a>
  );
}
