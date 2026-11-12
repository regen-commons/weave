import { uuid } from "@weave/api/account-contract";
/** A navigation hint, never an access grant. Home checks it against the account's freshly listed workspaces. */
export const workspaceResumeKey = (owner: string) => `weave-resume-workspace/${owner}`;
export function readWorkspaceResume(owner: string, storage: Pick<Storage, "getItem">): string | null {
  try { const id = storage.getItem(workspaceResumeKey(owner)); return uuid(id) ? id : null; } catch { return null; }
}
export function rememberWorkspace(owner: string, id: string, storage: Pick<Storage, "setItem">): void {
  if (!uuid(id)) return;
  try { storage.setItem(workspaceResumeKey(owner), id); } catch { /* Navigation still works without a resume hint. */ }
}
