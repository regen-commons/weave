import { parseTeamSaved, parseTeamWorkspace, record } from "./account-contract.ts";
import { AccountError } from "./account-provider.ts";
import type { CertifiedGroupRole, CertifiedProjectProvider } from "./certified-project-provider.ts";
import { parsePublicEvidenceSnapshot, type MatchingCommand } from "./matching-contract.ts";
import { createMatchingProvider } from "./matching-provider.ts";
import { requireCertifiedProjectResult, type ProjectActor, type ProjectStore, type TeamCommand } from "./project-commands.ts";
import { parseProjectUri } from "./project-index-source.ts";

export interface WorkspaceContentStore {
  target(actor: ProjectActor, workspaceId: string): Promise<unknown>;
  command(actor: ProjectActor, workspaceId: string, role: CertifiedGroupRole | null,
    cid: string | null, action: string, payload: unknown): Promise<unknown>;
}

function target(value: unknown) {
  const row = record(value);
  const { uri, did } = parseProjectUri(row.projectUri);
  if (row.repositoryDid !== did || (row.groupDid !== null && row.groupDid !== did) ||
    typeof row.cid !== "string" || !/^[A-Za-z0-9]{1,128}$/.test(row.cid)) throw Error("invalid_workspace_target");
  return { projectUri: uri, repositoryDid: did, groupDid: row.groupDid as string | null, cid: row.cid };
}

export function createWorkspaceContent(
  provider: Pick<CertifiedProjectProvider, "getProject" | "getMembership">,
  store: WorkspaceContentStore, projects: ProjectStore,
) {
  async function access(actor: ProjectActor, workspaceId: string) {
    const link = target(await store.target(actor, workspaceId));
    if (!link.groupDid) return { link, role: null };
    const observedAt = new Date().toISOString();
    const role = requireCertifiedProjectResult(await provider.getMembership(actor.did, link.groupDid));
    if (!role) {
      await projects.execute(actor, "suspend_access", {
        ...link, workspaceId, recipientDid: actor.did, recipientRole: "absent", observedAt,
      });
      throw new AccountError(403, "workspace_access_required");
    }
    return { link, role };
  }
  async function verifiedProject(actor: ProjectActor, id: string) {
    const { link, role } = await access(actor, id);
    const upstream = await provider.getProject(link.projectUri);
    if ((!upstream.ok && upstream.code === "not_found") || (upstream.ok && upstream.value.visibility === "unlisted")) {
      await store.command(actor, id, role, null, "pause_matching", {});
      throw new AccountError(404, "project_not_found");
    }
    const project = requireCertifiedProjectResult(upstream);
    if (project.uri !== link.projectUri || project.repoDid !== link.repositoryDid)
      throw new AccountError(503, "certified_project_unavailable");
    return { role, cid: project.cid };
  }

  return {
    async saveOrLoad(actor: ProjectActor, command: TeamCommand) {
      const { link, role } = await access(actor, command.workspaceId);
      if (!link.groupDid) throw new AccountError(404, "not_found");
      if (command.action === "team_save") {
        const result = await store.command(actor, command.workspaceId, role, null, command.action, {
          expectedRevision: command.expectedRevision, requestId: command.requestId, document: command.document,
        });
        return { saved: parseTeamSaved(result) };
      }
      const workspace = { ...parseTeamWorkspace(await store.command(actor, command.workspaceId, role, null, command.action, {})), projectUri: link.projectUri };
      if (workspace.saved || workspace.accessRole === "viewer") return workspace;
      const project = await provider.getProject(link.projectUri);
      if (project.ok && project.value.uri === link.projectUri && project.value.repoDid === link.repositoryDid
          && project.value.visibility === "public") {
        return { ...workspace, projectTitle: project.value.title.trim().slice(0, 200).replace(/[\uD800-\uDBFF]$/u, "") || null };
      }
      return workspace;
    },
    async publicEvidence(actor: ProjectActor, workspaceId: string) {
      const { role, cid } = await verifiedProject(actor, workspaceId);
      return parsePublicEvidenceSnapshot(
        await store.command(actor, workspaceId, role, cid, "public_evidence", {}),
      );
    },
    async match(actor: ProjectActor, command: MatchingCommand) {
      const id = command.initiativeId;
      const { role, cid } = await verifiedProject(actor, id);
      const matching = createMatchingProvider((action, data) => store.command(actor, id, role, cid, action, data));
      return matching.execute("", command);
    },
  };
}
