import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { BROWSER_SPEECH_NOTICE, talkControls, talkHold } from "../describe/speech-setup.ts";
import type { SpeechSetup } from "../describe/use-speech.ts";
import { Icon } from "./Icon.tsx";
import { TaskDialog } from "./TaskDialog.tsx";

const LANGUAGES = ["en-US", "pt-BR", "es-ES", "fr-FR", "de-DE", "sw-KE", "hi-IN", "ar-SA", "zh-CN"];

/**
 * Talk it out (`rc-voice-input`, DL-110): one button, one box and one action. The button turns
 * into Stop in place while the browser listens, and the words appear in the box,
 * whose space is always there. A person who cannot or will not speak types into the same box.
 * The action then structures the words, and its result is said in the line under it, which keeps
 * its height. Nothing on the page moves when any of them is pressed. Where talking goes through
 * the browser's own speech service, the first press on a device asks the person to agree in a
 * dialog, and listening starts only from their agreement. While the browser downloads and sets
 * up its speech pack, the button shows a Spinner and a Progress bar runs beside it; the browser
 * reports no amount, so neither does the bar (DL-125).
 */
export function TalkItOut({
  speech,
  listening,
  language,
  onLanguage,
  onStart,
  onStop,
  value,
  onChange,
  boxLabel,
  hint,
  rows = 4,
  maxLength = 20000,
  actionLabel,
  workingLabel,
  working,
  onAction,
  onCancel,
  status,
  statusId,
  problem,
  lead = false,
  disabled = false,
  actionReady = false,
  secondary = false,
  actions,
}: {
  speech: SpeechSetup;
  listening: boolean;
  language: string;
  onLanguage(value: string): void;
  onStart(): void;
  onStop(): void;
  /** The words in the box: what was said, or what the person typed. */
  value: string;
  onChange(value: string): void;
  boxLabel: string;
  hint?: string;
  rows?: number;
  maxLength?: number;
  /** What the action does with the words, such as "Fill In The Fields". */
  actionLabel: string;
  /** What the same button says while it works. Pressing it then stops the work. */
  workingLabel: string;
  working: boolean;
  onAction(): void;
  onCancel(): void;
  /** One line about what the action did. */
  status: string;
  statusId?: string;
  /** Why the page could not go on from here. It takes the status line's place, as an alert. */
  problem?: string;
  /** The filled button on a page that has nothing typed yet. One primary at a time. */
  lead?: boolean;
  /** Hold a new start, as on a full list. Stopping always works, and the box can still be changed or cleared. */
  disabled?: boolean;
  /** The action has something to work on even with an empty box, such as files added but not read. */
  actionReady?: boolean;
  /**
   * A second Talk it out on the same page. The first one offers the speech setup and says the
   * one line about a browser without speech, so this one stays quiet until talking works.
   */
  secondary?: boolean;
  /** More to do with the words' sources, beside the action: such as Add Files on the describe step. */
  actions?: ReactNode;
}) {
  const id = useId();
  const [choosing, setChoosing] = useState(false);
  const [agreeing, setAgreeing] = useState(false);
  const [focused, setFocused] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  // While listening, the newest words stay in view inside the box.
  useEffect(() => {
    if (listening && box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [listening, value]);
  const controls = talkControls(speech.state, {
    listening,
    setUpHere: speech.setUpHere,
    asking: speech.asking,
    secondary,
    agreed: speech.agreed,
    touch: speech.touch,
  });
  const names = new Intl.DisplayNames(["en"], { type: "language" });
  const languages = [...new Set([...LANGUAGES, ...navigator.languages, language])];
  const hold = talkHold(controls.action, { working, disabled, focused });
  const talk = controls.agreement ? () => setAgreeing(true) : onStart;
  const press =
    hold !== "free"
      ? undefined
      : controls.action === "stop" ? onStop : controls.action === "talk" ? talk : controls.action === "set-up" ? speech.setUp : undefined;
  return (
    <div className="rc-voice-input">
      <div className="rc-voice-slot">
        {controls.action && (
          <button
            className="rc-button"
            data-variant={controls.action === "talk" && lead ? "primary" : "secondary"}
            // Which recognizer it uses, for tests and for anyone reading the page's markup.
            data-speech={controls.mode ?? undefined}
            data-size="lg"
            type="button"
            aria-pressed={controls.action === "talk" || controls.action === "stop" ? listening : undefined}
            // Under way or held, the button keeps the focus, which a disabled button would drop.
            aria-busy={controls.action === "setting-up" || undefined}
            aria-disabled={hold === "held" || undefined}
            disabled={hold === "disabled"}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onClick={press}
          >
            {/* Under way, a Spinner takes the microphone's place, so the button's width holds. */}
            {controls.action === "setting-up" ? <span className="rc-spinner" aria-hidden="true" /> : <Icon name="mic" />}
            {controls.label}
          </button>
        )}
        <div className="rc-voice-aside">
          {/* The browser reports no amount, so the bar only says the work is going on. */}
          {controls.action === "setting-up" && (
            <div className="rc-progress">
              <progress aria-label="Setting up speech on this device" />
            </div>
          )}
          <p className="rc-meta" role="status">
            {controls.note}
          </p>
          {/* The language choice shows where it can help and there is room: not while a longer line explains a setup. */}
          {controls.language && (
            <button className="rc-button" data-variant="quiet" data-size="sm" type="button" onClick={() => setChoosing(true)}>
              Speaking In {names.of(language) ?? language}
            </button>
          )}
        </div>
      </div>
      <div className="rc-field">
        <label htmlFor={`${id}-box`}>{listening ? "Listening" : boxLabel}</label>
        {hint && (
          <p className="rc-hint" id={`${id}-hint`}>
            {hint}
          </p>
        )}
        <textarea
          className="rc-input rc-voice-transcript"
          id={`${id}-box`}
          aria-describedby={hint ? `${id}-hint` : undefined}
          ref={box}
          rows={rows}
          data-sizing="fixed"
          maxLength={maxLength}
          value={value}
          readOnly={listening}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
      <div className="rc-action-bar">
        <button
          className="rc-button"
          data-variant="secondary"
          type="button"
          aria-busy={working || undefined}
          // A full list takes no new words, but words or files already added can still be read again.
          disabled={!working && (listening || !(actionReady || (!disabled && value.trim())))}
          onClick={working ? onCancel : onAction}
        >
          {working && <span className="rc-spinner" aria-hidden="true" />}
          {working ? workingLabel : actionLabel}
        </button>
        {actions}
        <p
          className={problem ? "rc-error rc-status-slot" : "rc-meta rc-status-slot"}
          data-lines="2"
          role={problem ? "alert" : "status"}
          id={statusId}
          tabIndex={statusId ? -1 : undefined}
        >
          {problem || status}
        </p>
      </div>
      {/* Asked in a dialog, so choosing a language never pushes the page down. */}
      <TaskDialog title="Speaking Language" open={choosing} onClose={() => setChoosing(false)}>
        <div className="rc-stack">
          <div className="rc-field">
            <label htmlFor={`${id}-language`}>The language you will speak in</label>
            <p className="rc-hint" id={`${id}-language-hint`}>
              {controls.mode === "browser"
                ? "Your browser's speech service listens for one language at a time."
                : "Speech is recognized on this device, one language at a time."}
            </p>
            <select
              className="rc-input"
              id={`${id}-language`}
              aria-describedby={`${id}-language-hint`}
              value={language}
              data-task-focus
              onChange={(event) => onLanguage(event.target.value)}
            >
              {languages.map((code) => (
                <option key={code} value={code}>
                  {names.of(code) ?? code}
                </option>
              ))}
            </select>
          </div>
          <div className="rc-action-bar">
            <button className="rc-button" data-variant="primary" type="button" onClick={() => setChoosing(false)}>
              Done
            </button>
          </div>
        </div>
      </TaskDialog>
      {/* Asked before the first use on a device. Nothing listens until the person agrees. */}
      <TaskDialog title={BROWSER_SPEECH_NOTICE.title} open={agreeing} onClose={() => setAgreeing(false)}>
        <div className="rc-stack">
          {BROWSER_SPEECH_NOTICE.body.map((line) => (
            <p key={line}>{line}</p>
          ))}
          <div className="rc-action-bar">
            <button
              className="rc-button"
              data-variant="primary"
              type="button"
              onClick={() => {
                speech.consent.agree();
                setAgreeing(false);
                onStart();
              }}
            >
              {BROWSER_SPEECH_NOTICE.agree}
            </button>
            <button className="rc-button" data-variant="quiet" type="button" onClick={() => setAgreeing(false)}>
              {BROWSER_SPEECH_NOTICE.decline}
            </button>
          </div>
        </div>
      </TaskDialog>
    </div>
  );
}
