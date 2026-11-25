import { useEffect, useState } from "react";
import { newDraft, revise, type DeviceDraft } from "../describe/contracts.ts";
import { useDraft } from "../describe/use-draft.ts";
import { intakeFixture, type FixtureContext } from "../fixtures.ts";
import { fullDate } from "../home.ts";
import { draftWithRecord, withProjectDetails } from "../initiative/import.ts";
import { boundCardId, draftKinds, draftSaving, ENTRY_KINDS, initiativeEntries, linkedProject, projectKind, projectLinkLine, projectLinkState, savingLine, standsForProject, openSavedOver, type EntryKind } from "../initiative/list.ts";
import { useListedDrafts, useOpenDraft } from "../initiative/use-drafts.ts";
import { cardName, cardRoute, publicCard, publicKey, SAVED_SIGNED_OUT, savedSignedOut } from "../initiative/status.ts";
import { dismissDuplicate, duplicateOffer } from "../initiative/duplicates.ts";
import { useCardStatus } from "../initiative/use-card-status.ts";
import { navigate, routeSearch } from "../router.tsx";
import { fixtureHref, pathTo } from "../routes.ts";
import { useSocial } from "../social/context.tsx";
import { PendingInvite } from "../initiative/WorkspaceAccess.tsx";
import { ConsentButton, useProjectAccessAfterSignIn } from "../initiative/ProjectConsent.tsx";
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
import { accountKey } from "../account/document.ts";
import { useSetAside } from "../account/set-aside.ts";
import { choiceStorage, chosenProjectUri, deviceChoosers } from "../social/project-choice.ts";
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
import { backUpCopies, deletableCards, type DeviceCopy } from "../account/delete-card.ts";
import { exportedMessage, privateSavesExport } from "../account/export-saves.ts";
import { downloadJson } from "../data/download.ts";
import { RemoveDeviceDraft } from "../data/RemoveDeviceDraft.tsx";
import { readPlan } from "../initiative/publish-plan.ts";
import { SIGN_IN } from "../data/privacy.ts";
import { SignInReturnNotice } from "../account/SignInReturnNotice.tsx";
import { Tag } from "../ui/Tag.tsx";
import { ThemeChoice } from "../ui/ThemeSwitch.tsx";
import { SettingsSection } from "../ui/SettingsSection.tsx";
import { InstallGuide } from "../install/InstallGuide.tsx";

/** Said before the press, so the second Certified screen is expected. */
const PROJECT_ACCESS_NEXT =
  "Certified will ask to confirm it is you, then to let Weave read your projects for as long as you stay signed in.";
/** The same, where the page has just said the initiatives are only in this browser. */
const PROJECT_ACCESS_WITH_SIGN_IN =
  "Signing in says who you are, and Certified then asks to let Weave read your projects for as long as you stay signed in. Nothing of yours is saved or shared until you choose it.";

