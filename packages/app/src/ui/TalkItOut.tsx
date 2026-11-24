import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { STOP_WAIT_NO_WORDS_MS } from "../describe/speech.ts";
import { CLOUD_FINISH_MS, cloudSession } from "../describe/speech-cloud.ts";
import {
  BROWSER_SPEECH_NOTICE,
  CLOUD_SPEECH_NOTICE,
  DISCARD_RECORDING,
  recordingLabel,
  holdsTalkRoom,
  talkControls,
  talkHold,
} from "../describe/speech-setup.ts";
import type { SpeechSetup } from "../describe/use-speech.ts";
import { Icon } from "./Icon.tsx";
import { TaskDialog } from "./TaskDialog.tsx";

const LANGUAGES = ["en-US", "pt-BR", "es-ES", "fr-FR", "de-DE", "sw-KE", "hi-IN", "ar-SA", "zh-CN"];

/**
 * Talk it out (`rc-voice-input`, DL-110): one button, one box and one action. The button turns
 * into Stop in place while the browser listens, and the words appear in the box,
 * whose space is always there. Stop answers the press at once: the button reads Finishing until
 * the recognizer has handed over its last words (DL-133). A person who cannot or will not speak
 * types into the same box. The action then structures the words, and its result is said in the line under it, which keeps
 * its height. Nothing on the page moves when any of them is pressed. Where talking goes through
 * the browser's own speech service, or a recording is sent to be turned into text, the first
 * press on a device asks the person to agree in a dialog that says where their voice goes, and
 * listening starts only from their agreement. While the browser downloads and sets
 * up its speech pack, the button shows a Spinner and a Progress bar runs beside it; the browser
 * reports no amount, so neither does the bar (DL-127).
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
  // Stop was pressed here. The page ends listening only when the recognizer has handed over its
  // last words, which can take a moment, so the button says Finishing from the press itself.
  const [stopPressed, setStopPressed] = useState(false);
  if (stopPressed && !listening) setStopPressed(false);
  // Where a recording is made (cloud speech), its session says where it stands: still opening the
  // microphone, recording, or on its way, which the time limit can bring about with no press at all.
  const cloud = speech.state === "cloud";
  const session = useSyncExternalStore(cloudSession.subscribe, cloudSession.view);
  const recording = cloud && listening ? session : null;
  const stopping = listening && (stopPressed || recording?.phase === "sending");
  // A session ends inside STOP_WAIT_NO_WORDS_MS of its Stop, or inside CLOUD_FINISH_MS where a
  // recording is sent. If the page is still listening after that, the press did not reach a
  // session, so Stop comes back and can be pressed again.
  useEffect(() => {
    if (!stopPressed) return;
    const timer = setTimeout(() => setStopPressed(false), (cloud ? CLOUD_FINISH_MS : STOP_WAIT_NO_WORDS_MS) + 500);
    return () => clearTimeout(timer);
  }, [stopPressed, cloud]);
  // Cloud speech shows no words while it records, so the box's label counts the time instead.
  // The time is always counted from this recording's own start, never carried over from the last one.
  const since = recording?.phase === "recording" ? recording.since : null;
  const [clock, setClock] = useState(0);
  useEffect(() => {
    if (since === null) return;
    const tick = () => setClock(Date.now());
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [since]);
  const elapsed = since === null ? 0 : Math.max(0, (clock - since) / 1000);
  const talkButton = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  // While listening, the newest words stay in view inside the box.
  useEffect(() => {
    if (listening && box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [listening, value]);
  const controls = talkControls(speech.state, {
    listening,
    stopping,
    starting: recording?.phase === "starting",
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
  // Each way of talking that leaves the device has its own notice, and its own agreement behind it.
  const notice = cloud ? CLOUD_SPEECH_NOTICE : BROWSER_SPEECH_NOTICE;
  const stop = () => {
    setStopPressed(true);
    onStop();
  };
  const press =
    hold !== "free"
      ? undefined
      : controls.action === "stop" ? stop : controls.action === "talk" ? talk : controls.action === "set-up" ? speech.setUp : undefined;
  // Under way: setting up speech, or finishing the words after Stop. The button waits in place.
  const underWay = controls.action === "setting-up" || controls.action === "finishing";
  return (
    <div className="rc-voice-input">
      <div className="rc-voice-slot">
        {/* Until the browser answers, the button's room is held, so the button arrives in place. */}
        {!controls.action && holdsTalkRoom(speech.state, { asking: speech.asking, secondary }) && (
          <span className="rc-skeleton" data-shape="room" aria-hidden="true">
            <span className="rc-button" data-variant="secondary" data-size="lg">
              <Icon name="mic" />
              Set Up Speech
            </span>
          </span>
        )}
        {controls.action && (
          <button
            className="rc-button"
            ref={talkButton}
            data-variant={controls.action === "talk" && lead ? "primary" : "secondary"}
            // Which recognizer it uses, for tests and for anyone reading the page's markup.
            data-speech={controls.mode ?? undefined}
            data-size="lg"
            type="button"
            // No aria-pressed: the label itself changes from Talk It Out to Stop, and a screen
            // reader told both would say "Stop, pressed" (WCAG 4.1.2).
            // Under way or held, the button keeps the focus, which a disabled button would drop.
            aria-busy={underWay || undefined}
            aria-disabled={hold === "held" || undefined}
            disabled={hold === "disabled"}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onClick={press}
          >
            {/* Under way, a Spinner takes the microphone's place, so the button's width holds. */}
            {underWay ? <span className="rc-spinner" aria-hidden="true" /> : <Icon name="mic" />}
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
          {/* While a recording is made, the way to drop it unsent. Stop sends it; this never does. */}
          {recording?.phase === "recording" && !stopping && (
            <button
              className="rc-button"
              data-variant="quiet"
              data-size="sm"
              data-voice-discard=""
              type="button"
              onClick={() => {
                cloudSession.discard();
                // The button goes away with the recording, so the focus goes back to Talk It Out.
                talkButton.current?.focus();
              }}
            >
              {DISCARD_RECORDING}
            </button>
          )}
        </div>
      </div>
      <div className="rc-field">
        <label htmlFor={`${id}-box`}>
          {!listening || stopping
            ? boxLabel
            : !recording
              ? "Listening"
              : recordingLabel(recording.phase === "starting" ? "starting" : since === null ? "example" : "recording", elapsed)}
        </label>
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
        {/*
          One slot, two live regions that are always there. A screen reader does not reliably
          follow a role that changes on a live element, so what the action did is said politely in
          one and a problem at once in the other, and only one of them ever has words. The slot
          itself takes the focus a page sends to it.
        */}
        <p
          className={problem ? "rc-error rc-status-slot" : "rc-meta rc-status-slot"}
          data-lines="2"
          id={statusId}
          tabIndex={statusId ? -1 : undefined}
        >
          <span role="status">{problem ? "" : status}</span>
          <span role="alert">{problem ?? ""}</span>
        </p>
      </div>
      {/* Asked in a dialog, so choosing a language never pushes the page down. */}
      <TaskDialog title="Speaking Language" open={choosing} onClose={() => setChoosing(false)}>
        <div className="rc-stack">
          <div className="rc-field">
            <label htmlFor={`${id}-language`}>The language you will speak in</label>
            <p className="rc-hint" id={`${id}-language-hint`}>
              {controls.mode === "cloud"
                ? "The language you choose is sent with the recording, to help turn it into text."
                : controls.mode === "browser"
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
      <TaskDialog title={notice.title} open={agreeing} onClose={() => setAgreeing(false)}>
        <div className="rc-stack">
          {notice.body.map((line) => (
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
              {notice.agree}
            </button>
            <button className="rc-button" data-variant="quiet" type="button" onClick={() => setAgreeing(false)}>
              {notice.decline}
            </button>
          </div>
        </div>
      </TaskDialog>
    </div>
  );
}
