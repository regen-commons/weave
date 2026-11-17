import type { DraftController } from "../describe/controller.ts";
import { revise } from "../describe/contracts.ts";
import { accountRequest, accountSessionSignal, AccountFailure, assertAccount, parseSaved } from "./client.ts";
import { loadedDraft, saveCommand } from "./document.ts";
import { releaseDeletedCard } from "./delete-card.ts";

/** The save went through, but the device draft is no longer the one that asked for it. */
export class SaveDetached extends Error {
  constructor() {
    super("Your card was saved to your account, but the draft on this device changed meanwhile, so it is not linked to that save. Open the saved card from Your Initiatives to continue it.");
  }
}

/** Send one save. A removed ID releases the device draft so the next Save makes a new card. */
export async function sendSave(controller: DraftController, command: { id: string }, signal: AbortSignal) {
  try {
    return parseSaved((await accountRequest("", { action: "save", ...command }, "/api/account", signal)).saved);
  } catch (error) {
    if (error instanceof AccountFailure && error.code === "initiative_deleted") await releaseDeletedCard(controller, command.id);
    throw error;
  }
}

/** The account panel's Save operation; device recovery metadata is durable before the cloud write. */
export async function saveAccountCard(controller: DraftController, owner: string, refresh: () => Promise<unknown>) {
  const signal = accountSessionSignal();
  signal.throwIfAborted();
  const { binding, command } = saveCommand(controller.getSnapshot().draft, owner);
  controller.change(current => revise(current, { account: { ...current.account, pending: binding } }));
  await controller.settled();
  signal.throwIfAborted();
  if (controller.getSnapshot().storage !== "saved")
    throw new Error("Your save request could not be kept safely on this device. Copy your words and try device storage again first.");
  const receipt = await sendSave(controller, command, signal);
  signal.throwIfAborted();
  if (receipt.id !== command.id || JSON.stringify(receipt.document) !== binding.contentKey)
    throw new AccountFailure("account_unavailable");
  // Only the draft that is still waiting for this request is bound to its result. A draft
  // removed, restored or loaded meanwhile must never inherit the saved card.
  if (controller.getSnapshot().draft.account.pending?.requestId !== binding.requestId) {
    await refresh();
    throw new SaveDetached();
  }
  controller.change(current => revise(current, { account: { ...current.account, saved: {
    id: receipt.id, owner, revision: receipt.revision, contentKey: binding.contentKey,
  }, pending: null } }));
  await refresh();
  signal.throwIfAborted();
  return binding.contentKey;
}

/** The account panel's explicit Load operation, including its atomic device backup and replacement. */
export async function loadAccountCard(controller: DraftController, owner: string, id: string) {
  const signal = accountSessionSignal();
  signal.throwIfAborted();
  const before = controller.getSnapshot().draft;
  const result = await accountRequest(`?id=${encodeURIComponent(id)}`, undefined, "/api/account", signal);
  signal.throwIfAborted();
  assertAccount(result, owner);
  const saved = parseSaved(result.saved);
  if (saved.id !== id) throw new AccountFailure("account_unavailable");
  if (controller.getSnapshot().draft !== before) throw new Error("Your device draft changed. Try opening the card again.");
  await controller.replace(loadedDraft(saved, owner), signal);
  return controller.backups();
}
