import { useState } from "react";
import { TaskDialog } from "../ui/TaskDialog.tsx";
import { useSocialFixture } from "./context.tsx";
import { ExampleDoor } from "./Door.tsx";
import { partnerAccessOf } from "./fixture.ts";
export type SocialIntent =
  | { kind: "remind"; id: string; name: string }
  | { kind: "lead"; id: string; name: string };
/** Example reminders and saved partners. A saved partner stays in the workspace and sends no invitation. */
export function SocialAction({ intent }: { intent: SocialIntent }) {
  const fixture = useSocialFixture();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!import.meta.env.DEV || !fixture) return null;
  const { state, service, refresh } = fixture;
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
  if (intent.kind === "lead") {
    // A saved partner is kept with the linked project, so the control waits for a link.
    if (partnerAccessOf(state) === "unlinked") return null;
    const saved = state.leads.includes(intent.id);
    return (
      <>
        <button
          className="rc-button"
          data-variant={saved ? "quiet" : "secondary"}
          data-size="sm"
          type="button"
          disabled={busy}
          aria-label={`${saved ? "Remove from saved" : "Save"}: ${intent.name}`}
          onClick={() =>
            void run(async () => {
              if (saved) await service.removeLead(intent.id);
              else await service.saveLead(intent.id);
              setMessage(saved ? "Removed from saved." : "Saved. No invitation is sent.");
            })
          }
        >
          {saved ? "Remove from saved" : "Save"}
        </button>
        {message && (
          <p className="rc-meta" role={failed ? "alert" : "status"}>
            {message}
          </p>
        )}
      </>
    );
  }
  const completed = state.reminders.includes(intent.id);
  return (
    <>
      <button
        className="rc-button"
        data-variant="secondary"
        type="button"
        disabled={completed}
        onClick={() => setOpen(true)}
      >
        {completed ? "Reminder on" : "Remind me"}
      </button>
      <TaskDialog title="Remind me" open={open} onClose={() => setOpen(false)}>
        {completed ? (
          <p role="status">Reminder on for {intent.name}.</p>
        ) : !state.identity ? (
          <ExampleDoor
            onDone={(result) => {
              if (result === "cancelled") setOpen(false);
            }}
          />
        ) : (
          <div className="rc-stack">
            <p>One reminder for {intent.name}, a week before it closes.</p>
            <button
              className="rc-button"
              data-variant="primary"
              type="button"
              disabled={busy}
              onClick={() => void run(() => service.remind(intent.id))}
            >
              Turn on the reminder
            </button>
          </div>
        )}
        {message && !completed && (
          <p className="rc-notice" data-tone={failed ? "warning" : "info"} role={failed ? "alert" : "status"}>
            {message}
          </p>
        )}
      </TaskDialog>
    </>
  );
}
