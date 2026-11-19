import { parseDeleted, type DeletedInitiative } from "@weave/api/account-contract";
import type { DraftController } from "../describe/controller.ts";
import { revise, type DeviceDraft } from "../describe/contracts.ts";
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
  /** Whether the card on this device was bound to the removed card, and whether its new state is stored. */
  readonly device: "unrelated" | "unbound" | "unbound_unsaved";
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

const savedCount = (kept: number) =>
  kept === 0 ? "No other cards are saved in your account." : `${kept} saved ${kept === 1 ? "card" : "cards"} kept.`;

/** Exactly what was removed and what was kept, in the words the person reads. */
export function deletedMessage(name: string, result: DeletedCard): string {
  const device =
    result.device === "unrelated"
      ? ""
      : result.device === "unbound"
        ? " The card on this device keeps its words. Save it again to keep a new copy."
        : " The card on this device keeps its words, but this device could not store the change. Copy your words before reloading.";
  return `Removed ${name} from your account. ${savedCount(result.deleted.kept)}${device}`;
}

/** Why a deletion did not happen. Nothing was removed in any of these cases. */
export function deleteFailure(error: unknown): string {
  const code = error instanceof AccountFailure ? error.code : "";
  if (code === "save_conflict") return "This card changed somewhere else. Reload to see the latest version.";
  if (code === "initiative_referenced")
    return "This card is linked to a Certified project, shared for matching or has saved partners, so it cannot be deleted here yet. Nothing was removed.";
  if (code === "not_found") return "This card is no longer saved in your account. Reload to see your saved cards.";
  if (code === "connection_failed")
    return "The connection failed before Weave could confirm the deletion. Try again.";
  return accountMessage(error);
}

/** A failure after which the list is stale and should be read again before another try. */
export const deleteNeedsReload = (error: unknown) =>
  error instanceof AccountFailure && ["save_conflict", "not_found"].includes(error.code);

/** The private saves a person can choose to delete: listed with a revision, and not a project's workspace. */
export function deletableCards(
  cards: readonly { id: string; name: string; savedOn: string; revision?: number }[],
  workspaceIds: readonly (string | undefined)[],
  /** The saved cards that a draft on this device is the working copy of: one ID, or every one. */
  deviceCardIds: string | null | readonly string[],
): (DeletableCard & { savedOn: string; onDevice: boolean })[] {
  const onDevice = typeof deviceCardIds === "string" ? [deviceCardIds] : (deviceCardIds ?? []);
  return cards.flatMap((card) =>
    typeof card.revision === "number" && !workspaceIds.includes(card.id)
      ? [{ id: card.id, name: card.name, revision: card.revision, savedOn: card.savedOn, onDevice: onDevice.includes(card.id) }]
      : [],
  );
}
