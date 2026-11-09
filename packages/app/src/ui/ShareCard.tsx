import { useId, type ReactNode } from "react";
/** Share card organism. A missing match count stays unknown; service actions are supplied only when usable. */
export function ShareCard({ count, children }: { count: number | null; children?: ReactNode }) {
  const id = useId();
  return (
    <article className="rc-card rc-share-card" aria-labelledby={id}>
      <h2 className="rc-card-title" id={id}>
        {count === null
          ? "Partner suggestions"
          : `${count} ${count === 1 ? "initiative matches" : "initiatives match"} what you need and offer`}
      </h2>
      <p>{count === null ? "Partner suggestions from public sources are not connected yet." : "These are example partner matches."}</p>
      <p className="rc-meta">
        Viewing public-source suggestions will not require sharing your initiative. Saving and sharing are separate choices.
      </p>
      {children}
    </article>
  );
}
