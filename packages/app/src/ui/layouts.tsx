import type { ReactNode } from "react";

/** Stack (`rc-stack`): vertical rhythm, with more space between groups when wide. */
export function Stack({ wide, children }: { wide?: boolean; children: ReactNode }) {
  return (
    <div className="rc-stack" data-gap={wide ? "wide" : undefined}>
      {children}
    </div>
  );
}

/**
 * Panel (`rc-panel`): a block of words and controls that have no card of their own, such as a
 * form or a side panel. It keeps the block's rhythm and paints nothing (DL-099).
 */
export function Panel({ children }: { children: ReactNode }) {
  return <div className="rc-panel">{children}</div>;
}

/** List layout template (`rc-list-layout`): the available page width. */
export function ListLayout({ children }: { children: ReactNode }) {
  return <div className="rc-list-layout">{children}</div>;
}

/** Narrow layout template (`rc-narrow`): a focused single task. */
export function NarrowLayout({ children }: { children: ReactNode }) {
  return <div className="rc-narrow">{children}</div>;
}

/** Home hero template (`rc-home-hero`): what this is and where to start. */
export function HomeHero({
  actions,
  search,
  live,
  children,
}: {
  actions: ReactNode;
  search?: ReactNode;
  live?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rc-home-hero" aria-labelledby="home-title" data-mycelium-own>
      {children}
      <div className="rc-home-actions">{actions}</div>
      {search}
      <div className="rc-home-live">{live}</div>
    </section>
  );
}

/**
 * Doorway template (`rc-doorway`): a page with nothing to fill in and no list, such as signing in to
 * Your Initiatives or a missing page, opens like Home's hero, in the middle of the window (DL-053).
 * The page body's mycelium lies behind it, as behind every page.
 */
export function Doorway({ children }: { children: ReactNode }) {
  return <div className="rc-doorway">{children}</div>;
}

/**
 * Step layout template: a working column with a side panel alongside it on wide screens. `more` is
 * work that follows the panel on a phone and sits under the first column on a wide screen, so the
 * panel stays beside the whole page. `wide` gives the working column the rest of the width, for a
 * record page whose lists hold more than one card across. `asideFrom="wide"` keeps a panel that
 * only mirrors the work beside it for a wide screen.
 */
export function StepLayout({ children, aside, more, wide, asideFrom }: {
  children: ReactNode; aside: ReactNode; more?: ReactNode; wide?: boolean; asideFrom?: "wide";
}) {
  return (
    <div className="rc-step-layout" data-main={wide ? "wide" : undefined}>
      <div className="rc-step-main">{children}</div>
      <aside className="rc-step-aside" data-from={asideFrom}>{aside}</aside>
      {more && <div className="rc-step-main">{more}</div>}
    </div>
  );
}
