import { useId } from "react";
import { CAPITALS } from "../capitals.ts";
import type { PublicAsk } from "../listing.ts";
import { Tag } from "./Tag.tsx";

/** Read-only Ask cards: supplied shared records carry no editing or commitment action. */
export function PublicAsks({ kind, asks }: { kind: "needs" | "offers"; asks: readonly PublicAsk[] }) {
  const id = useId();
  return (
    <section className="rc-card-list" aria-labelledby={id}>
      <h2 className="rc-heading" data-size="section" id={id}>
        {kind === "needs" ? "What they need" : "What they offer"}
      </h2>
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
                <h3 className="rc-ask-title">{ask.title}</h3>
                <p>{ask.description}</p>
                <p className="rc-ask-terms">{ask.terms}</p>
              </article>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
