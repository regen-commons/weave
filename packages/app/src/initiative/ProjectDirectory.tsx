import { useEffect, useRef, useState } from "react";
import { record, uuid } from "@weave/api/account-contract";
import { AccountSection } from "../account/AccountSection.tsx";
import { AccountFailure } from "../account/client.ts";
import { useAccount } from "../account/context.tsx";
import { connectPersonalProject, loadPersonalProject, saveForProject } from "./project-save.ts";
import { clearRejectedProjectCreate, parsePendingProjectCreate, projectCreationKey, projectGroupPattern, publicProjectProfile, validProjectGroupLabel, type PendingProjectCreate } from "./project-creation.ts";
import { accountKey } from "../account/document.ts";
import { useDraft } from "../describe/use-draft.ts";
import { navigate } from "../router.tsx";
import { pathTo, teamWorkspacePath } from "../routes.ts";
import { ButtonLink } from "../ui/ButtonLink.tsx";
import { Heading } from "../ui/Heading.tsx";
import { TaskDialog } from "../ui/TaskDialog.tsx";
import { projectPage, projectRequest, setupPage, workspacePage,
  type PublicProject, type SetupListing, type WorkspaceListing } from "./projects-client.ts";

import { ConsentButton } from "./ProjectConsent.tsx";
import { PendingInvite } from "./WorkspaceAccess.tsx";

type Group = { groupDid: string; role: "owner" | "admin" | "member" };
const messageFor = (error: unknown) => error instanceof AccountFailure && error.code === "project_consent_required"
  ? "Allow Weave to check your Certified groups to continue."
  : error instanceof AccountFailure && error.code === "project_pilot_access_required"
    ? "Project connections are limited to the pilot accounts."
    : "Projects could not be checked. Your saved work is still here.";

