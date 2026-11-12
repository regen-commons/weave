import { CAPITALS } from "../capitals.ts";
import { entryId, suggestedEntry, type CapitalForm } from "../intake/ask-page.ts";
import type { AskItem, AskKind } from "../intake/contracts.ts";
import { askExtras } from "../intake/presentation.ts";
import { Icon } from "./Icon.tsx";

/**
 * Ask card molecule: one need or offer in the person's words, with its kinds of support as
 * chips. A dashed chip, or a whole dashed card, is a suggestion until the page's Continue
 * keeps it, so the card has no Keep of its own.
 */
export function AskCard({
  item,
  kind,
  disabled,
  noteId,
  onKind,
  onMore,
  onRemove,
  onUndo,
}: {
  item: AskItem;
  kind: AskKind;
  disabled: boolean;
  /** The line under the list that says what dashed means, when the list has one. */
  noteId?: string;
  onKind(kind: CapitalForm): void;
  onMore(): void;
  onRemove(): void;
  onUndo(): void;
}) {
  if (item.decision === "removed")
    return (
      <div className="rc-proposal" data-state="confirmed">
        <p className="rc-proposal-source">Removed: {item.value.title}</p>
        <button
          className="rc-button"
          data-variant="quiet"
          type="button"
          id={entryId(item.id, "undo")}
          disabled={disabled}
          onClick={onUndo}
        >
          Undo remove
        </button>
      </div>
    );
  const pencil = item.decision === "pencil";
  const suggested = suggestedEntry(item);
  const chosen = CAPITALS.filter((capital) => item.value.capitalForms.includes(capital.key));
  const addable = CAPITALS.filter((capital) => !item.value.capitalForms.includes(capital.key));
  const extras = askExtras(item.value, kind);
  return (
    <article
      className="rc-card rc-ask-card"
      data-kind={suggested ? undefined : kind === "needs" ? "need" : "offer"}
      data-pencil={suggested || undefined}
      aria-labelledby={entryId(item.id, "title")}
    >
      <h3 className="rc-ask-title" id={entryId(item.id, "title")}>
        {item.value.title}
      </h3>
      {item.value.description && item.value.description !== item.value.title && (
        <p>{item.value.description}</p>
      )}
      {chosen.length ? (
        <ul className="rc-tag-list" aria-label="Kinds of support">
          {chosen.map((capital) => (
            <li key={capital.key}>
              <span className="rc-chip" data-capital={capital.key} data-pencil={pencil || undefined}>
                <span className="rc-tile" data-state={pencil ? "suggested" : undefined} aria-hidden="true">
                  {capital.glyph}
                </span>
                {capital.label}
                <button
                  className="rc-chip-remove"
                  type="button"
                  id={entryId(item.id, `kind-${capital.key}-remove`)}
                  aria-label={`Remove ${capital.label} from ${item.value.title}`}
                  aria-describedby={pencil ? noteId : undefined}
                  disabled={disabled}
                  onClick={() => onKind(capital.key)}
                >
                  <Icon name="close" size="sm" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rc-meta">No kind of support yet</p>
      )}
      {addable.length > 0 && (
        <details>
          <summary className="rc-footer-link" id={entryId(item.id, "kinds")}>
            Add a kind of support
          </summary>
          <ul className="rc-tag-list" aria-label="Kinds of support you can add">
            {addable.map((capital) => (
              <li key={capital.key}>
                <button
                  className="rc-chip"
                  type="button"
                  data-capital={capital.key}
                  id={entryId(item.id, `kind-${capital.key}-add`)}
                  disabled={disabled}
                  onClick={() => onKind(capital.key)}
                >
                  <span className="rc-tile" data-state="empty" aria-hidden="true">
                    {capital.glyph}
                  </span>
                  {capital.label}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      {extras && <p className="rc-ask-terms">{extras}</p>}
      {item.value.purpose && kind === "needs" && <p className="rc-meta">{item.value.purpose}</p>}
      {item.value.audience && kind === "offers" && <p className="rc-meta">For {item.value.audience}</p>}
      <div className="rc-ask-foot">
        {suggested && <p className="rc-proposal-source">Suggested from your words</p>}
        <div className="rc-action-bar">
          <button
            className="rc-button"
            data-variant="quiet"
            type="button"
            disabled={disabled}
            id={entryId(item.id, "more")}
            onClick={onMore}
          >
            More details
          </button>
          <button
            className="rc-button"
            data-variant="quiet"
            type="button"
            disabled={disabled}
            onClick={onRemove}
          >
            Remove
          </button>
        </div>
      </div>
    </article>
  );
}
