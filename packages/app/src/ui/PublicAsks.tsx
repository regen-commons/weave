import { useId } from "react";
import type { PublicAsk } from "../listing.ts";
import { AskCards } from "./AskCards.tsx";
import { useSectionTag } from "./section-level.ts";

/** Read-only Ask cards: supplied shared records carry no editing or commitment action. */
export function PublicAsks({ kind, asks }: { kind: "needs" | "offers"; asks: readonly PublicAsk[] }) {
  const id = useId();
  // A section of the record it is drawn in, at that record's level (a sheet's or a page's).
  const Heading = useSectionTag(), AskHeading = useSectionTag(1);
  return (
    <section className="rc-card-list" aria-labelledby={id}>
      <Heading className="rc-heading" data-size="section" id={id}>
        {kind === "needs" ? "What They Need" : "What They Can Offer"}
      </Heading>
      {!asks.length ? (
        <p className="rc-meta">Nothing listed yet.</p>
      ) : (
        <AskCards kind={kind === "needs" ? "need" : "offer"} label={kind === "needs" ? "What they need" : "What they can offer"}
          Heading={AskHeading}
          items={asks.map((ask, index) => ({ key: `${index}-${ask.title}`, title: ask.title, description: ask.description,
            terms: ask.terms, capitals: ask.capitals }))} />
      )}
    </section>
  );
}
