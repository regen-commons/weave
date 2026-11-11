import { Icon } from "./Icon.tsx";

/** A placeholder until D30 settles uploads, previews and rights. No remote image request. */
export function Media({ thumb, wide }: { thumb?: boolean; wide?: boolean }) {
  return (
    <div
      className="rc-media"
      data-size={thumb ? "thumb" : wide ? "wide" : undefined}
      role="img"
      aria-label="No image yet"
    >
      <Icon name="sprout" size="lg" />
    </div>
  );
}
