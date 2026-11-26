import { record, uuid } from "@weave/api/account-contract";
import { accountRequest } from "../account/client.ts";
import { matchRoute, pathTo, teamWorkspacePath } from "../routes.ts";
import { isPagePath } from "./consent-chain.ts";

export type ProjectConsentAction = "membership" | "create-project" | "workspace-members" | "add-member" | "publish-support" | "withdraw-support" | "publish-initiative";
/** `returnTo` is the page a consent that followed a sign-in began on, when that was not Your Initiatives. */
export type ConsentTask = { kind: "directory"; action: ProjectConsentAction; returnTo?: string } | { kind: "team"; workspaceId: string };
type Outcome = "ready" | "denied" | "failed";
export type ConsentReturn = ConsentTask & { result: Outcome };
const pending = "weave-certified-project-return";
const legacy = ["weave-project-actions-return", "weave-team-membership-return"];
const actions: readonly string[] = ["membership", "create-project", "workspace-members", "add-member", "publish-support", "withdraw-support", "publish-initiative"];

/** The newest explicit task owns the callback. Older task receipts cannot race it. */
export function beginConsentReturn(storage: Storage, task: ConsentTask) {
  const id = crypto.randomUUID();
  for (const key of legacy) storage.removeItem(key);
  storage.setItem(pending, JSON.stringify({ ...task, id, until: Date.now() + 600_000 }));
  return id;
}
export function currentConsentReturn(storage: Storage, id: string) {
  try { return record(JSON.parse(storage.getItem(pending) ?? "null")).id === id; } catch { return false; }
}
export function cancelConsentReturn(storage: Storage, id: string) {
  if (currentConsentReturn(storage, id)) storage.removeItem(pending);
}
export function takeConsentReturn(result: string | null, getStorage: () => Storage, expectedKind?: ConsentTask["kind"]): ConsentReturn | null {
  if (result !== "ready" && result !== "denied" && result !== "failed") return null;
  try {
    const storage = getStorage();
    const raw = storage.getItem(pending);
    if (!raw) return null;
    const value = record(JSON.parse(raw));
    if (expectedKind !== undefined && value.kind !== expectedKind) return null;
    storage.removeItem(pending);
    for (const key of legacy) storage.removeItem(key);
    if (!uuid(value.id) || typeof value.until !== "number" || !Number.isSafeInteger(value.until) || value.until <= Date.now()) return null;
    if (value.kind === "directory" && actions.includes(String(value.action))) {
      if (value.returnTo !== undefined && !returnPage(value.returnTo)) return null;
      return { kind: "directory", action: value.action as ProjectConsentAction,
        ...(value.returnTo === undefined ? {} : { returnTo: value.returnTo as string }), result };
    }
    if (value.kind === "team" && uuid(value.workspaceId)) return { kind: "team", workspaceId: value.workspaceId, result };
  } catch { /* Storage failures leave permission inactive. */ }
  return null;
}
/** An unresumable callback must offer recovery without activating an unknown receipt. */
export async function recoverConsentReturn(result: string | null, getStorage: () => Storage) {
  const task = takeConsentReturn(result, getStorage);
  return task ? finishConsentReturn(task) : "/your-initiatives?access=failed";
}
/** A page of Weave's own to come back to, other than Your Initiatives, which is where a return goes anyway. */
export function returnPage(value: unknown): value is string {
  return isPagePath(value) && matchRoute(value) !== undefined && value !== pathTo("your-initiatives");
}
/**
 * Consume the server's one-use receipt once, then return to the reviewed task without running its writes.
 * A consent that followed a sign-in elsewhere goes back to that page once it is granted or declined. One
 * that could not be confirmed goes to Your Initiatives, which says so and offers Allow again.
 */
export async function finishConsentReturn(task: ConsentReturn) {
  const destination = task.kind === "team" ? teamWorkspacePath(task.workspaceId) : "/your-initiatives";
  const elsewhere = task.kind === "directory" && returnPage(task.returnTo) ? task.returnTo : undefined;
  if (task.result === "ready") {
    try {
      const data = await accountRequest("", { action: "finish" }, "/api/certified-project-consent");
      if (data.granted === (task.kind === "team" ? "membership" : task.action))
        return task.kind === "team" ? destination : elsewhere ?? `${destination}?access=ready`;
    } catch { /* The receipt must still belong to this exact signed-in session and DID. */ }
  }
  if (task.result === "denied" && elsewhere) return elsewhere;
  return `${destination}?access=${task.result === "denied" ? "denied" : "failed"}`;
}