/** Public project metadata and authorized workspace links only. Team documents load on their own route. */
export function ProjectDirectory({ pick }: { pick?: (project: PublicProject, role?: Group["role"]) => void }) {
  const { state } = useAccount();
  return state?.user ? <AccountProjects key={state.user.id} pick={pick} /> : null;
}
function AccountProjects({ pick }: { pick?: (project: PublicProject, role?: Group["role"]) => void }) {
  const { state } = useAccount();
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupCursor, setGroupCursor] = useState<string>();
  const [target, setTarget] = useState("personal");
  const [certifiedRole, setCertifiedRole] = useState<Group["role"]>();
  const [projects, setProjects] = useState<PublicProject[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceListing[]>([]);
  const [workspaceCursor, setWorkspaceCursor] = useState<string>();
  const [cursor, setCursor] = useState<string>();
  const [setups, setSetups] = useState<SetupListing[]>([]);
  const [setupCursor, setSetupCursor] = useState<string>();
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [consent, setConsent] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const alive = useRef<AbortController | null>(null);
  const user = state?.user?.id;
  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    alive.current = controller;
    setBusy(true); setError(""); setConsent(false); setProjects([]); setCursor(undefined);
    setSetups([]); setSetupCursor(undefined); setCertifiedRole(undefined);
    const read = (body: unknown) => projectRequest(body, controller.signal);
    const loading = target === "personal" ? { kind: "personal" } : { kind: "group", groupDid: target };
    void Promise.allSettled([read({ action: "list_projects", target: loading }), read({ action: "list_workspaces" }),
      read({ action: "list_project_groups" })]).then(async ([p, w, g]) => {
      if (controller.signal.aborted) return;
      const failures: unknown[] = [];
      let role: Group["role"] | undefined;
      try {
        if (p.status === "rejected") throw p.reason;
        const page = projectPage(p.value); role = page.certifiedRole;
        setProjects(page.projects); setCursor(page.cursor); setCertifiedRole(role);
      } catch (cause) { failures.push(cause); }
      try {
        if (w.status === "rejected") throw w.reason;
        const saved = workspacePage(w.value);
        setWorkspaces(saved.workspaces); setWorkspaceCursor(saved.cursor);
      } catch (cause) { failures.push(cause); }
      try {
        if (g.status === "rejected") throw g.reason;
        if (!Array.isArray(g.value.groups) || g.value.groups.length > 100) throw Error();
        const items = g.value.groups.map((value): Group => {
          const group = record(value);
          if (typeof group.groupDid !== "string" || !["owner", "admin", "member"].includes(String(group.role))) throw Error();
          return { groupDid: group.groupDid, role: group.role as Group["role"] };
        });
        setGroups((previous) => [...new Map([...previous, ...items].map((item) => [item.groupDid, item])).values()]);
        setGroupCursor(typeof g.value.cursor === "string" ? g.value.cursor : undefined);
      } catch (cause) { failures.push(cause); }
      if (target !== "personal" && (role === "owner" || role === "admin")) {
        try {
          const pending = setupPage(await read({ action:"list_workspaces", setupGroupDid:target }), target);
          if (controller.signal.aborted) return;
          setSetups(pending.requests); setSetupCursor(pending.cursor);
        } catch (cause) { failures.push(cause); }
      }
      if (controller.signal.aborted) return;
      if (failures.length) {
        const needsConsent = failures.find(cause => cause instanceof AccountFailure && cause.code === "project_consent_required");
        setError(messageFor(needsConsent ?? failures[0])); setConsent(!!needsConsent);
      }
    }).catch((cause) => {
      if (controller.signal.aborted) return;
      setError(messageFor(cause));
      setConsent(cause instanceof AccountFailure && cause.code === "project_consent_required");
    }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [user, target, attempt]);
  async function more(kind: "projects" | "workspaces" | "groups" | "setups") {
    if (busy) return;
    setBusy(true); setError("");
    const signal = alive.current?.signal;
    try {
      if (kind === "projects") {
        const result = projectPage(await projectRequest({ action: "list_projects", cursor,
          target: target === "personal" ? { kind: "personal" } : { kind: "group", groupDid: target } }, signal));
        if (signal?.aborted) return;
        setProjects((previous) => [...new Map([...previous, ...result.projects].map((p) => [p.uri, p])).values()]); setCursor(result.cursor);
      } else if (kind === "workspaces") {
        const result = workspacePage(await projectRequest({ action: "list_workspaces", cursor: workspaceCursor }, signal));
        if (signal?.aborted) return;
        setWorkspaces((previous) => [...new Map([...previous, ...result.workspaces].map((w) => [w.workspaceId, w])).values()]);
        setWorkspaceCursor(result.cursor);
      } else if (kind === "setups") {
        const result = setupPage(await projectRequest({action:"list_workspaces",setupGroupDid:target,setupCursor},signal),target);
        if (signal?.aborted) return;
        setSetups(previous => [...new Map([...previous,...result.requests].map(item => [item.requestId,item])).values()]);
        setSetupCursor(result.cursor);
      } else {
        const result = await projectRequest({ action: "list_project_groups", cursor: groupCursor }, signal);
        if (signal?.aborted) return;
        if (!Array.isArray(result.groups) || result.groups.length > 100) throw Error();
        const next = result.groups.map((value) => record(value)).map((g) => {
          if (typeof g.groupDid !== "string" || !["owner", "admin", "member"].includes(String(g.role))) throw Error();
          return { groupDid: g.groupDid, role: g.role as Group["role"] };
        });
        setGroups((previous) => [...new Map([...previous, ...next].map((g) => [g.groupDid, g])).values()]);
        setGroupCursor(typeof result.cursor === "string" ? result.cursor : undefined);
      }
    } catch (cause) { if (!signal?.aborted) setError(messageFor(cause)); }
    finally { if (!signal?.aborted) setBusy(false); }
  }
  async function approve(request: SetupListing) {
    if (busy) return;
    const signal = alive.current?.signal;
    setBusy(true); setError("");
    try {
      const result = await projectRequest({action:"approve_setup",projectUri:request.projectUri,requestId:request.requestId},signal);
      if (signal?.aborted) return;
      if (result.status === "linked" && uuid(result.workspaceId)) navigate(teamWorkspacePath(result.workspaceId));
      else setError("This project already has a workspace. Ask its workspace admin for access.");
    } catch (cause) { if (!signal?.aborted) setError(messageFor(cause)); }
    finally { if (!signal?.aborted) setBusy(false); }
  }
  if (!user) return null;
  return <section className="rc-stack" aria-label="Certified projects" aria-busy={busy}>
    {workspaces.length > 0 && !pick && <>
      <h2 className="rc-heading" data-size="section">Team workspaces</h2>
      <ul className="rc-card-grid">{workspaces.map((w) => <li key={w.workspaceId}>
        <article className="rc-card" data-layout="listing"><h3 className="rc-card-title">{w.project?.title ?? "Project unavailable on Certified"}</h3>
          <p className="rc-card-meta">{w.kind === "group" ? `Team workspace, ${w.accessRole}` : "Personal project"}</p>
          {w.status==="paused" && <p>Matching is paused. Open your private work to review it or withdraw public support listings.</p>}
          {w.kind === "group" ? <ButtonLink href={teamWorkspacePath(w.workspaceId)} variant="secondary">Open</ButtonLink>
            : <OpenPersonalWorkspace workspace={w} />}
        </article></li>)}</ul>
    </>}
    {workspaceCursor && !pick && <button className="rc-button" data-variant="quiet" disabled={busy} onClick={() => void more("workspaces")}>More workspaces</button>}
    <h2 className="rc-heading" data-size="section">On Certified</h2>
    <label className="rc-field">Project owner
      <select className="rc-input" value={target} disabled={busy} onChange={(event) => setTarget(event.target.value)}>
        <option value="personal">Your personal projects</option>
        {groups.map((g) => <option key={g.groupDid} value={g.groupDid}>{g.groupDid}, {g.role}</option>)}
      </select>
    </label>
    {groupCursor && <button className="rc-button" data-variant="quiet" disabled={busy} onClick={() => void more("groups")}>More groups</button>}
    <ul className="rc-card-grid">{projects.map((p) => <li key={p.uri}><article className="rc-card" data-layout="listing">
      <h3 className="rc-card-title">{p.title}</h3>{p.description && <p>{p.description}</p>}
      <div className="rc-action-bar">{pick ? <button className="rc-button" data-variant="secondary" type="button"
        onClick={() => pick(p, p.groupDid ? certifiedRole : undefined)}>Use this project</button>
        : <ConnectProject project={p} role={p.groupDid ? certifiedRole : undefined} />}</div>
    </article></li>)}</ul>
    {!busy && !error && projects.length === 0 && <p>No projects found for this owner.</p>}
    {cursor && <button className="rc-button" data-variant="quiet" disabled={busy} onClick={() => void more("projects")}>More projects</button>}
    {(setups.length > 0 || setupCursor) && <section className="rc-stack" aria-label="Pending workspace requests">
      <h2 className="rc-heading" data-size="section">Workspace requests</h2>
      <ul className="rc-stack">{setups.map(request => <li key={request.requestId}><article className="rc-card" data-layout="listing">
        <h3 className="rc-card-title">{request.project.title}</h3>
        <p>A member requested a workspace for this public project. Approval creates its team workspace with you as the first workspace admin.</p>
        <button className="rc-button" data-variant="secondary" type="button" disabled={busy} onClick={() => void approve(request)}>Approve workspace</button>
      </article></li>)}</ul>
      {setupCursor && <button className="rc-button" data-variant="quiet" type="button" disabled={busy} onClick={() => void more("setups")}>More requests</button>}
    </section>}
    {busy && <p role="status">Checking Certified projects</p>}
    {error && <p role="status">{error}</p>}
    {consent ? <ConsentButton action="membership" /> : error && <button className="rc-button" data-variant="secondary" onClick={() => setAttempt((n) => n + 1)}>Try again</button>}
  </section>;
}


