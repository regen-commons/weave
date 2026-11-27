import { useEffect, useState } from "react";
import type { SavedInitiative } from "@weave/api/account-contract";
import { matchingRequest } from "../partners/matching-client.ts";
import { projectRequest } from "../initiative/projects-client.ts";
import { publicListingPage, publicSupportStatuses } from "../partners/public-support-state.ts";
import { PublicSupport } from "../partners/PublicSupport.tsx";
import { SavedMatching } from "../partners/PartnerExperience.tsx";
import { StatusLine } from "../ui/StatusLine.tsx";
import { TaskDialog } from "../ui/TaskDialog.tsx";
import { NOT_PUBLIC_LINE, PUBLISH_ACTION, publicListingsLine } from "../initiative/status.ts";
import { sharedEntries, sharedLine } from "../partners/use-network-matching.ts";

/**
 * Agreed status rows; their reviews retain server receipts, conflict handling and the exact retry command. Nothing
 * new is shared for matching (DL-155, step 4), so the sharing row shows only while something is still shared, to stop it.
 */
export function LiveExposure({ saved, owner, readOnly = false, online = true, onExpired, onChanged, team = false, refreshVersion = 0 }: {
  saved: SavedInitiative; owner: string; readOnly?: boolean; online?: boolean; team?: boolean;
  /** Changes when sharing changed elsewhere on the page, such as from Partners For You, so the rows read again. */
  refreshVersion?: number;
  /** Hears of a session that ended, after the screen was cleared. */
  onExpired?(): void; onChanged?(): void;
}) {
  const [step, setStep] = useState<"share" | "publish" | null>(null);
  const [opened, setOpened] = useState({ share: false, publish: false });
  const [version, setVersion] = useState(0);
  // The share row's line, or null when nothing is shared and there is nothing to stop; `stoppable` once a share is found.
  const [shared, setShared] = useState<string | null>("Checking sharing status");
  const [stoppable, setStoppable] = useState(false);
  const [published, setPublished] = useState("Checking public listings");
  useEffect(() => {
    const controller = new AbortController();
    if (!online) { setStoppable(false); setShared("Reconnect to check sharing."); setPublished("Reconnect to check public listings."); return; }
    void matchingRequest(saved.id, "state", {}, controller.signal).then(state => {
      if (controller.signal.aborted) return;
      if (state.initiativeRevision !== saved.revision) { setStoppable(false); setShared("The saved entries changed. Reload to check what is still shared."); return; }
      const active = sharedEntries(state.entries.filter(entry => entry.status === "open"));
      setShared(active.length ? sharedLine(active.length, team) : null);
      setStoppable(active.length > 0);
    }).catch(() => { if (!controller.signal.aborted) { setStoppable(false); setShared("Sharing status could not be checked."); } });
    void projectRequest({ action: "support_state", workspaceId: saved.id }, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      const page = publicListingPage(result, saved.id);
      const pending = page.listings.find(listing => ["conflict", "withdrawal_pending", "publish_pending"].includes(listing.status));
      const count = page.listings.filter(listing => listing.status === "published").length;
      setPublished(pending ? publicSupportStatuses[pending.status]! : count ? publicListingsLine(count) : NOT_PUBLIC_LINE);
    }).catch(() => { if (!controller.signal.aborted) setPublished("Public listing status could not be checked."); });
    return () => controller.abort();
  }, [saved.id, saved.revision, version, online, team, refreshVersion]);
  const active = { id: saved.id, owner, revision: saved.revision, document: saved.document, contentKey: JSON.stringify(saved.document) };
  function close(panel: "share" | "publish") {
    // Native close events can arrive after the next task has opened.
    setStep(current => current === panel ? null : current);
    setVersion(value => value + 1); onChanged?.();
  }
  function show(next: "share" | "publish") { setOpened(current => ({ ...current, [next]: true })); setStep(next); }
  return <>
    {shared !== null && <StatusLine actions={!readOnly && stoppable ? (
      <button className="rc-button" data-variant="secondary" data-size="sm" type="button" disabled={!online}
        onClick={() => show("share")}>Stop Sharing</button>) : undefined}>{shared}</StatusLine>}
    <StatusLine actions={!readOnly && <button className="rc-button" data-variant="secondary" data-size="sm" type="button" disabled={!online}
      onClick={() => show("publish")}>{PUBLISH_ACTION}</button>}>{published}</StatusLine>
    <TaskDialog title="Stop Sharing" open={step === "share"} onClose={() => close("share")} retainContents>
      {opened.share && <SavedMatching key={saved.revision} active={active} synced online={online} compact={false}
        onExpired={onExpired} fixture={false} team={team} readOnly={readOnly} presentation="sharing" visible={step === "share"} />
      }
    </TaskDialog>
    <TaskDialog title={PUBLISH_ACTION} open={step === "publish"} onClose={() => close("publish")} retainContents>
      {opened.publish && <PublicSupport workspaceId={saved.id} saved={saved} readOnly={readOnly} expanded visible={step === "publish"} />}
    </TaskDialog>
  </>;
}
