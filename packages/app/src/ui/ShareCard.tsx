import { useId, type ReactNode } from "react";

/**
 * Share card organism, used as the gate before partner suggestions: they start once the initiative is
 * linked to a Certified project, and funding that fits does not wait for one. The caller supplies the
 * actions that say what to do next.
 */
export function ShareCard({ level, children }: { level: 2 | 3; children: ReactNode }) {
  const id = useId();
  const Title = `h${level}` as const;
  return (
    <article className="rc-card rc-share-card" aria-labelledby={id}>
      <Title className="rc-card-title" id={id}>
        Partner suggestions start with a Certified project
      </Title>
      <p>You can see funding that fits without a project.</p>
      <div className="rc-action-bar">{children}</div>
    </article>
  );
}
