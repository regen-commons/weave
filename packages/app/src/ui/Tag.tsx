import type { ReactNode } from "react";
import { Tooltip } from "./Tooltip.tsx";
import type { Capital } from "../capitals.ts";
import { Icon } from "./Icon.tsx";
import type { IconName } from "./icons.ts";

/**
 * Tag atom (`rc-tag`): a short label. A form of capital shows its tile glyph beside its plain word.
 * A tone colours the icon only, so the word still carries the meaning. A tag that must not be
 * missed in its row, such as a deadline, is `strong`: heavier words, and its tone along its edge.
 */
export function Tag({
  capital,
  icon,
  tone,
  strong,
  children,
}: {
  capital?: Capital;
  icon?: IconName;
  tone?: "success" | "warning" | "info";
  strong?: boolean;
  children?: ReactNode;
}) {
  const tag = (
    <span className="rc-tag" data-capital={capital?.key} data-tone={tone} data-emphasis={strong ? "strong" : undefined}>
      {capital && (
        <span className="rc-tile" aria-hidden="true">
          {capital.glyph}
        </span>
      )}
      {icon && <Icon name={icon} size="sm" />}
      {children ?? capital?.title}
    </span>
  );
  return capital ? <Tooltip text={`${capital.label}. ${capital.description}`}>{tag}</Tooltip> : tag;
}
