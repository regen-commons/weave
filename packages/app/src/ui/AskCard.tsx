import { CAPITALS } from "../capitals.ts";
import type { AskItem, AskKind } from "../intake/contracts.ts";
import { askTerms } from "../intake/presentation.ts";
import { Tag } from "./Tag.tsx";
/** Ask card molecule: plain source state and equal capital tags, with explicit review. */
export function AskCard({
  item,
  kind,
  disabled,
  onKeep,
  onChange,
  onRemove,
  onUndo,
}: {
  item: AskItem;
  kind: AskKind;
  disabled: boolean;
  onKeep(): void;
  onChange(): void;
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
          id={`ask-${item.id}-undo`}
          disabled={disabled}
          onClick={onUndo}
        >
          Undo remove
        </button>
      </div>
    );
  const kept = item.decision === "kept";
  return (
    <article
      className="rc-card rc-ask-card"
      data-kind={kept ? (kind === "needs" ? "need" : "offer") : undefined}
      data-pencil={!kept || undefined}
      aria-labelledby={`ask-${item.id}-title`}
    >
      {item.value.capitalForms.length ? (
        <ul className="rc-tag-list" aria-label="Kinds of support">
          {CAPITALS.filter((capital) => item.value.capitalForms.includes(capital.key)).map((capital) => (
            <li key={capital.key}>
              <Tag capital={capital} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="rc-meta">Choose the kinds of support in Change.</p>
      )}
      <h3 className="rc-ask-title" id={`ask-${item.id}-title`}>
        {item.value.title}
      </h3>
      {item.value.description && item.value.description !== item.value.title && (
        <p>{item.value.description}</p>
      )}
      <p className="rc-ask-terms">{askTerms(item.value, kind)}</p>
      {item.value.purpose && kind === "needs" && <p className="rc-meta">{item.value.purpose}</p>}
      {item.value.audience && kind === "offers" && <p className="rc-meta">For {item.value.audience}</p>}
      <div className="rc-ask-foot">
        <p className="rc-proposal-source">
          {kept ? "Kept by you" : "Suggested from your words. Check this."}
        </p>
        <div className="rc-action-bar">
          {!kept && (
            <button
              className="rc-button"
              data-variant="secondary"
              type="button"
              disabled={disabled}
              onClick={onKeep}
            >
              Keep
            </button>
          )}
          <button
            className="rc-button"
            data-variant="quiet"
            type="button"
            disabled={disabled}
            id={`ask-${item.id}-change`}
            onClick={onChange}
          >
            Change
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
