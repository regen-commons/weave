import { useEffect, useRef, useState, type ReactNode } from "react";
import { CAPITALS } from "../capitals.ts";
import { useDraft } from "../describe/use-draft.ts";
import { cardRoute, chosenEntries, entryCount, GROUP_PUBLISH_AUTHORITY, PUBLISH_ACTION, publicCard, publicKey } from "../initiative/status.ts";
import { askTerms } from "../intake/presentation.ts";
import { useCardStatus } from "../initiative/use-card-status.ts";
import { pathTo, type RouteName } from "../routes.ts";
import { Link } from "../router.tsx";
import { Facts } from "../ui/Facts.tsx";
import { TaskDialog } from "../ui/TaskDialog.tsx";
import { useSocialFixture } from "./context.tsx";
import { ExampleDoor, ExampleSave } from "./Door.tsx";
import { publishGate, publishLabel } from "./gate.ts";
import { ProjectStep, WorkspaceRow } from "./Project.tsx";
import { publicFacts } from "./words.ts";

const CARD_STEPS: Partial<Record<RouteName, string>> = {
  initiative: "Describe your initiative",
  needs: "Add needs and offers",
};

/**
 * Opens the review for publishing on Certified, where anyone can read an entry. Saving does not publish.
 * An example of the target, in development only.
 */
export function PublishAction({
  label,
  variant = "secondary",
  size,
}: {
  label?: string;
  variant?: "primary" | "secondary" | "quiet";
  size?: "sm";
}) {
  const fixture = useSocialFixture();
  const status = useCardStatus();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!import.meta.env.DEV || !fixture) return null;
  const { service, refresh } = fixture;
  const exposure = status.publishing;
  // A withdrawal waits on Certified, so the only thing to do is look again.
  const waiting = exposure?.state === "withdrawing";
  async function check() {
    if (busy) return;
    setBusy(true);
    try {
      await service.checkAgain();
      refresh();
    } finally {
      setBusy(false);
    }
  }
  const close = () => setOpen(false);
  return (
    <>
      <button
        className="rc-button"
        data-variant={variant}
        data-size={size}
        type="button"
        disabled={busy}
        onClick={() => (waiting ? void check() : setOpen(true))}
      >
        {waiting ? publishLabel("withdrawing") : (label ?? publishLabel(exposure?.state))}
      </button>
      <TaskDialog title={PUBLISH_ACTION} open={open} onClose={close}>
        <PublishSteps onClose={close} />
      </TaskDialog>
    </>
  );
}

/** One step of the dialog. A new step takes the focus, so the keyboard stays inside the dialog. */
function Stage({ children }: { children: ReactNode }) {
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    body.current
      ?.querySelector<HTMLElement>("[data-task-focus]:not(:disabled), button:not(:disabled), a[href]")
      ?.focus();
  }, []);
  return (
    <div className="rc-stack" ref={body}>
      {children}
    </div>
  );
}

/** Shows the one step still missing, then the review. */
function PublishSteps({ onClose }: { onClose(): void }) {
  const fixture = useSocialFixture();
  const { draft } = useDraft();
  const status = useCardStatus();
  if (!import.meta.env.DEV || !fixture) return null;
  const gate = publishGate(fixture.state, status);
  if (gate === "sign-in")
    return (
      <ExampleDoor
        reason="Sign in with Certified to publish."
        onDone={(result) => {
          if (result === "cancelled") onClose();
        }}
      />
    );
  if (gate === "project")
    return (
      <div className="rc-stack">
        <p>A listing is published under a Certified project.</p>
        <ProjectStep onDone={() => undefined} onCancel={onClose} />
      </div>
    );
  if (gate === "authority")
    return (
      <Stage key={gate}>
        <p>{GROUP_PUBLISH_AUTHORITY}</p>
        <div className="rc-action-bar">
          <button className="rc-button" data-variant="secondary" type="button" data-task-focus onClick={onClose}>
            Close
          </button>
        </div>
      </Stage>
    );
  if (gate === "workspace")
    return (
      <Stage key={gate}>
        <p>A group publishes from its team workspace.</p>
        <WorkspaceRow primary focus />
        <div className="rc-action-bar">
          <button className="rc-button" data-variant="quiet" type="button" onClick={onClose}>
            Not Now
          </button>
        </div>
      </Stage>
    );
  if (gate === "card") {
    const route = cardRoute(draft);
    return (
      <Stage key={gate}>
        <p>Check your initiative, needs and offers first.</p>
        <div className="rc-action-bar">
          <Link className="rc-button" data-variant="primary" href={pathTo(route)} data-task-focus onClick={onClose}>
            {CARD_STEPS[route] ?? "Open Your Card"}
          </Link>
          <button className="rc-button" data-variant="quiet" type="button" onClick={onClose}>
            Not Now
          </button>
        </div>
      </Stage>
    );
  }
  if (gate === "save") return <SaveGate onClose={onClose} />;
  return <Review onClose={onClose} />;
}

/** Publishing uses the saved copy, so an unsaved card saves first, as its own tap. */
function SaveGate({ onClose }: { onClose(): void }) {
  const status = useCardStatus();
  const [message, setMessage] = useState("");
  if (!import.meta.env.DEV || status.save?.needs !== "save") return null;
  return (
    <Stage>
      <p>
        {status.unsaved ? "Save your changes first." : "Save your initiative first."} Publishing uses the saved copy.
      </p>
      <p className="rc-meta">{status.save.note}</p>
      <div className="rc-action-bar">
        <ExampleSave focus onFailed={setMessage} />
        <button className="rc-button" data-variant="quiet" type="button" onClick={onClose}>
          Not Now
        </button>
      </div>
      {message && (
        <p className="rc-notice" data-tone="warning" role="alert">
          {message}
        </p>
      )}
    </Stage>
  );
}

