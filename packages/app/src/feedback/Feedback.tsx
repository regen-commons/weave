import { useId, useRef, useState } from "react";
import { Link } from "../router.tsx";
import { TaskDialog } from "../ui/TaskDialog.tsx";
import {
  CATEGORY_LABELS,
  FEEDBACK,
  FEEDBACK_CATEGORIES,
  failureText,
  feedbackBody,
  messageProblem,
  sendFeedback,
  weavePagePath,
  websiteFormHref,
  type FeedbackCategory,
  type SendOutcome,
} from "./send.ts";

/**
 * The feedback tab on every page, and the sheet it opens (`rc-feedback-tab`). On a phone a focused step
 * leaves the tab out, where it would sit over the step's fields. The prototype build has no server, so
 * it has no tab.
 */
export function Feedback({ pathname, form }: { pathname: string; form: boolean }) {
  const [open, setOpen] = useState(false);
  // A sent message starts the next one afresh; an unsent one stays, closed and opened again.
  const [round, setRound] = useState(0);
  const sent = useRef(false);
  if (__WEAVE_PROTOTYPE__) return null;
  return (
    <>
      <button
        className="rc-feedback-tab"
        type="button"
        aria-haspopup="dialog"
        data-from={form ? "wide" : undefined}
        onClick={() => setOpen(true)}
      >
        Feedback
      </button>
      <TaskDialog
        title="Share Your Feedback"
        open={open}
        retainContents
        onClose={() => {
          setOpen(false);
          if (sent.current) {
            sent.current = false;
            setRound((value) => value + 1);
          }
        }}
      >
        <FeedbackForm
          key={round}
          pathname={pathname}
          onSent={() => (sent.current = true)}
          onDone={() => setOpen(false)}
        />
      </TaskDialog>
    </>
  );
}

function FeedbackForm({ pathname, onSent, onDone }: { pathname: string; onSent(): void; onDone(): void }) {
  const id = useId();
  const [message, setMessage] = useState("");
  const [categories, setCategories] = useState<readonly FeedbackCategory[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [failure, setFailure] = useState<Exclude<SendOutcome, { ok: true }>["reason"] | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const honeypot = useRef<HTMLInputElement>(null);
  /** One key per set of words, so a retry of the same words is kept once. */
  const request = useRef<{ body: string; key: string } | null>(null);
  const page = weavePagePath(pathname) ?? FEEDBACK.pathPrefix;

  if (done)
    return (
      <div className="rc-stack">
        <p className="rc-meta" role="status" tabIndex={-1} ref={(line) => line?.focus()}>
          Sent to the Regen Commons stewards. Thank you.
        </p>
        <div className="rc-dialog-foot">
          <button className="rc-button" data-variant="primary" type="button" onClick={onDone}>
            Done
          </button>
        </div>
      </div>
    );

  return (
    <form
      className="rc-form"
      data-width="full"
      noValidate
      aria-busy={busy || undefined}
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        const wrong = messageProblem(message);
        setProblem(wrong);
        setFailure(null);
        if (wrong) {
          document.getElementById(`${id}-message`)?.focus();
          return;
        }
        const body = feedbackBody({ message, categories, pathname, honeypot: honeypot.current?.value ?? "" });
        if (request.current?.body !== body) request.current = { body, key: crypto.randomUUID() };
        setBusy(true);
        const outcome = await sendFeedback(body, request.current.key);
        setBusy(false);
        if (outcome.ok) {
          onSent();
          setDone(true);
        } else setFailure(outcome.reason);
      }}
    >
      <p className="rc-meta">
        Tell us what could work better, or share an idea. It goes to the Regen Commons stewards with the address of
        this page, and nothing else. Leave out passwords and other private details.
      </p>
      <div className="rc-field">
        <label htmlFor={`${id}-message`}>Your feedback</label>
        {problem ? (
          <p className="rc-error" role="alert" id={`${id}-message-hint`}>
            {problem}
          </p>
        ) : (
          <p className="rc-hint" id={`${id}-message-hint`}>
            Between 3 and 5,000 characters.
          </p>
        )}
        <textarea
          className="rc-input"
          id={`${id}-message`}
          rows={5}
          maxLength={FEEDBACK.maxLength}
          aria-describedby={`${id}-message-hint`}
          aria-invalid={problem ? true : undefined}
          data-task-focus
          value={message}
          readOnly={busy}
          onChange={(event) => setMessage(event.target.value)}
        />
      </div>
      <fieldset>
        <legend>What kind of feedback is this?</legend>
        <p className="rc-hint">Optional. Pick any that fit.</p>
        <div className="rc-chip-group">
          {FEEDBACK_CATEGORIES.map((category) => (
            <label className="rc-chip" key={category}>
              <input
                className="rc-check"
                type="checkbox"
                checked={categories.includes(category)}
                onChange={(event) =>
                  setCategories((current) =>
                    event.target.checked ? [...current, category] : current.filter((value) => value !== category),
                  )
                }
              />
              {CATEGORY_LABELS[category]}
            </label>
          ))}
        </div>
      </fieldset>
      {/* Never shown and never reached by the keyboard. A form filler that fills every field fills it,
          and the server then sends nothing on. */}
      <div hidden>
        <label htmlFor={`${id}-confirm`}>Leave this field empty</label>
        <input id={`${id}-confirm`} name={FEEDBACK.honeypot} ref={honeypot} tabIndex={-1} autoComplete="off" />
      </div>
      <p className="rc-meta">Sent with this page's address: {page}</p>
      {failure && (
        <p className="rc-error" role="alert">
          {failureText(failure)}{" "}
          {failure !== "offline" && failure !== "invalid_feedback" && (
            <Link href={websiteFormHref(pathname)}>Open the website's feedback form</Link>
          )}
        </p>
      )}
      <div className="rc-dialog-foot">
        <button className="rc-button" data-variant="primary" type="submit" aria-busy={busy || undefined}>
          {busy ? "Sending Feedback" : "Send Feedback"}
        </button>
      </div>
    </form>
  );
}
