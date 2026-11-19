import type { ReactNode } from "react";

/**
 * Listing card molecule; content comes from pages, actions sit at the bottom. `kind` keeps a record's
 * own colour wherever the card appears, such as funding gold (DL-050).
 */
export function Card({ kind, children }: { kind?: "funding" | "initiative"; children: ReactNode }) {
  return (
    <article className="rc-card" data-layout="listing" data-kind={kind}>
      {children}
    </article>
  );
}
/**
 * Card grid template (`rc-card-grid`). A `preview` shows whole rows only: one row, or two with
 * `rows`. It holds a card more than three to a row needs, for the large desktop's fourth column.
 * On a phone a preview is one row that swipes sideways and shows every card it holds (DL-090).
 */
export function CardGrid({ preview, children }: { preview?: "row" | "rows"; children: ReactNode }) {
  return (
    <ul className="rc-card-grid" data-preview={preview}>
      {children}
    </ul>
  );
}
