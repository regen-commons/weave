import type { ReactNode } from "react";
import { Tooltip } from "./Tooltip.tsx";
import type { Capital } from "../capitals.ts";
import { Icon } from "./Icon.tsx";
import type { IconName } from "./icons.ts";

/**
 * Tag atom (`rc-tag`): a short label. A form of capital shows its tile glyph beside its plain word.
 * A tone colours the icon only, so the word still carries the meaning.
 */
export function Tag({
  capital,
  icon,
  tone,
  children,
}: {
  capital?: Capital;
  icon?: IconName;
  tone?: "success" | "warning" | "info";
  children?: ReactNode;
}) {
  const tag = (
    <span className="rc-tag" data-capital={capital?.key} data-tone={tone}>
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
