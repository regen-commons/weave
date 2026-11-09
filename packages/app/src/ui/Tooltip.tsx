import { useEffect, useId, useRef, type ReactNode } from "react";
import { connectTooltip } from "@regen-commons/design-system/overlays";

/** A compact sign, with the same explanation for pointer, keyboard and screen reader. */
export function Tooltip({ text, children }: { text: string; children: ReactNode }) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (trigger.current && panel.current) return connectTooltip(trigger.current, panel.current);
  }, [text]);
  return (
    <span className="rc-tooltip-wrap">
      <button ref={trigger} type="button" className="rc-tooltip-trigger" {...{ interestfor: id }}>
        {children}
      </button>
      <span ref={panel} className="rc-tooltip" popover="hint" id={id}>
        {text}
      </span>
    </span>
  );
}
