import { useEffect, useState } from "react";
import type { SavedInitiative } from "@weave/api/account-contract";
import { projectRequest } from "../initiative/projects-client.ts";
import { publicListingPage, publicSupportStatuses } from "../partners/public-support-state.ts";
import { PublicSupport } from "../partners/PublicSupport.tsx";
import { StatusLine } from "../ui/StatusLine.tsx";
import { TaskDialog } from "../ui/TaskDialog.tsx";
import { NOT_PUBLIC_LINE, PUBLISH_ACTION, publicListingsLine } from "../initiative/status.ts";

/**
 * The saved card's public listings row, and Make It Public from it. Its review retains server receipts, conflict
 * handling and the exact retry command. Sharing for matching has ended (DL-155, step 5), so there is no sharing row.
 */
export function LiveExposure({ saved, readOnly = false, publishHeld = false, online = true, onChanged, refreshVersion = 0 }: {
  saved: SavedInitiative; readOnly?: boolean; online?: boolean;
  /** The device moved on from this save, so publishing from it would publish an earlier version. */
  publishHeld?: boolean;
  /** Changes when listings changed elsewhere on the page, so the row reads again. */
  refreshVersion?: number;
  onChanged?(): void;
}) {
  const [open, setOpen] = useState(false);
  const [opened, setOpened] = useState(false);
  const [version, setVersion] = useState(0);
  const [published, setPublished] = useState("Checking public listings");
  useEffect(() => {
    const controller = new AbortController();
    if (!online) { setPublished("Reconnect to check public listings."); return; }
    void projectRequest({ action: "support_state", workspaceId: saved.id }, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      const page = publicListingPage(result, saved.id);
      const pending = page.listings.find(listing => ["conflict", "withdrawal_pending", "publish_pending"].includes(listing.status));
      const count = page.listings.filter(listing => listing.status === "published").length;
      setPublished(pending ? publicSupportStatuses[pending.status]! : count ? publicListingsLine(count) : NOT_PUBLIC_LINE);
    }).catch(() => { if (!controller.signal.aborted) setPublished("Public listing status could not be checked."); });
    return () => controller.abort();
  }, [saved.id, saved.revision, version, online, refreshVersion]);
  function close() {
    // Native close events can arrive after the next task has opened.
    setOpen(false);
    setVersion(value => value + 1); onChanged?.();
  }
  return <>
    <StatusLine actions={!readOnly && !publishHeld && <button className="rc-button" data-variant="secondary" data-size="sm" type="button" disabled={!online}
      onClick={() => { setOpened(true); setOpen(true); }}>{PUBLISH_ACTION}</button>}>{published}</StatusLine>
    <TaskDialog title={PUBLISH_ACTION} open={open} onClose={close} retainContents>
      {opened && <PublicSupport workspaceId={saved.id} saved={saved} readOnly={readOnly || publishHeld} expanded visible={open} />}
    </TaskDialog>
  </>;
}
