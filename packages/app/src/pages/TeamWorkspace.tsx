import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { SavedInitiative, TeamWorkspaceState } from "@weave/api/account-contract";
import { AccountFailure, accountRequest } from "../account/client.ts";
import { useAccount } from "../account/context.tsx";
import { continueToCertified } from "../account/sign-in.ts";
import { useDraft } from "../describe/use-draft.ts";
import { PublicSupport } from "../partners/PublicSupport.tsx";
import { SaveDeviceToTeam } from "../partners/SaveDeviceToTeam.tsx";
import { WorkspaceAccess } from "../initiative/WorkspaceAccess.tsx";
import { TeamEntries } from "../partners/TeamEntries.tsx";
import { SavedMatching } from "../partners/PartnerExperience.tsx";
import { CertifiedSuggestions } from "../partners/CertifiedSuggestions.tsx";
import { requestTeamWorkspace, startTeamAccess, teamPartnerQueries } from "../partners/team-workspace.ts";
import { teamWorkspacePath } from "../routes.ts";
import { Heading } from "../ui/Heading.tsx";

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

/** The workspace is named for its initiative once it opens; until then it says what it is. */
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
  const online = useSyncExternalStore(subscribeOnline, isOnline);
  const [loaded, setLoaded] = useState<TeamWorkspaceState | undefined>();
  const [editing, setEditing] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [access, setAccess] = useState(() => new URLSearchParams(window.location.search).get("access"));
  const [attempt, setAttempt] = useState(0);
  const loseAccess = useCallback((code: string) => {
    setLoaded(undefined);
    setFailure(code);
  }, []);
  useEffect(() => {
    if (!online || loaded !== undefined) return;
    const controller = new AbortController();
    setFailure(null);
    void requestTeamWorkspace(workspaceId, controller.signal).then((saved) => {
      if (!controller.signal.aborted) setLoaded(saved);
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
    return <><WorkspaceHeading /><p role="status">This workspace is unavailable to your account.</p></>;
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
  return (
    <>
      {!online && <p role="status">You’re offline. Reconnect to save or change sharing.</p>}
      <WorkspaceHeading name={String(saved?.document.initiative.name ?? loaded.projectTitle ?? "Team initiative")}
        role={loaded.accessRole} />
      {!saved && loaded.accessRole !== "viewer" && online && <SaveDeviceToTeam workspaceId={workspaceId} onSaved={saveResult} />}
      {loaded.accessRole === "admin" && loaded.projectUri && <WorkspaceAccess workspaceId={workspaceId} projectUri={loaded.projectUri} />}
      <TeamEntries workspaceId={workspaceId} workspace={loaded} online={online} onSaved={saveResult}
        onEditing={setEditing} onAccessLost={loseAccess} />
      {saved && (
        <>
          <CertifiedSuggestions workspaceId={workspaceId} queries={queries} compact={false} online={online}
            onAccessLost={loseAccess} />
          <PublicSupport key={`public/${saved.revision}`} workspaceId={workspaceId} saved={saved} readOnly={loaded.accessRole === "viewer" || editing} />
          <SavedMatching key={saved.revision} active={{ id: workspaceId, owner: state!.user!.id, revision: saved.revision,
            document: saved.document, contentKey: JSON.stringify(saved.document) }} synced={!editing}
            compact={false} online={online} onExpired={() => loseAccess("sign_in_required")}
            fixture={state?.fixture === true} team readOnly={loaded.accessRole === "viewer" || editing} />
        </>
      )}
    </>
  );
}
