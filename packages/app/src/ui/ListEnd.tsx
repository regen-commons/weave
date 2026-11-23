import { useEffect, useRef, useState } from "react";
import { AHEAD_MARGIN, loadsUnasked, shownLine } from "../list-more.ts";

/**
 * Keeps a keyboard user's place when they ask for more: focus moves to the first item the press
 * added. Spread `item(index)` on each list item and call `pressed` when the button is pressed.
 */
export function useAddedFocus(shown: number) {
  const [from, setFrom] = useState<number | null>(null);
  const added = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    if (from === null || shown <= from) return;
    added.current?.focus();
    setFrom(null);
  }, [shown, from]);
  return {
    item: (index: number) => ({ tabIndex: -1, ref: index === from ? added : undefined }),
    pressed: () => setFrom(shown),
  };
}

/** The list end's room while the list loads, so whatever follows the list is already where it will be (DL-108). */
export function ListEndHold({ things }: { things: string }) {
  return (
    <div className="rc-list-end" aria-hidden="true">
      <p className="rc-meta">
        <span className="rc-skeleton" data-shape="hold">{shownLine(0, 1, things)}</span>
      </p>
    </div>
  );
}

/**
 * List end (`rc-list-end`): the foot of a long list. It says how much of the list is on the page
 * and brings the next batch as a person scrolls near it, for as long as there is more (DL-101,
 * DL-128). Show More stays for the keyboard, which brings nothing unasked, and for a batch that did
 * not arrive. Every list that has cards ends in one, with or without more to come, so its room
 * never comes and goes (DL-108). Give it a `key` that changes with the search and filters, so a
 * new list starts from its first batch.
 */
export function ListEnd({ shown, total, things, more, busy = false, failed = false, onMore, onPress }: {
  shown: number;
  total: number;
  /** What the count counts: "programs", "projects". */
  things: string;
  /** Whether any of the list is still to come. */
  more: boolean;
  /** The next batch is on its way. */
  busy?: boolean;
  /** The last batch did not arrive. */
  failed?: boolean;
  onMore(): void;
  /** The button was pressed, before `onMore`: the moment to note where the new items start. */
  onPress?(): void;
}) {
  const end = useRef<HTMLDivElement>(null);
  // The page's own function changes with every render; the watcher only needs the latest one.
  const latest = useRef(onMore);
  latest.current = onMore;
  useEffect(() => {
    const element = end.current;
    if (!element || !more || busy || failed || typeof IntersectionObserver !== "function") return;
    // Watching starts again after every batch, so a window tall enough to show the end twice asks twice.
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        const focused = document.activeElement;
        const keyboardInList =
          !!focused?.matches(":focus-visible") && !!focused.closest(".rc-card-grid, .rc-list-end");
        if (loadsUnasked({ more, busy, keyboardInList })) latest.current();
      },
      { rootMargin: AHEAD_MARGIN },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [shown, more, busy, failed]);
  function press() {
    if (busy) return;
    onPress?.();
    onMore();
  }
  return (
    <div className="rc-list-end" ref={end}>
      <p className="rc-meta" role="status">
        {shownLine(shown, total, things)}
      </p>
      {more && (
        // aria-disabled, not disabled, so the button keeps keyboard focus while the next batch loads.
        <button className="rc-button" data-variant="secondary" type="button" aria-disabled={busy} onClick={press}>
          {busy ? "Loading More" : "Show More"}
        </button>
      )}
      {failed && <p role="alert">More did not load. Try again.</p>}
    </div>
  );
}
