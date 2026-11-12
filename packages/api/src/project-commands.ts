import { randomInt } from "node:crypto";
import { parseTeamDocument, record, uuid } from "./account-contract.ts";
import { AccountError } from "./account-provider.ts";
import { parseProjectUri } from "./project-index-source.ts";
import type { CertifiedProjectProvider, CertifiedProject, CertifiedGroupRole } from "./certified-project-provider.ts";

export interface ProjectActor {
  userId: string;
  sessionId: string;
  did: string;
}
export interface ProjectStore {
  execute(actor: ProjectActor, action: string, data: Record<string, unknown>): Promise<unknown>;
}
const did = (value: unknown): value is string => typeof value === "string" &&
  value.length <= 2048 && /^did:[a-z]+:[a-zA-Z0-9._:%-]+$/.test(value);
const revision = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0 && Number(value) <= 2147483647;
const isAdmin = (role: CertifiedGroupRole | null) => role === "owner" || role === "admin";

function invalid(): never { throw new AccountError(400, "invalid_project_command"); }
function keys(value: Record<string, unknown>, expected: string[]) {
  if (Object.keys(value).length !== expected.length || expected.some(key => !Object.hasOwn(value, key))) invalid();
}
export function parseProjectCommand(value: Record<string, unknown>) {
  const action = value.action;
  if (action === "team_load" || action === "public_evidence") {
    keys(value, ["action", "workspaceId"]);
    if (!uuid(value.workspaceId)) invalid();
    return action === "team_load"
      ? { action, workspaceId: value.workspaceId } as const
      : { action, workspaceId: value.workspaceId } as const;
  }
  if (action === "team_save") {
    keys(value, ["action", "workspaceId", "expectedRevision", "requestId", "document"]);
    if (!uuid(value.workspaceId) || !uuid(value.requestId) ||
      (value.expectedRevision !== 0 && !revision(value.expectedRevision))) invalid();
    return { action, workspaceId: value.workspaceId, expectedRevision: value.expectedRevision,
      requestId: value.requestId, document: parseTeamDocument(value.document) } as const;
  }
  if (action === "create") {
    keys(value, ["action", "initiativeId", "expectedRevision", "requestId", "groupLabel", "publicProfile"]);
    const profile = record(value.publicProfile);
    keys(profile, ["title", "description"]);
    if (!uuid(value.initiativeId) || !uuid(value.requestId) || !revision(value.expectedRevision) ||
      typeof value.groupLabel !== "string" || !/^[a-z][a-z0-9-]{1,30}[a-z0-9]$/.test(value.groupLabel) ||
      typeof profile.title !== "string" || !profile.title.trim() || [...profile.title.trim()].length > 80 ||
      typeof profile.description !== "string" || [...profile.description.trim()].length > 800) invalid();
    return {
      action, initiativeId: value.initiativeId, expectedRevision: value.expectedRevision, requestId: value.requestId,
      groupLabel: value.groupLabel, publicProfile: { title: profile.title.trim(), description: profile.description.trim() },
    } as const;
  }
  const { uri } = parseProjectUri(value.projectUri);
  if (action === "resolve_teammate") {
    keys(value, ["action", "projectUri", "workspaceId", "handle"]);
    if (!uuid(value.workspaceId) || typeof value.handle !== "string" || value.handle.length > 254
      || !/^@?(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z][a-zA-Z0-9-]{0,62}$/u.test(value.handle)) invalid();
    return { action, projectUri: uri, workspaceId: value.workspaceId, handle: value.handle.replace(/^@/u, "").toLowerCase() } as const;
  }
  if (action === "lookup" || action === "request_setup" || action === "activate") {
    keys(value, ["action", "projectUri"]);
    return { action, projectUri: uri } as const;
  }
  if (action === "link") {
    keys(value, ["action", "projectUri", "initiativeId", "expectedRevision"]);
    if (!uuid(value.initiativeId) || !revision(value.expectedRevision)) invalid();
    return { action, projectUri: uri, initiativeId: value.initiativeId, expectedRevision: value.expectedRevision } as const;
  }
  if (action === "approve_setup") {
    keys(value, ["action", "projectUri", "requestId"]);
    if (!uuid(value.requestId)) invalid();
    return { action, projectUri: uri, requestId: value.requestId } as const;
  }
  if (action === "grant_access" || action === "add_member_and_grant") {
    const fields = ["action", "projectUri", "workspaceId", "recipientDid", "accessRole"];
    if (action === "add_member_and_grant") {
      fields.push("confirmGroupPermissions");
      if (value.confirmGroupPermissions !== true) invalid();
    }
    keys(value, fields);
    const accessRole = value.accessRole;
    if (!uuid(value.workspaceId) || !did(value.recipientDid) ||
      (accessRole !== "viewer" && accessRole !== "editor" && accessRole !== "admin")) invalid();
    return { action, projectUri: uri, workspaceId: value.workspaceId, recipientDid: value.recipientDid, accessRole } as const;
  }
  if (action === "recover_admin") {
    keys(value, value.workspaceId === undefined ? ["action", "projectUri"] : ["action", "projectUri", "workspaceId"]);
    if (value.workspaceId !== undefined && !uuid(value.workspaceId)) invalid();
    return { action, projectUri: uri, workspaceId: value.workspaceId } as const;
  }
  if (action === "suspend_access" || action === "revoke_access") {
    const fields = ["action", "projectUri", "recipientDid"];
    if (action === "revoke_access" || value.workspaceId !== undefined) {
      fields.push("workspaceId");
      if (!uuid(value.workspaceId)) invalid();
    }
    keys(value, fields);
    if (!did(value.recipientDid)) invalid();
    return { action, projectUri: uri, workspaceId: value.workspaceId, recipientDid: value.recipientDid } as const;
  }
  return invalid();
}

