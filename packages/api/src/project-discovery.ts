import { record, uuid } from "./account-contract.ts";
import { AccountError } from "./account-provider.ts";
import { discoveryDid, type ProjectDiscoveryCommand } from "./project-discovery-contract.ts";
import { parseProjectUri } from "./project-index-source.ts";
import { requireCertifiedProjectResult, type ProjectActor } from "./project-commands.ts";
import type { CertifiedGroupRole, CertifiedProject, CertifiedProjectProvider } from "./certified-project-provider.ts";
import type { ProjectDiscoveryStore } from "./project-discovery-store.ts";
import { suspendDepartedMember, type ProjectLifecycle } from "./project-discovery-lifecycle.ts";

type Provider = Pick<CertifiedProjectProvider, "listMemberships" | "listProjects" | "getProject" | "getMembership">;
const pageSize = 25;
const scopes = { groups: "groups", workspaces: "workspaces" };
const unavailable = (): never => { throw new AccountError(503, "project_workspace_unavailable"); };
const invalid = (): never => { throw new AccountError(400, "invalid_project_command"); };
const accessRole = (value: unknown): value is "admin" | "editor" | "viewer" => value === "admin" || value === "editor" || value === "viewer";

function nextCursor(actor: ProjectActor, scope: string, value: string | undefined) {
  return value === undefined ? undefined
    : Buffer.from(JSON.stringify({ v: 1, actor: actor.did, scope, value })).toString("base64url");
}
function readCursor(actor: ProjectActor, scope: string, value: string | undefined) {
  if (value === undefined) return undefined;
  try {
    const decoded = Buffer.from(value, "base64url");
    if (decoded.toString("base64url") !== value) return invalid();
    const cursor = record(JSON.parse(decoded.toString("utf8")));
    if (Object.keys(cursor).length !== 4 || cursor.v !== 1 || cursor.actor !== actor.did || cursor.scope !== scope
      || typeof cursor.value !== "string" || !cursor.value || cursor.value.length > 2048 || /\p{Cc}/u.test(cursor.value)) return invalid();
    return cursor.value;
  } catch { return invalid(); }
}

function page(input: unknown) {
  try {
    const value = record(input);
    if (!Array.isArray(value.entries) || value.entries.length > pageSize
      || (value.cursor !== undefined && (!uuid(value.cursor) || value.entries.length !== pageSize))) return unavailable();
    return { entries: value.entries as unknown[], cursor: value.cursor as string | undefined };
  } catch { return unavailable(); }
}

function summary(project: CertifiedProject) {
  // Select only public provider fields. Never use a private saved document as a display fallback.
  return { uri: project.uri, cid: project.cid, repoDid: project.repoDid,
    ...(project.groupDid ? { groupDid: project.groupDid } : {}), title: project.title,
    ...(project.description ? { description: [...project.description].slice(0, 600).join("") } : {}),
    createdAt: project.createdAt, visibility: "public" as const };
}

