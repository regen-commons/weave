import { resumeLabel } from "../home.ts";
import { pathTo, type RouteName } from "../routes.ts";
import type { DeviceDraft } from "./contracts.ts";
import type { DraftController } from "./controller.ts";
import { hasDraft } from "./view.ts";

/**
 * Starts a new initiative in this tab, the way every "Start An Initiative" does: the drafts
 * already on the device stay as they are, and the tab moves to a blank card that is stored at its
 * first word. When the tab is already on a blank card, that card is the new one, so loading the
 * start address twice, by a reload or a second press, never makes two. It waits for the first read
 * of storage, so a draft read late can never take the place of the new card.
 */
export async function beginNewInitiative(controller: DraftController): Promise<DeviceDraft> {
  await controller.initialize();
  const current = controller.getSnapshot().draft;
  return hasDraft(current) ? controller.startNew() : current;
}

/**
 * The one door on a page that is not fitted to an initiative yet. With a card in progress it
 * continues that card and says so; without one it starts a new card.
 */
export function describeDoor(started: boolean, route: RouteName): { href: string; label: string } {
  return started
    ? { href: pathTo(route), label: resumeLabel(route) }
    : { href: pathTo("new-initiative"), label: "Describe Your Initiative" };
}
