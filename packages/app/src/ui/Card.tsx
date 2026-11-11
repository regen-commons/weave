import type { ReactNode } from "react";

/**
 * Listing card molecule; content comes from pages, actions sit at the bottom. `kind` keeps a record's
 * own colour wherever the card appears, such as funding gold (DL-050).
 */
export function Card({ kind, children }: { kind?: "funding"; children: ReactNode }) {
  return (
    <article className="rc-card" data-layout="listing" data-kind={kind}>
      {children}
    </article>
  );
}
export function CardGrid({ children }: { children: ReactNode }) {
  return <ul className="rc-card-grid">{children}</ul>;
}
