import { useEffect, useId, useRef, useState } from "react";
import { invitationDate, invitationStatuses, inviteToken, pendingInviteKey, pendingWorkspaceInvite, workspaceInvitations, type WorkspaceInvitation } from "./workspace-access-state.ts";
import { useAccount } from "../account/context.tsx";
import { AccountFailure } from "../account/client.ts";
import { ConsentButton } from "./ProjectConsent.tsx";
import { projectRequest } from "./projects-client.ts";

/** Access is reviewed per workspace. A pending link neither adds a group member nor grants access. */
export function WorkspaceAccess({ workspaceId, projectUri }: { workspaceId: string; projectUri: string }) {
  const { state } = useAccount();
  return state?.user ? <AccountWorkspaceAccess key={`${state.user.id}/${workspaceId}`} workspaceId={workspaceId} projectUri={projectUri} /> : null;
}
function AccountWorkspaceAccess({ workspaceId, projectUri }: { workspaceId: string; projectUri: string }) {
  const linkId = useId();
  const [invitations, setInvitations] = useState<WorkspaceInvitation[]>([]), [cursor, setCursor] = useState<string>();
  const [link, setLink] = useState(""), [expires, setExpires] = useState("");
  const [did, setDid] = useState(""), [role, setRole] = useState<"viewer" | "editor" | "admin">("editor");
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  const [consent, setConsent] = useState(false), [wider, setWider] = useState(false);
  const task = useRef<AbortController | null>(null);
  useEffect(() => () => task.current?.abort(), []);
  async function run(action: string, extra: Record<string, unknown> = {}) {
    if (busy || task.current) return;
    setBusy(true); setNotice(""); setConsent(false);
    const controller = new AbortController(); task.current = controller;
    try {
      const result = await projectRequest({ action, workspaceId, projectUri, ...extra }, controller.signal);
      controller.signal.throwIfAborted();
      if (action === "list_invites") {
        const page = workspaceInvitations(result, typeof extra.cursor === "string" ? extra.cursor : undefined);
        setInvitations(current => extra.cursor ? [...new Map([...current, ...page.invitations].map(item => [item.inviteId, item])).values()] : page.invitations);
        setCursor(page.cursor);
      } else if (action === "create_invite") {
        if (!inviteToken(result.token) || typeof result.expiresAt !== "string" || !Number.isFinite(Date.parse(result.expiresAt))) throw Error();
        setLink(`${window.location.origin}/your-initiatives#invite=${result.token}`); setExpires(result.expiresAt);
      } else {
        setWider(false);
        setNotice(result.status === "already_reviewed" ? "This request has already been reviewed. Check the invitations again for its current status." : "Access updated.");
        if ((action === "approve_invite" || action === "revoke_invite") && result.status !== "already_reviewed")
          setInvitations(current => current.map(item => item.inviteId === extra.inviteId
            ? { ...item, status: action === "approve_invite" ? "approved" : "revoked" } : item));
      }
    } catch (cause) {
      if (controller.signal.aborted) return;
      if (cause instanceof AccountFailure && cause.code === "project_consent_required") setConsent(true);
      if (cause instanceof AccountFailure && cause.code === "certified_membership_required") {
        setWider(true); setNotice("This person must join the Certified group before receiving workspace access.");
      } else setNotice(action === "create_invite"
        ? "Invitation creation could not be confirmed. Review the invitations before creating another."
        : "Access could not be updated. Check the identity and try again.");
    } finally {
      if (task.current === controller) { task.current = null; if (!controller.signal.aborted) setBusy(false); }
    }
  }
  return <details className="rc-stack"><summary>Manage teammates</summary>
    <p>Teammates need Certified group membership and a separate Weave workspace grant.</p>
    <label className="rc-field">Teammate's Certified DID<input className="rc-input" value={did} maxLength={261} disabled={busy}
      onChange={(e) => { setDid(e.target.value.trim()); setWider(false); }} /></label>
    <label className="rc-field">Workspace access<select className="rc-input" value={role} disabled={busy}
      onChange={(e) => setRole(e.target.value as typeof role)}><option value="viewer">View</option><option value="editor">Edit</option><option value="admin">Admin</option></select></label>
    <div className="rc-action-bar"><button className="rc-button" data-variant="secondary" disabled={busy || !did}
      onClick={() => void run("grant_access", { recipientDid: did, accessRole: role })}>Grant workspace access</button>
      <button className="rc-button" data-variant="quiet" disabled={busy || !did}
        onClick={() => void run("revoke_access", { recipientDid: did })}>Remove workspace access</button></div>
    {wider && <section className="rc-notice" data-tone="warning"><div className="rc-notice-body">
      <p>Adding {did} to the Certified group also lets them create records under the group identity across its projects.</p>
      <p>Only a Certified group admin or owner can approve this wider permission.</p>
      <ConsentButton action="add-member" />
      <button className="rc-button" data-variant="secondary" disabled={busy || !did}
        onClick={() => void run("add_member_and_grant", { recipientDid: did, accessRole: role, confirmGroupPermissions: true })}>Add to Certified group and grant workspace access</button>
    </div></section>}
    <div className="rc-action-bar"><button className="rc-button" data-variant="secondary" disabled={busy}
      onClick={() => void run("create_invite")}>Create a pending invitation</button>
      <button className="rc-button" data-variant="quiet" disabled={busy} onClick={() => void run("list_invites")}>Review invitations</button></div>
    {link && <div className="rc-field"><label htmlFor={linkId}>Invitation link</label>
      <input id={linkId} className="rc-input" value={link} readOnly onFocus={(e) => e.target.select()} />
      <p className="rc-hint">Expires {invitationDate(expires)}. Share this link with the person yourself. It grants no access.</p></div>}
    <ul className="rc-ask-summary">{invitations.map((i) => <li key={i.inviteId}>
      <p>{i.claimedDid ?? "Waiting for a Certified identity"}</p><p className="rc-meta">{invitationStatuses[i.status]}, expires {invitationDate(i.expiresAt)}</p>
      <div className="rc-action-bar">{i.claimedDid && i.status === "claimed" && <button className="rc-button" data-variant="secondary" disabled={busy}
        onClick={() => void run("approve_invite", { inviteId: i.inviteId, recipientDid: i.claimedDid, accessRole: role })}>Approve {role} access for this identity</button>}
        {["pending", "claimed"].includes(i.status) && <button className="rc-button" data-variant="quiet" disabled={busy}
          onClick={() => void run("revoke_invite", { inviteId: i.inviteId })}>Revoke invitation</button>}</div>
    </li>)}</ul>
    {cursor && <button className="rc-button" data-variant="quiet" disabled={busy} onClick={() => void run("list_invites", { cursor })}>More invitations</button>}
    {consent && <ConsentButton action="workspace-members" />}{notice && <p role="status">{notice}</p>}
  </details>;
}

