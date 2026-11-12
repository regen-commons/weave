import { useId } from "react";
import { Icon } from "./Icon.tsx";

/**
 * Voice input molecule: the Speak button leads, and the language choice sits behind a small
 * disclosure under it. Speak is present only when local speech is usable.
 */
export function VoiceInput({
  available,
  listening,
  transcript,
  language,
  onLanguage,
  onStart,
  onStop,
  variant = "primary",
  label = "Speak",
  focus = false,
  disabled = false,
}: {
  available: boolean;
  listening: boolean;
  transcript: string;
  language: string;
  onLanguage(value: string): void;
  onStart(): void;
  onStop(): void;
  /** Secondary where the page already has its one primary action. */
  variant?: "primary" | "secondary";
  /** What the button says before the person speaks. */
  label?: string;
  /** Take the keyboard focus on arrival, when the person got here by choosing to speak. */
  focus?: boolean;
  /** Hold a new start while other work on the same list is open. Finishing always works. */
  disabled?: boolean;
}) {
  const id = useId();
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
      {available || listening ? (
        <button
          className="rc-button"
          data-variant={variant}
          data-size="lg"
          type="button"
          aria-pressed={listening}
          autoFocus={focus}
          disabled={disabled && !listening}
          onClick={listening ? onStop : onStart}
        >
          <Icon name="mic" />
          {listening ? "Finish speaking" : label}
        </button>
      ) : (
        <p className="rc-meta">Local speech is not available for this language. You can type below.</p>
      )}
      {listening && (
        <p className="rc-meta" role="status">
          Listening on this device. Audio is not sent to a server.
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
