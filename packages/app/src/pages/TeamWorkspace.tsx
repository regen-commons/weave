import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { SavedInitiative, TeamWorkspaceState } from "@weave/api/account-contract";
import { AccountFailure, accountRequest } from "../account/client.ts";
import { useAccount } from "../account/context.tsx";
import { continueToCertified } from "../account/sign-in.ts";
import { useDraft } from "../describe/use-draft.ts";
import { useSocial } from "../social/context.tsx";
import { saveBlocker } from "../account/document.ts";
import { useSetAside } from "../account/set-aside.ts";
import { SaveDeviceToTeam } from "../partners/SaveDeviceToTeam.tsx";
import { WorkspaceAccess } from "../initiative/WorkspaceAccess.tsx";
import { TeamEntries } from "../partners/TeamEntries.tsx";
import { SavedMatching } from "../partners/PartnerExperience.tsx";
import { CertifiedSuggestions } from "../partners/CertifiedSuggestions.tsx";
import { requestTeamWorkspace, startTeamAccess, teamPartnerQueries } from "../partners/team-workspace.ts";
import { teamWorkspacePath } from "../routes.ts";
import { Heading } from "../ui/Heading.tsx";
import { InitiativeRecord } from "../initiative/InitiativeRecord.tsx";
import { SuggestionSchema } from "../describe/contracts.ts";
import { AskSuggestionSchema } from "../intake/contracts.ts";
import { Section } from "../ui/Section.tsx";
import { StatusLine } from "../ui/StatusLine.tsx";
import { StepLayout } from "../ui/layouts.tsx";
import { TaskDialog } from "../ui/TaskDialog.tsx";
import { FirstFunding } from "../ui/FirstFunding.tsx";
import { loadedDraft } from "../account/document.ts";
import { LiveExposure } from "../social/LiveExposure.tsx";
import { rememberWorkspace } from "../initiative/workspace-resume.ts";

const subscribeOnline = (notify: () => void) => {
  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);
  return () => {
    window.removeEventListener("online", notify);
    window.removeEventListener("offline", notify);
  };
};
const isOnline = () => navigator.onLine;
const errorCode = (error: unknown) => error instanceof AccountFailure ? error.code : "";

export function TeamWorkspace({ workspaceId }: { workspaceId: string }) {
  const { state } = useAccount();
  return (
    <div className="rc-stack">
      {state === null ? <><WorkspaceHeading /><p role="status">Checking your account</p></>
        : !state.user ? <><WorkspaceHeading /><WorkspaceSignIn workspaceId={workspaceId} available={state.available} /></>
          : <WorkspaceContent key={`${state.user.id}/${workspaceId}`} workspaceId={workspaceId} />}
    </div>
  );
}

/** What each person can do here, in one line, so a viewer knows why nothing can be changed. */
const ROLE_LINE: Record<TeamWorkspaceState["accessRole"], string> = {
  viewer: "You can view this workspace. A workspace admin can give you editing access.",
  editor: "You can change the team's needs and offers.",
  admin: "You can change the team's needs and offers and manage teammates.",
};

/** Once the workspace opens the page names its initiative, echoing the name that led here. */
function WorkspaceHeading({ name, role }: { name?: string; role?: TeamWorkspaceState["accessRole"] }) {
  return (
    <div className="rc-stack">
      {name && <p className="rc-eyebrow">Team workspace</p>}
      <Heading level={1} size="page">{name ?? "Team workspace"}</Heading>
      {role && <p>{ROLE_LINE[role]}</p>}
    </div>
  );
}

