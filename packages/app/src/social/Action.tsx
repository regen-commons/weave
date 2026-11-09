import { useId, useState } from "react";
import { TaskDialog } from "../ui/TaskDialog.tsx";
import { useSocialFixture } from "./context.tsx";
import type { Visibility } from "./fixture.ts";
export type SocialIntent =
  | { kind: "save" }
  | { kind: "share" }
  | { kind: "remind"; id: string; name: string }
  | { kind: "intro"; ids: readonly string[]; names: readonly string[] };
/** A single example Certified door for private save, sharing, reminders and introductions. */
export function SocialAction({ intent, inline = false }: { intent: SocialIntent; inline?: boolean }) {
  const fixture = useSocialFixture();
  const [open, setOpen] = useState(false);
  const [visibility, setVisibility] = useState<Visibility>(fixture?.state.visibility ?? "private");
  const [onward, setOnward] = useState(false);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const id = useId();
  if (!import.meta.env.DEV || !fixture) return null;
  const { state, service, refresh } = fixture;
  const label =
    intent.kind === "save"
      ? "Save privately"
      : intent.kind === "share"
        ? "Choose who can see it"
        : intent.kind === "remind"
          ? "Remind me"
          : "Ask for an introduction";
  const completed =
    intent.kind === "remind"
      ? state.reminders.includes(intent.id)
      : intent.kind === "intro"
        ? intent.ids.every((id) => state.introductions.includes(id))
        : false;
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
  const body = (
    <>
      <p className="rc-notice" data-tone="info">
        Example Certified sign-in. No real account, publication or request is created.
      </p>
      {completed ? <p role="status">{intent.kind === "remind" ? "Example reminder on. No email is scheduled." : "Example introduction requested. Nothing was sent."}</p> : !state.signedIn ? (
        <div className="rc-stack">
          <p>Continue with Certified. Saving and sharing remain separate choices.</p>
          <button className="rc-button" data-variant="primary" type="button" data-task-focus disabled={busy}
            onClick={() => void run(() => service.signIn())}>Sign in with Certified</button>
        </div>
      ) : !state.saved ? (
        <div className="rc-stack">
          <p>Signed in to the example. Saving is separate from sharing.</p>
          <button
            className="rc-button"
            data-variant="primary"
            type="button"
            disabled={busy}
            onClick={() => void run(() => service.save())}
          >
            Save the example privately
          </button>
        </div>
      ) : intent.kind === "save" ? (
        <p role="status">
          {state.visibility === "private" ? "Example saved privately." : "Example shared with the community."}{" "}
          Only this temporary example changed.
        </p>
      ) : intent.kind === "share" || (intent.kind === "intro" && state.visibility !== "public") ? (
        <form
          className="rc-stack"
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              await service.share(visibility, onward);
              setMessage("Example visibility saved. No real initiative was published.");
            });
          }}
        >
          <fieldset className="rc-choice-group">
            <legend>Who can see it</legend>
            {(
              [
                ["private", "Private, for finding funding", "Only you. Funding stays available."],
                [
                  "public",
                  "Shared with the community",
                  "A public page and directory entry. Partners can find you.",
                ],
              ] as const
            ).map(([value, title, description]) => (
              <label className="rc-choice" key={value}>
                <input
                  className="rc-check"
                  type="radio"
                  name={`${id}-visibility`}
                  checked={visibility === value}
                  onChange={() => setVisibility(value)}
                />
                <span className="rc-choice-text">
                  <span className="rc-choice-title">{title}</span>
                  <span className="rc-choice-note">{description}</span>
                </span>
              </label>
            ))}
          </fieldset>
          {visibility === "public" && (
            <label className="rc-choice">
              <input
                className="rc-switch"
                type="checkbox"
                checked={onward}
                onChange={(event) => setOnward(event.target.checked)}
              />
              <span className="rc-choice-text">
                <span className="rc-choice-title">Also list it on other open directories</span>
                <span className="rc-choice-note">
                  Off until you choose. This example distributes nothing.
                </span>
              </span>
            </label>
          )}
          <button className="rc-button" data-variant="primary" type="submit" disabled={busy}>
            Save this choice
          </button>
        </form>
      ) : intent.kind === "remind" ? (
        <div className="rc-stack">
          <p>
            One reminder for {intent.name}, a week before it closes. This does not enable a weekly update.
          </p>
          <button
            className="rc-button"
            data-variant="primary"
            type="button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await service.remind(intent.id);
                setMessage("Example reminder on. No email is scheduled.");
              })
            }
          >
            Confirm example reminder
          </button>
        </div>
      ) : (
        <form
          className="rc-stack"
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              await service.introduce(intent.ids, note);
              setMessage("Example introduction requested. Nothing was sent.");
            });
          }}
        >
          <p>
            {intent.names.join(", ")} would see your card and the note below. Contact details would be
            exchanged only after they accept.
          </p>
          <div className="rc-field">
            <label htmlFor={`${id}-note`}>A line in your own words</label>
            <textarea
              className="rc-input"
              id={`${id}-note`}
              maxLength={1000}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
          <button className="rc-button" data-variant="primary" type="submit" disabled={busy}>
            Confirm example introduction
          </button>
        </form>
      )}
      {message && !completed && (
        <p className="rc-notice" data-tone={failed ? "warning" : "info"} role={failed ? "alert" : "status"}>
          {message}
        </p>
      )}
    </>
  );
  return inline ? (
    <div className="rc-stack">{body}</div>
  ) : (
    <>
      <button
        className="rc-button"
        data-variant="secondary"
        type="button"
        disabled={completed}
        onClick={() => setOpen(true)}
      >
        {completed
          ? intent.kind === "remind"
            ? "Example reminder on"
            : "Example introduction requested"
          : label}
      </button>
      <TaskDialog title={label} open={open} onClose={() => setOpen(false)}>
        {body}
      </TaskDialog>
    </>
  );
}
