import { useEffect, useId, useRef, type ReactNode } from "react";
import { connectPopover } from "@regen-commons/design-system/overlays";

export interface MenuChoice {
  readonly value: string;
  readonly label: string;
}

/**
 * A Menu (`rc-menu`) with one thing to pick: the button that opens it, one named group of radios
 * and Done. A choice takes effect as it is made, and the button says what is in force, so the page
 * reads the same before and after a press. Sort in the filter bar is one (DL-100), and so is the
 * choice of initiative on Funding (DL-118).
 */
export function RadioMenu({
  label,
  legend,
  name,
  options,
  value,
  onChange,
  size,
  align,
  filter,
  active,
}: {
  /** The button's words. */
  label: ReactNode;
  /** What is being picked, as the menu names it. */
  legend: string;
  /** The radio group's name, where a page needs to set it. Each menu needs its own. */
  name?: string;
  options: readonly MenuChoice[];
  /** The choice in force. None is marked when it matches no option. */
  value: string | undefined;
  onChange(value: string): void;
  size?: "sm";
  /** `end` ends the menu at its button's edge, for a button at the far end of its row. */
  align?: "end";
  /** `one`: a filter bar's own menu, which a phone leaves out because its sheet holds the same choice. */
  filter?: "one";
  /** The choice in force is not the default, so the button shows it is in use as a chosen filter does. */
  active?: boolean;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (trigger.current && panel.current) return connectPopover(trigger.current, panel.current);
  }, []);
  return (
    <>
      <button className="rc-button" data-variant="secondary" data-size={size} data-filter={filter} data-active={active}
        type="button" ref={trigger} popoverTarget={id}>
        {label}
      </button>
      <div className="rc-menu" ref={panel} id={id} popover="auto" data-align={align}>
        <fieldset className="rc-menu-group">
          <legend>{legend}</legend>
          <div className="rc-menu-options">
            {options.map((option) => (
              <label className="rc-menu-option" key={option.value}>
                <input
                  className="rc-check"
                  type="radio"
                  name={name ?? `${id}-choice`}
                  checked={value === option.value}
                  onChange={() => onChange(option.value)}
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>
        <button type="button" className="rc-button" data-variant="quiet" data-close-popover>
          Done
        </button>
      </div>
    </>
  );
}
