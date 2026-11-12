import { useEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { useDraft } from "../describe/use-draft.ts";
import { saveForProject } from "../initiative/project-save.ts";
import { keepFocusOnPage } from "../ui/focus.ts";
import { accountMessage } from "./client.ts";
import { useSocial } from "../social/context.tsx";
import { useAccount } from "./context.tsx";

/** Save is the confirming tap. The surrounding row states the audience and the fields that stay on device. */
export function PrivateSaveAction({ children = "Save privately", size, onSaved, onFailed }: {
  children?: ReactNode; size?: "sm"; onSaved?(): void; onFailed(message: string): void;
}) {
  const { state, refresh, savedCheck } = useAccount();
  const { controller } = useDraft();
  const social = useSocial();
  const [busy, setBusy] = useState(false);
  const task = useRef<AbortController | null>(null);
  useEffect(() => () => task.current?.abort(), []);
  async function save(row: Element | null) {
    if (!state?.user || task.current) return;
    const current = new AbortController(); task.current = current; setBusy(true); onFailed("");
    try {
      if (social?.mode === "live") await social.service.save("", "private");
      else { await saveForProject(controller, state.user.id, current.signal); await refresh(); }
      current.signal.throwIfAborted();
      flushSync(() => onSaved?.()); keepFocusOnPage(row);
    } catch (error) { if (!current.signal.aborted) onFailed(accountMessage(error)); }
    finally { if (task.current === current) { task.current = null; if (!current.signal.aborted) setBusy(false); } }
  }
  return <button className="rc-button" data-variant="primary" data-size={size} type="button"
    disabled={busy || !state?.user || savedCheck === "checking" || savedCheck === "unavailable" || savedCheck === "changed"}
    onClick={event => void save(event.currentTarget.closest(".rc-status-line"))}>{children}</button>;
}
