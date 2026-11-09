// A small history router for the shell. Replace it with a router library when pages
// need nested layouts or data loading; until then this keeps the app dependency-free.
import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from "react";

import { fixtureHref } from "./routes.ts";

import { flushSync } from "react-dom";

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("popstate", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("popstate", listener);
  };
}

/** The current pathname, kept in step with links and the back button. */
export function usePathname(): string {
  return useSyncExternalStore(
    subscribe,
    () => window.location.pathname + window.location.search,
    () => "/",
  );
}

export function navigate(to: string, replace = false): void {
  if (to === window.location.pathname + window.location.search) return;
  const update = () => {
    window.history[replace ? "replaceState" : "pushState"](null, "", to);
    for (const listener of listeners) listener();
  };
  if (document.startViewTransition && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    document.startViewTransition(() => flushSync(update));
  } else update();
}

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

/** A plain anchor that changes page without a reload when it points inside the app. */
export function Link({ href, onClick, ...props }: LinkProps) {
  href = fixtureHref(href, window.location.search, import.meta.env.DEV);
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    const modified = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
    // Other sites, mail links and downloads load the ordinary way.
    const inApp = href.startsWith("/") && !href.startsWith("//") && props.download === undefined;
    if (event.defaultPrevented || event.button !== 0 || modified || props.target || !inApp) return;
    event.preventDefault();
    navigate(href);
  }
  return <a href={href} onClick={handleClick} {...props} />;
}
