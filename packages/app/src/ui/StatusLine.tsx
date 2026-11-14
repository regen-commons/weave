import { useEffect, useRef, type ReactNode } from "react";

/**
 * Status line molecule (`rc-status-line`): one plain sentence on where the work stands, with the
 * one thing to do about it next. The words carry the state, so the row has no icon.
 *
 * A finished step can take its own button away, sometimes before the step resolves, as Save does
 * while the account is checked again. The browser then drops the focus on the page, so the line
 * that says the outcome takes it (DL-032).
 */
export function StatusLine({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  const line = useRef<HTMLParagraphElement>(null);
  /** The control in this row that last held the focus, until the focus moves somewhere else. */
  const focused = useRef<Element | null>(null);
  useEffect(() => {
    const last = focused.current;
    if (last && !last.isConnected && document.activeElement === document.body) {
      focused.current = null;
      line.current?.focus({ preventScroll: true });
    }
  });
  return (
    <div
      className="rc-status-line"
      onFocus={(event) => {
        if (event.target !== line.current) focused.current = event.target;
      }}
      onBlur={(event) => {
        // A removed control may blur with nothing to go to; only a move to another control clears it.
        if (event.relatedTarget) focused.current = null;
      }}
    >
      {/* Focusable from code only: the line takes the focus when its finished action goes away. */}
      <p className="rc-save-status" role="status" tabIndex={-1} ref={line}>
        <span>{children}</span>
      </p>
      {actions && <div className="rc-action-bar">{actions}</div>}
    </div>
  );
}
