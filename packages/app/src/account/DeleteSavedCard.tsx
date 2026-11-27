import { busyProps } from "./busy.ts";
import { useEffect, useRef, useState } from "react";
import { fullDate } from "../home.ts";
import { TaskDialog } from "../ui/TaskDialog.tsx";
import { deleteFailure, deleteNeedsReload, deletedMessage, namesakesLine, type DeletedCard, type ListedCard } from "./delete-card.ts";

/**
 * Choose one private save, then confirm it by name. Listing cards carry no buttons, so the
 * choice lives here. One request ID covers every retry of one confirmation. A card with a copy
 * on this device asks, before the press, whether that copy goes to the device backups too, so
 * the initiative leaves the list unless the person keeps it (QA notes, 25 November 2026).
 */
export function DeleteSavedCard({ open, cards, onClose, onDelete, onReload, onDeleted }: {
  open: boolean;
  cards: readonly ListedCard[];
  onClose(): void;
  /** `removeCopies`: also move the card's copies on this device to the device backups once the account confirms. */
  onDelete(card: ListedCard, requestId: string, removeCopies: boolean): Promise<DeletedCard>;
  onReload(): Promise<void>;
  onDeleted(message: string): void;
}) {
  const [chosen, setChosen] = useState<{ card: ListedCard; requestId: string } | null>(null);
  const [removeCopies, setRemoveCopies] = useState(true);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ text: string; reload: boolean } | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const returnTo = useRef<string | null>(null);
  useEffect(() => {
    if (!open) { setChosen(null); setProblem(null); }
  }, [open]);
  const reloaded = useRef(false);
  // The pressed control leaves with its view, so focus moves with the person.
  useEffect(() => {
    const target = chosen ? "[data-confirm-cancel]" : returnTo.current ? `[data-card-id="${returnTo.current}"]`
      : reloaded.current ? "[data-card-id]" : null;
    reloaded.current = false;
    if (target) body.current?.querySelector<HTMLElement>(target)?.focus();
  }, [chosen]);
  // A refusal replaces the pressed button, so focus goes to the way forward it offers.
  useEffect(() => {
    if (problem) body.current?.querySelector<HTMLElement>(problem.reload ? "[data-reload]" : "[data-confirm-cancel]")?.focus();
  }, [problem]);
  async function confirm() {
    if (!chosen || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const result = await onDelete(chosen.card, chosen.requestId, removeCopies && chosen.card.copies.length > 0);
      onDeleted(deletedMessage(chosen.card.name, result, chosen.card.namesakes));
    } catch (error) {
      setProblem({ text: deleteFailure(error), reload: deleteNeedsReload(error) });
    } finally {
      setBusy(false);
    }
  }
  async function reload() {
    if (busy) return;
    setBusy(true);
    try {
      await onReload();
      returnTo.current = null;
      reloaded.current = true;
      setChosen(null);
      setProblem(null);
    } catch {
      setProblem({ text: "Your saved cards could not be reloaded. Try again.", reload: true });
    } finally {
      setBusy(false);
    }
  }
  return (
    <TaskDialog title="Delete A Saved Card" open={open} onClose={onClose} blockClose={busy}>
      <div className="rc-stack" ref={body} aria-busy={busy}>
        {chosen ? (
          <>
            <p><strong>Delete {chosen.card.name} from your account?</strong></p>
            <p>This removes the saved copy from your Weave account. It cannot be undone there.</p>
            {chosen.card.copies.length > 0 ? (
              <fieldset className="rc-choice-group">
                <legend>Its copy on this device</legend>
                <label className="rc-choice">
                  {/* Held, not disabled, while the deletion runs, so a focus here is never dropped. */}
                  <input className="rc-check" type="checkbox" checked={removeCopies} aria-disabled={busy || undefined}
                    onChange={(event) => { if (!busy) setRemoveCopies(event.target.checked); }} />
                  <span className="rc-choice-text">
                    <span className="rc-choice-title">Also remove its copy from this device</span>
                    <span className="rc-choice-note">
                      {removeCopies
                        ? "The copy moves to the device backups in Settings, where you can restore it or delete it for good."
                        : "The copy on this device keeps its words and stays in Your Initiatives, marked On this device."}
                    </span>
                  </span>
                </label>
              </fieldset>
            ) : (
              <p>{`Nothing on this device changes.${namesakesLine(chosen.card.name, chosen.card.namesakes)}`}</p>
            )}
            {problem && <p className="rc-notice" data-tone="warning" role="alert">{problem.text}</p>}
            {busy && <p role="status">Deleting</p>}
            <div className="rc-action-bar">
              {problem?.reload ? (
                <button className="rc-button" data-variant="primary" type="button" {...busyProps(busy)} data-reload onClick={() => void reload()}>
                  <span>Reload Saved Cards</span>
                  {busy && <span className="rc-spinner" aria-hidden="true" />}
                </button>
              ) : (
                <button className="rc-button" data-variant="danger" type="button" {...busyProps(busy)} onClick={() => void confirm()}>
                  <span>Delete From Your Account</span>
                  {busy && <span className="rc-spinner" aria-hidden="true" />}
                </button>
              )}
              {/* Not greyed out either: a failed delete moves focus here, and it must be able to hold it. */}
              <button className="rc-button" data-variant="quiet" type="button" aria-disabled={busy || undefined} data-confirm-cancel
                onClick={() => { if (busy) return; returnTo.current = chosen.card.id; setChosen(null); setProblem(null); }}>
                Cancel
              </button>
            </div>
          </>
        ) : cards.length ? (
          <>
            <p>Choose a card to remove from your Weave account. Your Certified projects and team workspaces are not changed here.</p>
            <ul className="rc-stack">
              {cards.map((card) => (
                <li key={card.id}>
                  <p>
                    <strong>{card.name}</strong>
                    <br />
                    <span className="rc-meta">
                      Saved on {fullDate(card.savedOn)}.{card.copies.length ? " It has a copy on this device." : ""}
                    </span>
                  </p>
                  <button className="rc-button" data-variant="secondary" type="button" data-card-id={card.id}
                    aria-label={`Delete from your account: ${card.name}`}
                    onClick={() => { setProblem(null); setRemoveCopies(true); setChosen({ card, requestId: crypto.randomUUID() }); }}>
                    Delete From Your Account
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p>No private saves to delete.</p>
        )}
      </div>
    </TaskDialog>
  );
}
