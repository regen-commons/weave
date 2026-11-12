import { useEffect, useState } from "react";
import type { SavedInitiative } from "@weave/api/account-contract";
import { matchingRequest } from "../partners/matching-client.ts";
import { projectRequest } from "../initiative/projects-client.ts";
import { publicListingPage, publicSupportStatuses } from "../partners/public-support-state.ts";
import { PublicSupport } from "../partners/PublicSupport.tsx";
import { SavedMatching } from "../partners/PartnerExperience.tsx";
import { StatusLine } from "../ui/StatusLine.tsx";
import { TaskDialog } from "../ui/TaskDialog.tsx";

/** Agreed status rows; their reviews retain server receipts, conflict handling and the exact retry command. */
export function LiveExposure({ saved, owner, readOnly = false, online = true, onExpired, onChanged, team = false }: {
  saved: SavedInitiative; owner: string; readOnly?: boolean; online?: boolean; team?: boolean;
  onExpired(): void; onChanged?(): void;
}) {
  const [step, setStep] = useState<"share" | "publish" | null>(null);
  const [opened, setOpened] = useState({ share: false, publish: false });
  const [version, setVersion] = useState(0);
  const [shared, setShared] = useState("Checking sharing status");
  const [published, setPublished] = useState("Checking public listings");
  useEffect(() => {
    const controller = new AbortController();
    if (!online) { setShared("Reconnect to check sharing."); setPublished("Reconnect to check public listings."); return; }
    void matchingRequest(saved.id, "state", {}, controller.signal).then(state => {
      if (controller.signal.aborted) return;
      if (state.initiativeRevision !== saved.revision) { setShared("The saved entries changed. Reload before sharing."); return; }
      const active = state.entries.filter(entry => entry.sharing === "shared" && entry.status === "open"
        && (!entry.expiresAt || Date.parse(entry.expiresAt) > Date.now()));
      setShared(active.length ? `${active.length} ${active.length === 1 ? "entry shared" : "entries shared"} with people signed in.`
        : state.entries.some(entry => entry.sharing === "needs_review") ? "Changed entries need review before matching."
          : `Not shared. Only ${team ? "your team sees" : "you see"} your needs and offers.`);
    }).catch(() => { if (!controller.signal.aborted) setShared("Sharing status could not be checked."); });
    void projectRequest({ action: "support_state", workspaceId: saved.id }, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      const page = publicListingPage(result, saved.id);
      const pending = page.listings.find(listing => ["conflict", "withdrawal_pending", "publish_pending"].includes(listing.status));
      const count = page.listings.filter(listing => listing.status === "published").length;
      setPublished(pending ? publicSupportStatuses[pending.status]! : count ? `${count} public ${count === 1 ? "listing" : "listings"} on AT Protocol.` : "Not published.");
    }).catch(() => { if (!controller.signal.aborted) setPublished("Public listing status could not be checked."); });
    return () => controller.abort();
  }, [saved.id, saved.revision, version, online, team]);
  const active = { id: saved.id, owner, revision: saved.revision, document: saved.document, contentKey: JSON.stringify(saved.document) };
  function close(panel: "share" | "publish") {
    // Native close events can arrive after the next task has opened.
    setStep(current => current === panel ? null : current);
    setVersion(value => value + 1); onChanged?.();
  }
  function show(next: "share" | "publish") { setOpened(current => ({ ...current, [next]: true })); setStep(next); }
  return <>
    <StatusLine actions={!readOnly && <button className="rc-button" data-variant="primary" data-size="sm" type="button" disabled={!online}
      onClick={() => show("share")}>Share for matching</button>}>{shared}</StatusLine>
    <StatusLine actions={!readOnly && <button className="rc-button" data-variant="secondary" data-size="sm" type="button" disabled={!online}
      onClick={() => show("publish")}>Publish on Certified</button>}>{published}</StatusLine>
    <TaskDialog title="Share for matching" open={step === "share"} onClose={() => close("share")} retainContents>
      {opened.share && <SavedMatching key={saved.revision} active={active} synced online={online} compact={false}
        onExpired={onExpired} fixture={false} team={team} readOnly={readOnly} presentation="sharing" visible={step === "share"} />
      }
    </TaskDialog>
    <TaskDialog title="Publish on Certified" open={step === "publish"} onClose={() => close("publish")} retainContents>
      {opened.publish && <PublicSupport workspaceId={saved.id} saved={saved} readOnly={readOnly} expanded visible={step === "publish"} />}
    </TaskDialog>
  </>;
}
