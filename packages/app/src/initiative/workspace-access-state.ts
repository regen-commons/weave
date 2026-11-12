import { certifiedHandle, record, uuid } from "@weave/api/account-contract";
import { fullDate } from "../home.ts";

export const invitationStatuses: Record<string, string> = {
  pending: "Waiting to be claimed", claimed: "Ready for your review", approved: "Access approved", revoked: "Invitation revoked", expired: "Invitation expired",
};
export type WorkspaceInvitation = { inviteId: string; status: string; expiresAt: string; claimedDid?: string; claimedHandle?: string };
export function workspaceInvitations(input: unknown, after?: string) {
  const result = record(input);
  if (!Array.isArray(result.invitations) || result.invitations.length > 25
      || (result.cursor !== undefined && (!uuid(result.cursor) || result.cursor === after || result.invitations.length !== 25))) throw Error("invalid_invitation_page");
  const invitations = result.invitations.map((input): WorkspaceInvitation => {
    const invitation = record(input);
    if (!uuid(invitation.inviteId) || typeof invitation.status !== "string" || !Object.hasOwn(invitationStatuses, invitation.status)
        || typeof invitation.expiresAt !== "string" || !Number.isFinite(Date.parse(invitation.expiresAt))
        || (invitation.claimedDid !== undefined && (typeof invitation.claimedDid !== "string" || !/^did:[a-z]+:[^/\s]+$/u.test(invitation.claimedDid)))
        || (invitation.claimedHandle !== undefined && !certifiedHandle(invitation.claimedHandle))) throw Error("invalid_invitation_page");
    return { inviteId: invitation.inviteId, status: invitation.status, expiresAt: invitation.expiresAt,
      ...(typeof invitation.claimedDid === "string" ? { claimedDid: invitation.claimedDid } : {}),
      ...(typeof invitation.claimedHandle === "string" ? { claimedHandle: invitation.claimedHandle } : {}) };
  });
  if (new Set(invitations.map(item => item.inviteId)).size !== invitations.length) throw Error("invalid_invitation_page");
  return { invitations, cursor: result.cursor as string | undefined };
}
export const invitationDate = (value: string) => fullDate(new Date(value).toISOString().slice(0, 10));
export const inviteToken = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{43}$/u.test(value);

export const pendingInviteKey = "weave-pending-workspace-invite";
/** Keep the fragment recoverable until storage can survive an account remount or sign-in navigation. */
export function pendingWorkspaceInvite(hash: string, storage: () => Pick<Storage, "getItem" | "setItem">, hideFragment: () => void) {
  const match = /^#invite=([A-Za-z0-9_-]{43})$/u.exec(hash);
  let token: string | null;
  try {
    const held = storage();
    if (match) held.setItem(pendingInviteKey, match[1]!);
    const value = held.getItem(pendingInviteKey);
    token = inviteToken(value) ? value : null;
  } catch { return { token: match?.[1] ?? null, persisted: false }; }
  if (match) {
    try { hideFragment(); } catch { /* Storage still retains the invitation. */ }
  }
  return { token, persisted: true };
}
