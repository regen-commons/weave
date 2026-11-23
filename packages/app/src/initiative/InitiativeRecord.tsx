import { useId } from "react";
import { CAPITALS } from "../capitals.ts";
import type { Initiative } from "../describe/contracts.ts";
import type { AskFields } from "../intake/contracts.ts";
import { askTerms } from "../intake/presentation.ts";
import { Icon } from "../ui/Icon.tsx";
import { RecordPreview } from "../ui/RecordPreview.tsx";
import { Tag } from "../ui/Tag.tsx";

/**
 * The same checked card on device and in a team workspace. Its surrounding page owns the available
 * actions. The initiative has its own card; needs and offers follow as two lists of Ask cards, each
 * under its own heading and sign, so the two are told apart at a glance: a need's edge is at the
 * start of its card and an offer's at the end.
 */
export function InitiativeRecord({ fields, needs, offers, team = false, named = true }: {
  fields: Initiative; needs: readonly AskFields[]; offers: readonly AskFields[]; team?: boolean; named?: boolean;
}) {
  const id = useId();
  // Named, the card's own heading is a level 2 and the lists sit under it. Unnamed, the page's level 1
  // is the name, so the lists are level 2 and nothing is skipped (WCAG 1.3.1).
  const List = named ? "h3" : "h2";
  const Entry = named ? "h4" : "h3";
  return (
    <div className="rc-stack">
      <RecordPreview fields={fields} confirmed team={team} named={named} />
      {/* Side by side where the column has room for two lists, one under the other where it has not. */}
      <div className="rc-card-grid" data-layout="pair">
        {(["needs", "offers"] as const).map((kind) => {
          const entries = kind === "needs" ? needs : offers;
          return (
            <section className="rc-card-list" key={kind} aria-labelledby={`${id}-${kind}`}>
              <List className="rc-heading" data-size="section" id={`${id}-${kind}`}>
                <Icon name={kind === "needs" ? "need" : "offer"} />
                {kind === "needs" ? "Needs" : "Offers"}, {entries.length}
              </List>
              {entries.length ? (
                <ul className="rc-ask-list">
                  {entries.map((entry, index) => (
                    <li key={index}>
                      <article className="rc-card rc-ask-card" data-kind={kind === "needs" ? "need" : "offer"}>
                        <Entry className="rc-ask-title">{entry.title}</Entry>
                        {entry.capitalForms.length ? (
                          <ul className="rc-tag-list" aria-label="Kinds of support">
                            {CAPITALS.filter((capital) => entry.capitalForms.includes(capital.key)).map((capital) => (
                              <li key={capital.key}>
                                <Tag capital={capital} />
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="rc-meta">No kind of support yet</p>
                        )}
                        <p className="rc-ask-terms">{askTerms(entry, kind)}</p>
                      </article>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rc-meta">None added.</p>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
