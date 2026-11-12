import { createHash, randomBytes } from "node:crypto";
import { certifiedHandle, record, uuid } from "./account-contract.ts";
import { AccountError } from "./account-provider.ts";
import { requireCertifiedProjectResult, type ProjectActor } from "./project-commands.ts";
import { discoveryDid } from "./project-discovery-contract.ts";
import type { CertifiedProjectProvider } from "./certified-project-provider.ts";
import type { WorkspaceInviteCommand } from "./workspace-invites-contract.ts";
import type { WorkspaceInviteStore } from "./workspace-invites-store.ts";
import { suspendDepartedMember, workspaceProjectTarget, type ProjectLifecycle } from "./project-discovery-lifecycle.ts";

type Provider = Pick<CertifiedProjectProvider, "getProject" | "getMembership" | "getGroupMember" | "verifiedHandle">;
const unavailable = (): never => { throw new AccountError(503, "project_workspace_unavailable"); };
const date = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));
const tokenHash = (value: string) => createHash("sha256").update(value).digest("hex");

function inviteSummary(value: unknown) {
  const item = record(value);
  if (!uuid(item.inviteId) || !date(item.createdAt) || !date(item.expiresAt)
    || !["pending","claimed","approved","revoked","expired"].includes(String(item.status))
    || (item.claimedDid !== undefined && !discoveryDid(item.claimedDid))
    || (item.claimedHandle !== undefined && !certifiedHandle(item.claimedHandle))) return unavailable();
  const dates = ["claimedAt","approvedAt","revokedAt"] as const;
  if (dates.some(key => item[key] !== undefined && !date(item[key]))) return unavailable();
  return { inviteId: item.inviteId, status: item.status as string, createdAt: item.createdAt, expiresAt: item.expiresAt,
    ...(item.claimedDid === undefined ? {} : { claimedDid: item.claimedDid }),
    ...(item.claimedHandle === undefined ? {} : { claimedHandle: item.claimedHandle }),
    ...Object.fromEntries(dates.filter(key => item[key] !== undefined).map(key => [key,item[key]])) };
}

/** Optional display metadata must not hold the list open if a provider ignores cancellation. */
function withVerifiedHandle(item: ReturnType<typeof inviteSummary>, provider: Provider, signal: AbortSignal) {
  // A stored or cached label cannot substitute for fresh identity proof.
  const { claimedHandle: _unverified, ...base } = item;
  if (base.status !== "claimed" || !base.claimedDid || signal.aborted) return Promise.resolve(base);
  const claimedDid = base.claimedDid;
  return new Promise<ReturnType<typeof inviteSummary>>(resolve => {
    const finish = (result: ReturnType<typeof inviteSummary> = base) => { signal.removeEventListener("abort", aborted); resolve(result); };
    const aborted = () => finish();
    signal.addEventListener("abort", aborted, { once: true });
    Promise.resolve().then(() => signal.aborted ? null : provider.verifiedHandle(claimedDid, signal)).then(result => {
      finish(!signal.aborted && result?.ok && result.value.did === claimedDid && certifiedHandle(result.value.handle)
        ? { ...base, claimedHandle: result.value.handle } : base);
    }).catch(() => finish());
  });
}