function OpenPersonalWorkspace({ workspace }: { workspace: WorkspaceListing }) {
  const { state } = useAccount(), { controller } = useDraft();
  const [open,setOpen] = useState(false), [busy,setBusy] = useState(false), [error,setError] = useState("");
  const task = useRef<AbortController | null>(null);
  useEffect(() => () => task.current?.abort(), []);
  async function load() {
    if (!state?.user || busy) return;
    const current = new AbortController(); task.current = current;
    setBusy(true); setError("");
    try {
      await loadPersonalProject(controller,workspace.workspaceId,state.user.id,current.signal);
      current.signal.throwIfAborted();
      navigate(pathTo("your-initiative"));
    } catch (cause) { if (!current.signal.aborted) setError(messageFor(cause)); }
    finally { if (!current.signal.aborted) setBusy(false); }
  }
  return <><button className="rc-button" data-variant="secondary" type="button" onClick={() => setOpen(true)}>Open</button>
    <TaskDialog title={workspace.project?.title ?? "Open your private card"} open={open} onClose={() => { task.current?.abort(); setOpen(false); setBusy(false); }}>
      <div className="rc-stack"><p>Open this project's saved private card. Weave will keep a device backup of your current draft, including unfinished words and files.</p>
        <button className="rc-button" data-variant="primary" type="button" disabled={busy} onClick={() => void load()}>Back up and open saved card</button>
        {error && <p role="status">{error}</p>}
      </div>
    </TaskDialog></>;
}

