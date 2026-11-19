import { useEffect, useId, useState } from "react";
import { useDraft } from "../describe/use-draft.ts";
import { hasDraft } from "../describe/view.ts";
import type { DraftBackup } from "../describe/repository.ts";
import {
  backupDeleteWarning,
  backupLine,
  BACKUPS_SHOWN,
  deviceRemovalFailure,
  discardedMessage,
  discardWarning,
  draftTime,
  draftTitle,
  listedBackups,
  removedBackupMessage,
  restoreWarning,
} from "../describe/device-removal.ts";
import { TaskDialog } from "../ui/TaskDialog.tsx";

type Step = { kind: "restore" | "delete"; backup: DraftBackup } | { kind: "current" };
const TITLES = { restore: "Restore this backup?", delete: "Delete this backup?", current: "Remove this draft from this device?" };

/**
 * This browser's backups, one compact row each: the name, when it last changed, and Restore and
 * Delete. A long history shows its newest few and offers the rest. Restoring backs up the current
 * draft first, and deleting is for good; each asks first and names exactly what it acts on. With
 * `manage`, the current draft can also be removed after it is kept as a backup.
 */
export function DeviceBackups({ manage = false, disabled = false }: { manage?: boolean; disabled?: boolean }) {
  const id = useId();
  const { controller, draft, ready } = useDraft();
  const [backups, setBackups] = useState<DraftBackup[]>([]);
  const [all, setAll] = useState(false);
  const [step, setStep] = useState<Step | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ text: string; failed: boolean } | null>(null);
  const reload = () => controller.backups().then(setBackups, () => {});
  // Loading or restoring a card keeps the previous draft as a backup, so list again whenever the draft changes.
  useEffect(() => { void reload(); }, [controller, draft.id, draft.updatedAt]);
  async function run(action: () => Promise<string>) {
    if (busy) return;
    setBusy(true);
    setResult(null);
    try {
      setResult({ text: await action(), failed: false });
    } catch (error) {
      setResult({ text: deviceRemovalFailure(error), failed: true });
    } finally {
      setStep(null);
      setBusy(false);
      await reload();
    }
  }
  const current = manage && hasDraft(draft);
  // Settings has a place for backups whether or not there are any; elsewhere an empty list is left out.
  if (!backups.length && !current && !result && !manage) return null;
  const listed = listedBackups(backups, all);
  const ask = (next: Step) => { setResult(null); setStep(next); };
  return (
    <section className="rc-stack" aria-label="Device backups" aria-busy={busy}>
      {backups.length > 0 ? (
        <ul className="rc-record-list" id={`${id}-list`}>
          {listed.map((item) => {
            const name = `${draftTitle(item.draft)}, ${draftTime(item.draft)}`;
            return (
              <li key={item.key} className="rc-record-row" data-layout="actions">
                <div className="rc-record-text">
                  <p className="rc-record-title">{draftTitle(item.draft)}</p>
                  <p className="rc-meta">{backupLine(item.draft)}</p>
                </div>
                <div className="rc-action-bar">
                  <button className="rc-button" data-variant="secondary" data-size="sm" type="button"
                    disabled={busy || disabled} aria-label={`Restore ${name}`}
                    onClick={() => ask({ kind: "restore", backup: item })}>
                    Restore
                  </button>
                  <button className="rc-button" data-variant="quiet" data-size="sm" type="button"
                    disabled={busy || disabled} aria-label={`Delete this backup: ${name}`}
                    onClick={() => ask({ kind: "delete", backup: item })}>
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rc-meta">No backups on this device yet.</p>
      )}
      {(backups.length > BACKUPS_SHOWN || current) && (
        <div className="rc-action-bar">
          {backups.length > BACKUPS_SHOWN && (
            <button className="rc-button" data-variant="quiet" data-size="sm" type="button"
              aria-expanded={all} aria-controls={`${id}-list`} onClick={() => setAll((value) => !value)}>
              {all ? "Show fewer backups" : `Show all ${backups.length} backups`}
            </button>
          )}
          {current && (
            <button className="rc-button" data-variant="quiet" data-size="sm" type="button"
              disabled={busy || disabled || !ready} onClick={() => ask({ kind: "current" })}>
              Remove this draft from this device
            </button>
          )}
        </div>
      )}
      {result && (
        <p className="rc-notice" data-tone={result.failed ? "warning" : "info"} role={result.failed ? "alert" : "status"}>
          {result.text}
        </p>
      )}
      <TaskDialog title={TITLES[step?.kind ?? "delete"]} open={!!step} onClose={() => setStep(null)} blockClose={busy}>
        {step && (
          <div className="rc-stack">
            <p>
              {step.kind === "current"
                ? discardWarning(draft)
                : step.kind === "restore"
                  ? restoreWarning(step.backup.draft)
                  : backupDeleteWarning(step.backup.draft)}
            </p>
            {busy && <p role="status">{step.kind === "restore" ? "Restoring" : "Removing"}</p>}
            <div className="rc-action-bar">
              {step.kind === "restore" ? (
                <button className="rc-button" data-variant="primary" type="button" disabled={busy} data-task-focus
                  onClick={() => void run(async () => {
                    await controller.replace(step.backup.draft);
                    return "Device backup restored. The previous draft was backed up first.";
                  })}>
                  Back up this draft and restore
                </button>
              ) : (
                <button className="rc-button" data-variant="danger" type="button" disabled={busy}
                  onClick={() => void run(async () => step.kind === "current"
                    ? discardedMessage(await controller.discardCurrent())
                    : removedBackupMessage(await controller.deleteBackup(step.backup)))}>
                  {step.kind === "current" ? "Remove from this device" : "Delete this backup"}
                </button>
              )}
              <button className="rc-button" data-variant="quiet" type="button" disabled={busy}
                data-task-focus={step.kind === "restore" ? undefined : true} onClick={() => setStep(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </TaskDialog>
    </section>
  );
}
