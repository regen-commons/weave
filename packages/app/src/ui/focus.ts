/**
 * A finished step can remove the control that held the focus, and the browser then drops it on
 * the body. The line that says the outcome takes it instead, or the page heading, as on a new page.
 */
export function keepFocusOnPage(row?: Element | null): void {
  if (document.activeElement !== document.body) return;
  const line = row?.isConnected ? row.querySelector<HTMLElement>("[role=status]") : null;
  (line ?? document.querySelector<HTMLElement>("main h1"))?.focus({ preventScroll: true });
}
