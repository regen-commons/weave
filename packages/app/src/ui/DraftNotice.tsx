import { useState } from "react";
/** Storage failure Notice. A text copy is explicit and never claims to back up file bytes. */
export function DraftNotice({
  error,
  text,
  conflict,
  onRetry,
}: {
  error: string | null;
  text: string;
  conflict: boolean;
  onRetry(): void;
}) {
  const [showText, setShowText] = useState(false);
  const [copied, setCopied] = useState(false);
  if (!error) return null;
  async function copy() {
    try {
      if (!navigator.clipboard) throw new Error();
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setShowText(true);
    }
  }
  return (
    <section className="rc-notice" data-tone="warning" role="status">
      <div className="rc-notice-body">
        <h2 className="rc-notice-title">Your latest changes need care</h2>
        <p>{error}</p>
        <div className="rc-action-bar">
          {!conflict && (
            <button className="rc-button" data-variant="secondary" type="button" onClick={onRetry}>
              Try device storage again
            </button>
          )}
          <button className="rc-button" data-variant="secondary" type="button" onClick={copy}>
            Copy draft text
          </button>
          <button
            className="rc-button"
            data-variant="quiet"
            type="button"
            onClick={() => setShowText((value) => !value)}
          >
            {showText ? "Hide text copy" : "Show text copy"}
          </button>
        </div>
        <p className="rc-meta">
          A text copy does not include file bytes. Keep this tab open for files that have not been stored.
        </p>
        {copied && <p className="rc-meta">Draft text copied.</p>}
        {showText && (
          <div className="rc-field">
            <label htmlFor="draft-text-copy">Your draft text</label>
            <textarea
              className="rc-input"
              id="draft-text-copy"
              rows={8}
              value={text}
              readOnly
              onFocus={(event) => event.target.select()}
            />
          </div>
        )}
      </div>
    </section>
  );
}
