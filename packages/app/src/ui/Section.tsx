import type { ReactNode } from "react";
import { Heading } from "./Heading.tsx";

/** Section molecule: a heading, an optional browse action, an optional line of context and related content. */
export function Section({
  id,
  title,
  action,
  note,
  children,
}: {
  id: string;
  title: string;
  action?: ReactNode;
  /** One or two sentences that say why the section is here. */
  note?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="rc-section" aria-labelledby={id}>
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
