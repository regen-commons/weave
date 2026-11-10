import postgres from "postgres";
import { AccountError } from "./account-provider.ts";
import type { ProjectActor } from "./project-commands.ts";

export interface ProjectDiscoveryStore {
  read(actor: ProjectActor, action: "list_workspaces" | "list_setup_requests", data: Record<string, unknown>): Promise<unknown>;
}

export function createProjectDiscoveryStore(sql: postgres.Sql): ProjectDiscoveryStore {
  return {
    async read(actor, action, data) {
      try {
        const [row] = await sql`select weave_workspace.discovery(
          ${actor.userId}::uuid, ${actor.sessionId}::uuid, ${actor.did}, ${action}, ${JSON.stringify(data)}::text::jsonb
        ) as result`;
        if (!row?.result) throw Error("missing_discovery_result");
        return row.result;
      } catch (error) {
        const code = error instanceof postgres.PostgresError ? error.code : undefined;
        if (code === "PT401") throw new AccountError(401, "sign_in_required");
        if (code === "PT403") throw new AccountError(403, "project_authority_required");
        if (code === "PT400") throw new AccountError(400, "invalid_project_command");
        throw new AccountError(503, "project_workspace_unavailable");
      }
    },
  };
}
