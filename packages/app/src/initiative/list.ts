import type { DeviceDraft } from "../describe/contracts.ts";
import { hasDraft } from "../describe/view.ts";
import { projectSource } from "../intake/project-page.ts";

/**
 * One initiative in Your Initiatives' single list (DL-112): a draft in this browser, with the
 * saved card it is the working copy of when there is one, or a card that is only in the account.
 */
export type InitiativeEntry<Card extends { readonly id: string }> =
  | { readonly kind: "draft"; readonly draft: DeviceDraft; readonly saved: Card | null }
  | { readonly kind: "card"; readonly card: Card };

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
 * The saved card in this account that a draft is the working copy of: the one it was saved as,
 * or the one a save still waiting for its answer asked for. A lost answer leaves only the second,
 * and the card it made is still this draft's.
 */
export function boundCardId(draft: DeviceDraft, owner: string | null | undefined): string | null {
  if (!owner) return null;
  const { saved, pending } = draft.account;
  if (saved?.owner === owner) return saved.id;
  return pending?.owner === owner ? pending.id : null;
}

/**
 * One list from the browser's drafts and the account's saved cards. A draft and the card it was
 * saved as are the same initiative, so they make one entry, and it opens the draft. `savedId`
 * says which card a draft stands for. Every card can be a draft's, but only the ones `alone`
 * accepts are listed by themselves: a card that is also a workspace is listed as the workspace.
 */
export function initiativeEntries<Card extends { readonly id: string }>(
  drafts: readonly DeviceDraft[],
  cards: readonly Card[],
  savedId: (draft: DeviceDraft) => string | null,
  alone: (card: Card) => boolean = () => true,
): InitiativeEntry<Card>[] {
  const taken = new Set<string>();
  const fromDrafts = drafts.map((draft): InitiativeEntry<Card> => {
    const id = savedId(draft);
    const saved = id ? (cards.find((card) => card.id === id) ?? null) : null;
    if (saved) taken.add(saved.id);
    return { kind: "draft", draft, saved };
  });
  return [
    ...fromDrafts,
    ...cards.filter((card) => !taken.has(card.id) && alone(card)).map((card): InitiativeEntry<Card> => ({ kind: "card", card })),
  ];
}

/**
 * Where a draft stands against its saved card, for someone signed in:
 * - `unsaved`: it exists only in this browser.
 * - `saved`: the account holds this version.
 * - `saved-unlisted`: it was saved, and its card is not among the ones the list has read yet.
 * - `changed-here`: this browser has changes the account does not.
 * - `newer-in-account`: the card was saved again elsewhere, and this copy has no changes of its own.
 * - `changed-both`: it changed here and in the account.
 */
export type DraftSaving = "unsaved" | "saved" | "saved-unlisted" | "changed-here" | "newer-in-account" | "changed-both";

export function draftSaving(
  draft: DeviceDraft,
  card: { readonly revision?: number } | null,
  owner: string | null | undefined,
  /** The draft as the account would hold it, or null while it is not a checked card. */
  contentKey: (draft: DeviceDraft) => string | null,
): DraftSaving {
  const { saved, pending } = draft.account;
  const binding = owner && saved?.owner === owner ? saved : null;
  const waiting = owner && !binding && pending?.owner === owner ? pending : null;
  if (!binding && !waiting) return card ? "saved" : "unsaved";
  const changedHere = (binding ?? waiting)!.contentKey !== contentKey(draft);
  if (!card) return changedHere ? "changed-here" : "saved-unlisted";
  const newer = !!binding && typeof card.revision === "number" && card.revision > binding.revision;
  if (newer) return changedHere ? "changed-both" : "newer-in-account";
  return changedHere ? "changed-here" : "saved";
}

/** The one line a draft's entry shows about saving. Empty for `unsaved`, which shows the badge. */
export function savingLine(saving: DraftSaving, savedOn: string | null): string {
  switch (saving) {
    case "unsaved":
      return "";
    case "saved":
      // The card's tag says where; the line adds when.
      return savedOn ? `Saved on ${savedOn}.` : "";
    case "saved-unlisted":
      return "";
    case "changed-here":
      return "Changed on this device since you saved.";
    case "newer-in-account":
      return "A newer version is saved in your account. It opens from here.";
    case "changed-both":
      // Said before the press, because opening the saved version leaves this page.
      // True whichever way the copy is kept: as a backup, or in the list when it changed meanwhile
      // or a save of it is still unanswered. The page cannot know which before the press.
      return "Changed on this device and in your account since you saved. Opening the saved version keeps this device's copy, in this list or in Device backups in Settings.";
  }
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
 * Opens the account's version of a card in place of this browser's working copy, and returns
 * whether that copy is now a device backup. Either way the copy is kept, which the entry says
 * before the press: the page moves on to the card, so nothing said afterwards would be read. The loaded version is stored under the card's own
 * ID, which is usually the copy's ID too: the load then backs the copy up and replaces it. A
 * copy kept under another ID would stay beside it as a second draft of the same card, so it is
 * moved to the backups, unless it is waiting for a save's answer or changed meanwhile, in which
 * case it stays in the list.
 */
export async function openSavedOver(
  copy: { readonly id: string },
  saved: { readonly id: string },
  open: () => Promise<void>,
  retire: (id: string) => Promise<boolean>,
): Promise<boolean> {
  await open();
  return copy.id === saved.id ? true : retire(copy.id);
}

/**
 * What an entry in Your Initiatives is, said as a tag on its card, so a draft and a Certified project
 * with one name can be told apart at a glance (DL-134):
 * - `device`: a draft kept only in this browser.
 * - `private`: saved to the account, where only the person sees it.
 * - `personal-project`, `group-project`, `team-workspace`: a Certified project of the person's own, of a
 *   group without a team workspace in Weave, or of a group with one.
 */
export type EntryKind = "device" | "private" | "personal-project" | "group-project" | "team-workspace";

export const ENTRY_KINDS: Record<EntryKind, { readonly icon: "device" | "lock" | "person" | "people"; readonly label: string }> = {
  device: { icon: "device", label: "On this device" },
  private: { icon: "lock", label: "Saved privately" },
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
 * first; one that is not saved says that too, whatever it is linked to. Signed out, a draft that an
 * account saved carries no tag: its line says to sign in, and whose it is cannot be known here.
 */
export function draftKinds(
  saving: DraftSaving,
  project: { readonly group: string | null; readonly workspace: boolean | string } | null,
  savedSignedOut = false,
): EntryKind[] {
  if (savedSignedOut) return [];
  const kept: EntryKind[] = saving === "unsaved" ? ["device"] : project ? [] : ["private"];
  return project ? [projectKind(project), ...kept] : kept;
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
