import { parseDeleted, type DeletedInitiative } from "@weave/api/account-contract";
import type { DraftController } from "../describe/controller.ts";
import { revise, type DeviceDraft } from "../describe/contracts.ts";
import { backUpDraft } from "../describe/device-removal.ts";
import { AccountFailure, accountMessage, accountRequest } from "./client.ts";

/** A saved card exactly as the list showed it. Deletion names this ID and revision, never a title. */
export interface DeletableCard {
  readonly id: string;
  readonly name: string;
  readonly revision: number;
}

/**
 * The device draft no longer points at a removed saved card, so autosave and Save cannot
 * write to it again. A draft whose own ID was that card's keeps it, so device state keyed by
 * it stays attached, and retires it: the next Save creates a new card. The device words stay.
 */
export function forgetSavedCard(draft: DeviceDraft, id: string): Partial<DeviceDraft> | null {
  const { saved, pending, retired = [] } = draft.account;
  const retire = draft.id === id && !retired.includes(id);
  if (saved?.id !== id && pending?.id !== id && !retire) return null;
  return {
    account: {
      saved: saved?.id === id ? null : saved,
      pending: pending?.id === id ? null : pending,
      ...(retire || retired.length ? { retired: retire ? [...retired, id].slice(-20) : retired } : {}),
    },
  };
}

/** The drafts on this device that point at a saved card: the tab's own first, then the others. */
export function draftsBoundTo(controller: DraftController, id: string): string[] {
  const { draft, drafts } = controller.getSnapshot();
  return [...new Set([draft, ...drafts].filter((item) => forgetSavedCard(item, id)).map((item) => item.id))];
}

/**
 * Release every draft on this device from a card the account no longer has: the tab's own and
 * any other the browser holds (DL-112). False when nothing pointed at it, or when this device
 * could not store a release.
 */
export async function releaseDeletedCard(controller: DraftController, id: string): Promise<boolean> {
  const bound = draftsBoundTo(controller, id);
  if (!bound.length) return false;
  let stored = true;
  for (const draftId of bound) {
    const released = await controller.amend(draftId, (draft) => {
      const change = forgetSavedCard(draft, id);
      return change ? revise(draft, change) : null;
    });
    const current = controller.getSnapshot();
    if (!released || (current.draft.id === draftId && current.storage !== "saved")) stored = false;
  }
  return stored;
}

export interface DeletedCard {
  readonly deleted: DeletedInitiative;
  /**
   * What became of the drafts on this device that were working copies of the removed card:
   * - `unrelated`: none was.
   * - `unbound`: they keep their words and stay in Your Initiatives, marked Not saved yet.
   * - `unbound_unsaved`: as `unbound`, but this device could not store the change.
   * - `backed_up`: they were moved to this device's backups, as the person chose before the press.
   * - `backup_failed`: they could not all be moved to the backups, so some stay in Your Initiatives.
   */
  readonly device: "unrelated" | "unbound" | "unbound_unsaved" | "backed_up" | "backup_failed";
}

/** Delete one saved card from the account, then release the device draft from it. */
export async function deleteSavedCard(
  controller: DraftController,
  card: Pick<DeletableCard, "id" | "revision">,
  requestId: string,
  request = accountRequest,
  signal?: AbortSignal,
): Promise<DeletedCard> {
  const result = await request(
    "",
    { action: "delete", id: card.id, expectedRevision: card.revision, requestId },
    "/api/account",
    signal,
  );
  let deleted: DeletedInitiative;
  try {
    deleted = parseDeleted(result.deleted);
  } catch {
    throw new AccountFailure("account_unavailable");
  }
  if (deleted.id !== card.id || deleted.revision !== card.revision) throw new AccountFailure("account_unavailable");
  // The server confirmed the deletion. A device problem from here on is reported, never thrown.
  if (!draftsBoundTo(controller, card.id).length) return { deleted, device: "unrelated" };
  try {
    return { deleted, device: (await releaseDeletedCard(controller, card.id)) ? "unbound" : "unbound_unsaved" };
  } catch {
    return { deleted, device: "unbound_unsaved" };
  }
}

/**
 * After the account confirmed a deletion, moves the card's copies on this device to the device's
 * backups, when the person chose that before the press. A copy that changed meanwhile, or waits for
 * a save's answer, stays where it is, and the result says so. Never throws: the deletion stands.
 */
export async function backUpCopies(
  controller: Pick<DraftController, "getSnapshot" | "discardCurrent" | "retire">,
  result: DeletedCard,
  copies: readonly string[],
): Promise<DeletedCard> {
  if (!copies.length) return result;
  let all = true;
  for (const id of copies) {
    try {
      if (!(await backUpDraft(controller, id))) all = false;
    } catch {
      all = false;
    }
  }
  return { ...result, device: all ? "backed_up" : "backup_failed" };
}

const savedCount = (kept: number) =>
  kept === 0 ? "No other cards are saved in your account." : `${kept} saved ${kept === 1 ? "card" : "cards"} kept.`;

