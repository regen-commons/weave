import postgres from "postgres";
import { record, uuid } from "./account-contract.ts";
import { AccountError, type AccountProvider } from "./account-provider.ts";
import { sessionCookies } from "./account-http.ts";
import type { WorkspaceContentStore } from "./workspace-content.ts";
import type { ProjectActor, ProjectStore } from "./project-commands.ts";

const storageErrors: Record<string, [number, string]> = {
  PT400: [400, "invalid_project_command"],
  PT401: [401, "sign_in_required"],
  PT403: [403, "workspace_access_required"],
  PT404: [404, "project_request_not_found"],
  PT409: [409, "project_conflict"],
  PT429: [429, "rate_limited"],
};

export function projectDatabase(value: string, ca?: string) {
  const url = new URL(value);
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.username || !url.hostname ||
      url.searchParams.has("ssl") || url.searchParams.has("sslmode")) throw Error("invalid_project_database");
  return postgres(url.href, {
    max: 3, connect_timeout: 5, idle_timeout: 10, onnotice: () => {},
    ssl: ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ? false : {
      rejectUnauthorized: true, ca, servername: url.hostname,
    },
    connection: { statement_timeout: 10000, idle_in_transaction_session_timeout: 10000 },
  });
}

export function createProjectStore(sql: postgres.Sql): ProjectStore {
  return {
    async execute(actor, action, data) {
      try {
        const [row] = await sql`select weave_workspace.command(
          ${actor.userId}::uuid, ${actor.sessionId}::uuid, ${actor.did}, ${action}, ${JSON.stringify(data)}::text::jsonb
        ) as result`;
        return row?.result ?? null;
      } catch (error) {
        const code = error instanceof postgres.PostgresError ? storageErrors[error.code] : undefined;
        throw new AccountError(...(code ?? [503, "project_workspace_unavailable"] as const));
      }
    },
  };
}

export function createWorkspaceContentStore(sql: postgres.Sql): WorkspaceContentStore {
  const execute = async (run: () => PromiseLike<readonly { result: unknown }[]>) => {
    try {
      const [row] = await run();
      return row?.result ?? null;
    } catch (error) {
      const code = error instanceof postgres.PostgresError ? storageErrors[error.code] : undefined;
      if (error instanceof postgres.PostgresError && error.code === "PT403" && error.message === "workspace_edit_required")
        throw new AccountError(403, "workspace_edit_required");
      if (code?.[0] === 404) throw new AccountError(404, "not_found");
      throw new AccountError(...(code ?? [503, "project_workspace_unavailable"] as const));
    }
  };
  return {
    target: (actor, id) => execute(() => sql`select weave_workspace.content_target(
      ${actor.userId}::uuid, ${actor.sessionId}::uuid, ${actor.did}, ${id}::uuid
    ) as result`),
    command: (actor, id, role, cid, action, payload) => execute(() => sql`select weave_workspace.content_command(
      ${actor.userId}::uuid, ${actor.sessionId}::uuid, ${actor.did}, ${id}::uuid,
      ${role}, ${cid}, ${action}, ${JSON.stringify(payload)}::text::jsonb
    ) as result`),
  };
}

export function createProjectActorResolver(
  provider: Pick<AccountProvider, "authorize">, sql: postgres.Sql, secureCookies: boolean,
): (request: Request) => Promise<ProjectActor> {
  const cookies = sessionCookies(secureCookies);
  return async request => {
    const token = cookies.token(request);
    if (!token) throw new AccountError(401, "sign_in_required");
    const user = await provider.authorize(token);
    // GoTrue and the existing account_access RPC verified this token before its session ID is read.
    let sessionId: string;
    try {
      const claims = record(JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString()));
      if (!uuid(claims.session_id) || claims.sub !== user.id) throw Error();
      sessionId = claims.session_id;
    } catch { throw new AccountError(401, "sign_in_required"); }
    try {
      const [row] = await sql`select weave_workspace.weave_project_actor(${user.id}::uuid, ${sessionId}::uuid) as did`;
      if (!row?.did || typeof row.did !== "string") throw new AccountError(401, "sign_in_required");
      return { userId: user.id, sessionId, did: row.did };
    } catch (error) {
      if (error instanceof AccountError) throw error;
      throw new AccountError(503, "project_workspace_unavailable");
    }
  };
}
