import { useEffect, useRef, useState } from "react";
import { fullDate } from "../home.ts";
import { TaskDialog } from "../ui/TaskDialog.tsx";
import { deleteFailure, deleteNeedsReload, deletedMessage, type DeletableCard, type DeletedCard } from "./delete-card.ts";

type Listed = DeletableCard & { savedOn: string; onDevice: boolean };

/**
 * Choose one private save, then confirm it by name. Listing cards carry no buttons, so the
 * choice lives here. One request ID covers every retry of one confirmation.
 */
export function DeleteSavedCard({ open, cards, onClose, onDelete, onReload, onDeleted }: {
  open: boolean;
  cards: readonly Listed[];
  onClose(): void;
  onDelete(card: DeletableCard, requestId: string): Promise<DeletedCard>;
  onReload(): Promise<void>;
  onDeleted(message: string): void;
}) {
  const [chosen, setChosen] = useState<{ card: Listed; requestId: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ text: string; reload: boolean } | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const returnTo = useRef<string | null>(null);
  useEffect(() => {
    if (!open) { setChosen(null); setProblem(null); }
  }, [open]);
  // The pressed control leaves with its view, so focus moves with the person.
  useEffect(() => {
    const target = chosen ? "[data-confirm-cancel]" : returnTo.current ? `[data-card-id="${returnTo.current}"]` : null;
    if (target) body.current?.querySelector<HTMLElement>(target)?.focus();
  }, [chosen]);
  async function confirm() {
    if (!chosen || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const result = await onDelete(chosen.card, chosen.requestId);
      onDeleted(deletedMessage(chosen.card.name, result));
    } catch (error) {
      setProblem({ text: deleteFailure(error), reload: deleteNeedsReload(error) });
    } finally {
      setBusy(false);
    }
  }
  async function reload() {
    setBusy(true);
    try {
      await onReload();
      returnTo.current = null;
      setChosen(null);
      setProblem(null);
    } catch {
      setProblem({ text: "Your saved cards could not be reloaded. Try again.", reload: true });
    } finally {
      setBusy(false);
    }
  }
  return (
    <TaskDialog title="Delete a saved card" open={open} onClose={onClose} blockClose={busy}>
      <div className="rc-stack" ref={body} aria-busy={busy}>
        {chosen ? (
          <>
            <p><strong>Delete {chosen.card.name} from your account?</strong></p>
            <p>This removes the saved copy from your Weave account. It cannot be undone there.</p>
            <p>
              {chosen.card.onDevice
                ? "The card on this device keeps its words. You can save it again as a new card."
                : "Nothing on this device changes."}
            </p>
            {problem && <p className="rc-notice" data-tone="warning" role="alert">{problem.text}</p>}
            {busy && <p role="status">Deleting</p>}
            <div className="rc-action-bar">
              {problem?.reload ? (
                <button className="rc-button" data-variant="primary" type="button" disabled={busy} onClick={() => void reload()}>
                  Reload saved cards
                </button>
              ) : (
                <button className="rc-button" data-variant="danger" type="button" disabled={busy} onClick={() => void confirm()}>
                  Delete from your account
                </button>
              )}
              <button className="rc-button" data-variant="quiet" type="button" disabled={busy} data-confirm-cancel
                onClick={() => { returnTo.current = chosen.card.id; setChosen(null); setProblem(null); }}>
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
                      Saved on {fullDate(card.savedOn)}.{card.onDevice ? " This is the card on this device." : ""}
                    </span>
                  </p>
                  <button className="rc-button" data-variant="secondary" type="button" data-card-id={card.id}
                    aria-label={`Delete ${card.name} from your account`}
                    onClick={() => { setProblem(null); setChosen({ card, requestId: crypto.randomUUID() }); }}>
                    Delete from your account
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
