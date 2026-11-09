import type { ReactNode } from "react";
import { Heading } from "./Heading.tsx";

/** Section molecule: a heading, optional browse action and related content. */
export function Section({
  id,
  title,
  action,
  children,
}: {
  id: string;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rc-section" aria-labelledby={id}>
      <div className="rc-section-head">
        <Heading level={2} size="section" id={id}>
          {title}
        </Heading>
        {action}
      </div>
      {children}
    </section>
  );
}
