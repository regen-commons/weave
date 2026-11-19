import { resumeLabel } from "../home.ts";
import { pathTo, type RouteName } from "../routes.ts";
import type { DeviceDraft } from "./contracts.ts";
import type { DraftController } from "./controller.ts";

/**
 * Starts a new initiative in this tab, the way every "Start An Initiative" does: the drafts
 * already on the device stay as they are, and the tab moves to a blank card that is stored at its
 * first word. A blank card the tab never stored is the new one, so loading the start address twice
 * never makes two (`DraftController.startNewInitiative` says exactly which cards count). It waits
 * for the first read of storage and pins the card to the tab, so a draft read late can never take
 * its place. `leave` calls it off when the person goes elsewhere first.
 */
export async function beginNewInitiative(controller: DraftController, leave?: AbortSignal): Promise<DeviceDraft> {
  await controller.initialize();
  leave?.throwIfAborted();
  return controller.startNewInitiative(leave);
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
