import type { ReactNode } from "react";
import { Heading } from "./Heading.tsx";

/** Section molecule: a heading, an optional browse action, an optional line of context and related content. */
export function Section({
  id,
  title,
  action,
  note,
  until,
  children,
}: {
  id: string;
  title: string;
  action?: ReactNode;
  /** Shown on a phone only, where a wide screen's header holds the same thing. */
  until?: "wide";
  /** One or two sentences that say why the section is here. */
  note?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="rc-section" data-until={until} aria-labelledby={id}>
      <div className="rc-section-head">
        <Heading level={2} size="section" id={id}>
          {title}
        </Heading>
        {action}
      </div>
      {note && <p className="rc-section-note">{note}</p>}
      {children}
    </section>
  );
}
