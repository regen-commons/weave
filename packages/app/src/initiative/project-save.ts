import { accountRequest, assertAccount, parseSaved } from "../account/client.ts";
import { accountKey, loadedDraft, saveCommand } from "../account/document.ts";
import { DeviceDraftSchema, EMPTY_INITIATIVE, newDraft, revise, type DeviceDraft } from "../describe/contracts.ts";
import type { DraftController } from "../describe/controller.ts";
import { reviewStep } from "../intake/state.ts";
import { projectRequest, type PublicProject } from "./projects-client.ts";
import { uuid } from "@weave/api/account-contract";

/** A reviewed public project supplies only its actual name and description. Missing facts stay empty. */
export function personalProjectDraft(project: PublicProject): DeviceDraft {
  const draft = newDraft();
  const card = { ...EMPTY_INITIATIVE, name: project.title, description: project.description ?? "" };
  return DeviceDraftSchema.parse({ ...draft, proposal: card, confirmed: card, proposalVersion: draft.inputVersion,
    needs: reviewStep(draft.needs), offers: reviewStep(draft.offers) });
}

export async function preparePersonalProject(controller: DraftController, project: PublicProject, signal: AbortSignal) {
  signal.throwIfAborted();
  if (accountKey(controller.getSnapshot().draft) === null) {
    await controller.replace(personalProjectDraft(project));
    signal.throwIfAborted();
  }
}

export async function loadPersonalProject(controller: DraftController, workspaceId: string, owner: string, signal: AbortSignal) {
  signal.throwIfAborted();
  const before = controller.getSnapshot().draft;
  const result = await accountRequest(`?id=${encodeURIComponent(workspaceId)}`, undefined, "/api/account", signal);
  signal.throwIfAborted();
  assertAccount(result, owner);
  const saved = parseSaved(result.saved);
  if (saved.id !== workspaceId) throw Error("invalid_save_receipt");
  if (controller.getSnapshot().draft !== before) throw Error("draft_changed");
  await controller.replace(loadedDraft(saved, owner));
  signal.throwIfAborted();
}

/** A Certified project has one canonical workspace, including when another tab links it first. */
export async function connectPersonalProject(controller: DraftController, owner: string, project: PublicProject, signal: AbortSignal) {
  signal.throwIfAborted();
  if (project.groupDid) throw Error("personal_project_required");
  const before = controller.getSnapshot().draft;
  let result = await projectRequest({ action: "lookup", projectUri: project.uri }, signal);
  signal.throwIfAborted();
  if (controller.getSnapshot().draft !== before) throw Error("draft_changed");
  if (result.status === "unlinked") {
    await preparePersonalProject(controller, project, signal);
    const identity = await saveForProject(controller, owner, signal);
    result = await projectRequest({ action: "link", projectUri: project.uri, ...identity }, signal);
    signal.throwIfAborted();
  }
  if (result.status === "linked") {
    if (!uuid(result.workspaceId) || result.projectUri !== project.uri) throw Error("invalid_project_link");
    const held = controller.getSnapshot().draft.account.saved;
    if (held?.id !== result.workspaceId || held.owner !== owner)
      await loadPersonalProject(controller, result.workspaceId, owner, signal);
  }
  return result;
}

/** The reviewed action saves this person's draft. A completed stale request never rebinds another account's card. */
export async function saveForProject(controller: DraftController, owner: string, signal: AbortSignal) {
  signal.throwIfAborted();
  const draft = controller.getSnapshot().draft;
  if (draft.account.saved?.owner === owner && draft.account.saved.contentKey === accountKey(draft))
    return { initiativeId: draft.account.saved.id, expectedRevision: draft.account.saved.revision };
  const { binding, command } = saveCommand(draft, owner);
  controller.change((d) => revise(d, { account: { ...d.account, pending: binding } }));
  await controller.settled();
  signal.throwIfAborted();
  if (controller.getSnapshot().storage !== "saved") throw Error("device_save_required");
  const receipt = parseSaved((await accountRequest("", { action: "save", ...command }, "/api/account", signal)).saved);
  signal.throwIfAborted();
  if (receipt.id !== command.id || receipt.revision !== command.expectedRevision + 1
      || JSON.stringify(receipt.document) !== binding.contentKey) throw Error("invalid_save_receipt");
  const latest = controller.getSnapshot().draft;
  if (latest.account.pending?.requestId !== binding.requestId) throw Error("draft_changed");
  controller.change((d) => revise(d, { account: { saved: { id: receipt.id, owner,
    revision: receipt.revision, contentKey: binding.contentKey }, pending: null } }));
  await controller.settled();
  signal.throwIfAborted();
  if (controller.getSnapshot().storage !== "saved") throw Error("device_save_required");
  return { initiativeId: receipt.id, expectedRevision: receipt.revision };
}
