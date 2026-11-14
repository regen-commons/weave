import type { DraftController } from "../describe/controller.ts";
import { projectCreationKey } from "./project-creation.ts";
import { belongsToAnotherAccount } from "../account/document.ts";
import { record } from "@weave/api/account-contract";

/** Stable entry points only. No draft fields, identity tokens or invented return parameters. */
export const PROJECT_EDITORS = {
  maearth: { name: "Ma Earth", url: "https://maearth.com/" },
  certified: { name: "Certified", url: "https://certified.one/" },
} as const;
export type ProjectEditor = keyof typeof PROJECT_EDITORS;
type HandoffStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export interface EditorHandoff {
  readonly version: 1;
  readonly editor: ProjectEditor;
  readonly owner: string;
  readonly draftId: string;
}
export const editorHandoffKey = (owner: string, draftId: string) => `weave-project-editor/${owner}/${draftId}`;
export function editorStorage(access: () => Storage): Storage | undefined {
  try { return access(); } catch { return undefined; }
}
/** A local resume hint, never proof of publication, membership or authority. */
export function readEditorHandoff(storage: Pick<Storage, "getItem"> | undefined, owner: string, draftId: string): EditorHandoff | null {
  try {
    const input: unknown = JSON.parse(storage?.getItem(editorHandoffKey(owner, draftId)) ?? "null");
    const value = record(input);
    if (!value || value.version !== 1 || value.owner !== owner || value.draftId !== draftId
      || typeof value.editor !== "string" || !Object.hasOwn(PROJECT_EDITORS, value.editor)
      || Object.keys(value).some(key => !["version", "editor", "owner", "draftId"].includes(key))) return null;
    return { version: 1, editor: value.editor as ProjectEditor, owner, draftId };
  } catch { return null; }
}
export function finishEditorHandoff(storage: Pick<Storage, "removeItem"> | undefined, owner: string, draftId: string) {
  // Losing a display hint cannot undo a verified selection or the device draft.
  try { storage?.removeItem(editorHandoffKey(owner, draftId)); } catch { /* Keep the draft and current selection. */ }
}
export async function beginEditorHandoff({ controller, storage, owner, editor, signal, isCurrent, navigate }: {
  controller: DraftController;
  storage: HandoffStorage | undefined;
  owner: string;
  editor: ProjectEditor;
  signal: AbortSignal;
  isCurrent(): boolean;
  navigate(target: string): void;
}): Promise<void> {
  const before = controller.getSnapshot().draft;
  await controller.settled();
  signal.throwIfAborted();
  const current = controller.getSnapshot();
  if (!owner || !isCurrent() || belongsToAnotherAccount(before, owner) || current.draft !== before || !current.ready || current.storage !== "saved")
    throw Error("Your latest changes need to be stored on this device before leaving. Keep this tab open and try device storage again.");
  if (!storage) throw Error("This browser could not keep the return step. Keep this tab open and try again.");
  // Even an unreadable old intent might have created a public group. Never replace it with a new handoff.
  if (storage.getItem(projectCreationKey(owner, before.id)) !== null)
    throw Error("Check the earlier Certified creation request before creating a project elsewhere.");
  const receipt: EditorHandoff = { version: 1, editor, owner, draftId: before.id };
  storage.setItem(editorHandoffKey(owner, before.id), JSON.stringify(receipt));
  if (!readEditorHandoff(storage, owner, before.id)) throw Error("This browser could not keep the return step. Keep this tab open and try again.");
  signal.throwIfAborted();
  if (!isCurrent() || controller.getSnapshot().draft !== before || controller.getSnapshot().storage !== "saved")
    throw Error("Your device card changed. Review it before leaving Weave.");
  navigate(PROJECT_EDITORS[editor].url);
}
