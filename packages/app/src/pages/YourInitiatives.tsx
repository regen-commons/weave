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
import { ListLayout } from "../ui/layouts.tsx";
import { AboutCertified } from "../ui/AboutCertified.tsx";

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
  const onDevice = hasDraft(draft);
  if (!state.identity)
    return (
      <div className="rc-narrow rc-stack">
        <Heading level={1} size="page">
          Your initiatives
        </Heading>
        {!live && <p>Sign in with Certified to open your projects and what you saved in Weave.</p>}
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
      </div>
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
    if (live && record.workspace) {
      if (!record.group && record.workspaceId) { await service.openCard(record.workspaceId, null); go(pathTo("your-initiative")); }
      else await service.openWorkspace(record.uri, null);
      return;
    }
    if (import.meta.env.DEV && record.workspace) {
      // The team workspace already holds this initiative's needs and offers.
      const next = draftWithRecord(intakeFixture("kept", pathTo("your-initiative")), record);
      await controller.replace(next);
      await service.openWorkspace(record.uri, publicKey(next));
      go(pathTo(cardRoute(next)));
      return;
    }
    // No workspace to open: the project's four details start a card, and the rest is added here.
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
        Your initiatives
      </Heading>
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
      {live && <PendingInvite />}
      {social.loading && <p role="status">Checking your Certified projects</p>}
      {social.problem && <p role="status">{social.problem}</p>}
      {social.consent ? <ConsentButton action="membership" /> : social.problem && <button className="rc-button" data-variant="secondary" type="button" onClick={() => void social.reload?.()}>Try again</button>}
      {!!state.setupRequests?.length && <Section id="setup-requests" title="Workspace requests">
        <ul className="rc-ask-summary">{state.setupRequests.map(request => <li key={request.requestId}><strong>{request.name}</strong>
          <p className="rc-meta">Approval sets up the team's workspace. The requester still needs an explicit access grant.</p>
          <button className="rc-button" data-variant="secondary" type="button" disabled={busy}
            onClick={() => void run(async () => { await service.approveSetup?.(request.projectUri, request.requestId); })}>Approve workspace</button>
        </li>)}</ul>
      </Section>}
      {total === 0 && !social.loading && !social.problem && (
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
          <button
            className="rc-button"
            data-variant="quiet"
            type="button"
            disabled={busy}
            onClick={() => (onDevice ? setStarting(true) : void run(startNew))}
          >
            Start a new initiative
          </button>
          <ButtonLink href={pathTo("settings")} variant="quiet">
            Settings
          </ButtonLink>
        </div>
      )}
      {busy && <p role="status">Opening</p>}
      {note}
    </ListLayout>
  );
}
