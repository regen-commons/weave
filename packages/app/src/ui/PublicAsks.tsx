import { useId } from "react";
import { CAPITALS } from "../capitals.ts";
import type { PublicAsk } from "../listing.ts";
import { Tag } from "./Tag.tsx";
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
        <ul className="rc-ask-list">
          {asks.map((ask, index) => (
            <li key={`${index}-${ask.title}`}>
              <article className="rc-card rc-ask-card" data-kind={kind === "needs" ? "need" : "offer"}>
                <ul className="rc-tag-list" aria-label="Kinds of support">
                  {CAPITALS.filter((capital) => ask.capitals.includes(capital.key)).map((capital) => (
                    <li key={capital.key}>
                      <Tag capital={capital} />
                    </li>
                  ))}
                </ul>
                <AskHeading className="rc-ask-title">{ask.title}</AskHeading>
                {ask.description && <p>{ask.description}</p>}
                <p className="rc-ask-terms">{ask.terms}</p>
              </article>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
