import type { ReactNode } from "react";

/**
 * Status line molecule (`rc-status-line`): one plain sentence on where the work stands, with the
 * one thing to do about it next. The words carry the state, so the row has no icon.
 */
export function StatusLine({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="rc-status-line">
      {/* Focusable from code only: the line takes the focus when its finished action goes away. */}
      <p className="rc-save-status" role="status" tabIndex={-1}>
        <span>{children}</span>
      </p>
      {actions && <div className="rc-action-bar">{actions}</div>}
    </div>
  );
}