function WorkspaceSignIn({ workspaceId, available }: { workspaceId: string; available: boolean }) {
  const { controller, ready } = useDraft();
  const [status, setStatus] = useState<"idle" | "starting" | "failed">("idle");
  async function signIn() {
    setStatus("starting");
    try {
      await continueToCertified(controller, teamWorkspacePath(workspaceId),
        (returnTo) => accountRequest("", { returnTo }, "/api/sign-in"),
        (target) => window.location.assign(target));
    } catch {
      setStatus("failed");
    }
  }
  if (!available) return <p>Certified sign-in is unavailable right now.</p>;
  return (
    <div className="rc-stack">
      <p>Sign in to open this team workspace.</p>
      {status === "failed" && <p role="status">Sign-in could not start. Try again.</p>}
      <div className="rc-action-bar">
        <button className="rc-button" data-variant="primary" type="button"
          disabled={!ready || status === "starting"} onClick={() => void signIn()}>Sign in with Certified</button>
      </div>
    </div>
  );
}

function WorkspaceContent({ workspaceId }: { workspaceId: string }) {
  const { clear, state } = useAccount();
  const social = useSocial();
  const { draft } = useDraft();
  // Another account's card stays on the device but is never copied into this account's team (DL-055).
  const setAside = useSetAside();
  const online = useSyncExternalStore(subscribeOnline, isOnline);
  const [loaded, setLoaded] = useState<TeamWorkspaceState | undefined>();
  const [editing, setEditing] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [access, setAccess] = useState(() => new URLSearchParams(window.location.search).get("access"));
  const [attempt, setAttempt] = useState(0);
  const [panel, setPanel] = useState<"entries" | "teammates" | null>(null);
  const [matchVersion, setMatchVersion] = useState(0);
  const [closeNotice, setCloseNotice] = useState("");
  const loseAccess = useCallback((code: string) => {
    setLoaded(undefined);
    setFailure(code);
  }, []);
  useEffect(() => {
    if (!online || loaded !== undefined) return;
    const controller = new AbortController();
    setFailure(null);
    void requestTeamWorkspace(workspaceId, controller.signal).then((saved) => {
      if (!controller.signal.aborted) {
        setLoaded(saved);
        try { rememberWorkspace(state!.user!.id, workspaceId, window.localStorage); } catch { /* Optional navigation hint. */ }
      }
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) loseAccess(errorCode(error));
    });
    return () => controller.abort();
  }, [workspaceId, attempt, online, loseAccess]);
  useEffect(() => {
    if (failure === "sign_in_required") clear();
  }, [failure, clear]);
  const queries = useMemo(() => teamPartnerQueries(loaded?.saved ?? null), [loaded]);
  const saveResult = useCallback((saved: SavedInitiative) => setLoaded((current) => current ? { ...current, saved } : current), []);

  async function confirmAccess() {
    setAccess("starting");
    try {
      window.location.assign(await startTeamAccess(workspaceId, window.sessionStorage));
    } catch {
      setAccess("failed");
    }
  }

  if (!online && loaded === undefined) return <><WorkspaceHeading /><p>Reconnect to open this workspace.</p></>;
  if (failure === "project_consent_required") return (
    <div className="rc-stack">
      <WorkspaceHeading />
      <p>Confirm Certified group access to open this workspace.</p>
      {access === "denied" && <p role="status">Certified access was declined.</p>}
      {access === "failed" && <p role="status">Certified access could not be confirmed. Try again.</p>}
      <div className="rc-action-bar">
        <button className="rc-button" data-variant="primary" type="button" disabled={access === "starting"}
          onClick={() => void confirmAccess()}>Confirm Certified access</button>
      </div>
    </div>
  );
  if (failure === "workspace_access_required" || failure === "project_authority_required" || failure === "not_found")
    return <><WorkspaceHeading /><p role="status">You can't open this workspace with this account. If you should, ask a workspace admin for an invitation link.</p></>;
  if (failure !== null) return (
    <div className="rc-stack">
      <WorkspaceHeading />
      <p role="status">The workspace could not be opened.</p>
      <div className="rc-action-bar">
        <button className="rc-button" data-variant="secondary" type="button"
          onClick={() => { setLoaded(undefined); setAttempt((value) => value + 1); }}>Try again</button>
      </div>
    </div>
  );
  if (loaded === undefined) return <><WorkspaceHeading /><p role="status">Opening the team workspace</p></>;
  const saved = loaded.saved;
  const readOnly = loaded.accessRole === "viewer";
  // Copying this device's checked card is offered while the team has nothing saved. When that card
  // was linked to this project, saving it here is the next step.
  const offerSave = !saved && !readOnly && online && !setAside && !saveBlocker(draft);
  const ownCard = offerSave && social?.mode === "live" && social.state.project?.workspaceId === workspaceId;
  const owner = state!.user!.id;
  const fields = saved ? SuggestionSchema.parse({ ...saved.document.initiative, confidence: 1 }) : null;
  return (
    <>
      {/* First, as while loading, so the heading that took the focus on arrival stays the same element. */}
      <WorkspaceHeading name={String(saved?.document.initiative.name ?? loaded.projectTitle ?? "Team initiative")}
        role={loaded.accessRole} />
      {!online && <p role="status">You’re offline. Reconnect to save or change sharing.</p>}
      <StepLayout aside={<>
        <Section id="saving-sharing" title="Saving and sharing">
          <StatusLine actions={offerSave ? <SaveDeviceToTeam workspaceId={workspaceId} onSaved={saveResult} primary={ownCard} /> : undefined}>
            {saved ? "Saved in the team workspace. Teammates with access can see it." : "Nothing saved to this team yet."}
          </StatusLine>
          {saved && <LiveExposure saved={saved} owner={owner} team readOnly={readOnly || editing} online={online}
            onExpired={() => loseAccess("sign_in_required")} onChanged={() => setMatchVersion(v => v + 1)} />}
        </Section>
        {!readOnly && <Section id="change-team" title="Change it"><div className="rc-action-bar" data-layout="rows">
          <button className="rc-button" data-variant={saved || ownCard ? "quiet" : "primary"} type="button" disabled={!online}
            onClick={() => setPanel("entries")}>Change needs and offers</button>
          {loaded.accessRole === "admin" && loaded.projectUri && <button className="rc-button" data-variant="quiet" type="button" disabled={!online}
            onClick={() => setPanel("teammates")}>Manage teammates</button>}
        </div></Section>}
      </>}>
        {saved && fields ? <InitiativeRecord named={false} fields={fields} team needs={saved.document.needs.map(entry => AskSuggestionSchema.parse(entry.value))}
          offers={saved.document.offers.map(entry => AskSuggestionSchema.parse(entry.value))} />
          : <p>No needs or offers saved yet.{readOnly ? " An editor can add them." : ""}</p>}
      </StepLayout>
      <TaskDialog title={panel === "teammates" ? "Manage teammates" : "Needs and offers"} open={panel !== null} onClose={() => setPanel(null)}
        blockClose={editing} onCloseBlocked={() => setCloseNotice("Save or cancel your entry before closing. Your changes are still here.")}>
        {closeNotice && <p role="status">{closeNotice}</p>}
        {panel === "entries" && <TeamEntries workspaceId={workspaceId} workspace={loaded} online={online} onSaved={saveResult}
          onEditing={value => { setEditing(value); setCloseNotice(""); }} onAccessLost={loseAccess} />}
        {panel === "teammates" && loaded.accessRole === "admin" && loaded.projectUri && <WorkspaceAccess workspaceId={workspaceId} projectUri={loaded.projectUri} expanded />}
      </TaskDialog>
      {saved && (
        <>
          <CertifiedSuggestions workspaceId={workspaceId} queries={queries} compact={false} online={online}
            onAccessLost={loseAccess} />
          <SavedMatching key={saved.revision} refreshVersion={matchVersion} active={{ id: workspaceId, owner: state!.user!.id, revision: saved.revision,
            document: saved.document, contentKey: JSON.stringify(saved.document) }} synced={!editing}
            compact={false} online={online} onExpired={() => loseAccess("sign_in_required")}
            fixture={false} team readOnly={loaded.accessRole === "viewer" || editing} presentation="results" />
          <Section id="team-funding" title="Funding that fits"><FirstFunding subject={loadedDraft(saved, owner)} /></Section>
        </>
      )}
    </>
  );
}
