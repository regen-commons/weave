import type { MouseEvent, ReactNode } from "react";
import { goBack, Link, navigate, routeSearch } from "../router.tsx";
import { fixtureHref, type BackTarget } from "../routes.ts";
import { Icon } from "./Icon.tsx";

/**
 * Follows a way back the way the back gesture would: through history when the page is there,
 * otherwise in this page's place when the target says so. A modified click opens the link as usual.
 */
export function followBack(event: MouseEvent<HTMLAnchorElement>, target: BackTarget): void {
  const modified = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
  if (event.defaultPrevented || event.button !== 0 || modified) return;
  if (target.hops) {
    event.preventDefault();
    goBack(target.hops);
  } else if (target.replace) {
    event.preventDefault();
    navigate(fixtureHref(target.href, routeSearch(), import.meta.env.DEV), true);
  }
}

/**
 * Back link molecule (`rc-back`): the one way back on a page that is not a tab. It names
 * the page it returns to and steps through history, so it does what the back gesture does.
 * The link carries its whole name itself, because a crowded phone header shows the arrow alone.
 */
export function BackLink({ target }: { target: BackTarget }) {
  return (
    <nav className="rc-back" aria-label="Back">
      <Link
        className="rc-back-link"
        href={target.href}
        onClick={(event) => followBack(event, target)}
        aria-label={`Back to ${target.label}`}
      >
        <Icon name="back" size="sm" />
        <span>{target.label}</span>
      </Link>
    </nav>
  );
}

/**
 * A step's own Back button (`rc-button`), which goes where the app bar's back link goes, so the
 * two and the back gesture always agree.
 */
export function BackButton({ target, children }: { target: BackTarget; children: ReactNode }) {
  return (
    <Link className="rc-button" data-variant="quiet" href={target.href} onClick={(event) => followBack(event, target)}>
      {children}
    </Link>
  );
}
