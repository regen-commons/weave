import { record } from "./account-contract.ts";
import { AccountError } from "./account-provider.ts";
import { parseProjectUri } from "./project-index-source.ts";
import type { ProjectActor, ProjectStore } from "./project-commands.ts";
import type { WorkspaceContentStore } from "./workspace-content.ts";

export interface ProjectLifecycle { projects: ProjectStore; content: WorkspaceContentStore }
export function workspaceProjectTarget(value: unknown) {
  const row=record(value), target=parseProjectUri(row.projectUri);
  if (row.repositoryDid!==target.did || (row.groupDid!==null && row.groupDid!==target.did)
    || typeof row.cid!=="string" || !/^[A-Za-z0-9]{1,128}$/u.test(row.cid))
    throw new AccountError(503,"project_workspace_unavailable");
  return {projectUri:target.uri,repositoryDid:target.did,groupDid:row.groupDid as string|null,cid:row.cid};
}
export async function suspendDepartedMember(lifecycle: ProjectLifecycle,actor: ProjectActor,workspaceId: string,
  expectedUri: string,observedAt: string) {
  const target=workspaceProjectTarget(await lifecycle.content.target(actor,workspaceId));
  if (target.projectUri!==expectedUri || !target.groupDid) throw new AccountError(503,"project_workspace_unavailable");
  await lifecycle.projects.execute(actor,"suspend_access",{...target,workspaceId,
    recipientDid:actor.did,recipientRole:"absent",observedAt});
}
