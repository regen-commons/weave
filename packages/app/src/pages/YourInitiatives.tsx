import { useEffect, useState } from "react";
import { newDraft, revise, type DeviceDraft } from "../describe/contracts.ts";
import { useDraft } from "../describe/use-draft.ts";
import { intakeFixture, type FixtureContext } from "../fixtures.ts";
import { fullDate } from "../home.ts";
import { draftWithRecord, withProjectDetails } from "../initiative/import.ts";
import { boundCardId, deviceDrafts, draftSaving, initiativeEntries, savingLine, standsForProject, openSavedOver, savedVersionOpened } from "../initiative/list.ts";
import { cardName, cardRoute, NOT_SAVED_YET, publicKey, SAVED_SIGNED_OUT, savedSignedOut } from "../initiative/status.ts";
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
import { useAccount } from "../account/context.tsx";
import { accountKey, belongsToAnotherAccount } from "../account/document.ts";
import { useSetAside } from "../account/set-aside.ts";
import { projectChoiceKey, projectChoosers } from "../social/project-choice.ts";
import { uuid } from "@weave/api/account-contract";
import { AboutCertified } from "../ui/AboutCertified.tsx";
import { ProjectAction, ProjectStep } from "../social/Project.tsx";
import { deviceTeamWorkspace, projectOpening } from "../social/project-open.ts";
import { editorStorage, PROJECT_EDITORS, readEditorHandoff } from "../initiative/editor-handoff.ts";
import { TaskDialog } from "../ui/TaskDialog.tsx";
import { EXAMPLE_EDITOR_OWNER } from "../initiative/ProjectEditor.tsx";
import { StatusLine } from "../ui/StatusLine.tsx";
import { DeleteSavedCard } from "../account/DeleteSavedCard.tsx";
import { SignInButton } from "../account/SignInButton.tsx";
import { CardGridSkeleton } from "../ui/CardSkeleton.tsx";
import { Icon } from "../ui/Icon.tsx";
import { deletableCards } from "../account/delete-card.ts";
import { SIGN_IN } from "../data/privacy.ts";
import { SignInReturnNotice } from "../account/SignInReturnNotice.tsx";
import { Tag } from "../ui/Tag.tsx";
import { ThemeChoice } from "../ui/ThemeSwitch.tsx";

/**
 * A phone's Settings on the You tab, in every state of the page, signed out included: the theme,
 * which a wide screen changes from its header, and the way to the rest. It stands where the gear
 * in a phone's header stood (DL-086).
 */
function PhoneSettings() {
  return (
    <Section
      id="initiatives-settings"
      title="Settings"
      until="wide"
      action={
        <ButtonLink href={pathTo("settings")} variant="quiet" size="sm">
          All Settings
        </ButtonLink>
      }
    >
      <ThemeChoice />
    </Section>
  );
}

/**
 * Everything a person can open, in one list (DL-112): the initiatives in this browser, their
 * private saves and their team workspaces, then their Certified projects. One that exists only
 * in this browser carries a "Not saved yet" badge. Each card opens from its name, so no card
 * carries a button. Starting an initiative always makes a new one and asks nothing.
 * The live adapter reads projects and granted workspaces; development examples use the same layout.
 */