export function createProjectDiscovery(provider: Provider, store: ProjectDiscoveryStore, lifecycle: ProjectLifecycle) {
  return async (actor: ProjectActor, command: ProjectDiscoveryCommand, cancellation?: AbortSignal) => {
    const signal = cancellation ? AbortSignal.any([cancellation, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000);
    if (signal.aborted) return unavailable();
    if (command.action === "list_project_groups") {
      const cursor = readCursor(actor, scopes.groups, command.cursor);
      const result = requireCertifiedProjectResult(await provider.listMemberships(actor.did, cursor, signal));
      return { groups: result.groups, cursor: nextCursor(actor, scopes.groups, result.cursor) };
    }
    if (command.action === "list_projects") {
      const repository = command.target.kind === "personal" ? actor.did : command.target.groupDid;
      const scope = `projects:${repository}`;
      const result = requireCertifiedProjectResult(await provider.listProjects(
        actor.did, command.target, readCursor(actor, scope, command.cursor), signal,
      ));
      return { repositoryDid: result.repositoryDid, certifiedRole: result.certifiedRole,
        projects: result.projects.map(summary), cursor: nextCursor(actor, scope, result.cursor) };
    }
    const memberships = new Map<string, CertifiedGroupRole | null>();
    const observed = new Map<string,string>();
    const membership = async (groupDid: string) => {
      if (!memberships.has(groupDid)) {
        observed.set(groupDid,new Date().toISOString());
        memberships.set(groupDid,requireCertifiedProjectResult(await provider.getMembership(actor.did, groupDid, signal)));
      }
      return memberships.get(groupDid) ?? null;
    };
    const cursor = readCursor(actor, scopes.workspaces, command.cursor);
    if (cursor !== undefined && !uuid(cursor)) return invalid();
    // SQL checks the live exact session/DID and filters active grants before any row leaves storage.
    const rows = page(await store.read(actor, "list_workspaces", { cursor }));
    const seen = new Set<string>();
    const workspaces = [];
    for (const input of rows.entries) {
      if (signal.aborted) return unavailable();
      const row = record(input);
      if (!uuid(row.workspaceId) || seen.has(row.workspaceId) || !accessRole(row.accessRole)
        || (row.kind !== "personal" && row.kind !== "group") || !discoveryDid(row.repositoryDid)
        || (row.kind === "personal" && (row.repositoryDid !== actor.did || row.groupDid !== undefined || row.accessRole !== "admin"))
        || (row.kind === "group" && (row.groupDid !== row.repositoryDid || row.repositoryDid === actor.did))) return unavailable();
      const target = parseProjectUri(row.projectUri);
      if (target.did !== row.repositoryDid) return unavailable();
      seen.add(row.workspaceId);
      const certifiedRole = row.kind === "group" ? await membership(row.repositoryDid) : undefined;
      if (certifiedRole === null) {
        await suspendDepartedMember(lifecycle,actor,row.workspaceId,target.uri,observed.get(row.repositoryDid)!);
        continue;
      }
      const result = await provider.getProject(target.uri, signal);
      if (result.ok && (result.value.uri!==target.uri || result.value.repoDid!==row.repositoryDid
        || (row.kind==="group" && result.value.groupDid!==row.groupDid)
        || (row.kind==="personal" && result.value.groupDid!==undefined))) return unavailable();
      if ((!result.ok && result.code === "not_found") || (result.ok && result.value.visibility!=="public")) {
        await lifecycle.content.command(actor,row.workspaceId,certifiedRole??null,null,"pause_matching",{});
        workspaces.push({workspaceId:row.workspaceId,kind:row.kind,accessRole:row.accessRole,
          projectUri:target.uri,certifiedRole,status:"paused",project:null});
        continue;
      }
      const project = requireCertifiedProjectResult(result);
      if (project.uri !== target.uri || project.repoDid !== row.repositoryDid
        || (row.kind === "group" && project.groupDid !== row.groupDid)
        || (row.kind === "personal" && project.groupDid !== undefined)) return unavailable();
      workspaces.push({ workspaceId: row.workspaceId, kind: row.kind, accessRole: row.accessRole,
        projectUri: target.uri, certifiedRole, project: summary(project) });
    }
    const pendingSetups = [];
    let setupNext: string | undefined;
    if (command.setupGroupDid !== undefined) {
      const groupDid = command.setupGroupDid;
      const actorRole = await membership(groupDid);
      if (actorRole !== "owner" && actorRole !== "admin") throw new AccountError(403, "project_authority_required");
      const scope = `setups:${groupDid}`;
      const after = readCursor(actor, scope, command.setupCursor);
      if (after !== undefined && !uuid(after)) return invalid();
      const setups = page(await store.read(actor, "list_setup_requests", { groupDid, actorRole, cursor: after }));
      const requestIds = new Set<string>();
      for (const input of setups.entries) {
        if (signal.aborted) return unavailable();
        const row = record(input);
        if (!uuid(row.requestId) || requestIds.has(row.requestId) || row.groupDid !== groupDid
          || typeof row.requestedAt !== "string" || !Number.isFinite(Date.parse(row.requestedAt))) return unavailable();
        requestIds.add(row.requestId);
        const target = parseProjectUri(row.projectUri);
        if (target.did !== groupDid) return unavailable();
        const result = await provider.getProject(target.uri, signal);
        if (!result.ok && result.code === "not_found") continue;
        const project = requireCertifiedProjectResult(result);
        if (project.visibility !== "public") continue;
        if (project.groupDid !== groupDid || project.uri !== target.uri) return unavailable();
        pendingSetups.push({ requestId: row.requestId, projectUri: target.uri, groupDid,
          requestedAt: row.requestedAt, project: summary(project) });
      }
      setupNext = nextCursor(actor, scope, setups.cursor);
    }
    return { workspaces, cursor: nextCursor(actor, scopes.workspaces, rows.cursor), pendingSetups, setupCursor: setupNext };
  };
}
