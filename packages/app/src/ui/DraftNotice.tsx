import { useId, useState } from "react";
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
  const title = useId();
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
  // Only the problem and the copy's outcome are announced. The whole notice as one live region would
  // read its buttons again, and the draft's whole text once Show Text Copy adds it (WCAG 4.1.3).
  return (
    <section className="rc-notice" data-tone="warning" aria-labelledby={title}>
      <div className="rc-notice-body">
        <h2 className="rc-notice-title" id={title}>Not stored on this device yet</h2>
        <p role="alert">{error}</p>
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
        <p className={copied ? "rc-meta" : "rc-visually-hidden"} role="status">
          {copied ? "Draft text copied." : ""}
        </p>
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
