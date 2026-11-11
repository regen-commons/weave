import { NewProject } from "../initiative/NewProject.tsx";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { useDraft } from "../describe/use-draft.ts";
import { draftWithRecord } from "../initiative/import.ts";
import { cardRoute, publicCard } from "../initiative/status.ts";
import { pathTo } from "../routes.ts";
import { Link } from "../router.tsx";
import { Facts } from "../ui/Facts.tsx";
import { keepFocusOnPage } from "../ui/focus.ts";
import { StatusLine } from "../ui/StatusLine.tsx";
import { TaskDialog } from "../ui/TaskDialog.tsx";
import { useSocial } from "./context.tsx";
import { useAccountDoor } from "../account/door.tsx";
import { ConsentButton } from "../initiative/ProjectConsent.tsx";
import { ExampleDoor } from "./Door.tsx";
import { EXAMPLE_HANDLE, type CertifiedRecord, type ProjectLink } from "./fixture.ts";
import { linkEffect, projectLine, publicFacts, replacesCard, workspaceLine, workspaceOpenLine } from "./words.ts";

/** The choice that creates a project instead of linking one the person already has. */
const NEW = "new";

/**
 * Ties the initiative to a Certified project: one the person already has, or a new one made
 * from the checked card. The live adapter reads projects and membership; development examples
 * use the same choice with synthetic records.
 */
