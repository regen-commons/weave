import { Icon } from "./Icon.tsx";

/**
 * A placeholder until D30 settles uploads, previews and rights. No remote image request. With `initials`
 * it is a record's mark, drawn from its name: decorative, since the record's heading already names it.
 */
export function Media({ thumb, wide, initials }: { thumb?: boolean; wide?: boolean; initials?: string }) {
  if (initials)
    return (
      <div className="rc-media" data-size={thumb ? "thumb" : wide ? "wide" : undefined} data-content="initials" aria-hidden="true">
        {initials}
      </div>
    );
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
