import type { DeviceDraft } from "../describe/contracts.ts";
import { hasDraft } from "../describe/view.ts";
import { projectSource } from "../intake/project-page.ts";

/**
 * The drafts in this browser that the list shows: the tab's own as it reads now, then the others,
 * most recently changed first. An empty draft is not an initiative yet, and `hidden` leaves out
 * a card that belongs to another account (DL-055).
 */
export function deviceDrafts(
  current: DeviceDraft,
  stored: readonly DeviceDraft[],
  hidden: (draft: DeviceDraft) => boolean = () => false,
): DeviceDraft[] {
  return [current, ...stored.filter((draft) => draft.id !== current.id)]
    .filter((draft) => hasDraft(draft) && !hidden(draft))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * The card ID this account gave a draft when it was saved privately, before private saving ended:
 * the one it was saved as, or the one a save still waiting for its answer asked for. No saved copy
 * is read or claimed from it (DL-155). It still names the personal project a saved card was linked
 * to, which `linkedProject` reads.
 */
export function boundCardId(draft: DeviceDraft, owner: string | null | undefined): string | null {
  if (!owner) return null;
  const { saved, pending } = draft.account;
  if (saved?.owner === owner) return saved.id;
  return pending?.owner === owner ? pending.id : null;
}

/**
 * True when a draft already stands for a Certified project: this account chose the project for
 * it on this device, or it carries suggestions read from the project's page. The project is then
 * listed once, as that draft, and opening it never starts another.
 */
export function standsForProject(draft: DeviceDraft, uri: string, chosenUri: string | null): boolean {
  if (chosenUri === uri) return true;
  const source = `${projectSource(uri)}:`;
  return (["needs", "offers"] as const).some((kind) =>
    draft[kind].items.some((item) => item.sourceKey?.startsWith(source)),
  );
}

/**
 * The Certified project a draft is linked to, among the ones the account can open: the one the
 * account chose for it on this device, and with no choice the workspace it was saved to. A choice
 * of a project that is no longer listed links to nothing. Suggestions read from a project's page
 * link nothing by themselves: a draft nobody chose a project for still asks before it is linked
 * (DL-055), so it is never handed to an account that did not choose it. The account's lists and
 * the live adapter both read this rule, so they agree on what a card is.
 */
export function linkedProject<Project extends { readonly uri: string; readonly workspaceId?: string | undefined }>(
  chosenUri: string | null,
  savedId: string | null,
  projects: readonly Project[],
): Project | null {
  if (chosenUri) return projects.find((project) => project.uri === chosenUri) ?? null;
  return savedId ? (projects.find((project) => project.workspaceId === savedId) ?? null) : null;
}

/**
 * What a card can say about its Certified project:
 * - `linked`: it is linked to one of the projects listed now.
 * - `not-linked`: nobody chose a project for it, or its account's choice is no longer listed.
 * - `signed-out`: an account chose a project for it on this device, and nobody is signed in to see which.
 * - `checking`: this account chose a project for it, and its projects are still being read.
 * - `unchecked`: this account chose a project for it, and its projects could not be read.
 *
 * A stored choice is a note that the card was linked (DL-119). Only the account that made it can
 * read it against its projects, so the card is never called unlinked while that cannot be done:
 * signed out, or before the account's projects have been read.
 */
export type ProjectLinkState = "linked" | "not-linked" | "signed-out" | "checking" | "unchecked";

export function projectLinkState({ linked, owner, choosers, loading, problem }: {
  /** The card is linked to a project listed now, by `linkedProject`. */
  readonly linked: boolean;
  /** The account signed in now. */
  readonly owner: string | null | undefined;
  /** The accounts that chose a Certified project for the card on this device. */
  readonly choosers: readonly string[];
  /** The account's projects are being read. */
  readonly loading: boolean;
  /** Some of the account's projects could not be read. */
  readonly problem: boolean;
}): ProjectLinkState {
  if (linked) return "linked";
  if (!owner) return choosers.length ? "signed-out" : "not-linked";
  if (!choosers.includes(owner)) return "not-linked";
  if (loading) return "checking";
  return problem ? "unchecked" : "not-linked";
}

/** The line a card shows about its project while it is not linked to one listed now. Empty once it is. */
export function projectLinkLine(state: ProjectLinkState): string {
  switch (state) {
    case "linked":
      return "";
    case "not-linked":
      return "Not linked to a Certified project yet.";
    case "signed-out":
      return "Linked to a Certified project. Sign in to see it.";
    case "checking":
      return "Checking your Certified project.";
    case "unchecked":
      return "Your Certified project could not be checked. The card is still linked to it.";
  }
}

/**
 * What an entry in Your Initiatives is, said as a tag on its card, so a draft and a Certified project
 * with one name can be told apart at a glance (DL-134):
 * - `device`: a draft kept only in this browser.
 * - `personal-project`, `group-project`, `team-workspace`: a Certified project of the person's own, of a
 *   group without a team workspace in Weave, or of a group with one.
 */
export type EntryKind = "device" | "personal-project" | "group-project" | "team-workspace";

export const ENTRY_KINDS: Record<EntryKind, { readonly icon: "device" | "person" | "people"; readonly label: string }> = {
  device: { icon: "device", label: "On this device" },
  "personal-project": { icon: "person", label: "Personal project" },
  "group-project": { icon: "people", label: "Group project" },
  "team-workspace": { icon: "people", label: "Team workspace" },
};

/** A Certified project's kind. `workspace` is true, or "open", once its group has a team workspace in Weave. */
export function projectKind(project: { readonly group: string | null; readonly workspace: boolean | string }): EntryKind {
  if (!project.group) return "personal-project";
  return project.workspace === true || project.workspace === "open" ? "team-workspace" : "group-project";
}

/**
 * The tags on a draft's card. A draft linked to a Certified project is that project, and says so
 * first. Every draft is kept in this browser, so it also says that: nothing is saved privately any
 * more (DL-155), and a draft that carries the mark of an earlier private save is a device draft too.
 */
export function draftKinds(
  project: { readonly group: string | null; readonly workspace: boolean | string } | null,
): EntryKind[] {
  return project ? [projectKind(project), "device"] : ["device"];
}

const FIT_RANK = { strong: 3, good: 2, possible: 1 } as const;

/**
 * Records with the strongest fit first, as the live funding list sorts them. Records of one
 * strength, and those with none, keep the order they came in.
 */
export function strongestFirst<T extends { readonly fit?: keyof typeof FIT_RANK | undefined }>(records: readonly T[]): T[] {
  const rank = (record: T) => (record.fit ? FIT_RANK[record.fit] : 0);
  return [...records].sort((a, b) => rank(b) - rank(a));
}
