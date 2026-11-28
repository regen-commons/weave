/** What opening a Certified project from its card on Your Initiatives does. */
export type ProjectOpening = "workspace" | "choose" | "start";

/**
 * A group project with a team workspace opens it. Otherwise an unlinked card on this device may be
 * this project's own work, such as one just published from an external editor, so the person
 * chooses: link that card and keep its needs and offers, or start a separate card from the project.
 * A name never decides. With no such card, the project starts a card of its own. A personal
 * project's workspace held its private saved card, and those are gone (DL-155, D49), so it opens
 * as a project does.
 */
export function projectOpening(
  record: { readonly workspace: boolean; readonly group?: string | null },
  device: { readonly card: boolean; readonly linked: boolean },
): ProjectOpening {
  if (record.workspace && record.group !== null) return "workspace";
  return device.card && !device.linked ? "choose" : "start";
}

/**
 * The team workspace of the project the card on this device is linked to. It is the same
 * initiative as that card, so a list shows the card once and reaches the workspace from it. A
 * personal workspace, or a team's for another project, is a different thing and keeps its own row.
 */
export function deviceTeamWorkspace<Record extends { readonly uri: string; readonly group?: string | null }>(
  project: { readonly uri: string } | null | undefined,
  workspaces: readonly Record[],
): Record | undefined {
  return project ? workspaces.find((record) => !!record.group && record.uri === project.uri) : undefined;
}
