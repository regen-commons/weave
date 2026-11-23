/**
 * A finished step can remove the control that held the focus, and the browser then drops it on
 * the body. The line that says the outcome takes it instead, or the page heading, as on a new page.
 */
export function keepFocusOnPage(row?: Element | null): void {
  if (document.activeElement !== document.body) return;
  const line = row?.isConnected ? row.querySelector<HTMLElement>("[role=status]") : null;
  (line ?? document.querySelector<HTMLElement>("main h1"))?.focus({ preventScroll: true });
}

/**
 * An open dialog whose content was replaced in place, with the control that held the focus: its
 * new title takes the focus, so the change is read out (WCAG 2.4.3). The title is focusable only
 * for that moment, so the next time the dialog opens its focus starts where it always does.
 */
export function focusDialogTitle(dialog: HTMLDialogElement | null): void {
  const title = dialog?.open ? dialog.querySelector<HTMLElement>(".rc-dialog-title") : null;
  // Focus still on something in the dialog stays where it is.
  if (!title || (dialog?.contains(document.activeElement) && document.activeElement !== dialog)) return;
  title.tabIndex = -1;
  title.addEventListener("blur", () => title.removeAttribute("tabindex"), { once: true });
  title.focus();
}