export type TeamCommand = Extract<ReturnType<typeof parseProjectCommand>, { action: "team_load" | "team_save" }>;
type Command = ReturnType<typeof parseProjectCommand>;
type ProviderResult<T> = { ok: true; value: T } | { ok: false; code: string };
export function requireCertifiedProjectResult<T>(result: ProviderResult<T>): T {
  if (result.ok) return result.value;
  switch (result.code) {
    case "authorization_required": throw new AccountError(403, "project_consent_required");
    case "forbidden": throw new AccountError(403, "project_authority_required");
    case "not_found": throw new AccountError(404, "project_not_found");
    case "conflict": throw new AccountError(409, "project_conflict");
    case "invalid_input": return invalid();
    default: throw new AccountError(503, "certified_project_unavailable");
  }
}

interface CreateIntent {
  requestId: string;
  groupHandle: string;
  projectRkey: string;
  createdAt: string;
  publicProfile: { title: string; description: string };
  status: "prepared" | "group_pending" | "group_rejected" | "group_confirmed" | "project_pending" | "project_confirmed" | "linked";
  registrationDid?: string;
  groupReconcileAfter?: string;
  groupDid?: string;
  workspaceId?: string;
  projectUri?: string;
}
let lastTimestamp = 0n;
const clockId = BigInt(randomInt(1024));
function projectKey(now: Date) {
  const timestamp = BigInt(now.getTime()) * 1000n;
  lastTimestamp = timestamp > lastTimestamp ? timestamp : lastTimestamp + 1n;
  let value = (lastTimestamp << 10n) | clockId;
  let key = "";
  const alphabet = "234567abcdefghijklmnopqrstuvwxyz";
  for (let digit = 0; digit < 13; digit++) {
    key = alphabet[Number(value & 31n)] + key;
    value >>= 5n;
  }
  return key;
}

type ProjectProof = { projectUri: string; repositoryDid: string; cid: string; groupDid?: string; actorRole?: CertifiedGroupRole };