export function PendingInvite() {
  const { state } = useAccount();
  return <AccountPendingInvite key={state?.user?.id ?? "signed-out"} />;
}
function AccountPendingInvite() {
  const { state } = useAccount();
  const [initial] = useState(() => pendingWorkspaceInvite(window.location.hash, () => window.sessionStorage,
    () => window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search)));
  const [token, setToken] = useState(initial.token);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const task = useRef<AbortController | null>(null);
  useEffect(() => () => task.current?.abort(), []);
  if (!token && !message) return null;
  async function claim() {
    if (!state?.user || busy || task.current || !token) return;
    setBusy(true);
    const controller = new AbortController(); task.current = controller;
    try {
      const result = await projectRequest({ action: "claim_invite", token }, controller.signal);
      controller.signal.throwIfAborted();
      if (result.status !== "pending_review") throw Error();
      try { window.sessionStorage.removeItem(pendingInviteKey); } catch { /* A confirmed claim does not depend on device cleanup. */ }
      try { window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search); } catch { /* The identity claim is already confirmed. */ }
      setToken(null);
      setMessage("Your Certified identity is ready for the admin to review. No team access has been granted yet.");
    } catch { if (!controller.signal.aborted) setMessage("This invitation could not be claimed. Ask the admin for a current link."); }
    finally {
      if (task.current === controller) { task.current = null; if (!controller.signal.aborted) setBusy(false); }
    }
  }
  return <section className="rc-stack" aria-label="Workspace invitation">
    {token && <p>{state?.user ? "Send your signed-in Certified identity to the admin for review." : "Sign in with Certified to request access from this invitation."}</p>}
    {token && !state?.user && !initial.persisted && <p role="status">This device cannot keep the invitation through sign-in. Sign in first, then reopen the original invitation link.</p>}
    {token && state?.user && <button className="rc-button" data-variant="primary" disabled={busy} onClick={() => void claim()}>Request team access</button>}
    {message && <p role="status">{message}</p>}
  </section>;
}
