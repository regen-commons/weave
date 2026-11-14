import { useState } from "react";
import { useAccountDoor } from "../account/door.tsx";
import { newDraft, revise } from "../describe/contracts.ts";
import { useDraft } from "../describe/use-draft.ts";
import { hasDraft } from "../describe/view.ts";
import { intakeFixture } from "../fixtures.ts";
import { fullDate } from "../home.ts";
import { draftWithRecord } from "../initiative/import.ts";
import { cardName, cardRoute, publicKey } from "../initiative/status.ts";
import { useCardStatus } from "../initiative/use-card-status.ts";
import { navigate, routeSearch } from "../router.tsx";
import { fixtureHref, pathTo } from "../routes.ts";
import { useSocial } from "../social/context.tsx";
import { PendingInvite } from "../initiative/WorkspaceAccess.tsx";
import { ConsentButton } from "../initiative/ProjectConsent.tsx";
import { teamWorkspacePath } from "../routes.ts";
import type { CertifiedRecord, SavedCard } from "../social/fixture.ts";
import { projectLine } from "../social/words.ts";
import { ButtonLink } from "../ui/ButtonLink.tsx";
import { Card, CardGrid } from "../ui/Card.tsx";
import { EmptyState } from "../ui/EmptyState.tsx";
import { Heading } from "../ui/Heading.tsx";
import { Section } from "../ui/Section.tsx";
import { Doorway, ListLayout } from "../ui/layouts.tsx";
import { useSetAside } from "../account/set-aside.ts";
import { AboutCertified } from "../ui/AboutCertified.tsx";
import { ProjectAction, ProjectStep } from "../social/Project.tsx";
import { projectOpening } from "../social/project-open.ts";
import { editorStorage, PROJECT_EDITORS, readEditorHandoff } from "../initiative/editor-handoff.ts";
import { TaskDialog } from "../ui/TaskDialog.tsx";
import { EXAMPLE_EDITOR_OWNER } from "../initiative/ProjectEditor.tsx";
import { StatusLine } from "../ui/StatusLine.tsx";

/**
 * Everything a signed-in person can open: the card on this device, their private saves and
 * their Certified projects. Each card opens from its name, so no card carries a button.
 * The live adapter reads projects and granted workspaces; development examples use the same layout.
 */
