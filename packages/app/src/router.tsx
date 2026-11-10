// A small history router for the shell. Replace it with a router library when pages
// need nested layouts or data loading; until then this keeps the app dependency-free.
// The prototype build (vite.config.ts) keeps the route in the URL fragment instead of the
// path, so the app runs from one static file inside a review page.
import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from "react";

import { fixtureHref, routeFromFragment, splitRoute } from "./routes.ts";

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

export function navigate(to: string, replace = false): void {
  if (to === currentRoute()) return;
  const update = () => {
    window.history[replace ? "replaceState" : "pushState"](null, "", address(to));
    for (const listener of listeners) listener();
  };
  if (document.startViewTransition && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    document.startViewTransition(() => flushSync(update));
  } else update();
}

/** Updates the address without changing page, as list filters do. */
export function replaceRouteQuietly(route: string): void {
  window.history.replaceState(null, "", address(route));
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