export function ProjectStep({ onDone, onCancel }: { onDone(link: ProjectLink): void; onCancel(): void }) {
  const fixture = useSocial();
  const { draft, controller } = useDraft();
  const name = useId();
  const [choice, setChoice] = useState<string | null>(null);
  const [step, setStep] = useState<"review" | "certified">("review");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    body.current?.querySelector<HTMLElement>("[data-task-focus]:not(:disabled)")?.focus();
  }, [step]);
  if (!fixture) return null;
  const { service, state, refresh } = fixture;
  const live = fixture.mode === "live";
  const records = [...state.records, ...(state.workspaces ?? [])];
  const card = publicCard(draft);
  const picked = records.length ? choice : NEW;
  const record = records.find((item) => item.uri === picked);
  function choose(value: string) {
    setChoice(value);
    setMessage("");
    setFailed(false);
  }
  async function run(action: () => Promise<ProjectLink>) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    setFailed(false);
    try {
      const link = await action();
      refresh();
      onDone(link);
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : "This step did not work. Try again.");
    } finally {
      setBusy(false);
    }
  }
  function link(chosen: CertifiedRecord) {
    return run(async () => {
      const linked = await service.linkProject(chosen.uri);
      // The project's four public details are now the card's. Needs and offers are untouched.
      controller.change((current) => draftWithRecord(current, chosen));
      return linked;
    });
  }
  if (live && !records.length && (fixture.loading || fixture.problem)) return <div className="rc-stack">
    <p role="status">{fixture.loading ? "Checking your Certified projects" : fixture.problem}</p>
    {fixture.consent ? <ConsentButton action="membership" /> : fixture.problem && <button className="rc-button" data-variant="secondary" type="button" onClick={() => void fixture.reload?.()}>Try again</button>}
    <button className="rc-button" data-variant="quiet" type="button" onClick={onCancel}>Not now</button>
  </div>;
  if (live && picked === NEW) return <NewProject onDone={() => { void fixture.reload?.(); onCancel(); }} />;
  if (import.meta.env.DEV && step === "certified")
    return (
      <div className="rc-stack" aria-busy={busy} ref={body}>
        <p className="rc-eyebrow">Certified</p>
        <h3 className="rc-heading" data-size="section">
          Create this project as {EXAMPLE_HANDLE}?
        </h3>
        <p>{card.name}, in a new group with you as its only owner.</p>
        <div className="rc-action-bar">
          <button
            className="rc-button"
            data-variant="primary"
            type="button"
            data-task-focus
            disabled={busy}
            onClick={() => void run(() => service.createProject(card))}
          >
            {failed ? "Try again" : "Create project"}
          </button>
          <button
            className="rc-button"
            data-variant="quiet"
            type="button"
            disabled={busy}
            onClick={() => {
              setStep("review");
              setFailed(false);
              setMessage("Nothing was created.");
            }}
          >
            Cancel
          </button>
        </div>
        {message && (
          <p className="rc-notice" data-tone="warning" role="alert">
            {message}
          </p>
        )}
      </div>
    );
  return (
    <div className="rc-stack" aria-busy={busy} ref={body}>
      {fixture.loading && <p role="status">Checking your Certified projects</p>}
      {fixture.problem && <p role="status">{fixture.problem}</p>}
      {fixture.consent && <ConsentButton action="membership" />}
      {records.length > 0 ? (
        <fieldset className="rc-choice-group">
          <legend>Which project is this initiative?</legend>
          {records.map((item, index) => (
            <label className="rc-choice" key={item.uri}>
              <input
                className="rc-check"
                type="radio"
                name={name}
                checked={choice === item.uri}
                disabled={busy}
                data-task-focus={index === 0 || undefined}
                onChange={() => choose(item.uri)}
              />
              <span className="rc-choice-text">
                <span className="rc-choice-title">{item.name}</span>
                <span className="rc-choice-note">{projectLine(item)}</span>
              </span>
            </label>
          ))}
          <label className="rc-choice">
            <input
              className="rc-check"
              type="radio"
              name={name}
              checked={choice === NEW}
              disabled={busy}
              onChange={() => choose(NEW)}
            />
            <span className="rc-choice-text">
              <span className="rc-choice-title">A new project</span>
              <span className="rc-choice-note">Create it on Certified from your card.</span>
            </span>
          </label>
        </fieldset>
      ) : (
        <p>You have no project on Certified yet.</p>
      )}
      {record && (
        <section className="rc-section">
          <h3 className="rc-heading" data-size="section">
            Use {record.name}
          </h3>
          <Facts items={publicFacts(record)} />
          <p>{live ? "Linking keeps your needs and offers private. Saving to a team is a separate reviewed action." : linkEffect(record, !!state.saved)}</p>
          <p>
            {replacesCard(card, record)
              ? live ? "The verified name and description replace those on your card. Your needs and offers stay as they are." : "These four details replace the ones on your card. Your needs and offers stay as they are."
              : "Your needs and offers stay as they are."}
          </p>
          <details>
            <summary className="rc-footer-link">Where these details come from</summary>
            <p>
              {live ? "The name and description come from Certified. Other details stay on your card." : "After linking, the name, place, description and links come from Certified. Change them there and Weave shows the latest."}
            </p>
          </details>
          <div className="rc-action-bar">
            <button
              className="rc-button"
              data-variant="primary"
              type="button"
              disabled={busy}
              onClick={() => void link(record)}
            >
              Link this project
            </button>
            <button className="rc-button" data-variant="quiet" type="button" disabled={busy} onClick={onCancel}>
              Not now
            </button>
          </div>
        </section>
      )}
      {picked === NEW &&
        (draft.confirmed ? (
          <section className="rc-section">
            <h3 className="rc-heading" data-size="section">
              Create {card.name} on Certified
            </h3>
            <Facts items={publicFacts(card)} />
            <p>Anyone can read these four details on Certified. Your needs and offers stay private.</p>
            {state.saved && (
              <p>
                Your saved initiative moves to the new group's team workspace. Teammates who join later can
                see it there.
              </p>
            )}
            <p className="rc-meta">It starts in a group with you as its only owner, so teammates can join later.</p>
            <div className="rc-action-bar">
              <button
                className="rc-button"
                data-variant="primary"
                type="button"
                data-task-focus={records.length === 0 || undefined}
                onClick={() => {
                  setMessage("");
                  setFailed(false);
                  setStep("certified");
                }}
              >
                Continue to Certified
              </button>
              <Link className="rc-button" data-variant="quiet" href={pathTo("check-card")} onClick={onCancel}>
                Change these details
              </Link>
              <button className="rc-button" data-variant="quiet" type="button" onClick={onCancel}>
                Not now
              </button>
            </div>
          </section>
        ) : (
          <section className="rc-section">
            <p>Finish describing your initiative first. Certified shows its name, place, description and links.</p>
            <div className="rc-action-bar">
              <Link
                className="rc-button"
                data-variant="primary"
                href={pathTo(cardRoute(draft))}
                data-task-focus={records.length === 0 || undefined}
                onClick={onCancel}
              >
                {draft.proposal ? "Check your card" : "Describe your initiative"}
              </Link>
              <button className="rc-button" data-variant="quiet" type="button" onClick={onCancel}>
                Not now
              </button>
            </div>
          </section>
        ))}
      {!record && picked !== NEW && (
        <div className="rc-action-bar">
          <button className="rc-button" data-variant="quiet" type="button" onClick={onCancel}>
            Not now
          </button>
        </div>
      )}
      {message &&
        (failed ? (
          <p className="rc-notice" data-tone="warning" role="alert">
            {message}
          </p>
        ) : (
          <p className="rc-notice" data-tone="info" role="status">
            {message}
          </p>
        ))}
      {live && record?.role === "owner" && failed && service.recoverWorkspace && <details>
        <summary className="rc-footer-link">Recover a workspace without an admin</summary>
        <p>A verified Certified group owner can recover an existing workspace only when it has no active admin. Saved team work is preserved.</p>
        <button className="rc-button" data-variant="secondary" type="button" disabled={busy}
          onClick={() => void run(async () => { await service.recoverWorkspace!(record.uri); return projectLinkForRecovery(record); })}>Recover workspace access</button>
      </details>}
    </div>
  );
}

