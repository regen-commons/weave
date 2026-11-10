import postgres from "postgres";
import { AccountError } from "./account-provider.ts";
import type { SupportPublicationStore } from "./support-publication.ts";

/** Restricted workspace login. These functions are never exposed through PostgREST. */
export function createSupportPublicationStore(sql: postgres.Sql): SupportPublicationStore {
  async function execute(run: () => PromiseLike<readonly { result: unknown }[]>) {
    try {
      const [row] = await run();
      if (!row) throw Error("missing_support_result");
      return row.result;
    } catch (error) {
      if (error instanceof postgres.PostgresError) {
        const known: Record<string, [number, string]> = {
          PT400: [400, "invalid_support_command"], PT401: [401, "sign_in_required"],
          PT403: [403, "workspace_edit_required"], PT404: [404, "not_found"],
          PT409: [409, "support_conflict"], PT429: [429, "rate_limited"],
        };
        const status = known[error.code];
        if (status) throw new AccountError(...status);
      }
      throw new AccountError(503, "support_publication_unavailable");
    }
  }
  return {
    target: (actor, id) => execute(() => sql`select weave_workspace.content_target(
      ${actor.userId}::uuid,${actor.sessionId}::uuid,${actor.did},${id}::uuid) as result`),
    command: (actor, id, role, cid, action, data) => execute(() => sql`select weave_workspace.support_command(
      ${actor.userId}::uuid,${actor.sessionId}::uuid,${actor.did},${id}::uuid,${role},${cid},${action},
      ${JSON.stringify(data)}::text::jsonb) as result`),
  };
}
