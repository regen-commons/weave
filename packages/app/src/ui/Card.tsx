import type { ReactNode } from "react";

/** Listing card molecule; content comes from pages, actions sit at the bottom. */
export function Card({ children }: { children: ReactNode }) {
  return (
    <article className="rc-card" data-layout="listing">
      {children}
    </article>
  );
}
export function CardGrid({ children }: { children: ReactNode }) {
  return <ul className="rc-card-grid">{children}</ul>;
}
