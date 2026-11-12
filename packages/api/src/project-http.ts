import { AccountError } from "./account-provider.ts";
import { boundedJson } from "./account-http.ts";
import { parseProjectCommand, type ProjectActor } from "./project-commands.ts";

import { parseProjectDiscoveryCommand } from "./project-discovery-contract.ts";

import { parseSupportPublicationCommand } from "./support-publication.ts";
import { parseWorkspaceInviteCommand } from "./workspace-invites-contract.ts";

export const parseProjectRequest = (value: Record<string, unknown>) => typeof value.action === "string" && value.action.startsWith("support_")
  ? parseSupportPublicationCommand(value) : parseWorkspaceInviteCommand(value) ?? parseProjectDiscoveryCommand(value) ?? parseProjectCommand(value);

export function createProjectHandler({ origin, resolveActor, execute }: {
  origin: string;
  resolveActor(request: Request): Promise<ProjectActor>;
  execute(request: Request, actor: ProjectActor, command: ReturnType<typeof parseProjectRequest>): Promise<unknown>;
}) {
  return async (request: Request) => {
    const respond = (status: number, body: unknown) => Response.json(body, {
      status, headers: { "Cache-Control": "private, no-store", "Vary": "Cookie",
        "X-Content-Type-Options": "nosniff", ...(status === 405 ? { Allow: "POST" } : {}) },
    });
    try {
      if (request.method !== "POST") throw new AccountError(405, "method_not_allowed");
      if (new URL(request.url).origin !== origin || request.headers.get("origin") !== origin)
        throw new AccountError(403, "origin_required");
      if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json")
        throw new AccountError(415, "json_required");
      const body = await boundedJson(request);
      let command;
      try { command = parseProjectRequest(body); }
      catch { throw new AccountError(400, "invalid_project_command"); }
      const actor = await resolveActor(request);
      return respond(200, await execute(request, actor, command));
    } catch (error) {
      const known = error instanceof AccountError ? error : new AccountError(503, "project_workspace_unavailable");
      return respond(known.status, { error: known.code });
    }
  };
}
