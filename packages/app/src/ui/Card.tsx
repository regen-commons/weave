import { useEffect, useRef, type ReactNode } from "react";
import { bounceAtEdges } from "@regen-commons/design-system/carousel";

/**
 * Listing card molecule; content comes from pages, actions sit at the bottom. `kind` keeps a record's
 * own colour wherever the card appears, such as funding gold (DL-050).
 */
export function Card({ kind, rows, children }: {
  kind?: "funding" | "initiative";
  /** `fixed`: every part keeps a set number of lines, so each card of its kind is the same height (DL-108). */
  rows?: "fixed";
  children: ReactNode;
}) {
  return (
    <article className="rc-card" data-layout="listing" data-kind={kind} data-rows={rows}>
      {children}
    </article>
  );
}
/**
 * Card grid template (`rc-card-grid`). A `preview` shows whole rows only: one row, or two with
 * `rows`. It holds a card more than three to a row needs, for the large desktop's fourth column.
 * On a phone a preview is one row that swipes sideways and shows every card it holds (DL-090), and
 * its cards bounce when it reaches its start or its end (DL-128).
 */
export function CardGrid({ preview, children }: { preview?: "row" | "rows"; children: ReactNode }) {
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (!preview || !list.current) return;
    const row = bounceAtEdges(list.current);
    return () => row.dispose();
  }, [preview]);
  return (
    <ul ref={list} className="rc-card-grid" data-preview={preview}>
      {children}
    </ul>
  );
}
