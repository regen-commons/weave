import { useEffect, useRef, useState } from "react";
import { parseTeamDocument, type SavedInitiative } from "@weave/api/account-contract";
import { accountDocument, saveBlocker } from "../account/document.ts";
import { useDraft } from "../describe/use-draft.ts";
import { TaskDialog } from "../ui/TaskDialog.tsx";
import { saveTeamWorkspace, type TeamSave } from "./team-workspace.ts";

/** Copying a personal draft into a team is a separate explicit save, never a side effect of linking. */
export function SaveDeviceToTeam({ workspaceId, onSaved }: { workspaceId: string; onSaved(saved: SavedInitiative): void }) {
  const { draft } = useDraft();
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [pending, setPending] = useState<TeamSave | null>(null);
  const task = useRef<AbortController | null>(null);
  useEffect(() => () => task.current?.abort(), []);
  if (saveBlocker(draft)) return null;
  async function save() {
    if (busy) return;
    setBusy(true); setError("");
    const controller = new AbortController(); task.current = controller;
    try {
      const command = pending ?? { expectedRevision: 0, requestId: crypto.randomUUID(), document: parseTeamDocument(accountDocument(draft)) };
      setPending(command);
      const saved = await saveTeamWorkspace(workspaceId, command, controller.signal);
      controller.signal.throwIfAborted();
      setPending(null); setOpen(false); onSaved(saved);
    } catch { if (!controller.signal.aborted) setError("The team save could not be confirmed. Retry the same request. Your device card is still here."); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  const document = pending?.document ?? accountDocument(draft);
  return <><button className="rc-button" data-variant="secondary" type="button" onClick={() => setOpen(true)}>Save this device's card to the team</button>
    <TaskDialog title="Save your card to this team" open={open} onClose={() => { if (!busy) setOpen(false); }}>
      <div className="rc-stack"><h3 className="rc-heading" data-size="section">{String(document.initiative.name)}</h3>
        <p>Your teammates will see this checked card, its needs, offers and funding details. Nothing is shared with other initiatives.</p>
        <p>{document.needs.length} needs, {document.offers.length} offers</p>
        <details><summary>Review the saved fields</summary><pre>{JSON.stringify(document, null, 2)}</pre></details>
        <button className="rc-button" data-variant="primary" type="button" disabled={busy} onClick={() => void save()}>{pending ? "Retry the same save" : "Save privately to the team"}</button>
        {error && <p role="alert">{error}</p>}
      </div>
    </TaskDialog></>;
}
