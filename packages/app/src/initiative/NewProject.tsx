import { useEffect, useRef, useState } from "react";
import { uuid } from "@weave/api/account-contract";
import { AccountFailure } from "../account/client.ts";
import { useAccount } from "../account/context.tsx";
import { useDraft } from "../describe/use-draft.ts";
import { navigate } from "../router.tsx";
import { teamWorkspacePath } from "../routes.ts";
import { parsePendingProjectCreate, projectCreationKey, submitProjectCreate, type PendingProjectCreate } from "./project-creation.ts";
import { projectRequest } from "./projects-client.ts";
import { ConsentButton } from "./ProjectConsent.tsx";
const messageFor = (error: unknown) => error instanceof AccountFailure && error.code === "project_consent_required"
  ? "Allow Weave to create this Certified project to continue."
  : error instanceof AccountFailure && error.code === "group_handle_in_use"
    ? "That address is already in use. Check your existing projects before using another editor."
    : "Project creation could not be confirmed. Your saved work is still here.";

/** Reconcile a stored legacy intent. This screen cannot initiate new public creation. */
export function NewProject({ onDone }: { onDone(): void }) {
  const { state } = useAccount();
  const { draft } = useDraft();
  const pendingKey = projectCreationKey(state!.user!.id,draft.id);
  const [pending, setPending] = useState<PendingProjectCreate | null>(() => {
    try {
      return parsePendingProjectCreate(JSON.parse(window.sessionStorage.getItem(pendingKey) ?? "null"));
    } catch { /* A corrupt pending request cannot create a project. */ }
    return null;
  });
  const task = useRef<AbortController | null>(null);
  useEffect(() => () => task.current?.abort(), []);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [consent, setConsent] = useState(false);
  async function create() {
    if (!pending || !state?.user || busy) return;
    setBusy(true); setError("");
    const current = new AbortController(); task.current = current;
    try {
      const { result, command } = await submitProjectCreate({ owner: state.user.id, draftId: draft.id, groupLabel: pending.groupLabel,
        profile: pending.publicProfile, storage: window.sessionStorage, resumeOnly: true,
        save: async () => { throw Error("Only the earlier request can be resumed."); }, request: command => projectRequest(command, current.signal), signal: current.signal });
      setPending(result.status === "linked" && uuid(result.workspaceId) ? null : command);
      if (result.status === "linked" && uuid(result.workspaceId)) { window.sessionStorage.removeItem(pendingKey); onDone(); navigate(teamWorkspacePath(result.workspaceId)); }
      else setError("Certified is still confirming the project. Check again with the same request.");
    } catch (cause) {
      if (current.signal.aborted) return;
      try { setPending(parsePendingProjectCreate(JSON.parse(window.sessionStorage.getItem(pendingKey) ?? "null"))); } catch { /* Keep the earlier request visible. */ }
      setConsent(cause instanceof AccountFailure && cause.code === "project_consent_required");
      setError(cause instanceof AccountFailure ? messageFor(cause) : cause instanceof Error ? cause.message : messageFor(cause));
    } finally { if (!current.signal.aborted) setBusy(false); }
  }
  if (!pending) return <p role="alert">{error || "The earlier creation request could not be read. Check your projects on Certified before creating anything else. Your device work is still here."}</p>;
  return <form className="rc-stack" onSubmit={event => { event.preventDefault(); void create(); }}>
    <h3 className="rc-heading" data-size="section">Check the earlier creation</h3>
    <p>An earlier Weave request may already have created {pending.publicProfile.title}. Check it before using another editor.</p>
    <details><summary className="rc-footer-link">Earlier request details</summary>
      <p>{pending.publicProfile.description}</p><p>{pending.groupLabel}</p>
    </details>
    <button className="rc-button" data-variant="primary" type="submit" disabled={busy}>Check creation again</button>
    {consent && <ConsentButton action="create-project" />}
    {error && <p role="status">{error}</p>}
  </form>;
}