/**
 * A phone's Settings on the You tab, in every state of the page, signed out included. The tab is a
 * phone's place for the person's own things (DL-086), so it holds the settings a phone uses most as
 * their own groups, as Settings shows them: the theme, which a wide screen changes from its header,
 * and installing Weave, which only a phone can do. The rest is one press away (DL-134).
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
      <div className="rc-stack">
        <SettingsSection level={3} title="Appearance" note="Light, dark, or the same as this device.">
          <ThemeChoice />
        </SettingsSection>
        <SettingsSection level={3} title="Install Weave On Your Phone" note="It opens like an app, full screen.">
          <InstallGuide />
        </SettingsSection>
      </div>
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
  const { draft, controller } = useDraft();
  // Another account's card stays on the device but out of this account's lists (DL-055).
  const listed = useListedDrafts();
  const openInTab = useOpenDraft();
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
  /** The dialog was opened from a draft's own card, to link that draft: there is no separate card to start. */
  const [forDraft, setForDraft] = useState(false);
  const [, setAnswered] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [removing, setRemoving] = useState(false);
  // Signing in from this page goes on to Certified's project permission (the user's choice, 22 November 2026).
  const continuing = useProjectAccessAfterSignIn();
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
  const setAside = useSetAside();
  // A card's project is chosen once and kept on the device, so it is still linked in a new tab.
  const choices = choiceStorage();
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
  /** This browser's drafts as the removal dialog lists them. Removing one leaves a saved copy in the account alone. */
  const removableDrafts = () => listed.map((item) => ({ draft: item, savedInAccount: !!savedId(item) }));
  const removeAction = listed.length > 0 && (
    <button className="rc-button" data-variant="quiet" type="button" disabled={busy}
      onClick={() => { setMessage(""); setRemoving(true); }}>Remove A Draft From This Device</button>
  );
  const removeDialog = (
    <RemoveDeviceDraft open={removing} drafts={removableDrafts()} onClose={() => setRemoving(false)}
      onRemoved={(text) => { setRemoving(false); setFailed(false); setMessage(text); refresh(); }} />
  );
  /** The Certified project this account chose for a draft on this device, if any. */
  const chosenProject = (item: DeviceDraft): string | null =>
    item.id === draft.id && project ? project.uri : chosenProjectUri(choices, state.identity?.id, item.id);
  /** The Certified project of this account's that a draft is linked to, the tab's own draft or another. */
  const linkedTo = (item: DeviceDraft) =>
    item.id === draft.id
      ? project
      : state.identity ? linkedProject(chosenProject(item), savedId(item), [...state.records, ...(state.workspaces ?? [])]) : null;
  const linked = (item: DeviceDraft): boolean => !!linkedTo(item);
  /** What a card is, as tags under its name (DL-134). */
  const kindTags = (kinds: readonly EntryKind[]) => kinds.length > 0 && (
    <div className="rc-tag-list">
      {kinds.map((kind) => <Tag key={kind} icon={ENTRY_KINDS[kind].icon}>{ENTRY_KINDS[kind].label}</Tag>)}
    </div>
  );
  /** Opens one of this browser's drafts where it was left: its page once checked, otherwise its next step. */
  async function openDraft(item: DeviceDraft) {
    await openInTab(item.id);
    go(pathTo(cardRoute(controller.getSnapshot().draft)));
  }
  /** Opens the account's version over this browser's working copy, which is kept: as a backup, or still in the list. */
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
    const line = savingLine(saving, saved ? fullDate(saved.savedOn) : null);
    // A draft that looks like a project the person already has on Certified is offered that project,
    // so the initiative is not kept twice. Once the projects are read, and never on its own (DL-134).
    const owner = state.identity ? (state.identity.id ?? state.identity.handle) : null;
    const duplicate = owner && !linked(item) && !social?.loading
      ? duplicateOffer(owner, item.id, publicCard(item), [...state.records, ...(state.workspaces ?? [])])
      : null;
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
          {kindTags(draftKinds(saving, linkedTo(item) ?? null, savedSignedOut(item, !!state.identity)))}
          {kept && !behind ? (
            <p className="rc-card-meta">{status.line}</p>
          ) : saving !== "unsaved" ? (
            line && <p className="rc-card-meta">{line}</p>
          ) : savedSignedOut(item, !!state.identity) ? (
            <p className="rc-card-meta">{SAVED_SIGNED_OUT}</p>
          ) : null}
          {saving === "changed-both" && saved && (
            <div className="rc-action-bar">
              <button className="rc-button" data-variant="quiet" data-size="sm" type="button" disabled={busy}
                onClick={() => void run(async () => { await openOver(item, saved); })}>
                Open Saved Version
              </button>
            </div>
          )}
          {duplicate && owner && (
            <>
              <p className="rc-card-meta">{`Looks like ${duplicate.name}, your project on Certified.`}</p>
              <div className="rc-action-bar">
                <button className="rc-button" data-variant="secondary" data-size="sm" type="button" disabled={busy}
                  onClick={() => void run(async () => { await openInTab(item.id); setForDraft(true); setChoosing(duplicate); })}>
                  Use That Project
                </button>
                <button className="rc-button" data-variant="quiet" data-size="sm" type="button" disabled={busy}
                  onClick={(event) => {
                    // The offer leaves with its buttons, so the card's name takes the focus they held.
                    event.currentTarget.closest(".rc-card")?.querySelector<HTMLButtonElement>(".rc-card-title button")?.focus();
                    dismissDuplicate(owner, item.id, duplicate.uri);
                    setAnswered((count) => count + 1);
                  }}>
                  It's A Different Initiative
                </button>
              </div>
            </>
          )}
          {/* Signed out, a card linked on this device says so. Signed in, its tag and its section say which project it is. */}
          {!linked(item) && live &&
            projectLinkState({ linked: false, owner: state.identity?.id, choosers: deviceChoosers(item.id), loading: false, problem: false }) === "signed-out" && (
              <p className="rc-card-meta">{projectLinkLine("signed-out")}</p>
            )}
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
  // On the way to Certified's project permission the projects are not read yet either.
  const loading = !!social.loading || exampleLoading || continuing;
  // Whether anyone is signed in is not known yet: hold the page's shape instead of guessing a state.
  // An account this device expects is being checked too, before the live adapter has anyone to read for.
  const checking = ((live || (import.meta.env.DEV && !!fixture)) && loading && !state.identity) || (live && account.expectsAccount);
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
            <SignInButton thenProjects={live} />
            {startAction("secondary")}
          </div>
          {live && <p className="rc-meta">{PROJECT_ACCESS_NEXT}</p>}
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
                {listed.length === 1 ? "Your initiative is" : "Your initiatives are"} kept in this browser only.{" "}
                {live ? PROJECT_ACCESS_WITH_SIGN_IN : SIGN_IN.effect}
              </p>
              <div className="rc-action-bar">
                <SignInButton thenProjects={live} />
                <AboutCertified />
              </div>
              <SignInReturnNotice />
            </div>
          </section>
        )}
        <div className="rc-action-bar">{startAction("quiet")}{removeAction}</div>
        {/* Said, not drawn: the card that was pressed is already busy, and a new line would push the page down. */}
        {busy && <p className="rc-visually-hidden" role="status">Opening</p>}
        {note}
        {removeDialog}
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
  const deviceCopies: DeviceCopy[] = listed.map((item) => ({ id: item.id, name: cardName(item), cardId: savedId(item) }));
  const removable = service.deleteCard
    ? deletableCards(state.cards, (state.workspaces ?? []).map(record => record.workspaceId), deviceCopies)
    : [];
  const empty = total === 0 && !loading && !social.problem;
  const waitingPublication = live ? listed.find((item) => {
    try { return !!readPlan(window.sessionStorage, item.id); } catch { return false; }
  }) : undefined;
  // A draft linked to a Certified project is listed with the projects; the rest exists only in Weave.
  type DraftEntry = Extract<(typeof entries)[number], { kind: "draft" }>;
  type CardEntry = Extract<(typeof entries)[number], { kind: "card" }>;
  const certifiedDrafts = entries.filter((entry): entry is DraftEntry => entry.kind === "draft" && linked(entry.draft));
  // Three destinations (QA notes, 25 November 2026): this device and Certified projects first, then
  // the private Weave saves, which only someone signed in can open, download or delete.
  const deviceEntries = entries.filter((entry): entry is DraftEntry => entry.kind === "draft" && !linked(entry.draft));
  const privateEntries = entries.filter((entry): entry is CardEntry => entry.kind === "card");
  const moreSaves = !!state.hasMoreCards && !!service.moreCards;
  const certified = certifiedDrafts.length > 0 || listedWorkspaces.length > 0 || (!loading && records.length > 0);
  const noProjectYet = total > 0 && records.length === 0 && workspaces.length === 0 && !project && !loading && !social.problem;
  async function downloadSaves() {
    if (!state.identity?.id) return;
    const result = await privateSavesExport(state.identity.id);
    if (result.cards.length) downloadJson("weave-private-saves.json", result);
    setMessage(exportedMessage(result));
  }
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
      setForDraft(false);
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
      {/* Certified's permission screens come back here, so a publication waiting in this tab is offered first. */}
      {waitingPublication && (
        <StatusLine actions={
          <button className="rc-button" data-variant="primary" data-size="sm" type="button" disabled={busy}
            onClick={() => void run(() => openDraft(waitingPublication))}>Continue Publishing</button>
        }>
          {`Publishing ${cardName(waitingPublication)} is waiting where you left it. Nothing is public until you confirm.`}
        </StatusLine>
      )}
      {handoff && (
        <StatusLine actions={<ProjectAction variant="primary" />}>
          {`Back from ${PROJECT_EDITORS[handoff.editor].name}? Link the project you published.`}
        </StatusLine>
      )}
      {/* What is only in this browser (DL-134). Nobody else can see it until it is published or saved. */}
      {deviceEntries.length > 0 && (
        <Section id="initiatives-device" title="On This Device"
          note="Kept only in this browser. Nobody else can see these until you publish one to a Certified project.">
          <CardGrid>{deviceEntries.map((entry) => draftCard(entry.draft, entry.saved))}</CardGrid>
          <div className="rc-action-bar">{removeAction}</div>
        </Section>
      )}
      {/* Everything that is a Certified project, or a draft linked to one. A failed read is not an
          empty list, so it says so with its retry, and what was read stays. */}
      {(certified || loading || social.problem || noProjectYet) && (
        <Section id="initiatives-certified" title="Certified Projects"
          note="Public on Certified, where each project's name, description and place are edited. What you publish from Weave adds needs and offers that anyone can read.">
          {certified && (
            <CardGrid>
              {certifiedDrafts.map((entry) => draftCard(entry.draft, entry.saved))}
              {listedWorkspaces.map(record => (
                <li key={record.uri}><Card><h3 className="rc-card-title"><button type="button" disabled={busy}
                  onClick={() => void run(() => openRecord(record))}>{record.name}</button></h3>
                  {kindTags([projectKind({ group: record.group, workspace: true })])}
                  <p className="rc-card-meta">{record.group ? (record.accessRole === "viewer" ? "You can view." : record.accessRole === "admin" ? "You manage teammates." : "You can edit.") : "Only you work on it."}</p>
                </Card></li>
              ))}
              {!loading && records.map((record) => (
                <li key={record.uri}>
                  <Card>
                    <h3 className="rc-card-title">
                      <button type="button" disabled={busy} onClick={() => void run(() => openRecord(record))}>
                        {record.name}
                      </button>
                    </h3>
                    {kindTags([projectKind(record)])}
                    <p className="rc-card-meta">{record.group ? projectLine(record) : "Only you work on it."}</p>
                  </Card>
                </li>
              ))}
            </CardGrid>
          )}
          {/* The shape of the cards that arrive. */}
          {loading && (
            <div aria-busy="true">
              <p className="rc-visually-hidden" role="status">
                Checking your Certified projects
              </p>
              <CardGridSkeleton kind="own" count={2} />
            </div>
          )}
          {social.problem && !continuing && (
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
          {noProjectYet && <p className="rc-meta">You have no project on Certified yet.</p>}
        </Section>
      )}
      {/* Saved in the Weave account before. Opened, downloaded or deleted here; never moved or published. */}
      {(privateEntries.length > 0 || moreSaves || removable.length > 0) && (
        <Section id="initiatives-private" title="Private Weave Saves"
          note="Copies saved in your Weave account. Only you can see them, when signed in. Nothing here is public or shared for matching.">
          {privateEntries.length > 0 && (
            <CardGrid>
              {privateEntries.map((entry) => (
                <li key={entry.card.id}>
                  <Card>
                    <h3 className="rc-card-title">
                      <button type="button" disabled={busy} onClick={() => void run(() => openCard(entry.card))}>
                        {entry.card.name}
                      </button>
                    </h3>
                    {kindTags(["private"])}
                    <p className="rc-card-meta">Saved on {fullDate(entry.card.savedOn)}.</p>
                  </Card>
                </li>
              ))}
            </CardGrid>
          )}
          <div className="rc-action-bar">
            {moreSaves && <button className="rc-button" data-variant="quiet" type="button" disabled={busy}
              onClick={() => void run(async () => { await service.moreCards?.(); })}>More Private Saves</button>}
            {live && state.cards.length > 0 && <button className="rc-button" data-variant="quiet" type="button" disabled={busy}
              onClick={() => void run(downloadSaves)}>Download Private Saves</button>}
            {removable.length > 0 && <button className="rc-button" data-variant="quiet" type="button" disabled={busy}
              onClick={() => { setMessage(""); setDeleting(true); }}>Delete A Saved Card</button>}
          </div>
        </Section>
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
      <div className="rc-action-bar">
        {/* An empty list already offers to start one, so the page offers it once. */}
        {!empty && startAction("quiet")}
        {/* Drafts linked to a project are on this device too; with no other drafts the removal is offered here. */}
        {deviceEntries.length === 0 && removeAction}
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
          onDelete={async (card, requestId, removeCopies) => {
            const result = await service.deleteCard!(card, requestId);
            refresh();
            // Only once the account confirmed: the copies on this device go to the backups, as chosen before the press.
            return removeCopies ? backUpCopies(controller, result, card.copies) : result;
          }}
          onReload={async () => { await (social.reload?.() ?? service.checkAgain()); refresh(); }}
          onDeleted={(text) => { setDeleting(false); setFailed(false); setMessage(text); refresh(); }} />
      )}
      {removeDialog}
      <TaskDialog title="Your Project" open={!!choosing} onClose={() => setChoosing(null)}>
        {choosing && (
          <ProjectStep
            key={choosing.uri}
            initial={choosing.uri}
            onDone={() => setChoosing(null)}
            onCancel={() => setChoosing(null)}
            alternative={forDraft ? undefined :
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