function projectLinkForRecovery(record: CertifiedRecord): ProjectLink {
  return { ...record, workspace: "open", requestedOn: null, created: false };
}

/** Opens the project step from a page: sign in first when needed, then link or create. */
export function ProjectAction({
  variant = "secondary",
  size,
  children = "Link or create a project",
}: {
  variant?: "primary" | "secondary" | "quiet";
  size?: "sm";
  children?: ReactNode;
}) {
  const fixture = useSocial();
  const [open, setOpen] = useState(false);
  const openDoor = useAccountDoor();
  if (!fixture) return null;
  const close = () => setOpen(false);
  return (
    <>
      <button
        className="rc-button"
        data-variant={variant}
        data-size={size}
        type="button"
        onClick={() => fixture.mode === "live" && !fixture.state.identity ? openDoor("certified") : setOpen(true)}
      >
        {children}
      </button>
      <TaskDialog title="Your Certified project" open={open} onClose={close}>
        {fixture.state.identity ? (
          <ProjectStep onDone={close} onCancel={close} />
        ) : import.meta.env.DEV ? (
          <ExampleDoor
            reason="Sign in with Certified to find your projects."
            onDone={(result) => {
              if (result === "cancelled") close();
            }}
          />
        ) : null}
      </TaskDialog>
    </>
  );
}

/**
 * The row for a linked group project whose team workspace is not open yet: ask for one, or check
 * on the request. The person keeps working privately either way, so it never blocks the page.
 * When the workspace opens while the row is on screen, the row stays to say so.
 */
export function WorkspaceRow({ primary = false, focus = false }: { primary?: boolean; focus?: boolean }) {
  const fixture = useSocial();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  /** The project whose workspace opened here, so a later link to another project does not inherit the line. */
  const [opened, setOpened] = useState<string | null>(null);
  if (!fixture) return null;
  const { service, state, refresh } = fixture;
  const project = state.identity ? state.project : null;
  if (!project) return null;
  const line = workspaceLine(project);
  if (!line && !(project.workspace === "open" && opened === project.uri)) return null;
  const asked = project.workspace === "requested";
  async function run(action: () => Promise<unknown>, row: Element | null) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await action();
      const now = service.snapshot().project;
      // Rendered now, so the focus can move before the browser leaves it on the body.
      flushSync(() => {
        if (now?.workspace === "open") setOpened(now.uri);
        refresh();
      });
      keepFocusOnPage(row);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "This step did not work. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <StatusLine
        actions={
          line ? (
            <button
              className="rc-button"
              data-variant={primary && !asked ? "primary" : "secondary"}
              type="button"
              disabled={busy}
              data-task-focus={focus || undefined}
              onClick={(event) =>
                void run(
                  asked ? () => service.checkAgain() : () => service.requestWorkspace(),
                  event.currentTarget.closest(".rc-status-line"),
                )
              }
            >
              {asked ? "Check again" : project.role === "member" ? "Ask for a team workspace" : "Set up team workspace"}
            </button>
          ) : undefined
        }
      >
        {line ?? workspaceOpenLine(project)}
      </StatusLine>
      {line && (
        <p className="rc-meta">A group admin or owner approves it. You can keep working privately.</p>
      )}
      {message && (
        <p className="rc-notice" data-tone="warning" role="alert">
          {message}
        </p>
      )}
    </>
  );
}
