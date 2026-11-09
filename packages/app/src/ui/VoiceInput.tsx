/** Voice input molecule: Speak is present only when local speech is usable. */
export function VoiceInput({
  available,
  listening,
  transcript,
  language,
  onLanguage,
  onStart,
  onStop,
}: {
  available: boolean;
  listening: boolean;
  transcript: string;
  language: string;
  onLanguage(value: string): void;
  onStart(): void;
  onStop(): void;
}) {
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
  return (
    <div className="rc-voice-input">
      <div className="rc-field">
        <label htmlFor="speech-language">Speaking language</label>
        <select
          className="rc-input"
          id="speech-language"
          value={language}
          disabled={listening}
          onChange={(event) => onLanguage(event.target.value)}
        >
          {languages.map((code) => (
            <option key={code} value={code}>
              {new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code}
            </option>
          ))}
        </select>
      </div>
      {available || listening ? (
        <button
          className="rc-button"
          data-variant="primary"
          data-size="lg"
          type="button"
          aria-pressed={listening}
          onClick={listening ? onStop : onStart}
        >
          {listening ? "Finish speaking" : "Speak"}
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
    </div>
  );
}
