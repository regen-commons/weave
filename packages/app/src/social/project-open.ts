/** What opening a Certified project from its card on Your Initiatives does. */
export type ProjectOpening = "workspace" | "choose" | "start";

/**
 * A project with a team workspace opens it. Otherwise an unlinked card on this device may be this
 * project's own work, such as one just published from an external editor, so the person chooses:
 * link that card and keep its needs and offers, or start a separate card from the project. A name
 * never decides. With no such card, the project starts a card of its own.
 */
export function projectOpening(
  record: { readonly workspace: boolean },
  device: { readonly card: boolean; readonly linked: boolean },
): ProjectOpening {
  if (record.workspace) return "workspace";
  return device.card && !device.linked ? "choose" : "start";
}
