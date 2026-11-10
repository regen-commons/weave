import type { ReactNode } from "react";
import type { CardState } from "../initiative/status.ts";
import { Icon } from "./Icon.tsx";
import type { IconName } from "./icons.ts";

const ICONS: Record<CardState, IconName> = {
  none: "device",
  device: "device",
  saving: "device",
  memory: "alert",
  conflict: "alert",
  saved: "done",
  shared: "people",
  published: "globe",
};
const ACCOUNT: readonly CardState[] = ["saved", "shared", "published"];

/**
 * Status line molecule (`rc-status-line`): where the work lives, and the one thing to do about it next.
 * A row about something else, such as sharing, names its own icon and says whether it is on.
 */
export function StatusLine({
  state = "device",
  icon = ICONS[state],
  on = ACCOUNT.includes(state),
  children,
  actions,
}: {
  state?: CardState;
  icon?: IconName;
  on?: boolean;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="rc-status-line">
      {/* Focusable from code only: the line takes the focus when its finished action goes away. */}
      <p className="rc-save-status" data-state={on ? "account" : "device"} role="status" tabIndex={-1}>
        <Icon name={icon} size="sm" />
        <span>{children}</span>
      </p>
      {actions && <div className="rc-action-bar">{actions}</div>}
    </div>
  );
}
