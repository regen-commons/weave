import { useEffect, useId, useRef, useState } from "react";
import { uuid } from "@weave/api/account-contract";
import { AccountFailure } from "../account/client.ts";
import { useAccount } from "../account/context.tsx";
import { useDraft } from "../describe/use-draft.ts";
import { navigate } from "../router.tsx";
import { pathTo, teamWorkspacePath } from "../routes.ts";
import { ButtonLink } from "../ui/ButtonLink.tsx";
import { saveForProject } from "./project-save.ts";
import { parsePendingProjectCreate, projectCreationKey, projectGroupPattern, proposeProjectGroupLabel, submitProjectCreate, type PendingProjectCreate } from "./project-creation.ts";
import { projectRequest } from "./projects-client.ts";
import { ConsentButton } from "./ProjectConsent.tsx";
const messageFor = (error: unknown) => error instanceof AccountFailure && error.code === "project_consent_required"
  ? "Allow Weave to create this Certified project to continue."
  : error instanceof AccountFailure && error.code === "group_handle_in_use"
    ? "That address is already in use. Change the address and try again."
    : "Project creation could not be confirmed. Your saved work is still here.";

export function NewProject({ onDone }: { onDone(): void }) {
  const { state } = useAccount();
  const { draft, controller } = useDraft();
  const pendingKey = projectCreationKey(state!.user!.id,draft.id);
  const [pending, setPending] = useState<PendingProjectCreate | null>(() => {
    try {
      return parsePendingProjectCreate(JSON.parse(window.sessionStorage.getItem(pendingKey) ?? "null"));
    } catch { /* A corrupt pending request cannot create a project. */ }
    return null;
  });
  const [changingAddress, setChangingAddress] = useState(false);
  const [label, setLabel] = useState(() => pending?.groupLabel ?? proposeProjectGroupLabel(draft.confirmed?.name ?? "initiative"));
  const task = useRef<AbortController | null>(null);
  useEffect(() => () => task.current?.abort(), []);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [consent, setConsent] = useState(false);
  const field = useId();
  async function create() {
    if ((!pending && !draft.confirmed) || !state?.user || busy) return;
    setBusy(true); setError("");
    const current = new AbortController(); task.current = current;
    try {
      const { result, command } = await submitProjectCreate({ owner: state.user.id, draftId: draft.id, groupLabel: label,
        profile: { title: draft.confirmed?.name ?? "", description: draft.confirmed?.description ?? "" }, storage: window.sessionStorage,
        save: () => saveForProject(controller, state.user!.id, current.signal), request: command => projectRequest(command, current.signal), signal: current.signal });
      setPending(result.status === "linked" ? null : command);
      if (result.status === "linked" && uuid(result.workspaceId)) { window.sessionStorage.removeItem(pendingKey); onDone(); navigate(teamWorkspacePath(result.workspaceId)); }
      else setError("Certified is still confirming the project. Check again with the same request.");
    } catch (cause) {
      if (current.signal.aborted) return;
      try { setPending(parsePendingProjectCreate(JSON.parse(window.sessionStorage.getItem(pendingKey) ?? "null"))); } catch { /* Keep the earlier request visible. */ }
      setConsent(cause instanceof AccountFailure && cause.code === "project_consent_required");
      setError(cause instanceof AccountFailure ? messageFor(cause) : cause instanceof Error ? cause.message : messageFor(cause));
    } finally { if (!current.signal.aborted) setBusy(false); }
  }
  const publicProfile = pending?.publicProfile ?? {title:draft.confirmed?.name.trim() ?? "",description:draft.confirmed?.description.trim() ?? ""};
  if (!pending && !draft.confirmed) return <ButtonLink href={pathTo("initiative")} variant="primary">Describe your initiative first</ButtonLink>;
  const tooLong = !pending && ([...publicProfile.title].length > 80 || [...publicProfile.description].length > 800);
  return <form className="rc-stack" onSubmit={event => { event.preventDefault(); void create(); }}><h3 className="rc-heading" data-size="section">{publicProfile.title}</h3>
    <p>{publicProfile.description}</p><p>These details become public on Certified in a new group with you as owner. Your needs and offers stay private.</p>
    <details open={changingAddress} onToggle={event => setChangingAddress(event.currentTarget.open)}><summary className="rc-footer-link">Change the address</summary>
    <div className="rc-field">
      <label htmlFor={field}>Short name for the group's web address</label>
      <p className="rc-hint" id={`${field}-hint`}>3 to 32 lowercase letters, numbers or hyphens. Start with a letter and end with a letter or number.</p>
      <input className="rc-input" id={field} aria-describedby={`${field}-hint`} value={label} disabled={busy || pending !== null}
        required minLength={3} maxLength={32} pattern={projectGroupPattern} onChange={(e) => setLabel(e.target.value)} />
    </div></details>
    <button className="rc-button" data-variant="primary" type="submit" disabled={busy || tooLong}>
      {pending ? "Check creation again" : "Save privately and create project"}</button>
    {consent && <ConsentButton action="create-project" />}
    {tooLong && <p>Use a project name of 80 characters or fewer and a description of 800 characters or fewer.</p>}
    {error && <p role="status">{error}</p>}
  </form>;
}