/** Where the copies on this device are after a deletion, so the person knows the card left the account and where its words are. */
const DEVICE_AFTER: Record<DeletedCard["device"], string> = {
  unrelated: "",
  unbound: " Its copy on this device keeps its words and stays in Your Initiatives, marked Not saved yet.",
  unbound_unsaved: " Its copy on this device keeps its words, but this device could not store the change. Copy your words before reloading.",
  backed_up: " Its copy on this device is now a device backup. Restore it or delete it for good in Settings, under Device Backups.",
  backup_failed: " Its copy on this device could not be moved to the backups, so it stays in Your Initiatives, marked Not saved yet.",
};

/**
 * Exactly what was removed and what was kept, in the words the person reads. `namesakes` counts
 * other drafts on this device with the same name, which were never this card and stay listed.
 */
export function deletedMessage(name: string, result: DeletedCard, namesakes = 0): string {
  return `Removed ${name} from your account. ${savedCount(result.deleted.kept)}${DEVICE_AFTER[result.device]}${namesakesLine(name, namesakes)}`;
}

/** Other drafts on this device that share a saved card's name, said before and after its deletion. Empty when there are none. */
export function namesakesLine(name: string, namesakes: number): string {
  if (namesakes === 0) return "";
  return namesakes === 1
    ? ` A different draft named ${name} is on this device and stays in Your Initiatives. It was never this saved card.`
    : ` ${namesakes} different drafts named ${name} are on this device and stay in Your Initiatives. They were never this saved card.`;
}

/**
 * What Weave could verify still refers to a card the account refused to delete (initiative_referenced).
 * The server gives one code for every reference (weave-initiative-deletion-stale-references.sql), so a
 * reason is named only when Weave checked it. Sharing for matching, saved partners and query vectors no
 * longer hold a personal card: they go with it.
 */
export interface CardReferences {
  /** The Certified project whose workspace this card is, from the account's own list of workspaces. */
  readonly project: string | null;
}

/** A refusal with what Weave could verify about it. */
export class CardReferenced extends AccountFailure {
  readonly references: CardReferences;
  constructor(references: CardReferences) {
    super("initiative_referenced");
    this.references = references;
  }
}

/**
 * Checks what refers to a card the account would not delete. A Certified link counts only when the
 * account's workspaces list the card as a project's workspace, so the message never names a project
 * Weave did not see.
 */
export function cardReferences(
  id: string,
  workspaces: readonly { readonly workspaceId?: string | undefined; readonly name: string }[],
): CardReferences {
  return { project: workspaces.find((workspace) => workspace.workspaceId === id)?.name ?? null };
}

/** Why a card the account still uses could not be deleted, naming only what was verified. */
function referencedMessage(references: CardReferences | null): string {
  if (references?.project)
    return `This card cannot be deleted yet because it is the saved copy of your Certified project ${references.project}. Nothing was removed.`;
  return "Weave still uses this card for something else, such as a project still being set up, so it cannot be deleted yet. Nothing was removed.";
}

/** Why a deletion did not happen. Nothing was removed in any of these cases. */
export function deleteFailure(error: unknown): string {
  const code = error instanceof AccountFailure ? error.code : "";
  if (code === "save_conflict") return "This card changed somewhere else. Reload to see the latest version.";
  if (code === "initiative_referenced") return referencedMessage(error instanceof CardReferenced ? error.references : null);
  if (code === "not_found") return "This card is no longer saved in your account. Reload to see your saved cards.";
  if (code === "connection_failed")
    return "The connection failed before Weave could confirm the deletion. Try again.";
  return accountMessage(error);
}

/** A failure after which the list is stale and should be read again before another try. */
export const deleteNeedsReload = (error: unknown) =>
  error instanceof AccountFailure && ["save_conflict", "not_found"].includes(error.code);

/** A draft on this device as the deletion dialog needs it: its ID, its name and the saved card it is the working copy of. */
export interface DeviceCopy {
  readonly id: string;
  readonly name: string;
  readonly cardId: string | null;
}

/** A private save the person can choose to delete, with its copies on this device and the other drafts here that share its name. */
export type ListedCard = DeletableCard & {
  readonly savedOn: string;
  /** The drafts on this device that are this card's working copies, by ID. */
  readonly copies: readonly string[];
  /** Other drafts on this device with the same name. They were never this card, so deleting it leaves them. */
  readonly namesakes: number;
};

const sameName = (a: string, b: string) => a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();

/** The private saves a person can choose to delete: listed with a revision, and not a project's workspace. */
export function deletableCards(
  cards: readonly { id: string; name: string; savedOn: string; revision?: number }[],
  workspaceIds: readonly (string | undefined)[],
  /** The drafts on this device, each with the saved card it is the working copy of. */
  device: readonly DeviceCopy[],
): ListedCard[] {
  return cards.flatMap((card) =>
    typeof card.revision === "number" && !workspaceIds.includes(card.id)
      ? [{
          id: card.id, name: card.name, revision: card.revision, savedOn: card.savedOn,
          copies: device.filter((draft) => draft.cardId === card.id).map((draft) => draft.id),
          namesakes: device.filter((draft) => draft.cardId !== card.id && sameName(draft.name, card.name)).length,
        }]
      : [],
  );
}