export function LiveYourInitiatives() {
  return <div className="rc-stack"><Heading level={1} size="page">Your initiatives</Heading>
    <PendingInvite /><AccountSection /><ProjectDirectory /><CreateProject />
    <ButtonLink href={pathTo("initiative")} variant="quiet">Describe a new initiative</ButtonLink></div>;
}

/** Linking never copies private entries into a team. The workspace offers that save separately. */
export function ConnectProject({ project, role }: { project: PublicProject; role?: Group["role"] }) {
  const { state } = useAccount();
  return state?.user ? <AccountProject key={state.user.id} project={project} role={role} /> : null;
}
function AccountProject({ project, role }: { project: PublicProject; role?: Group["role"] }) {
  const { state } = useAccount();
  const { draft, controller } = useDraft();
  const complete = accountKey(draft) !== null;
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const task = useRef<AbortController | null>(null);
  useEffect(() => () => task.current?.abort(), []);
  async function connect() {
    if (busy) return;
    setBusy(true); setError("");
    const current = new AbortController(); task.current = current;
    try {
      const result = project.groupDid
        ? await projectRequest({ action: role === "member" ? "request_setup" : "activate", projectUri: project.uri }, current.signal)
        : await connectPersonalProject(controller, state!.user!.id, project, current.signal);
      current.signal.throwIfAborted();
      if (result.status === "linked" && uuid(result.workspaceId)) {
        setOpen(false);
        navigate(project.groupDid ? teamWorkspacePath(result.workspaceId) : pathTo("your-initiative"));
      } else if (result.status === "pending") setError("Your workspace request is recorded. A Certified group admin or owner needs to approve it.");
      else if (result.status === "access_required") setError("This project already has a workspace. Ask its workspace admin for an invitation or access.");
      else setError("The project could not be connected. Try again with this project.");
    } catch (cause) { if (!current.signal.aborted) setError(messageFor(cause)); }
    finally { if (!current.signal.aborted) setBusy(false); }
  }
  return <><button className="rc-button" data-variant="secondary" type="button" onClick={() => setOpen(true)}>Connect to Weave</button>
    <TaskDialog title={project.title} open={open} onClose={() => { task.current?.abort(); setOpen(false); setBusy(false); }}>
      <div className="rc-stack"><p>{project.description}</p>
        <p>{project.groupDid ? "Open this project's team workspace. Your device draft stays here."
          : complete ? "If this project has a saved workspace, open that card and back up this device's draft. Otherwise, save and link your checked card privately."
            : "Use this public name and description for a new private card, with no needs or offers yet. Weave keeps a device backup of your current draft, including unfinished words and files, before opening it."}</p>
        {!project.groupDid && complete && <p>Private card: {draft.confirmed?.name}. {draft.confirmed?.description}</p>}
        <button className="rc-button" data-variant="primary" type="button" disabled={busy} onClick={() => void connect()}>
          {role === "member" ? "Request a team workspace" : project.groupDid ? "Open team workspace" : complete ? "Save and link project" : "Back up, save and link project"}</button>
        {error && <p role="status">{error}</p>}
      </div>
    </TaskDialog></>;
}

export function CreateProject() {
  const { state } = useAccount();
  const { draft } = useDraft();
  const [open, setOpen] = useState(false);
  if (!state?.user) return null;
  return <><button className="rc-button" data-variant="secondary" type="button" onClick={() => setOpen(true)}>Create a Certified project</button>
    <TaskDialog title="Create your Certified project" open={open} onClose={() => setOpen(false)}>
      <NewProject onDone={() => setOpen(false)} key={`${state.user.id}/${draft.id}`} />
    </TaskDialog></>;
}

