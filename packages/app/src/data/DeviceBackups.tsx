import { useEffect, useId, useState } from "react";
import { useDraft } from "../describe/use-draft.ts";
import { hasDraft } from "../describe/view.ts";
import type { DraftBackup } from "../describe/repository.ts";
import {
  attachedFiles,
  backupDeleteWarning,
  deviceRemovalFailure,
  discardedMessage,
  discardWarning,
  draftTime,
  draftTitle,
  removedBackupMessage,
} from "../describe/device-removal.ts";
import { TaskDialog } from "../ui/TaskDialog.tsx";

/**
 * This browser's backups. Each one restores after backing up the current draft. With `manage`,
 * each can also be deleted for good, and the current draft removed after it is kept as a backup.
 * Every removal names exactly what it shows: the stored key and the draft's ID, revision and time.
 */
export function DeviceBackups({ manage = false, disabled = false }: { manage?: boolean; disabled?: boolean }) {
  const id = useId();
  const { controller, draft, ready } = useDraft();
  const [backups, setBackups] = useState<DraftBackup[]>([]);
  const [restoring, setRestoring] = useState<DraftBackup | null>(null);
  const [removing, setRemoving] = useState<{ kind: "backup"; backup: DraftBackup } | { kind: "current" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ text: string; failed: boolean } | null>(null);
  const reload = () => controller.backups().then(setBackups, () => {});
  useEffect(() => { void reload(); }, [controller, draft.id]);
  async function run(action: () => Promise<string>) {
    if (busy) return;
    setBusy(true);
    setResult(null);
    try {
      setResult({ text: await action(), failed: false });
    } catch (error) {
      setResult({ text: deviceRemovalFailure(error), failed: true });
    } finally {
      setRemoving(null);
      setBusy(false);
      await reload();
    }
  }
  const current = manage && hasDraft(draft);
  if (!backups.length && !current && !result) return null;
  return (
    <section className="rc-stack" aria-labelledby={`${id}-backups`} aria-busy={busy}>
      <h3 className="rc-heading" data-size="section" id={`${id}-backups`}>
        Device backups
      </h3>
      <p>
        These drafts and their files are kept only in this browser. Restoring one backs up the current
        draft first.
      </p>
      {backups.length > 0 && (
        <ul className="rc-stack">
          {backups.map((item) => (
            <li key={item.key} className="rc-stack">
              <div className="rc-action-bar">
                <button className="rc-button" data-variant="secondary" type="button" disabled={busy || disabled}
                  onClick={() => { setRestoring(item); setResult(null); }}>
                  Restore {draftTitle(item.draft)}, {draftTime(item.draft)}
                </button>
                {manage && (
                  <button className="rc-button" data-variant="quiet" type="button" disabled={busy || disabled}
                    aria-label={`Delete the backup ${draftTitle(item.draft)}, ${draftTime(item.draft)}`}
                    onClick={() => { setRestoring(null); setResult(null); setRemoving({ kind: "backup", backup: item }); }}>
                    Delete this backup
                  </button>
                )}
              </div>
              {attachedFiles(item.draft) > 0 && (
                <p className="rc-meta">
                  {attachedFiles(item.draft) === 1 ? "1 attached file" : `${attachedFiles(item.draft)} attached files`}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      {restoring && (
        <div className="rc-action-bar">
          <button className="rc-button" data-variant="primary" type="button" disabled={busy}
            onClick={() => void run(async () => {
              await controller.replace(restoring.draft);
              setRestoring(null);
              return "Device backup restored. The previous draft was backed up first.";
            })}>
            Back up this draft and restore
          </button>
          <button className="rc-button" data-variant="quiet" type="button" disabled={busy} onClick={() => setRestoring(null)}>
            Cancel restoring
          </button>
        </div>
      )}
      {current && (
        <div className="rc-action-bar">
          <button className="rc-button" data-variant="quiet" type="button" disabled={busy || disabled || !ready}
            onClick={() => { setRestoring(null); setResult(null); setRemoving({ kind: "current" }); }}>
            Remove this draft from this device
          </button>
        </div>
      )}
      {result && (
        <p className="rc-notice" data-tone={result.failed ? "warning" : "info"} role={result.failed ? "alert" : "status"}>
          {result.text}
        </p>
      )}
      <TaskDialog
        title={removing?.kind === "current" ? "Remove this draft from this device?" : "Delete this backup?"}
        open={!!removing}
        onClose={() => setRemoving(null)}
        blockClose={busy}
      >
        {removing && (
          <div className="rc-stack">
            <p>{removing.kind === "current" ? discardWarning(draft) : backupDeleteWarning(removing.backup.draft)}</p>
            {busy && <p role="status">Removing</p>}
            <div className="rc-action-bar">
              <button className="rc-button" data-variant="danger" type="button" disabled={busy}
                onClick={() => void run(async () => removing.kind === "current"
                  ? discardedMessage(await controller.discardCurrent())
                  : removedBackupMessage(await controller.deleteBackup(removing.backup)))}>
                {removing.kind === "current" ? "Remove from this device" : "Delete this backup"}
              </button>
              <button className="rc-button" data-variant="quiet" type="button" disabled={busy} data-task-focus
                onClick={() => setRemoving(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </TaskDialog>
    </section>
  );
}
