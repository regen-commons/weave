import type { ReactNode, RefObject } from "react";
import type { MatchingMutation } from "./matching-client.ts";

/** Every matching presentation keeps the same command available after an uncertain response. */
export function MatchingFeedback({ busy, loading, error, notice, pending, online, readOnly, reviewing = false,
  noticeRef, onRetry, onRefresh, refreshBlocked = false, first }: {
  busy: boolean; loading: boolean; error: string; notice: string; pending: MatchingMutation | null;
  online: boolean; readOnly: boolean; reviewing?: boolean; noticeRef?: RefObject<HTMLParagraphElement | null>;
  onRetry(command: MatchingMutation): void; onRefresh?(): void; refreshBlocked?: boolean;
  /**
   * What holds the page's shape while the first answer is on its way and nothing is on the page yet:
   * a skeleton that says what is loading to assistive technology. The page that knows the shape
   * passes it, so this component stays free of other modules.
   */
  first?: ReactNode;
}) {
  // Progress is said to assistive technology and drawn as the shape of what is coming, or not drawn
  // at all once the page has its content, so a line of text never pushes that content down.
  return <>
    {loading && first ? first
      : (loading || busy) && <p className="rc-visually-hidden" role="status">{loading ? "Checking partners" : "Updating"}</p>}
    {error && !reviewing && <p className="rc-notice" data-tone="warning" role="alert">{error}</p>}
    {notice && <p className="rc-meta" role="status" tabIndex={-1} ref={noticeRef}>{notice}</p>}
    {pending && !reviewing && !readOnly && <div className="rc-action-bar">
      <button className="rc-button" data-variant="secondary" type="button" disabled={busy || !online}
        onClick={() => onRetry(pending)}>Try Again</button>
    </div>}
    {onRefresh && <button className="rc-button" data-variant="quiet" type="button" disabled={refreshBlocked}
      onClick={onRefresh}>Check Again</button>}
  </>;
}
