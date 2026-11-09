import type { ReactNode } from "react";

type HeadingProps = { level: 1 | 2; size: "hero" | "page" | "section"; id?: string; children: ReactNode };

/** Heading atom (`rc-heading`). Each page has exactly one level-1 heading. */
export function Heading({ level, size, id, children }: HeadingProps) {
  const Tag = level === 1 ? "h1" : "h2";
  return (
    <Tag className="rc-heading" data-size={size} id={id} tabIndex={level === 1 ? -1 : undefined}>
      {children}
    </Tag>
  );
}
