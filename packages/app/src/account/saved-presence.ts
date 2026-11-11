import type { InitiativeSummary } from "@weave/api/account-contract";
import type { DeviceDraft } from "../describe/contracts.ts";
import { AccountFailure, accountRequest, assertAccount, parseSaved } from "./client.ts";

export type SavedPresence = "checking" | "present" | "changed" | "missing" | "unavailable";
/** A paged list is not proof that a saved record was deleted. Only an authenticated exact-ID 404 establishes absence. */
export async function checkSavedPresence(binding: NonNullable<DeviceDraft["account"]["saved"]>, owner: string,
  items: readonly InitiativeSummary[], signal: AbortSignal, request = accountRequest): Promise<SavedPresence> {
  if (binding.owner !== owner) return "unavailable";
  const listed = items.find(item => item.id === binding.id);
  if (listed) return listed.revision === binding.revision ? "present" : "changed";
  try {
    const result = await request(`?id=${encodeURIComponent(binding.id)}`, undefined, "/api/account", signal);
    signal.throwIfAborted(); assertAccount(result, owner);
    const saved = parseSaved(result.saved);
    if (saved.id !== binding.id) return "unavailable";
    return saved.revision === binding.revision ? "present" : "changed";
  } catch (error) {
    signal.throwIfAborted();
    if (!(error instanceof AccountFailure) || error.code !== "not_found") return "unavailable";
    // A cookie switched in another tab can also produce 404. Confirm the account before forgetting its binding.
    try { const current = await request("", undefined, "/api/account", signal); signal.throwIfAborted(); assertAccount(current, owner); return "missing"; }
    catch { signal.throwIfAborted(); return "unavailable"; }
  }
}
