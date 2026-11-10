import { useEffect, useRef, useState } from "react";
import { parseTeamDocument, type AccountDocument, type SavedInitiative, type TeamWorkspaceState } from "@weave/api/account-contract";
import { AccountFailure } from "../account/client.ts";
import { formFromAsk, parseAskForm } from "../intake/state.ts";
import { AskSuggestionSchema, ASK_LIMIT, STATUS, type AskForm, type AskKind } from "../intake/contracts.ts";
import { keepFocusOnPage } from "../ui/focus.ts";
import { AskEditor } from "../ui/AskEditor.tsx";
import { Card, CardGrid } from "../ui/Card.tsx";
import { initialTeamDocument, saveTeamWorkspace, type TeamSave } from "./team-workspace.ts";

type Edit = { kind: AskKind; id: string | null; form: AskForm };

export function TeamEntries({ workspaceId, workspace, online, onSaved, onEditing, onAccessLost }: {
  workspaceId: string;
  workspace: TeamWorkspaceState;
  online: boolean;
  onSaved(saved: SavedInitiative): void;
  onEditing(editing: boolean): void;
  onAccessLost(code: string): void;
}) {
  const saved = workspace.saved;
  const canEdit = workspace.accessRole === "editor" || workspace.accessRole === "admin";
  const [edit, setEdit] = useState<Edit | null>(null);
  const [title, setTitle] = useState(workspace.projectTitle ?? "");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<TeamSave | null>(null);
  const current = useRef<AbortController | null>(null);
  const writing = useRef(false);
  useEffect(() => () => current.current?.abort(), []);
  useEffect(() => { if (notice) keepFocusOnPage(); }, [notice]);
  const frozen = busy || pending !== null;
  function open(kind: AskKind, id: string | null) {
    const item = id ? saved?.document[kind].find((entry) => entry.id === id) : null;
    setEdit({ kind, id, form: formFromAsk(item ? AskSuggestionSchema.parse(item.value) : undefined) });
    setError("");
    setNotice("");
    onEditing(true);
  }
  async function save(command?: TeamSave) {
    if (!edit || !canEdit || !online || writing.current) return;
    let next: TeamSave;
    try {
      const document = saved?.document ?? initialTeamDocument(title);
      const value = parseAskForm(edit.form, edit.kind, true);
      const entries = document[edit.kind];
      if (!edit.id && entries.length >= ASK_LIMIT) throw Error("Five is the limit for each kind.");
      const id = edit.id ?? crypto.randomUUID();
      const updated = edit.id ? entries.map((entry) => entry.id === id ? { id, value } : entry) : [...entries, { id, value }];
      const changed: AccountDocument = parseTeamDocument({ ...document, [edit.kind]: updated });
      next = command ?? { expectedRevision: saved?.revision ?? 0, requestId: crypto.randomUUID(), document: changed };
    } catch {
      setError("Check the title, terms and any amount, then try saving again.");
      return;
    }
    const controller = new AbortController();
    current.current = controller;
    writing.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await saveTeamWorkspace(workspaceId, next, controller.signal);
      if (controller.signal.aborted) return;
      onSaved(result);
      setPending(null);
      setEdit(null);
      onEditing(false);
      setNotice("Saved to the team. Changed entries need review before matching.");
    } catch (cause) {
      if (controller.signal.aborted) return;
      const code = cause instanceof AccountFailure ? cause.code : "";
      if (["workspace_access_required", "not_found", "project_consent_required", "sign_in_required"].includes(code)) {
        onAccessLost(code);
        return;
      }
      if (["connection_failed", "project_workspace_unavailable", "account_unavailable"].includes(code)) {
        setPending(next);
        setError("Saving could not be confirmed. Retry the same save.");
      } else if (code === "project_conflict") {
        setPending(null);
        setError("A teammate changed this workspace. Your edits are still here. Copy them before reloading the page.");
      } else if (code === "workspace_edit_required") {
        setPending(null);
        setError("Your access is now read-only. Your edits are still here for copying.");
      } else {
        setPending(null);
        setError("This entry could not be saved. Your edits are still here.");
      }
    } finally {
      writing.current = false;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return (
    <section className="rc-stack" aria-label="Team needs and offers">
      <p className="rc-meta">{canEdit ? "Saved entries are visible to your team. Choose what to share below." : "You have read-only access."}</p>
      {notice && <p role="status">{notice}</p>}
      {(["needs", "offers"] as const).map((kind) => (
        <section className="rc-stack" key={kind} aria-label={kind === "needs" ? "Team needs" : "Team offers"}>
          <h2 className="rc-heading" data-size="section">{kind === "needs" ? "Needs" : "Offers"}</h2>
          <CardGrid>
            {(saved?.document[kind] ?? []).map((entry) => (
              <li key={entry.id}>
                <Card>
                  <h3 className="rc-card-title">{String(entry.value.title)}</h3>
                  {typeof entry.value.description === "string" && <p>{entry.value.description}</p>}
                  <p className="rc-meta">{STATUS[entry.value.status as keyof typeof STATUS]}</p>
                  {canEdit && !edit && <div className="rc-action-bar">
                    <button className="rc-button" data-variant="quiet" type="button" disabled={!online}
                      aria-label={`Change ${entry.value.title}`} onClick={() => open(kind, entry.id)}>Change</button>
                  </div>}
                </Card>
              </li>
            ))}
          </CardGrid>
          {!(saved?.document[kind].length) && <p>{kind === "needs" ? "No needs saved yet." : "No offers saved yet."}</p>}
          {canEdit && !edit && (saved?.document[kind].length ?? 0) < ASK_LIMIT && (
            <div className="rc-action-bar">
              <button className="rc-button" data-variant="secondary" type="button" disabled={!online}
                onClick={() => open(kind, null)}>{kind === "needs" ? "Add a need" : "Add an offer"}</button>
            </div>
          )}
        </section>
      ))}
      {canEdit && edit && (
        <section className="rc-stack" aria-label="Edit team entry">
          {!saved && !workspace.projectTitle && <div className="rc-field">
            <label htmlFor="team-title">Initiative name</label>
            <input className="rc-input" id="team-title" value={title} maxLength={200} disabled={frozen}
              onChange={(event) => setTitle(event.target.value)} />
          </div>}
          <AskEditor kind={edit.kind} value={edit.form} error={error} disabled={frozen || !online}
            saveLabel="Save to team privately"
            onChange={(form) => setEdit({ ...edit, form })}
            onSave={() => void save()}
            onCancel={() => { setEdit(null); setError(""); onEditing(false); }} />
          {pending && <div className="rc-action-bar">
            <button className="rc-button" data-variant="primary" type="button" disabled={busy || !online}
              onClick={() => void save(pending)}>Retry save</button>
          </div>}
        </section>
      )}
    </section>
  );
}
