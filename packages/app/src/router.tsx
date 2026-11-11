// A small history router for the shell. Replace it with a router library when pages
// need nested layouts or data loading; until then this keeps the app dependency-free.
// The prototype build (vite.config.ts) keeps the route in the URL fragment instead of the
// path, so the app runs from one static file inside a review page.
import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from "react";

import { fixtureHref, matchRoute, nextVisit, readVisit, routeFromFragment, splitRoute, type Visit } from "./routes.ts";

import { flushSync } from "react-dom";

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
 * entry carries a key, and where each one was scrolled lives in memory, so a reload starts at the
 * top. The key only has to be unique in this tab.
 */
const positions = new Map<string, number>();
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
  positions.set(entry, window.scrollY);
  entry = next;
  returning = true;
}
window.history.scrollRestoration = "manual";
entry = entryKey();
// Registered before any page listens, so the move is known by the time the page renders.
window.addEventListener("popstate", returned);
if (__WEAVE_PROTOTYPE__) window.addEventListener("hashchange", returned);

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("popstate", listener);
  if (__WEAVE_PROTOTYPE__) window.addEventListener("hashchange", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("popstate", listener);
    if (__WEAVE_PROTOTYPE__) window.removeEventListener("hashchange", listener);
  };
}

/** The current route, kept in step with links and the back button. */
export function usePathname(): string {
  return useSyncExternalStore(subscribe, currentRoute, () => "/");
}

/** How the page on screen was reached, read from its history entry. */
export const currentVisit = (): Visit | null => readVisit(window.history.state);
const isSheet = (route: string): boolean => !!matchRoute(splitRoute(route).pathname)?.sheet;

export function navigate(to: string, replace = false): void {
  const here = currentRoute();
  if (to === here) return;
  const visit = nextVisit(here, currentVisit(), to, replace);
  positions.set(entry, window.scrollY);
  const key = replace ? entry : newKey();
  const update = () => {
    window.history[replace ? "replaceState" : "pushState"]({ ...visit, key }, "", address(to));
    entry = key;
    returning = false;
    for (const listener of listeners) listener();
  };
  // A sheet slides over its page and away again; the page under it does not change.
  const sheet = isSheet(here) || isSheet(to);
  if (!sheet && document.startViewTransition && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    // A transition cut short by the next move, or by the window changing, is not an error.
    document.startViewTransition(() => flushSync(update)).ready.catch(() => undefined);
  } else update();
}

/** Steps back through history, as the back link and a closing sheet do. */
export function goBack(hops: number): void {
  window.history.go(-hops);
}

/** Whether the page on screen was reached with Back or Forward, so it shows as it was left. */
export const wasReturn = (): boolean => returning;

/**
 * Puts the page where it belongs after a move: a new page starts at the top, and Back or Forward
 * returns to where the person left it. A list can still be filling in, so it keeps trying for a
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
}

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

/** A plain anchor that changes page without a reload when it points inside the app. */
export function Link({ href, onClick, ...props }: LinkProps) {
  href = fixtureHref(href, routeSearch(), import.meta.env.DEV);
  // Other sites, mail links and downloads load the ordinary way.
  const inApp = href.startsWith("/") && !href.startsWith("//") && props.download === undefined;
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    const modified = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
    if (event.defaultPrevented || event.button !== 0 || modified || props.target || !inApp) return;
    event.preventDefault();
    navigate(href);
  }
  return <a href={inApp ? address(href) : href} onClick={handleClick} {...props} />;
}
