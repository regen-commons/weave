import type { RefObject } from "react";
import type { MatchingMutation } from "./matching-client.ts";

/** Every matching presentation keeps the same command available after an uncertain response. */
export function MatchingFeedback({ busy, loading, error, notice, pending, online, readOnly, reviewing = false,
  noticeRef, onRetry, onRefresh, refreshBlocked = false }: {
  busy: boolean; loading: boolean; error: string; notice: string; pending: MatchingMutation | null;
  online: boolean; readOnly: boolean; reviewing?: boolean; noticeRef?: RefObject<HTMLParagraphElement | null>;
  onRetry(command: MatchingMutation): void; onRefresh?(): void; refreshBlocked?: boolean;
}) {
  return <>
    {(loading || busy) && <p role="status">{loading ? "Checking partners" : "Updating"}</p>}
    {error && !reviewing && <p className="rc-notice" data-tone="warning" role="alert">{error}</p>}
    {notice && <p className="rc-meta" role="status" tabIndex={-1} ref={noticeRef}>{notice}</p>}
    {pending && !reviewing && !readOnly && <div className="rc-action-bar">
      <button className="rc-button" data-variant="secondary" type="button" disabled={busy || !online}
        onClick={() => onRetry(pending)}>Try again</button>
    </div>}
    {onRefresh && <button className="rc-button" data-variant="quiet" type="button" disabled={refreshBlocked}
      onClick={onRefresh}>Check again</button>}
  </>;
}
