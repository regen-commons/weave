import { useState } from "react";
import { useDraft } from "../describe/use-draft.ts";
import { likelyDuplicate } from "../initiative/duplicates.ts";
import { draftWithRecord } from "../initiative/import.ts";
import { publicCard } from "../initiative/status.ts";
import { useSocial } from "./context.tsx";

/** Projects the person said are a different initiative, for this visit. */
const different = new Set<string>();

/**
 * Duplicate prompt: when the card on this device looks like one of the person's Certified
 * projects, it offers that project before a second copy starts: on the needs step, which every
 * way through the first step reaches, and again where the card is saved. It never links on its
 * own. Example world only, until Weave can read a person's projects.
 */
export function DuplicateNotice() {
  const social = useSocial();
  const { draft, controller } = useDraft();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [, setAnswered] = useState(0);
  if (!social?.state.identity) return null;
  const note = message ? (
    <p className="rc-notice" data-tone={failed ? "warning" : "info"} role={failed ? "alert" : "status"}>
      {message}
    </p>
  ) : null;
  if (social.state.project) return note;
  const match = likelyDuplicate(publicCard(draft), [...social.state.records, ...(social.state.workspaces ?? [])]);
  if (!match || different.has(`${social.state.identity.id ?? social.state.identity.handle}/${draft.id}/${match.uri}`)) return note;
  async function use() {
    if (busy || !match || !social) return;
    setBusy(true);
    setMessage("");
    setFailed(false);
    try {
      await social.service.linkProject(match.uri);
      // The project's four public details become the card's. Needs and offers stay as they are.
      controller.change((current) => draftWithRecord(current, match));
      social.refresh();
      setMessage(`Your card now uses ${match.name} from Certified. Your needs and offers are unchanged.`);
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : "This did not work. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="rc-notice" data-tone="info" aria-label="Already on Certified">
        <div className="rc-notice-body">
          <p>
            This looks like <strong>{match.name}</strong>, your project on Certified. Use that project so your
            initiative is not listed twice.
          </p>
          <div className="rc-action-bar">
            <button className="rc-button" data-variant="secondary" type="button" disabled={busy} onClick={() => void use()}>
              Use this project
            </button>
            <button
              className="rc-button"
              data-variant="quiet"
              type="button"
              disabled={busy}
              onClick={() => {
                different.add(`${social.state.identity!.id ?? social.state.identity!.handle}/${draft.id}/${match.uri}`);
                setAnswered((count) => count + 1);
              }}
            >
              It's a different initiative
            </button>
          </div>
        </div>
      </section>
      {note}
    </>
  );
}
