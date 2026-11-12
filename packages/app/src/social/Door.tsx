import { useContext, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useDraft } from "../describe/use-draft.ts";
import { cardName, publicKey } from "../initiative/status.ts";
import { useCardStatus } from "../initiative/use-card-status.ts";
import { keepFocusOnPage } from "../ui/focus.ts";
import { InformationContext } from "../ui/information-context.ts";
import { useSocialFixture } from "./context.tsx";
import { EXAMPLE_HANDLE } from "./fixture.ts";
import { AboutCertified } from "../ui/AboutCertified.tsx";

export type DoorIntent = "keep" | "sign-in" | "certified";
export type DoorResult = "saved" | "signed-in" | "cancelled";

/**
 * The example account door: one sentence, one trip to Certified, straight back.
 * Signing in only identifies the person. Saving is the next tap and says where the card goes.
 */
export function ExampleDoor({
  save = false,
  direct = false,
  reason,
  onDone,
}: {
  save?: boolean;
  /** The page already made the offer, so the door opens on Certified's page. */
  direct?: boolean;
  /** Why to sign in, when the door opens for something other than saving. */
  reason?: string;
  onDone(result: DoorResult): void;
}) {
  const fixture = useSocialFixture();
  const status = useCardStatus();
  // The door can open from the frame, outside the page's information dialogs.
  const information = useContext(InformationContext);
  const [step, setStep] = useState<"offer" | "certified" | "save">(() =>
    save && fixture?.state.identity ? "save" : direct ? "certified" : "offer",
  );
  const [arrived, setArrived] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    body.current?.querySelector<HTMLElement>("[data-task-focus]:not(:disabled)")?.focus();
  }, [step]);
  if (!import.meta.env.DEV || !fixture) return null;
  const { service, refresh } = fixture;
  // Nothing to save right now: the saved copy is current, or the card is not checked yet.
  const kept = status.state === "saved" || status.state === "shared" || status.state === "published";
  async function comeBack() {
    setBusy(true);
    try {
      await service.signIn();
      refresh();
      setMessage("");
      if (save) {
        setArrived(true);
        setStep("save");
      } else onDone("signed-in");
    } finally {
      setBusy(false);
    }
  }
  if (step === "save")
    return (
      <div className="rc-stack" ref={body}>
        {arrived && <p role="status">Signed in with Certified.</p>}
        {status.save?.needs === "save" ? (
          <>
            <p>{status.save.note}</p>
            <div className="rc-action-bar">
              <ExampleSave focus onSaved={() => onDone("saved")} onFailed={setMessage} />
              <button className="rc-button" data-variant="quiet" type="button" onClick={() => onDone("signed-in")}>
                Not now
              </button>
            </div>
          </>
        ) : (
          <>
            <p>{kept ? status.line : "You can save once your card is checked."}</p>
            <div className="rc-action-bar">
              <button
                className="rc-button"
                data-variant="primary"
                type="button"
                data-task-focus
                onClick={() => onDone("signed-in")}
              >
                Continue
              </button>
            </div>
          </>
        )}
        {message && (
          <p className="rc-notice" data-tone="warning" role="alert">
            {message}
          </p>
        )}
      </div>
    );
  if (step === "certified")
    return (
      <div className="rc-stack" aria-busy={busy} ref={body}>
        <p className="rc-eyebrow">Certified</p>
        <h3 className="rc-heading" data-size="section">
          Continue to Weave as {EXAMPLE_HANDLE}?
        </h3>
        <p className="rc-meta">Weave learns who you are on Certified and nothing else.</p>
        <div className="rc-action-bar">
          <button
            className="rc-button"
            data-variant="primary"
            type="button"
            data-task-focus
            disabled={busy}
            onClick={() => void comeBack()}
          >
            Continue as {EXAMPLE_HANDLE}
          </button>
          <button
            className="rc-button"
            data-variant="quiet"
            type="button"
            disabled={busy}
            onClick={() => {
              if (direct) return onDone("cancelled");
              setStep("offer");
              setMessage("Sign-in was cancelled. Your draft is still on this device.");
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  return (
    <div className="rc-stack" ref={body}>
      <p>
        {reason ??
          "Sign in with Certified to save your work and open it on another device. Your saved work stays private in Weave."}
      </p>
      <AboutCertified />
      <div className="rc-action-bar">
        <button
          className="rc-button"
          data-variant="primary"
          type="button"
          data-task-focus
          onClick={() => setStep("certified")}
        >
          Sign in with Certified
        </button>
        <button className="rc-button" data-variant="quiet" type="button" onClick={() => onDone("cancelled")}>
          Not now
        </button>
        {information && (
          <button className="rc-button" data-variant="quiet" type="button" onClick={() => information("storage")}>
            What is saved
          </button>
        )}
      </div>
      {message && (
        <p className="rc-notice" data-tone="info" role="status">
          {message}
        </p>
      )}
    </div>
  );
}

/**
 * The explicit Save. It is its own tap, never a side effect of signing in, and it goes
 * to the linked project's team workspace when one is open and to private saves otherwise.
 */
export function ExampleSave({
  variant = "primary",
  size,
  focus = false,
  onSaved,
  onFailed,
}: {
  variant?: "primary" | "secondary" | "quiet";
  size?: "sm";
  focus?: boolean;
  onSaved?(): void;
  onFailed(message: string): void;
}) {
  const fixture = useSocialFixture();
  const { draft } = useDraft();
  const status = useCardStatus();
  const [busy, setBusy] = useState(false);
  if (!import.meta.env.DEV || !fixture || status.save?.needs !== "save") return null;
  const { service, state, refresh } = fixture;
  const label = status.save.label;
  async function save(row: Element | null) {
    if (busy) return;
    setBusy(true);
    onFailed("");
    try {
      await service.save(
        cardName(draft),
        state.project?.workspace === "open" ? "workspace" : "private",
        publicKey(draft),
      );
      // Saving takes this button away. Rendered now, so the line that says "Saved" can take the focus.
      flushSync(refresh);
      onSaved?.();
      keepFocusOnPage(row);
    } catch (error) {
      onFailed(error instanceof Error ? error.message : "This save did not work. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      className="rc-button"
      data-variant={variant}
      data-size={size}
      type="button"
      disabled={busy}
      data-task-focus={focus || undefined}
      onClick={(event) => void save(event.currentTarget.closest(".rc-status-line"))}
    >
      {label}
    </button>
  );
}
