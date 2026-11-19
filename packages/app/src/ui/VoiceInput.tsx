import { useId } from "react";
import { voiceControls, type SpeechSetupState } from "../describe/speech-setup.ts";
import { Icon } from "./Icon.tsx";

/**
 * Voice input molecule: one button leads, and the language choice sits behind a small disclosure
 * under it. The button is Speak where local speech is usable, and the offer to set it up where the
 * browser can. The setup keeps the same button, so the focus stays on it until Speak appears. Where
 * the browser cannot recognize speech on the device, nothing shows.
 */
export function VoiceInput({
  speech,
  setUpHere = false,
  asking = false,
  listening,
  transcript,
  language,
  onLanguage,
  onStart,
  onStop,
  onSetUp,
  variant = "primary",
  label = "Speak",
  focus = false,
  disabled = false,
}: {
  speech: SpeechSetupState;
  /** This page asked for the setup, so it says when speech is ready. */
  setUpHere?: boolean;
  /** The browser is answering for a newly chosen language: only the language choice shows. */
  asking?: boolean;
  listening: boolean;
  transcript: string;
  language: string;
  onLanguage(value: string): void;
  onStart(): void;
  onStop(): void;
  onSetUp(): void;
  /** Secondary where the page already has its one primary action. Setting up speech is always secondary. */
  variant?: "primary" | "secondary";
  /** What the button says before the person speaks. */
  label?: string;
  /** Take the keyboard focus on arrival, when the person got here by choosing to speak. */
  focus?: boolean;
  /** Hold a new start while other work on the same list is open. Finishing always works. */
  disabled?: boolean;
}) {
  const id = useId();
  const controls = voiceControls(speech, { listening, setUpHere, asking });
  if (!controls.shown) return null;
  const speak = controls.action === "speak";
  const languages = [
    ...new Set([
      "en-US",
      "pt-BR",
      "es-ES",
      "fr-FR",
      "de-DE",
      "sw-KE",
      "hi-IN",
      "ar-SA",
      "zh-CN",
      ...navigator.languages,
      language,
    ]),
  ];
  const names = new Intl.DisplayNames(["en"], { type: "language" });
  return (
    <div className="rc-voice-input">
      {controls.action && (
        <button
          className="rc-button"
          data-variant={speak ? variant : "secondary"}
          data-size="lg"
          type="button"
          aria-pressed={speak ? listening : undefined}
          // Under way, the button keeps the focus, which a disabled button would drop.
          aria-busy={controls.action === "setting-up" || undefined}
          autoFocus={focus}
          disabled={speak && disabled && !listening}
          onClick={speak ? (listening ? onStop : onStart) : controls.action === "set-up" ? onSetUp : undefined}
        >
          <Icon name="mic" />
          {listening ? "Finish Speaking" : speak ? label : controls.label}
        </button>
      )}
      {controls.note && (
        <p className="rc-meta" role="status">
          {controls.note}
        </p>
      )}
      {transcript && (
        <p className="rc-voice-transcript" aria-live="polite">
          {transcript}
        </p>
      )}
      <details>
        <summary className="rc-footer-link">Speaking in {names.of(language) ?? language}</summary>
        <div className="rc-field">
          <label htmlFor={id}>Speaking language</label>
          <select
            className="rc-input"
            id={id}
            value={language}
            disabled={listening}
            onChange={(event) => onLanguage(event.target.value)}
          >
            {languages.map((code) => (
              <option key={code} value={code}>
                {names.of(code) ?? code}
              </option>
            ))}
          </select>
        </div>
      </details>
    </div>
  );
}
