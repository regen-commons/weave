import { record, uuid } from "@weave/api/account-contract";
import { AccountFailure } from "../account/client.ts";

export interface PendingProjectCreate {
  action: "create";
  initiativeId: string;
  expectedRevision: number;
  requestId: string;
  groupLabel: string;
  publicProfile: { title: string; description: string };
}
export const projectCreationKey = (owner: string, draftId: string) => `weave-create-project/${owner}/${draftId}`;
export const projectGroupPattern = "[a-z][a-z0-9\\-]{1,30}[a-z0-9]";
export const validProjectGroupLabel = (value: string) => new RegExp(`^(?:${projectGroupPattern})$`,"v").test(value);
export function proposeProjectGroupLabel(name: string, suffix = crypto.randomUUID().slice(0, 6)) {
  const base = name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "").replace(/^[^a-z]+/u, "").slice(0, 20).replace(/-+$/u, "") || "initiative";
  if (!/^[a-z0-9]{6}$/u.test(suffix)) throw Error("invalid_address_suffix");
  return `${base}-${suffix}`;
}
export function publicProjectProfile(title: string, description: string) {
  title = title.trim(); description = description.trim();
  if (!title || [...title].length > 80 || [...description].length > 800)
    throw Error("Use a project name of 80 characters or fewer and a description of 800 characters or fewer.");
  return { title, description };
}
export function parsePendingProjectCreate(input: unknown): PendingProjectCreate | null {
  try {
    const value = record(input), profile = record(value.publicProfile);
    if (value.action !== "create" || !uuid(value.initiativeId) || !uuid(value.requestId)
      || !Number.isSafeInteger(value.expectedRevision) || Number(value.expectedRevision) < 1 || Number(value.expectedRevision) > 2147483647
      || typeof value.groupLabel !== "string" || !validProjectGroupLabel(value.groupLabel)
      || typeof profile.title !== "string" || typeof profile.description !== "string"
      || Object.keys(profile).length !== 2
      || Object.keys(value).some(key => !["action","initiativeId","requestId","expectedRevision","groupLabel","publicProfile","until"].includes(key))) return null;
    const publicProfile = publicProjectProfile(profile.title, profile.description);
    if (profile.title !== publicProfile.title || profile.description !== publicProfile.description) return null;
    // A durable uncertain creation must keep its original request ID even after an old UI expiry passed.
    return { action:"create", initiativeId:value.initiativeId, requestId:value.requestId,
      expectedRevision:Number(value.expectedRevision), groupLabel:value.groupLabel, publicProfile };
  } catch { return null; }
}
export function clearRejectedProjectCreate(error: unknown) {
  return error instanceof AccountFailure && ["invalid_project_command","group_handle_in_use","group_registration_rejected"].includes(error.code);
}

/** One durable intent across both screen adapters. Uncertain outcomes always retry the same reviewed request. */
export async function submitProjectCreate({ owner, draftId, groupLabel, profile, storage, save, request, signal }: {
  owner: string; draftId: string; groupLabel: string; profile: { title: string; description: string };
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  save(): Promise<{ initiativeId: string; expectedRevision: number }>;
  request(command: PendingProjectCreate): Promise<Record<string, unknown>>;
  signal: AbortSignal;
}) {
  const key = projectCreationKey(owner, draftId);
  const raw = storage.getItem(key);
  let command: PendingProjectCreate | null = null;
  try { command = raw === null ? null : parsePendingProjectCreate(JSON.parse(raw)); }
  catch { throw Error("The earlier creation request could not be read. Check your projects on Certified before starting another."); }
  if (raw !== null && !command) throw Error("The earlier creation request could not be read. Check your projects on Certified before starting another.");
  if (!command) {
    if (!validProjectGroupLabel(groupLabel)) throw Error("Use a valid group name in the address before creating the project.");
    const publicProfile = publicProjectProfile(profile.title, profile.description);
    const saved = await save(); signal.throwIfAborted();
    command = { action: "create", ...saved, requestId: crypto.randomUUID(), groupLabel, publicProfile };
    storage.setItem(key, JSON.stringify(command));
  }
  signal.throwIfAborted();
  try {
    const result = await request(command); signal.throwIfAborted();
    if (result.status === "linked" && uuid(result.workspaceId)) storage.removeItem(key);
    return { result, command };
  } catch (error) {
    if (!signal.aborted && clearRejectedProjectCreate(error)) storage.removeItem(key);
    throw error;
  }
}
