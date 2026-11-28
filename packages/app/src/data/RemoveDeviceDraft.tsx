import { useEffect, useRef, useState } from "react";
import { busyProps } from "../account/busy.ts";
import type { DeviceDraft } from "../describe/contracts.ts";
import { backedUpMessage, backUpDraft, backUpWarning, deviceRemovalFailure, draftTitle, NOT_BACKED_UP } from "../describe/device-removal.ts";
import { useDraft } from "../describe/use-draft.ts";
import { TaskDialog } from "../ui/TaskDialog.tsx";

/** A draft in Your Initiatives. */
export type RemovableDraft = { readonly draft: DeviceDraft };

/**
 * Choose one of this browser's drafts, then confirm moving it to the device backups by name. Nothing
 * is deleted: the backup is restored or deleted for good in Settings, under Device Backups. Before the
 * QA notes of 25 November 2026 only the draft open in this tab could be removed, from Settings.
 */
export function RemoveDeviceDraft({ open, drafts, onClose, onRemoved }: {
  open: boolean;
  drafts: readonly RemovableDraft[];
  onClose(): void;
  onRemoved(message: string): void;
}) {
  const { controller } = useDraft();
  const [chosen, setChosen] = useState<RemovableDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) { setChosen(null); setProblem(""); }
  }, [open]);
  // The pressed control leaves with its view, so focus moves with the person.
  useEffect(() => {
    body.current?.querySelector<HTMLElement>(chosen ? "[data-confirm-cancel]" : "[data-draft-id]")?.focus();
  }, [chosen]);
  async function confirm() {
    if (!chosen || busy) return;
    setBusy(true);
    setProblem("");
    try {
      if (await backUpDraft(controller, chosen.draft.id)) onRemoved(backedUpMessage(chosen.draft));
      else setProblem(NOT_BACKED_UP);
    } catch (error) {
      setProblem(deviceRemovalFailure(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <TaskDialog title="Remove A Draft From This Device" open={open} onClose={onClose} blockClose={busy}>
      <div className="rc-stack" ref={body} aria-busy={busy}>
        {chosen ? (
          <>
            <p><strong>Move {draftTitle(chosen.draft)} to the device backups?</strong></p>
            <p>{backUpWarning(chosen.draft)}</p>
            {problem && <p className="rc-notice" data-tone="warning" role="alert">{problem}</p>}
            {busy && <p role="status">Moving</p>}
            <div className="rc-action-bar">
              <button className="rc-button" data-variant="danger" type="button" {...busyProps(busy)} onClick={() => void confirm()}>
                <span>Move To Device Backups</span>
                {busy && <span className="rc-spinner" aria-hidden="true" />}
              </button>
              <button className="rc-button" data-variant="quiet" type="button" aria-disabled={busy || undefined} data-confirm-cancel
                onClick={() => { if (busy) return; setChosen(null); setProblem(""); }}>
                Cancel
              </button>
            </div>
          </>
        ) : drafts.length ? (
          <>
            <p>Choose a draft to take out of Your Initiatives. It is kept as a device backup.</p>
            <ul className="rc-stack">
              {drafts.map((item) => (
                <li key={item.draft.id}>
                  <p>
                    <strong>{draftTitle(item.draft)}</strong>
                    <br />
                    <span className="rc-meta">Only on this device.</span>
                  </p>
                  <button className="rc-button" data-variant="secondary" type="button" data-draft-id={item.draft.id}
                    aria-label={`Remove from this device: ${draftTitle(item.draft)}`}
                    onClick={() => { setProblem(""); setChosen(item); }}>
                    Remove From This Device
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p>No drafts on this device.</p>
        )}
      </div>
    </TaskDialog>
  );
}