function NewProject({ onDone }: { onDone(): void }) {
  const { state } = useAccount();
  const { draft, controller } = useDraft();
  const pendingKey = projectCreationKey(state!.user!.id,draft.id);
  const [pending, setPending] = useState<PendingProjectCreate | null>(() => {
    try {
      return parsePendingProjectCreate(JSON.parse(window.sessionStorage.getItem(pendingKey) ?? "null"));
    } catch { /* A corrupt pending request cannot create a project. */ }
    return null;
  });
  const [label, setLabel] = useState(() => pending?.groupLabel ?? `${(draft.confirmed?.name ?? "initiative").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 20) || "initiative"}-${crypto.randomUUID().slice(0, 6)}`);
  const task = useRef<AbortController | null>(null);
  useEffect(() => () => task.current?.abort(), []);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [consent, setConsent] = useState(false);
  async function create() {
    if ((!pending && !draft.confirmed) || !state?.user || busy) return;
    setBusy(true); setError("");
    const current = new AbortController(); task.current = current;
    try {
      let command = pending;
      if (!command) {
        if (!validProjectGroupLabel(label)) throw Error("Use a valid group name in the address before creating the project.");
        const publicProfile = publicProjectProfile(draft.confirmed!.name,draft.confirmed!.description);
        const saved = await saveForProject(controller, state.user.id, current.signal);
        current.signal.throwIfAborted();
        command = { action: "create", ...saved, requestId: crypto.randomUUID(), groupLabel: label,
          publicProfile };
        window.sessionStorage.setItem(pendingKey, JSON.stringify(command));
        setPending(command);
      }
      current.signal.throwIfAborted();
      const result = await projectRequest(command, current.signal);
      current.signal.throwIfAborted();
      if (result.status === "linked" && uuid(result.workspaceId)) { window.sessionStorage.removeItem(pendingKey); onDone(); navigate(teamWorkspacePath(result.workspaceId)); }
      else setError("Certified is still confirming the project. Check again with the same request.");
    } catch (cause) {
      if (current.signal.aborted) return;
      if (clearRejectedProjectCreate(cause)) { window.sessionStorage.removeItem(pendingKey); setPending(null); }
      setConsent(cause instanceof AccountFailure && cause.code === "project_consent_required");
      setError(cause instanceof AccountFailure ? messageFor(cause) : cause instanceof Error ? cause.message : messageFor(cause));
    } finally { if (!current.signal.aborted) setBusy(false); }
  }
  const publicProfile = pending?.publicProfile ?? {title:draft.confirmed?.name.trim() ?? "",description:draft.confirmed?.description.trim() ?? ""};
  if (!pending && !draft.confirmed) return <ButtonLink href={pathTo("initiative")} variant="primary">Describe your initiative first</ButtonLink>;
  const tooLong = !pending && ([...publicProfile.title].length > 80 || [...publicProfile.description].length > 800);
  return <form className="rc-stack" onSubmit={event => { event.preventDefault(); void create(); }}><h3 className="rc-heading" data-size="section">{publicProfile.title}</h3>
    <p>{publicProfile.description}</p><p>These details become public on Certified in a new group with you as owner. Your needs and offers stay private.</p>
    <label className="rc-field">Group name in the address<input className="rc-input" value={label} disabled={busy || pending !== null}
      required minLength={3} maxLength={32} pattern={projectGroupPattern} onChange={(e) => setLabel(e.target.value)} /></label>
    <p className="rc-hint">Use 3 to 32 lowercase letters, numbers or hyphens. Start with a letter and end with a letter or number.</p>
    <button className="rc-button" data-variant="primary" type="submit" disabled={busy || tooLong}>
      {pending ? "Check creation again" : "Save privately and create project"}</button>
    {consent && <ConsentButton action="create-project" />}
    {tooLong && <p>Use a project name of 80 characters or fewer and a description of 800 characters or fewer.</p>}
    {error && <p role="status">{error}</p>}
  </form>;
}
