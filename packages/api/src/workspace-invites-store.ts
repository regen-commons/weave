import postgres from "postgres";
import { AccountError } from "./account-provider.ts";
import type { ProjectActor } from "./project-commands.ts";

export interface WorkspaceInviteStore {
  execute(actor: ProjectActor, action: "create" | "list" | "claim" | "check" | "approve" | "revoke", data: Record<string, unknown>): Promise<unknown>;
}
export function createWorkspaceInviteStore(sql: postgres.Sql): WorkspaceInviteStore {
  return { async execute(actor, action, data) {
    try {
      const [row] = await sql`select weave_workspace.invitation(
        ${actor.userId}::uuid,${actor.sessionId}::uuid,${actor.did},${action},${JSON.stringify(data)}::text::jsonb
      ) as result`;
      if (!row?.result) throw Error("missing_invitation_result");
      return row.result;
    } catch (error) {
      const code = error instanceof postgres.PostgresError ? error.code : undefined;
      const known: Record<string, [number, string]> = { PT400: [400,"invalid_project_command"], PT401: [401,"sign_in_required"],
        PT403: [403,"workspace_admin_required"], PT404: [404,"invitation_not_found"], PT409: [409,"invitation_conflict"],
        PT429: [429,"invitation_limit_reached"] };
      throw new AccountError(...(code && known[code] ? known[code]! : [503,"project_workspace_unavailable"] as [number,string]));
    }
  } };
}
