import { uuid } from "./account-contract.ts";
import { AccountError } from "./account-provider.ts";
import { discoveryDid } from "./project-discovery-contract.ts";
import { parseProjectUri } from "./project-index-source.ts";

export type WorkspaceInviteCommand =
  | { action: "claim_invite"; token: string }
  | { action: "create_invite"; workspaceId: string; projectUri: string }
  | { action: "list_invites"; workspaceId: string; projectUri: string; cursor?: string }
  | { action: "revoke_invite"; workspaceId: string; projectUri: string; inviteId: string }
  | { action: "approve_invite"; workspaceId: string; projectUri: string; inviteId: string;
    recipientDid: string; accessRole: "viewer" | "editor" | "admin" };

function invalid(): never { throw new AccountError(400, "invalid_project_command"); }
function keys(value: Record<string, unknown>, required: string[], optional: string[] = []) {
  if (required.some(key => !Object.hasOwn(value, key))
    || Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) invalid();
}
export function parseWorkspaceInviteCommand(value: Record<string, unknown>): WorkspaceInviteCommand | undefined {
  if (value.action === "claim_invite") {
    keys(value, ["action", "token"]);
    if (typeof value.token !== "string" || !/^[A-Za-z0-9_-]{43}$/u.test(value.token)
      || Buffer.from(value.token, "base64url").byteLength !== 32
      || Buffer.from(value.token, "base64url").toString("base64url") !== value.token) invalid();
    return { action: value.action, token: value.token };
  }
  if (!["create_invite", "list_invites", "revoke_invite", "approve_invite"].includes(String(value.action))) return undefined;
  const fields = ["action", "workspaceId", "projectUri"];
  if (value.action === "revoke_invite" || value.action === "approve_invite") fields.push("inviteId");
  if (value.action === "approve_invite") fields.push("recipientDid", "accessRole");
  keys(value, fields, value.action === "list_invites" ? ["cursor"] : []);
  if (!uuid(value.workspaceId)) invalid();
  const projectUri = parseProjectUri(value.projectUri).uri;
  const base = { workspaceId: value.workspaceId, projectUri };
  if (value.action === "create_invite") return { action: value.action, ...base };
  if (value.action === "list_invites") {
    if (value.cursor !== undefined && !uuid(value.cursor)) invalid();
    return { action: value.action, ...base, cursor: value.cursor as string | undefined };
  }
  if (!uuid(value.inviteId)) invalid();
  if (value.action === "revoke_invite") return { action: value.action, ...base, inviteId: value.inviteId };
  if (!discoveryDid(value.recipientDid) || !["viewer", "editor", "admin"].includes(String(value.accessRole))) invalid();
  return { action: "approve_invite", ...base, inviteId: value.inviteId, recipientDid: value.recipientDid,
    accessRole: value.accessRole as "viewer" | "editor" | "admin" };
}
