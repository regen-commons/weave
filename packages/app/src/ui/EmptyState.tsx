import { useId, type ReactNode } from "react";

/** Empty state molecule (`rc-empty`): a short title, one line of guidance, one action. */
export function EmptyState({ title, action, children }: { title: string; action: ReactNode; children: ReactNode }) {
  const id = useId();
  return (
    <section className="rc-empty" aria-labelledby={id}>
      <h2 id={id} className="rc-empty-title">
        {title}
      </h2>
      <p>{children}</p>
      {action}
    </section>
  );
}
