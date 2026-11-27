import { useEffect, useState } from "react";
import { PublicSupport } from "../partners/PublicSupport.tsx";
import { StatusLine } from "../ui/StatusLine.tsx";
import { TaskDialog } from "../ui/TaskDialog.tsx";
import { projectListings, type ProjectListings as Found } from "./project-listings.ts";
import { projectRequest } from "./projects-client.ts";

/**
 * The public listings of the person's own project, for a card that is not the project's saved workspace, as
 * after Make It Public from the draft (DL-155): where they stand, and a dialog to check or withdraw each one.
 * Nothing shows until something from the project is public or on its way.
 */
export function ProjectListings({ projectUri, refreshVersion = 0 }: { projectUri: string; refreshVersion?: number }) {
  const [found, setFound] = useState<Found | null>(null);
  const [unchecked, setUnchecked] = useState(false);
  const [open, setOpen] = useState(false);
  const [opened, setOpened] = useState(false);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setUnchecked(false);
    projectListings(projectUri, (body, signal) => projectRequest(body, signal), controller.signal).then(
      (result) => { if (!controller.signal.aborted) setFound(result); },
      () => { if (!controller.signal.aborted) { setFound(null); setUnchecked(true); } });
    return () => controller.abort();
  }, [projectUri, refreshVersion, version]);
  if (unchecked) return <StatusLine>Public listings could not be checked.</StatusLine>;
  if (!found) return null;
  return (
    <>
      <StatusLine actions={
        <button className="rc-button" data-variant="secondary" data-size="sm" type="button" onClick={() => { setOpened(true); setOpen(true); }}>
          See Public Listings
        </button>
      }>{found.line}</StatusLine>
      <TaskDialog title="Public Listings" open={open} onClose={() => { setOpen(false); setVersion((value) => value + 1); }} retainContents>
        {opened && <PublicSupport workspaceId={found.workspaceId} readOnly={false} expanded visible={open} />}
      </TaskDialog>
    </>
  );
}
