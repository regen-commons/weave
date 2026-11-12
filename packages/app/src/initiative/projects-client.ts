import { record, uuid } from "@weave/api/account-contract";
import { AccountFailure, accountRequest } from "../account/client.ts";
import { beginConsentReturn, cancelConsentReturn, currentConsentReturn, finishConsentReturn, takeConsentReturn,
  type ProjectConsentAction } from "./consent-return.ts";
export type { ProjectConsentAction } from "./consent-return.ts";

export interface PublicProject {
  uri: string;
  cid: string;
  repoDid: string;
  groupDid?: string;
  title: string;
  description?: string;
  createdAt?: string;
}
export interface WorkspaceListing {
  workspaceId: string;
  projectUri: string;
  kind: "personal" | "group";
  accessRole: "viewer" | "editor" | "admin";
  project: PublicProject | null;
  status?: "paused";
}
export interface SetupListing { requestId: string; projectUri: string; groupDid: string; project: PublicProject }
export const projectRequest = (body: unknown, signal?: AbortSignal) =>
  accountRequest("", body, "/api/projects", signal);
const invalid = (): never => { throw new AccountFailure("project_workspace_unavailable"); };
export function projectRecord(value: unknown): PublicProject {
  const p = record(value);
  if (typeof p.uri !== "string" || !/^at:\/\/did:[a-z]+:[^/\s]+\/org.hypercerts.collection\/[^/\s]+$/u.test(p.uri)
      || typeof p.repoDid !== "string" || typeof p.cid !== "string" || typeof p.title !== "string"
      || p.title.length > 200 || (p.description !== undefined && typeof p.description !== "string")
      || (p.groupDid !== undefined && p.groupDid !== p.repoDid)) return invalid();
  return { uri: p.uri, cid: p.cid, repoDid: p.repoDid, title: p.title,
    ...(typeof p.description === "string" ? { description: p.description } : {}),
    ...(typeof p.createdAt === "string" && Number.isFinite(Date.parse(p.createdAt)) ? { createdAt: p.createdAt } : {}),
    ...(typeof p.groupDid === "string" ? { groupDid: p.groupDid } : {}) };
}
export function projectPage(value: Record<string, unknown>) {
  if (!Array.isArray(value.projects) || value.projects.length > 25
      || (value.certifiedRole !== undefined && !["owner","admin","member"].includes(String(value.certifiedRole)))
      || (value.cursor !== undefined && typeof value.cursor !== "string")) return invalid();
  return { projects: value.projects.map(projectRecord), cursor: value.cursor as string | undefined,
    certifiedRole: value.certifiedRole as "owner" | "admin" | "member" | undefined };
}
export function setupPage(value: Record<string, unknown>, groupDid: string) {
  if (!Array.isArray(value.pendingSetups) || value.pendingSetups.length > 25
      || (value.setupCursor !== undefined && typeof value.setupCursor !== "string")) return invalid();
  const requests = value.pendingSetups.map((input): SetupListing => {
    const row = record(input), project = projectRecord(row.project);
    if (!uuid(row.requestId) || row.groupDid !== groupDid || row.projectUri !== project.uri || project.groupDid !== groupDid) return invalid();
    return { requestId:row.requestId, projectUri:project.uri, groupDid, project };
  });
  return { requests, cursor: value.setupCursor as string | undefined };
}
export function workspacePage(value: Record<string, unknown>) {
  if (!Array.isArray(value.workspaces) || value.workspaces.length > 25
      || (value.cursor !== undefined && typeof value.cursor !== "string")) return invalid();
  return { cursor: value.cursor as string | undefined, workspaces: value.workspaces.map((input): WorkspaceListing => {
    const w = record(input);
    if (!uuid(w.workspaceId) || typeof w.projectUri !== "string" || !["group", "personal"].includes(String(w.kind))
        || !["viewer", "editor", "admin"].includes(String(w.accessRole))) return invalid();
    const project = w.status === "paused" && w.project === null ? null : projectRecord(w.project);
    if ((project && project.uri !== w.projectUri) || (w.status !== undefined && w.status !== "paused")) return invalid();
    return { workspaceId: w.workspaceId, projectUri: w.projectUri, kind: w.kind as WorkspaceListing["kind"],
      accessRole: w.accessRole as WorkspaceListing["accessRole"], project, ...(w.status==="paused"?{status:"paused" as const}:{}) };
  }) };
}

export async function startProjectConsent(action: ProjectConsentAction, storage: Storage, signal?: AbortSignal) {
  const id = beginConsentReturn(storage, { kind: "directory", action });
  try {
    const result = await accountRequest("", { action }, "/api/certified-project-consent", signal);
    const target = typeof result.authorizeUrl === "string" ? new URL(result.authorizeUrl) : null;
    if (!target || !["https://certified.one", "https://auth.certified.one"].includes(target.origin)
        || target.pathname !== "/oauth/authorize" || target.username || target.password || target.hash
        || !currentConsentReturn(storage, id)) throw new AccountFailure("project_consent_failed");
    return target.href;
  } catch (error) { cancelConsentReturn(storage, id); throw error; }
}
/** Consent only returns to the reviewed task. It never creates, shares or grants access automatically. */
export async function finishProjectConsent(result: string | null, storage: Storage): Promise<string | null> {
  const task = takeConsentReturn(result, () => storage, "directory");
  return task ? finishConsentReturn(task) : null;
}
