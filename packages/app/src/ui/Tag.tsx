import type { ReactNode } from "react";
import { Tooltip } from "./Tooltip.tsx";
import type { Capital } from "../capitals.ts";

/** Tag atom (`rc-tag`): a short label. A form of capital shows its tile glyph beside its plain word. */
export function Tag({ capital, children }: { capital?: Capital; children?: ReactNode }) {
  const tag = (
    <span className="rc-tag" data-capital={capital?.key}>
      {capital && (
        <span className="rc-tile" aria-hidden="true">
          {capital.glyph}
        </span>
      )}
      {children ?? capital?.title}
    </span>
  );
  return capital ? <Tooltip text={`${capital.label}. ${capital.description}`}>{tag}</Tooltip> : tag;
}
