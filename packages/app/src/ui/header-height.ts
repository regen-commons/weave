// The app's header is the site banner and the app bar. It sticks with the banner scrolled away, so
// what sticks under it starts where the stuck header ends. The design system assumes that is a
// control's height plus its padding, but wider or taller text (WCAG 1.4.12) can grow the bar or put
// space under the banner, and the header then covered what sat under it (A-16). This measures where
// the stuck header ends and gives that as the design system's --app-header-height.

/** The design system's bar height, which the root element's own style overrides with the measure. */
export const MEASURED = "--app-header-height";

/** The part of the page's root element this writes to. */
export interface StyledRoot {
  readonly style: { setProperty(name: string, value: string): void; removeProperty(name: string): void };
}

/**
 * Where the stuck header ends: its height less what scrolls away above the window's top (a sticky
 * offset below zero). Nothing is given without a real size.
 */
export function stuckLength(blockSize: number | undefined, stickyTop: number): string | undefined {
  if (blockSize === undefined || !Number.isFinite(blockSize)) return undefined;
  const end = blockSize + (Number.isFinite(stickyTop) ? Math.min(stickyTop, 0) : 0);
  return end > 0 ? `${end}px` : undefined;
}

/** Keeps the root's measure in step with the header until the returned function is called. */
export function followAppHeader(header: Element, root: StyledRoot): () => void {
  const observer = new ResizeObserver(([entry]) => {
    const length = stuckLength(entry?.borderBoxSize[0]?.blockSize, Number.parseFloat(getComputedStyle(header).top));
    if (length) root.style.setProperty(MEASURED, length);
  });
  observer.observe(header, { box: "border-box" });
  return () => {
    observer.disconnect();
    root.style.removeProperty(MEASURED);
  };
}
