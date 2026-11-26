import { busyProps } from "./busy.ts";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { useDraft } from "../describe/use-draft.ts";
import { saveForProject } from "../initiative/project-save.ts";
import { keepFocusOnPage } from "../ui/focus.ts";
import { accountMessage } from "./client.ts";
import { useSocial } from "../social/context.tsx";
import { Facts } from "../ui/Facts.tsx";
import { TaskDialog } from "../ui/TaskDialog.tsx";
import { useAccount } from "./context.tsx";

/** Where a private save goes and who can read it, said before the first one (QA notes, 25 November 2026). */
export const PRIVATE_SAVE_FACTS = [
  { term: "Where it goes", value: "Your Weave account, kept by Regen Commons." },
  { term: "Who can see it", value: "Only you, when you sign in with Certified. It is not public, not shared for matching and not sent to Certified." },
  { term: "What goes", value: "Your card's name, place, description, needs and offers. Your own words, files and conversations stay on this device." },
] as const;

/**
 * Saves the card privately. With `confirm`, the press first opens a short dialog that says where the
 * card goes and who can read it, and the dialog's Save Privately is the confirming tap; without it the
 * press saves, as for Save Changes to a card the account already holds.
 */
export function PrivateSaveAction({ children = "Save Privately", size, variant = "primary", confirm = false, onSaved, onFailed }: {
  children?: ReactNode; size?: "sm"; variant?: "primary" | "secondary"; confirm?: boolean; onSaved?(): void; onFailed(message: string): void;
}) {
  const [asking, setAsking] = useState(false);
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
  const blocked = !state?.user || savedCheck === "checking" || savedCheck === "unavailable" || savedCheck === "changed";
  const row = useRef<Element | null>(null);
  // The pressed button keeps the focus while the save runs, and `save` declines a second press (`busy.ts`).
  return <>
    <button className="rc-button" data-variant={variant} data-size={size} type="button" {...busyProps(busy && !asking, blocked)}
      onClick={event => {
        row.current = event.currentTarget.closest(".rc-status-line");
        if (confirm) setAsking(true); else void save(row.current);
      }}>
      <span>{children}</span>
      {busy && !asking && <span className="rc-spinner" aria-hidden="true" />}
    </button>
    {confirm && (
      <TaskDialog title="Save Privately In Weave?" open={asking} onClose={() => { if (!busy) setAsking(false); }} blockClose={busy}>
        <div className="rc-stack">
          <Facts items={PRIVATE_SAVE_FACTS} />
          <div className="rc-action-bar">
            <button className="rc-button" data-variant="primary" type="button" {...busyProps(busy, blocked)}
              onClick={() => void save(row.current).then(() => setAsking(false))}>
              <span>Save Privately</span>
              {busy && <span className="rc-spinner" aria-hidden="true" />}
            </button>
            <button className="rc-button" data-variant="quiet" type="button" disabled={busy} onClick={() => setAsking(false)}>Cancel</button>
          </div>
        </div>
      </TaskDialog>
    )}
  </>;
}