/**
 * The review: who will see it, where it goes, what exactly they see, and the needs and offers to
 * send. One confirming tap, and the page reports the outcome once the service answers.
 */
function Review({ onClose }: { onClose(): void }) {
  const fixture = useSocialFixture();
  const { draft } = useDraft();
  const status = useCardStatus();
  const [picked, setPicked] = useState<readonly string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    body.current
      ?.querySelector<HTMLElement>("[data-task-focus]:not(:disabled), button:not(:disabled), a[href]")
      ?.focus();
  }, []);
  if (!import.meta.env.DEV || !fixture) return null;
  const { service, state, refresh } = fixture;
  const project = state.project;
  if (!project) return null;
  const exposure = status.publishing;
  const entries = chosenEntries(draft, "all");
  // An entry needs a kind of support before it can leave the team. A private save does not.
  const open = entries.filter((entry) => entry.kinds.length > 0).map((entry) => entry.id);
  const sent = state.published?.entries;
  const before = sent === undefined ? null : sent === "all" ? open : open.filter((id) => sent.includes(id));
  // A first publish starts from what an example card shared earlier, so an entry kept from matching is not offered to everyone.
  const earlier = state.shared?.entries;
  const start = earlier === undefined || earlier === "all" ? open : open.filter((id) => earlier.includes(id));
  const ids = (picked ?? before ?? start).filter((id) => open.includes(id));
  const chosen = entries.filter((entry) => ids.includes(entry.id));
  const live = exposure?.state === "on" || exposure?.state === "changed";
  const same = !!before && before.length === ids.length && before.every((id) => ids.includes(id));
  const dirty = !live || exposure?.state === "changed" || !same;
  function toggle(id: string) {
    setPicked(ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]);
    setMessage("");
  }
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    setFailed(false);
    try {
      await action();
      refresh();
      onClose();
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : "This step did not work. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="rc-stack" aria-busy={busy} ref={body}>
      <p>
        {live && exposure
          ? exposure.line
          : `Anyone can read what you publish here. It goes on Certified as a listing under ${project.name}.`}
      </p>
      {open.length > 0 ? (
        <fieldset className="rc-choice-group">
          <legend>Needs and offers to publish</legend>
          {entries.map((entry, index) => (
            <label className="rc-choice" key={entry.id}>
              <input
                className="rc-check"
                type="checkbox"
                checked={ids.includes(entry.id)}
                disabled={busy || entry.kinds.length === 0}
                data-task-focus={index === 0 || undefined}
                onChange={() => toggle(entry.id)}
              />
              <span className="rc-choice-text">
                <span className="rc-choice-title">{entry.title}</span>
                <span className="rc-choice-note">{entryNote(entry)}</span>
              </span>
            </label>
          ))}
        </fieldset>
      ) : (
        <>
          <p>
            {entries.length
              ? "Add a kind of support to a need or offer first. It is how others find it."
              : "Add a need or an offer first."}
          </p>
          <div className="rc-action-bar">
            <Link className="rc-button" data-variant="primary" href={pathTo("needs")} data-task-focus onClick={onClose}>
              Change Needs And Offers
            </Link>
          </div>
        </>
      )}
      {open.length > 0 && (
        <>
          <p className="rc-meta">
            Each listing shows its kinds of support and details, and your project's name, place, description and links.
          </p>
          <details>
            <summary className="rc-footer-link">See exactly what they see</summary>
            <div className="rc-stack">
              <Facts items={publicFacts(publicCard(draft))} />
              <ul className="rc-ask-summary">
                {chosen.map((entry) => (
                  <li key={entry.id}>
                    <strong>{entry.title}</strong>
                    <p className="rc-meta">{entryNote(entry)}</p>
                    {entry.value.description && entry.value.description !== entry.title && (
                      <p>{entry.value.description}</p>
                    )}
                    {entry.value.purpose && entry.kind === "needs" && <p>{entry.value.purpose}</p>}
                    {entry.value.audience && entry.kind === "offers" && <p>For {entry.value.audience}</p>}
                    <p className="rc-meta">{askTerms(entry.value, entry.kind)}</p>
                  </li>
                ))}
              </ul>
            </div>
          </details>
        </>
      )}
      <div className="rc-action-bar">
        {dirty && open.length > 0 && (
          <button
            className="rc-button"
            data-variant="primary"
            type="button"
            disabled={busy}
            onClick={() => void run(() => service.publish(ids, publicKey(draft, ids)))}
          >
            Publish
            {chosen.length ? ` ${entryCount(chosen)}` : ""}
          </button>
        )}
        {live && (
          <button
            className="rc-button"
            data-variant="secondary"
            type="button"
            disabled={busy}
            onClick={() => void run(() => service.withdraw())}
          >
            Ask To Withdraw
          </button>
        )}
        <button className="rc-button" data-variant="quiet" type="button" disabled={busy} onClick={onClose}>
          {live && !dirty ? "Done" : "Not Now"}
        </button>
      </div>
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
    </div>
  );
}

function entryNote(entry: { kind: "needs" | "offers"; kinds: readonly string[] }): string {
  const titles = CAPITALS.filter(({ key }) => entry.kinds.includes(key))
    .map(({ title }) => title)
    .join(", ");
  const what = entry.kind === "needs" ? "A need." : "An offer.";
  return titles ? `${what} ${titles}` : `${what} Add a kind of support to publish it.`;
}
