import { useState } from "react";
/**
 * Shown only when this browser could not store the latest changes. A text copy is explicit and
 * never claims to back up file bytes. Two tabs on one draft never raise it: the latest edit wins
 * and the other version is kept as a backup (DL-112).
 */
export function DraftNotice({
  error,
  text,
  onRetry,
}: {
  error: string | null;
  text: string;
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
        <h2 className="rc-notice-title">Not stored on this device yet</h2>
        <p>{error}</p>
        <div className="rc-action-bar">
          <button className="rc-button" data-variant="secondary" type="button" onClick={onRetry}>
            Try Again
          </button>
          <button className="rc-button" data-variant="secondary" type="button" onClick={copy}>
            Copy Draft Text
          </button>
          <button
            className="rc-button"
            data-variant="quiet"
            type="button"
            onClick={() => setShowText((value) => !value)}
          >
            {showText ? "Hide Text Copy" : "Show Text Copy"}
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
