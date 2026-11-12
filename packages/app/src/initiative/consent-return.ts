import { record, uuid } from "@weave/api/account-contract";
import { accountRequest } from "../account/client.ts";
import { teamWorkspacePath } from "../routes.ts";

export type ProjectConsentAction = "membership" | "create-project" | "workspace-members" | "add-member" | "publish-support" | "withdraw-support";
export type ConsentTask = { kind: "directory"; action: ProjectConsentAction } | { kind: "team"; workspaceId: string };
type Outcome = "ready" | "denied" | "failed";
export type ConsentReturn = ConsentTask & { result: Outcome };
const pending = "weave-certified-project-return";
const legacy = ["weave-project-actions-return", "weave-team-membership-return"];
const actions: readonly string[] = ["membership", "create-project", "workspace-members", "add-member", "publish-support", "withdraw-support"];

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
    if (value.kind === "directory" && actions.includes(String(value.action)))
      return { kind: "directory", action: value.action as ProjectConsentAction, result };
    if (value.kind === "team" && uuid(value.workspaceId)) return { kind: "team", workspaceId: value.workspaceId, result };
  } catch { /* Storage failures leave permission inactive. */ }
  return null;
}
/** Consume the server's one-use receipt once, then return to the reviewed task without running its writes. */
export async function finishConsentReturn(task: ConsentReturn) {
  const destination = task.kind === "team" ? teamWorkspacePath(task.workspaceId) : "/your-initiatives";
  if (task.result === "ready") {
    try {
      const data = await accountRequest("", { action: "finish" }, "/api/certified-project-consent");
      if (data.granted === (task.kind === "team" ? "membership" : task.action))
        return task.kind === "team" ? destination : `${destination}?access=ready`;
    } catch { /* The receipt must still belong to this exact signed-in session and DID. */ }
  }
  return `${destination}?access=${task.result === "denied" ? "denied" : "failed"}`;
}
