import { LiveYourInitiatives } from "../initiative/ProjectDirectory.tsx";
import { useId, useState } from "react";
import { AccountSection } from "../account/AccountSection.tsx";
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
import { useSocialFixture } from "../social/context.tsx";
import type { CertifiedRecord, SavedCard } from "../social/fixture.ts";
import { ProjectAction } from "../social/Project.tsx";
import { projectLine } from "../social/words.ts";
import { ButtonLink } from "../ui/ButtonLink.tsx";
import { EmptyState } from "../ui/EmptyState.tsx";
import { Heading } from "../ui/Heading.tsx";
import { Section } from "../ui/Section.tsx";
import { ListLayout } from "../ui/layouts.tsx";

/**
 * Everything a signed-in person can open: the card on this device, their private saves and
 * their Certified projects. The project list is an example until Weave can read projects.
 */
export function YourInitiatives() {
  const social = useSocialFixture();
  const { draft, controller } = useDraft();
  const status = useCardStatus();
  const openDoor = useAccountDoor();
  const titles = useId();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [starting, setStarting] = useState(false);
  if (!(import.meta.env.DEV && social)) return <LiveYourInitiatives />;
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
      setMessage(error instanceof Error ? error.message : "This example change failed. Try again.");
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
        <p>Sign in with Certified to open your projects and what you saved in Weave.</p>
        <div className="rc-action-bar">
          <button className="rc-button" data-variant="primary" type="button" onClick={() => openDoor("certified")}>
            Sign in with Certified
          </button>
          <ButtonLink href={pathTo(onDevice ? cardRoute(draft) : "initiative")} variant="quiet">
            {onDevice ? "Open the card on this device" : "Describe a new initiative"}
          </ButtonLink>
        </div>
        <p className="rc-meta">Example sign-in. Nothing is sent.</p>
        {note}
      </div>
    );
  const deviceName = cardName(draft);
  const project = onDevice ? state.project : null;
  // The card on this device already stands for its own private save and its own project.
  const cards = state.cards.filter((card) => !(onDevice && card.id === state.saved?.card));
  const records = state.records.filter((record) => record.uri !== project?.uri);
  const total = (onDevice ? 1 : 0) + cards.length + records.length;
  async function openCard(card: SavedCard) {
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
  async function openRecord(record: CertifiedRecord) {
    if (record.workspace) {
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
        <p className="rc-meta">Signed in as {state.identity.handle}.</p>
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
      {total === 0 && (
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
      {(onDevice || cards.length > 0) && (
        <Section id="initiatives-weave" title="In Weave">
          <ul className="rc-card-grid">
            {onDevice && (
              <li>
                <article className="rc-card" data-layout="listing">
                  <h3 className="rc-card-title">{deviceName}</h3>
                  <p className="rc-card-meta">{status.line || "On this device only."}</p>
                  {project && <p className="rc-card-meta">Linked to your project on Certified.</p>}
                  <div className="rc-action-bar">
                    <ButtonLink href={pathTo(cardRoute(draft))} variant="primary">
                      Open
                    </ButtonLink>
                    {!project && <ProjectAction variant="quiet" />}
                  </div>
                </article>
              </li>
            )}
            {cards.map((card, index) => (
              <li key={card.id}>
                <article className="rc-card" data-layout="listing">
                  <h3 className="rc-card-title" id={`${titles}-card-${index}`}>
                    {card.name}
                  </h3>
                  <p className="rc-card-meta">Saved privately in Weave on {fullDate(card.savedOn)}.</p>
                  <div className="rc-action-bar">
                    <button
                      className="rc-button"
                      data-variant="secondary"
                      type="button"
                      disabled={busy}
                      aria-describedby={`${titles}-card-${index}`}
                      onClick={() => void run(() => openCard(card))}
                    >
                      Open
                    </button>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {records.length > 0 && (
        <Section id="initiatives-certified" title="On Certified">
          <ul className="rc-card-grid">
            {records.map((record, index) => (
              <li key={record.uri}>
                <article className="rc-card" data-layout="listing">
                  <h3 className="rc-card-title" id={`${titles}-project-${index}`}>
                    {record.name}
                  </h3>
                  <p className="rc-card-meta">{projectLine(record)}</p>
                  <div className="rc-action-bar">
                    <button
                      className="rc-button"
                      data-variant="secondary"
                      type="button"
                      disabled={busy}
                      aria-describedby={`${titles}-project-${index}`}
                      onClick={() => void run(() => openRecord(record))}
                    >
                      {record.workspace ? "Open workspace" : "Open"}
                    </button>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {total > 0 && records.length === 0 && !project && (
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
              <button className="rc-button" data-variant="quiet" type="button" onClick={() => setStarting(false)}>
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