export function YourInitiatives() {
  const social = useSocial();
  const { draft, controller } = useDraft();
  const status = useCardStatus();
  const openDoor = useAccountDoor();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [starting, setStarting] = useState(false);
  /** A project opened from its card while an unlinked card is on this device: link that card, or start apart. */
  const [choosing, setChoosing] = useState<CertifiedRecord | null>(null);
  const access = new URLSearchParams(routeSearch()).get("access");
  const consentNotice = access === "failed" ? <p role="status">Certified access could not be confirmed. Try again.</p>
    : access === "denied" ? <p role="status">Certified access was declined.</p> : null;
  if (!social) return null;
  const live = social.mode === "live";
  const { state, service, refresh } = social;
  const go = (href: string) => navigate(fixtureHref(href, routeSearch(), true));
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    setFailed(false);
    try {
      await action();
      refresh();
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : "This change did not work. Try again.");
    } finally {
      setBusy(false);
    }
  }
  const note = message && (
    <p className="rc-notice" data-tone={failed ? "warning" : "info"} role={failed ? "alert" : "status"}>
      {message}
    </p>
  );
  // Another account's card stays on the device but out of this account's lists (DL-055).
  const setAside = useSetAside();
  const onDevice = hasDraft(draft) && !setAside;
  const handoff = onDevice && state.identity && readEditorHandoff(editorStorage(() => window.sessionStorage), state.identity.id ?? EXAMPLE_EDITOR_OWNER, draft.id);
  if (!state.identity)
    return (
      <Doorway>
        <Heading level={1} size="page">
          Your Initiatives
        </Heading>
        {consentNotice}
        {!live && <p className="rc-prose">Sign in with Certified to open your projects and what you saved in Weave.</p>}
        {live && <PendingInvite />}
        {live && social.loading && <p role="status">Checking your account</p> }
        <AboutCertified />
        <div className="rc-action-bar">
          <button className="rc-button" data-variant="primary" type="button" onClick={() => openDoor("certified")}>
            Sign in with Certified
          </button>
          <ButtonLink href={pathTo(onDevice ? cardRoute(draft) : "initiative")} variant="secondary">
            {onDevice ? "Open the card on this device" : "Describe a new initiative"}
          </ButtonLink>
        </div>
        {note}
      </Doorway>
    );
  const deviceName = cardName(draft);
  const project = onDevice ? state.project : null;
  const deviceSavedId = draft.account.saved?.owner === state.identity.id ? draft.account.saved?.id : null;
  // The card on this device already stands for its own private save and its own project.
  const cards = state.cards.filter((card) => !(onDevice && card.id === (state.saved?.card ?? deviceSavedId))
    && !(state.workspaces ?? []).some(record => record.workspaceId === card.id));
  const workspaces = state.workspaces ?? state.records.filter(record => record.workspace);
  const records = state.records.filter((record) => !record.workspace && record.uri !== project?.uri);
  const total = (onDevice ? 1 : 0) + cards.length + workspaces.length + records.length;
  const empty = total === 0 && !social.loading && !social.problem;
  async function openCard(card: SavedCard) {
    if (live) { await service.openCard(card.id, null); go(pathTo("your-initiative")); return; }
    if (import.meta.env.DEV) {
    const seed = intakeFixture("kept", pathTo("your-initiative"));
    const next = revise(seed, {
      proposal: { ...seed.proposal!, name: card.name },
      confirmed: { ...seed.confirmed!, name: card.name },
      publicEdits: { ...seed.publicEdits, name: card.name },
      form: seed.form ? { ...seed.form, name: card.name } : null,
    });
    await controller.replace(next);
    await service.openCard(card.id, publicKey(next));
    go(pathTo(cardRoute(next)));
    }
  }
  async function openRecord(record: CertifiedRecord) {
    const opening = projectOpening(record, { card: onDevice, linked: !!project });
    if (opening === "workspace" && live) {
      if (!record.group && record.workspaceId) { await service.openCard(record.workspaceId, null); go(pathTo("your-initiative")); }
      else await service.openWorkspace(record.uri, null);
      return;
    }
    if (opening === "workspace" && import.meta.env.DEV) {
      // The team workspace already holds this initiative's needs and offers.
      const next = draftWithRecord(intakeFixture("kept", pathTo("your-initiative")), record);
      await controller.replace(next);
      await service.openWorkspace(record.uri, publicKey(next));
      go(pathTo(cardRoute(next)));
      return;
    }
    if (opening === "choose") {
      setChoosing(record);
      return;
    }
    await startFrom(record);
  }
  /** No workspace to open: the project's details start a card, and the rest is added here. */
  async function startFrom(record: CertifiedRecord) {
    const next = draftWithRecord(newDraft(), record);
    await controller.replace(next);
    await service.clearCard();
    await service.linkProject(record.uri);
    go(pathTo(cardRoute(next)));
  }
  async function startNew() {
    await controller.replace(newDraft());
    await service.clearCard();
    setStarting(false);
    go(pathTo("initiative"));
  }
  return (
    <ListLayout>
      <Heading level={1} size="page">
        Your Initiatives
      </Heading>
      {consentNotice}
      {live && <PendingInvite />}
      {handoff && (
        <StatusLine actions={<ProjectAction variant="primary" />}>
          {`Back from ${PROJECT_EDITORS[handoff.editor].name}? Link the project you published.`}
        </StatusLine>
      )}
      {social.loading && <p role="status">Checking your Certified projects</p>}
      {/* A failed read is not an empty list, so it says so with its retry, and the lists below stay. */}
      {social.problem && (
        <section className="rc-notice" data-tone="warning" aria-label="Certified projects">
          <div className="rc-notice-body">
            <p role="status">{social.problem}</p>
            <div className="rc-action-bar">
              {social.consent ? <ConsentButton action="membership" /> : (
                <button className="rc-button" data-variant="secondary" type="button" onClick={() => void social.reload?.()}>Try again</button>
              )}
            </div>
          </div>
        </section>
      )}
      {!!state.setupRequests?.length && <Section id="setup-requests" title="Workspace requests">
        <ul className="rc-ask-summary">{state.setupRequests.map(request => <li key={request.requestId}><strong>{request.name}</strong>
          <p className="rc-meta">Approval sets up the team's workspace. The requester still needs an explicit access grant.</p>
          <button className="rc-button" data-variant="secondary" type="button" disabled={busy}
            onClick={() => void run(async () => { await service.approveSetup?.(request.projectUri, request.requestId); })}>Approve workspace</button>
        </li>)}</ul>
      </Section>}
      {empty && (
        <EmptyState
          title="Nothing here yet"
          action={
            <ButtonLink href={pathTo("initiative")} variant="primary">
              Describe your initiative
            </ButtonLink>
          }
        >
          Your Certified projects and what you save in Weave appear here.
        </EmptyState>
      )}
      {(onDevice || cards.length > 0 || workspaces.length > 0) && (
        <Section id="initiatives-weave" title="In Weave">
          <CardGrid>
            {onDevice && (
              <li>
                <Card>
                  <h3 className="rc-card-title">
                    {/* A button like its neighbours, so one card does not take the visited link colour. */}
                    <button type="button" disabled={busy} onClick={() => go(pathTo(cardRoute(draft)))}>
                      {deviceName}
                    </button>
                  </h3>
                  <p className="rc-card-meta">{status.line || "On this device only."}</p>
                  {project && <p className="rc-card-meta">Linked to your project on Certified.</p>}
                </Card>
              </li>
            )}
            {workspaces.filter(record => record.group || record.workspaceId !== (onDevice ? state.saved?.card ?? deviceSavedId : undefined)).map(record => (
              <li key={record.uri}><Card><h3 className="rc-card-title"><button type="button" disabled={busy}
                onClick={() => void run(() => openRecord(record))}>{record.name}</button></h3>
                <p className="rc-card-meta">{record.group ? `Team workspace, ${record.accessRole === "viewer" ? "you can view" : record.accessRole === "admin" ? "you manage teammates" : "you can edit"}` : "Personal Certified project"}</p>
              </Card></li>
            ))}
            {cards.map((card) => (
              <li key={card.id}>
                <Card>
                  <h3 className="rc-card-title">
                    <button type="button" disabled={busy} onClick={() => void run(() => openCard(card))}>
                      {card.name}
                    </button>
                  </h3>
                  <p className="rc-card-meta">Saved privately in Weave on {fullDate(card.savedOn)}.</p>
                </Card>
              </li>
            ))}
          </CardGrid>
          {state.hasMoreCards && service.moreCards && <button className="rc-button" data-variant="quiet" type="button" disabled={busy}
            onClick={() => void run(async () => { await service.moreCards?.(); })}>More private saves</button>}
        </Section>
      )}
      {records.length > 0 && (
        <Section id="initiatives-certified" title="On Certified">
          <CardGrid>
            {records.map((record) => (
              <li key={record.uri}>
                <Card>
                  <h3 className="rc-card-title">
                    <button type="button" disabled={busy} onClick={() => void run(() => openRecord(record))}>
                      {record.name}
                    </button>
                  </h3>
                  <p className="rc-card-meta">{projectLine(record)}</p>
                </Card>
              </li>
            ))}
          </CardGrid>
        </Section>
      )}
      {total > 0 && records.length === 0 && workspaces.length === 0 && !project && !social.loading && !social.problem && (
        <p className="rc-meta">You have no project on Certified yet.</p>
      )}
      {onDevice && (cards.length > 0 || records.length > 0) && (
        <p className="rc-meta">Opening another initiative backs up the card on this device first.</p>
      )}
      {starting ? (
        <section className="rc-notice" data-tone="warning" aria-label="Confirm a new card">
          <div className="rc-notice-body">
            <p>Start a new card? The one on this device is backed up first, under Device backups in Settings.</p>
            <div className="rc-action-bar">
              <button
                className="rc-button"
                data-variant="primary"
                type="button"
                disabled={busy}
                onClick={() => void run(startNew)}
              >
                Back up this card and start new
              </button>
              <button
                className="rc-button"
                data-variant="secondary"
                type="button"
                onClick={() => setStarting(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </section>
      ) : (
        <div className="rc-action-bar">
          {/* An empty list already offers to describe one, so the page offers it once. */}
          {!empty && (
            <button
              className="rc-button"
              data-variant="quiet"
              type="button"
              disabled={busy}
              onClick={() => (onDevice ? setStarting(true) : void run(startNew))}
            >
              Start a new initiative
            </button>
          )}
          <ButtonLink href={pathTo("settings")} variant="quiet">
            Settings
          </ButtonLink>
        </div>
      )}
      {setAside && (
        <p className="rc-meta">A card from another account is on this device. It opens again when that account signs in.</p>
      )}
      {/* The account is not what people come here for, so it closes the page. */}
      <div className="rc-action-bar">
        <p className="rc-meta">{state.identity.handle ? `Signed in as ${state.identity.handle}.` : "Signed in with Certified."}</p>
        <button
          className="rc-button"
          data-variant="quiet"
          data-size="sm"
          type="button"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await service.signOut();
              setMessage("You are signed out. The card on this device is still here.");
            })
          }
        >
          Sign out
        </button>
      </div>
      {busy && <p role="status">Opening</p>}
      {note}
      <TaskDialog title="Your project" open={!!choosing} onClose={() => setChoosing(null)}>
        {choosing && (
          <ProjectStep
            key={choosing.uri}
            initial={choosing.uri}
            onDone={() => setChoosing(null)}
            onCancel={() => setChoosing(null)}
            alternative={
              <button className="rc-button" data-variant="quiet" type="button" disabled={busy}
                onClick={() => {
                  const record = choosing;
                  setChoosing(null);
                  void run(() => startFrom(record));
                }}>
                Start a separate card
              </button>
            }
          />
        )}
      </TaskDialog>
    </ListLayout>
  );
}