export function YourInitiatives({ fixture }: { fixture?: FixtureContext }) {
  const social = useSocial();
  const { draft, drafts, controller } = useDraft();
  // The list is where every initiative on the device is shown, so it is read with whatever an
  // older tab on the released build has written since (DL-114).
  useEffect(() => {
    void controller.lookAgain();
  }, [controller]);
  const account = useAccount();
  const status = useCardStatus();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  /** A project opened from its card while an unlinked card is on this device: link that card, or start apart. */
  const [choosing, setChoosing] = useState<CertifiedRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
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
  const accountId = account.state?.user?.id;
  let session: Storage | undefined;
  try {
    session = window.sessionStorage;
  } catch {
    session = undefined;
  }
  const listed = deviceDrafts(draft, drafts, (item) =>
    belongsToAnotherAccount(item, accountId, projectChoosers(session, item.id)));
  const onDevice = listed.some((item) => item.id === draft.id);
  const handoff = onDevice && state.identity && readEditorHandoff(editorStorage(() => window.sessionStorage), state.identity.id ?? EXAMPLE_EDITOR_OWNER, draft.id);
  const project = onDevice && state.identity ? state.project : null;
  // The team workspace of the project this card is linked to is the same initiative. It is reached
  // from this card and is not listed a second time.
  const deviceWorkspace = deviceTeamWorkspace(project, state.workspaces ?? state.records.filter(record => record.workspace));
  /** The saved card a draft is the working copy of. The example account keeps that for the tab's draft only. */
  const savedId = (item: DeviceDraft): string | null => {
    if (!state.identity) return null;
    const own = boundCardId(item, state.identity.id);
    return item.id === draft.id ? (state.saved?.card ?? own) : own;
  };
  /** The Certified project this account chose for a draft in this browser session, if any. */
  const chosenProject = (item: DeviceDraft): string | null => {
    if (item.id === draft.id && project) return project.uri;
    try {
      return state.identity?.id ? (session?.getItem(projectChoiceKey(state.identity.id, item.id)) ?? null) : null;
    } catch {
      return null;
    }
  };
  /** Opens one of this browser's drafts where it was left: its page once checked, otherwise its next step. */
  async function openDraft(item: DeviceDraft) {
    if (item.id !== draft.id) {
      await controller.open(item.id);
      // The example account's saved and shared state describes one card, so it does not follow another.
      if (!live) await service.clearCard();
    }
    go(pathTo(cardRoute(controller.getSnapshot().draft)));
  }
  /** Opens the account's version over this browser's working copy, and says where the copy went only when asked. */
  const openOver = (item: DeviceDraft, saved: SavedCard) =>
    openSavedOver(item, saved, () => openCard(saved), (id) => controller.retire(id));
  /** One of this browser's initiatives. The badge says what is missing; a saved one says where it is kept. */
  const draftCard = (item: DeviceDraft, saved: SavedCard | null) => {
    const current = item.id === draft.id;
    const kept = current && (status.state === "saved" || status.state === "shared" || status.state === "published");
    const saving = draftSaving(item, saved, state.identity?.id, accountKey);
    // The account's copy moved on. With no changes of its own here, the entry opens that version;
    // with changes on both sides it opens this browser's words and offers the saved version beside them.
    const behind = saving === "newer-in-account" || saving === "changed-both";
    return (
      <li key={item.id}>
        <Card>
          <h3 className="rc-card-title">
            {/* A button like its neighbours, so one card does not take the visited link colour. */}
            <button type="button" disabled={busy}
              onClick={() => void run(async () => { if (saving === "newer-in-account" && saved) await openOver(item, saved); else await openDraft(item); })}>
              {cardName(item)}
            </button>
          </h3>
          {kept && !behind ? (
            <p className="rc-card-meta">{status.line}</p>
          ) : saving !== "unsaved" ? (
            <p className="rc-card-meta">{savingLine(saving, saved ? fullDate(saved.savedOn) : null)}</p>
          ) : savedSignedOut(item, !!state.identity) ? (
            <p className="rc-card-meta">{SAVED_SIGNED_OUT}</p>
          ) : (
            <div className="rc-tag-list">
              <Tag icon="device">{NOT_SAVED_YET}</Tag>
            </div>
          )}
          {saving === "changed-both" && saved && (
            <div className="rc-action-bar">
              <button className="rc-button" data-variant="quiet" data-size="sm" type="button" disabled={busy}
                onClick={() => void run(async () => {
                  setMessage(savedVersionOpened(await openOver(item, saved)));
                })}>
                Open Saved Version
              </button>
            </div>
          )}
          {current && project && <p className="rc-card-meta">Linked to your project on Certified.</p>}
          {current && deviceWorkspace && (
            <div className="rc-action-bar">
              <button className="rc-button" data-variant="quiet" data-size="sm" type="button" disabled={busy}
                onClick={() => void run(() => openRecord(deviceWorkspace))}>
                Open Team Workspace
              </button>
            </div>
          )}
        </Card>
      </li>
    );
  };
  const startAction = (variant: "secondary" | "quiet") => (
    <button className="rc-button" data-variant={variant} type="button" disabled={busy} onClick={() => void run(startNew)}>
      Start An Initiative
    </button>
  );
  // An example can hold the page in its loading state, so the shape it keeps can be seen and measured.
  const exampleLoading = import.meta.env.DEV && !live && fixture?.state === "loading";
  const loading = !!social.loading || exampleLoading;
  // Whether anyone is signed in is not known yet: hold the page's shape instead of guessing a state.
  const checking = (live || (import.meta.env.DEV && !!fixture)) && loading && !state.identity;
  if (!state.identity && !listed.length && !checking)
    return (
      <>
        <Doorway>
          <Heading level={1} size="page">
            Your Initiatives
          </Heading>
          {consentNotice}
          <p className="rc-prose">Sign in with Certified to open your projects and what you saved in Weave.</p>
          {live && <PendingInvite />}
          <div className="rc-action-bar">
            <SignInButton />
            {startAction("secondary")}
          </div>
          <AboutCertified />
          <SignInReturnNotice />
          {note}
        </Doorway>
        <PhoneSettings />
      </>
    );
  if (!state.identity)
    return (
      <ListLayout>
        <Heading level={1} size="page">
          Your Initiatives
        </Heading>
        {consentNotice}
        {live && <PendingInvite />}
        {listed.length > 0 && <CardGrid>{listed.map((item) => draftCard(item, null))}</CardGrid>}
        {checking ? (
          <div aria-busy="true">
            <p className="rc-visually-hidden" role="status">
              Checking your account
            </p>
            <CardGridSkeleton kind="own" count={2} />
          </div>
        ) : (
          // The card above is already here and usable, so signing in is an offer, never a gate.
          <section className="rc-notice" data-tone="info" aria-labelledby="initiatives-sign-in">
            <div className="rc-notice-body">
              <h2 className="rc-notice-title" id="initiatives-sign-in">
                Sign in to save and open on another device
              </h2>
              <p>
                {listed.length === 1 ? "Your initiative is" : "Your initiatives are"} kept in this browser only. {SIGN_IN.effect}
              </p>
              <div className="rc-action-bar">
                <SignInButton />
                <AboutCertified />
              </div>
              <SignInReturnNotice />
            </div>
          </section>
        )}
        <div className="rc-action-bar">{startAction("quiet")}</div>
        {/* Said, not drawn: the card that was pressed is already busy, and a new line would push the page down. */}
        {busy && <p className="rc-visually-hidden" role="status">Opening</p>}
        {note}
        <PhoneSettings />
      </ListLayout>
    );
  // A draft can stand for any saved card. A personal save that is also a workspace is listed by
  // itself once, as the workspace.
  const entries = initiativeEntries(listed, state.cards, savedId,
    (card) => !(state.workspaces ?? []).some(record => record.workspaceId === card.id));
  const savedHere = new Set(listed.map(savedId).filter((id): id is string => !!id));
  // While projects are still being read there are none to list yet, in the account as in an example.
  const workspaces = exampleLoading ? [] : (state.workspaces ?? state.records.filter(record => record.workspace));
  // A project that a draft here already stands for is listed once, as that draft.
  const records = (exampleLoading ? [] : state.records).filter((record) => !record.workspace && record.uri !== project?.uri
    && !listed.some((item) => standsForProject(item, record.uri, chosenProject(item))));
  // A draft already stands for its own personal workspace, and the tab's draft for its project's team workspace.
  const listedWorkspaces = workspaces.filter(record => record !== deviceWorkspace
    && (record.group || !record.workspaceId || !savedHere.has(record.workspaceId)));
  const total = entries.length + listedWorkspaces.length + records.length;
  // A draft's own saved copy is listed here too: deleting it leaves the device words in place.
  const removable = service.deleteCard
    ? deletableCards(state.cards, (state.workspaces ?? []).map(record => record.workspaceId), [...savedHere])
    : [];
  const empty = total === 0 && !loading && !social.problem;
  async function openCard(card: SavedCard) {
    if (live) { await service.openCard(card.id, null); go(pathTo("your-initiative")); return; }
    if (import.meta.env.DEV) {
    const seed = intakeFixture("kept", pathTo("your-initiative"));
    // As in the live account, the device's copy of a saved card carries the card's ID, so opening
    // it twice never makes two drafts.
    const next = revise({ ...seed, id: uuid(card.id) ? card.id : seed.id }, {
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
      // The team workspace already holds this initiative's needs and offers. Opening it links
      // nothing, so nothing is suggested from the project page, as with a live workspace.
      const next = withProjectDetails(intakeFixture("kept", pathTo("your-initiative")), record);
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
    if (live) {
      // The tab moves to a blank draft that is not stored yet, and the project is checked before
      // its details are written. A refused or failed link therefore leaves no draft behind.
      await controller.startNew();
      await service.clearCard();
      await service.linkProject(record.uri);
      go(pathTo(cardRoute(controller.getSnapshot().draft)));
      return;
    }
    const next = draftWithRecord(newDraft(), record);
    await controller.replace(next);
    await service.clearCard();
    await service.linkProject(record.uri);
    go(pathTo(cardRoute(next)));
  }
  /** Always a new initiative. The others stay as they are, so nothing is asked or backed up. */
  async function startNew() {
    await controller.startNew();
    await service.clearCard();
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
      {(entries.length > 0 || listedWorkspaces.length > 0) && (
        <CardGrid>
          {entries.map((entry) =>
            entry.kind === "draft" ? draftCard(entry.draft, entry.saved) : (
              <li key={entry.card.id}>
                <Card>
                  <h3 className="rc-card-title">
                    <button type="button" disabled={busy} onClick={() => void run(() => openCard(entry.card))}>
                      {entry.card.name}
                    </button>
                  </h3>
                  <p className="rc-card-meta">Saved privately in Weave on {fullDate(entry.card.savedOn)}.</p>
                </Card>
              </li>
            ),
          )}
          {listedWorkspaces.map(record => (
            <li key={record.uri}><Card><h3 className="rc-card-title"><button type="button" disabled={busy}
              onClick={() => void run(() => openRecord(record))}>{record.name}</button></h3>
              <p className="rc-card-meta">{record.group ? `Team workspace, ${record.accessRole === "viewer" ? "you can view" : record.accessRole === "admin" ? "you manage teammates" : "you can edit"}` : "Personal Certified project"}</p>
            </Card></li>
          ))}
        </CardGrid>
      )}
      {(state.hasMoreCards && service.moreCards || removable.length > 0) && <div className="rc-action-bar">
        {state.hasMoreCards && service.moreCards && <button className="rc-button" data-variant="quiet" type="button" disabled={busy}
          onClick={() => void run(async () => { await service.moreCards?.(); })}>More Private Saves</button>}
        {removable.length > 0 && <button className="rc-button" data-variant="quiet" type="button" disabled={busy}
          onClick={() => { setMessage(""); setDeleting(true); }}>Delete A Saved Card</button>}
      </div>}
      {/* The shape of the section that arrives: its heading, then cards of this page's own kind. */}
      {loading && (
        <Section id="initiatives-certified" title="On Certified">
          <div aria-busy="true">
            <p className="rc-visually-hidden" role="status">
              Checking your Certified projects
            </p>
            <CardGridSkeleton kind="own" count={2} />
          </div>
        </Section>
      )}
      {/* A failed read is not an empty list, so it says so with its retry, and the lists below stay. */}
      {social.problem && (
        <section className="rc-notice" data-tone="warning" aria-label="Certified projects">
          <div className="rc-notice-body">
            <p role="status">{social.problem}</p>
            <div className="rc-action-bar">
              {social.consent ? <ConsentButton action="membership" /> : (
                <button className="rc-button" data-variant="secondary" type="button" onClick={() => void social.reload?.()}>Try Again</button>
              )}
            </div>
          </div>
        </section>
      )}
      {!!state.setupRequests?.length && <Section id="setup-requests" title="Workspace Requests">
        <ul className="rc-ask-summary">{state.setupRequests.map(request => <li key={request.requestId}><strong>{request.name}</strong>
          <p className="rc-meta">Approval sets up the team's workspace. The requester still needs an explicit access grant.</p>
          <button className="rc-button" data-variant="secondary" type="button" disabled={busy}
            onClick={() => void run(async () => { await service.approveSetup?.(request.projectUri, request.requestId); })}>Approve Workspace</button>
        </li>)}</ul>
      </Section>}
      {empty && (
        <EmptyState
          title="Nothing here yet"
          action={
            <button className="rc-button" data-variant="primary" type="button" disabled={busy} onClick={() => void run(startNew)}>
              Start An Initiative
            </button>
          }
        >
          Your Certified projects and what you save in Weave appear here.
        </EmptyState>
      )}
      {records.length > 0 && !loading && (
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
      {total > 0 && records.length === 0 && workspaces.length === 0 && !project && !loading && !social.problem && (
        <p className="rc-meta">You have no project on Certified yet.</p>
      )}
      <div className="rc-action-bar">
        {/* An empty list already offers to start one, so the page offers it once. */}
        {!empty && startAction("quiet")}
        {/* A phone has the Settings section below in its place. */}
        <ButtonLink href={pathTo("settings")} variant="quiet" from="wide">
          Settings
        </ButtonLink>
      </div>
      {setAside && (
        <p className="rc-meta">A card from another account is on this device. It opens again when that account signs in.</p>
      )}
      <PhoneSettings />
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
              setMessage("You are signed out. What is in this browser is still here.");
            })
          }
        >
          Sign Out
        </button>
      </div>
      {/* Said, not drawn: the card that was pressed is already busy, and a new line would push the page down. */}
      {busy && <p className="rc-visually-hidden" role="status">Opening</p>}
      {note}
      {service.deleteCard && (
        <DeleteSavedCard open={deleting} cards={removable} onClose={() => setDeleting(false)}
          onDelete={async (card, requestId) => { const result = await service.deleteCard!(card, requestId); refresh(); return result; }}
          onReload={async () => { await (social.reload?.() ?? service.checkAgain()); refresh(); }}
          onDeleted={(text) => { setDeleting(false); setFailed(false); setMessage(text); refresh(); }} />
      )}
      <TaskDialog title="Your Project" open={!!choosing} onClose={() => setChoosing(null)}>
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
                Start A Separate Card
              </button>
            }
          />
        )}
      </TaskDialog>
    </ListLayout>
  );
}
