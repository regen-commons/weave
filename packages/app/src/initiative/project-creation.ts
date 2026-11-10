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
