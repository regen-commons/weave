import { useEffect, useRef, useState } from "react";
import { parseTeamDocument, type SavedInitiative } from "@weave/api/account-contract";
import { accountDocument, saveBlocker } from "../account/document.ts";
import { useDraft } from "../describe/use-draft.ts";
import { InitiativeRecord } from "../initiative/InitiativeRecord.tsx";
import { TaskDialog } from "../ui/TaskDialog.tsx";
import { documentCard, saveTeamWorkspace, type TeamSave } from "./team-workspace.ts";

/** Copying a personal draft into a team is a separate explicit save, never a side effect of linking. */
export function SaveDeviceToTeam({ workspaceId, onSaved, primary = false }: {
  workspaceId: string; onSaved(saved: SavedInitiative): void;
  /** The next step when this device's card was linked to the workspace's project. */
  primary?: boolean;
}) {
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
  // A retry sends the request it started with, so the review shows that document.
  const document = pending?.document ?? accountDocument(draft);
  const card = documentCard(document);
  return <><button className="rc-button" data-variant={primary ? "primary" : "secondary"} type="button" onClick={() => setOpen(true)}>Save your card to this team</button>
    <TaskDialog title="Save your card to this team" open={open} onClose={() => { if (!busy) setOpen(false); }}>
      <div className="rc-stack"><h3 className="rc-heading" data-size="section">{String(document.initiative.name)}</h3>
        <p>Teammates with access will see this card and its funding details. Nothing is shared outside the team.</p>
        {card && <InitiativeRecord named={false} team fields={card.fields} needs={card.needs} offers={card.offers} />}
        <div className="rc-action-bar">
          <button className="rc-button" data-variant="primary" type="button" disabled={busy} onClick={() => void save()}>{pending ? "Retry the same save" : "Save to team workspace"}</button>
        </div>
        {error && <p role="alert">{error}</p>}
      </div>
    </TaskDialog></>;
}
