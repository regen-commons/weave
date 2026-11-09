import type { IconName } from "./icons.ts";

/** Icon atom (`rc-icon`). Decorative: the visible word beside it names the action. */
export function Icon({ name, size }: { name: IconName; size?: "sm" | "lg" }) {
  return (
    <svg className="rc-icon" data-size={size} aria-hidden="true">
      <use href={`/brand/icons.svg#${name}`} />
    </svg>
  );
}