export function createWorkspaceInvites(provider: Provider, store: WorkspaceInviteStore, lifecycle: ProjectLifecycle) {
  return async (actor: ProjectActor, command: WorkspaceInviteCommand, cancellation?: AbortSignal) => {
    const startedAt = performance.now();
    const signal = cancellation ? AbortSignal.any([cancellation, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000);
    if (signal.aborted) return unavailable();
    if (command.action === "claim_invite") {
      const result = record(await store.execute(actor,"claim",{ tokenHash: tokenHash(command.token) }));
      if (result.status !== "pending_review" || !uuid(result.inviteId) || !date(result.expiresAt)) return unavailable();
      return { status: "pending_review", inviteId: result.inviteId, expiresAt: result.expiresAt };
    }
    const link=workspaceProjectTarget(await lifecycle.content.target(actor,command.workspaceId));
    if (link.projectUri!==command.projectUri) throw new AccountError(404,"project_not_found");
    if (!link.groupDid) throw new AccountError(403,"workspace_admin_required");
    const observedAt=new Date().toISOString();
    const actorRole = requireCertifiedProjectResult(await provider.getMembership(actor.did,link.groupDid,signal));
    if (!actorRole) {
      await suspendDepartedMember(lifecycle,actor,command.workspaceId,link.projectUri,observedAt);
      throw new AccountError(403,"project_authority_required");
    }
    const current=await provider.getProject(link.projectUri,signal);
    if (current.ok && (current.value.uri!==link.projectUri || current.value.repoDid!==link.repositoryDid
      || current.value.groupDid!==link.groupDid)) return unavailable();
    const ineligible=(!current.ok && current.code==="not_found") || (current.ok && current.value.visibility!=="public");
    if (ineligible) {
      await lifecycle.content.command(actor,command.workspaceId,actorRole,null,"pause_matching",{});
      if (command.action==="create_invite" || command.action==="approve_invite") throw new AccountError(404,"project_not_found");
    } else {
      const project=requireCertifiedProjectResult(current);
      if (project.uri!==link.projectUri || project.repoDid!==link.repositoryDid || project.groupDid!==link.groupDid) return unavailable();
    }
    const proof = { workspaceId: command.workspaceId, ...link, actorRole };
    if (signal.aborted) return unavailable();
    if (command.action === "create_invite") {
      const token = randomBytes(32).toString("base64url");
      const result = record(await store.execute(actor,"create",{ ...proof, tokenHash: tokenHash(token) }));
      if (result.status !== "pending" || !uuid(result.inviteId) || !date(result.expiresAt)) return unavailable();
      return { status: "pending", inviteId: result.inviteId, expiresAt: result.expiresAt, token };
    }
    if (command.action === "list_invites") {
      const result = record(await store.execute(actor,"list",{ ...proof, cursor: command.cursor }));
      if (!Array.isArray(result.invitations) || result.invitations.length > 25
        || (result.cursor !== undefined && (!uuid(result.cursor) || result.cursor === command.cursor || result.invitations.length !== 25))) return unavailable();
      const summaries = result.invitations.map(inviteSummary);
      const invitations: ReturnType<typeof inviteSummary>[] = [];
      if (new Set(summaries.map(item => item.inviteId)).size !== summaries.length) return unavailable();
      // Labels are optional: spend at most two seconds, leaving time to deliver the list
      // before the browser's 15-second request deadline, including dispatch overhead.
      const metadataBudget = Math.max(0, Math.floor(Math.min(2_000, 12_000 - (performance.now() - startedAt))));
      const metadataSignal = metadataBudget === 0 ? AbortSignal.abort()
        : AbortSignal.any([signal, AbortSignal.timeout(metadataBudget)]);
      for (let start = 0; start < summaries.length; start += 5)
        invitations.push(...await Promise.all(summaries.slice(start, start + 5).map(item => withVerifiedHandle(item, provider, metadataSignal))));
      return { invitations, cursor: result.cursor as string | undefined };
    }
    if (command.action === "revoke_invite") {
      const result = record(await store.execute(actor,"revoke",{ ...proof, inviteId: command.inviteId }));
      if (result.inviteId !== command.inviteId || (result.status !== "revoked" && result.status !== "already_reviewed")) return unavailable();
      return { status: result.status, inviteId: command.inviteId };
    }
    // Check explicit workspace administration and the pinned claim before reading another person's membership.
    const checked = record(await store.execute(actor,"check",{ ...proof, inviteId: command.inviteId, recipientDid: command.recipientDid }));
    if (checked.inviteId !== command.inviteId || (checked.status !== "verified" && checked.status !== "already_reviewed")) return unavailable();
    if (checked.status === "already_reviewed") return { status: "already_reviewed", inviteId: command.inviteId };
    const recipientObservedAt=new Date().toISOString();
    const recipientRole = requireCertifiedProjectResult(await provider.getGroupMember(actor.did, link.groupDid, command.recipientDid, signal));
    if (!recipientRole) throw new AccountError(403,"certified_membership_required");
    if (signal.aborted) return unavailable();
    const result = record(await store.execute(actor,"approve",{ ...proof, inviteId: command.inviteId,
      recipientDid: command.recipientDid, accessRole: command.accessRole, recipientRole, observedAt: recipientObservedAt }));
    if (result.inviteId !== command.inviteId || (result.status !== "granted" && result.status !== "already_reviewed")) return unavailable();
    return { status: result.status, inviteId: command.inviteId };
  };
}
