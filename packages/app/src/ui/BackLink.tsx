import type { MouseEvent } from "react";
import { goBack, Link } from "../router.tsx";
import type { BackTarget } from "../routes.ts";
import { Icon } from "./Icon.tsx";

/**
 * Back link molecule (`rc-back`): the one way back on a page that is not a tab. It names
 * the page it returns to and steps through history, so it does what the back gesture does.
 * The link carries its whole name itself, because a crowded phone header shows the arrow alone.
 */
export function BackLink({ target }: { target: BackTarget }) {
  function back(event: MouseEvent<HTMLAnchorElement>) {
    const modified = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
    if (!target.hops || event.button !== 0 || modified) return;
    event.preventDefault();
    goBack(target.hops);
  }
  return (
    <nav className="rc-back" aria-label="Back">
      <Link className="rc-back-link" href={target.href} onClick={back} aria-label={`Back to ${target.label}`}>
        <Icon name="back" size="sm" />
        <span>{target.label}</span>
      </Link>
    </nav>
  );
}