export function createProjectCommands(provider: CertifiedProjectProvider, store: ProjectStore, groupPdsOrigin: string) {
  const groupDomain = new URL(groupPdsOrigin).hostname;
  async function proof(actor: ProjectActor, project: CertifiedProject): Promise<ProjectProof> {
    if (project.visibility !== "public") throw new AccountError(404, "project_not_found");
    const identity = { projectUri: project.uri, repositoryDid: project.repoDid, cid: project.cid };
    const groupDid = project.groupDid ?? (project.repoDid === actor.did ? undefined : project.repoDid);
    if (!groupDid) return identity;
    const observedAt = new Date().toISOString();
    const actorRole = requireCertifiedProjectResult(await provider.getMembership(actor.did, groupDid));
    if (!actorRole) {
      // A complete negative CGS result invalidates the caller's old workspace grant.
      await store.execute(actor, "suspend_access", {
        ...identity, groupDid, recipientDid: actor.did, recipientRole: "absent", observedAt,
      });
      throw new AccountError(403, "project_authority_required");
    }
    return { ...identity, groupDid, actorRole };
  }

  async function create(actor: ProjectActor, command: Extract<Command, { action: "create" }>) {
    const run = (action: string, data: Record<string, unknown> = {}) =>
      store.execute(actor, action, { requestId: command.requestId, ...data });
    const now = new Date();
    const groupHandle = `${command.groupLabel}.${groupDomain}`;
    const checkHandle = async () => {
      const existing = await provider.findRegisteredGroup(actor.did, groupHandle);
      if (existing.ok || existing.code === "forbidden" || existing.code === "conflict")
        throw new AccountError(409, "group_handle_in_use");
      if (existing.code !== "not_found") requireCertifiedProjectResult(existing);
    };
    let prior: unknown;
    try { prior = await run("get_create"); }
    catch (error) {
      if (!(error instanceof AccountError) || error.status !== 404) throw error;
    }
    if (!prior) await checkHandle();
    let intent = await run("begin_create", {
      initiativeId: command.initiativeId, expectedRevision: command.expectedRevision, groupHandle,
      projectRkey: projectKey(now), createdAt: now.toISOString(), publicProfile: command.publicProfile,
    }) as CreateIntent;
    const pending = (step: string) => ({ status: "pending", step, requestId: intent.requestId });
    const linked = async () => {
      if (!intent.projectUri) throw new AccountError(503, "project_workspace_unavailable");
      return store.execute(actor, "lookup", await proof(actor, requireCertifiedProjectResult(await provider.getProject(intent.projectUri))));
    };
    if (intent.status === "linked") return linked();
    if (intent.status === "group_rejected") throw new AccountError(409, "group_registration_rejected");

    if (intent.status === "prepared") {
      if (prior) {
        try { await checkHandle(); }
        catch (error) {
          if (error instanceof AccountError && error.code === "group_handle_in_use")
            await run("abandon_prepared_create");
          throw error;
        }
      }
      const claim = await run("claim_create_step", { step: "group" }) as CreateIntent & { claimed?: boolean };
      if (claim.claimed) {
        const registered = await provider.registerGroup(actor.did, { handle: command.groupLabel });
        if (!registered.ok) {
          if (registered.code === "pending") return pending("group");
          await run("reject_group_claim");
          if (registered.code === "conflict") throw new AccountError(409, "group_handle_in_use");
          requireCertifiedProjectResult(registered);
        } else if (registered.value.handle === groupHandle) {
          intent = await run("record_registration_receipt", {
            groupDid: registered.value.groupDid, groupHandle,
          }) as CreateIntent;
        } else return pending("group");
      } else intent = claim;
    }

    if (intent.status === "group_pending") {
      if (!intent.registrationDid && intent.groupReconcileAfter && Date.parse(intent.groupReconcileAfter) > Date.now())
        return pending("group");
      const confirmed = await provider.findRegisteredGroup(actor.did, intent.groupHandle);
      if (!confirmed.ok || (intent.registrationDid && confirmed.value.groupDid !== intent.registrationDid))
        return pending("group");
      intent = await run("record_group", { ...confirmed.value, groupHandle: confirmed.value.handle, actorRole: "owner" }) as CreateIntent;
    }
    const groupDid = intent.groupDid;
    if (!groupDid) throw new AccountError(503, "project_workspace_unavailable");
    if (requireCertifiedProjectResult(await provider.getMembership(actor.did, groupDid)) !== "owner")
      throw new AccountError(403, "project_authority_required");

    const draft = { title: intent.publicProfile.title, description: intent.publicProfile.description || undefined,
      rkey: intent.projectRkey, createdAt: intent.createdAt };
    if (intent.status === "group_confirmed") {
      const claim = await run("claim_create_step", { step: "project" }) as CreateIntent & { claimed?: boolean };
      if (claim.claimed) {
        const created = await provider.createProject(actor.did, groupDid, draft);
        if (!created.ok) return pending("project");
      }
      intent = claim;
    }
    if (intent.status === "project_pending") {
      let confirmed = await provider.confirmProject(groupDid, draft);
      if (!confirmed.ok && confirmed.code === "not_found") {
        // Unlike group registration, the public project has a reserved record key.
        confirmed = await provider.createProject(actor.did, groupDid, draft);
      }
      if (!confirmed.ok) return pending("project");
      intent = await run("record_project", await proof(actor, confirmed.value)) as CreateIntent;
    }
    if (intent.status === "linked") return linked();
    if (intent.status !== "project_confirmed" || !intent.projectUri) return pending("project");
    return run("finish_create", await proof(actor, requireCertifiedProjectResult(await provider.getProject(intent.projectUri))));
  }

  return async (actor: ProjectActor, command: Command) => {
    if (command.action === "team_load" || command.action === "team_save" || command.action === "public_evidence") return invalid();
    if (command.action === "create") return create(actor, command);
    const project = requireCertifiedProjectResult(await provider.getProject(command.projectUri));
    if (project.uri !== command.projectUri) throw new AccountError(404, "project_not_found");
    const verification = await proof(actor, project);
    const run = (action: string, data: Record<string, unknown> = {}) =>
      store.execute(actor, action, { ...verification, ...data });
    if (command.action === "lookup" || command.action === "request_setup") return run(command.action);
    if (command.action === "link") {
      if (verification.groupDid) return invalid();
      return run("link", { initiativeId: command.initiativeId, expectedRevision: command.expectedRevision });
    }
    if (!verification.groupDid) return invalid();
    if (command.action === "activate" || command.action === "approve_setup") {
      if (!isAdmin(verification.actorRole ?? null)) throw new AccountError(403, "project_authority_required");
      return command.action === "activate" ? run("link") : run("approve_setup", { requestId: command.requestId });
    }
    if (command.action === "recover_admin") {
      if (verification.actorRole !== "owner") throw new AccountError(403, "project_authority_required");
      return run(command.action, { workspaceId: command.workspaceId });
    }

    if (command.action === "resolve_teammate") {
      const access = record(await run("lookup"));
      if (access.workspaceId !== command.workspaceId || access.accessRole !== "admin")
        throw new AccountError(403, "workspace_admin_required");
      const recipient = requireCertifiedProjectResult(await provider.resolveHandle(command.handle));
      return { recipientDid: recipient.did, handle: recipient.handle };
    }
    if (!did(command.recipientDid)) return invalid();
    const { workspaceId, recipientDid } = command;
    const ownerSuspension = command.action === "suspend_access" && verification.actorRole === "owner";
    if (!ownerSuspension) {
      if (!uuid(workspaceId)) return invalid();
      // Check the workspace grant before asking Certified for another member's role.
      const access = record(await run("lookup"));
      if (access.workspaceId !== workspaceId || access.accessRole !== "admin")
        throw new AccountError(403, "workspace_admin_required");
    }
    if (command.action === "revoke_access") return run(command.action, { workspaceId, recipientDid });
    let observedAt = new Date().toISOString();
    let recipientRole = requireCertifiedProjectResult(await provider.getGroupMember(actor.did, verification.groupDid, recipientDid));
    if (command.action === "add_member_and_grant" && !recipientRole) {
      if (!isAdmin(verification.actorRole ?? null)) throw new AccountError(403, "project_authority_required");
      await run("check_recipient", { workspaceId, recipientDid });
      const added = await provider.addMember(actor.did, verification.groupDid, { memberDid: recipientDid, role: "member" });
      if (!added.ok && !["pending", "conflict", "unavailable"].includes(added.code)) requireCertifiedProjectResult(added);
      observedAt = new Date().toISOString();
      const observed = await provider.getGroupMember(actor.did, verification.groupDid, recipientDid);
      if (!observed.ok || !observed.value) return { status: "group_membership_pending" };
      recipientRole = observed.value;
    }
    if (command.action === "grant_access" || command.action === "add_member_and_grant") {
      if (!recipientRole) throw new AccountError(403, "certified_membership_required");
      return run("grant_access", { workspaceId, recipientDid, recipientRole, observedAt, accessRole: command.accessRole });
    }
    if (recipientRole) throw new AccountError(409, "certified_membership_active");
    return run(command.action, { workspaceId, recipientDid, recipientRole: "absent", observedAt });
  };
}
