import type { ReactNode } from "react";

/** Stack (`rc-stack`): vertical rhythm, with more space between groups when wide. */
export function Stack({ wide, children }: { wide?: boolean; children: ReactNode }) {
  return (
    <div className="rc-stack" data-gap={wide ? "wide" : undefined}>
      {children}
    </div>
  );
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
    <section className="rc-home-hero" aria-labelledby="home-title">
      <svg className="rc-woven-backdrop" aria-hidden="true" focusable="false">
        <use href="/brand/weave-threads.svg#threads" />
      </svg>
      {children}
      <div className="rc-home-actions">{actions}</div>
      {search}
      <div className="rc-home-live">{live}</div>
    </section>
  );
}

/** Step layout template: a working column with a record alongside it on wide screens. */
export function StepLayout({ children, aside }: { children: ReactNode; aside: ReactNode }) {
  return <div className="rc-step-layout"><div className="rc-step-main">{children}</div><aside className="rc-step-aside">{aside}</aside></div>;
}
