import { useEffect, useState } from "react";
import { useAccount } from "./context.tsx";
import { sessionEndedNotice } from "./session-end.ts";

/**
 * Says so when the session ended without the person pressing Sign Out, so the screen never changes
 * silently. Kept by the page frame, which outlives each page. The header's live region reads it out;
 * the notice at the top of the page shows it.
 */
export function useSessionEndedNotice(pathname: string) {
  const { ending, acknowledgeEnding } = useAccount();
  const [endedOn, setEndedOn] = useState<string | null>(null);
  const notice = sessionEndedNotice(ending, endedOn, pathname);
  // Kept in step while rendering, so the notice shows on the render that took the account away.
  if (notice.endedOn !== endedOn) setEndedOn(notice.endedOn);
  useEffect(() => {
    if (notice.acknowledge) acknowledgeEnding();
  }, [notice.acknowledge, acknowledgeEnding]);
  return notice.text;
}

export function SessionEndedNotice({ text }: { text: string }) {
  return text ? (
    <p className="rc-notice" data-tone="info">
      {text}
    </p>
  ) : null;
}
