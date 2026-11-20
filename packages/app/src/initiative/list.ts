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
      return savedOn ? `Saved privately in Weave on ${savedOn}.` : "Saved privately in Weave.";
    case "saved-unlisted":
      return "Saved privately in Weave.";
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
