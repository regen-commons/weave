import type { DraftController } from "../describe/controller.ts";
import { accountRequest, accountSessionSignal, AccountFailure, assertAccount, parseSaved } from "./client.ts";
import { loadedDraft } from "./document.ts";

/**
 * The account panel's explicit Load operation, including its atomic device backup and replacement. Weave takes
 * no new private save (DL-155), so opening an earlier one on this device is the only account card operation left.
 */
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
