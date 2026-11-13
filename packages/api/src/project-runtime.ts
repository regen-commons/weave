import { AccountError, createSupabaseAccountProvider } from "./account-provider.ts";
import { accountConfiguration } from "./account-runtime.ts";
import { createCertifiedProjectAuth, projectOAuthStore, type CertifiedProjectRpc } from "./certified-project-auth.ts";
import { createCertifiedProjectProvider } from "./certified-project-provider.ts";
import { createProjectCommands } from "./project-commands.ts";
import { createProjectDiscovery } from "./project-discovery.ts";
import { createProjectDiscoveryStore } from "./project-discovery-store.ts";
import { createProjectHandler } from "./project-http.ts";
import { createProjectAccess } from "./project-pilot.ts";
import { createProjectActorResolver, createProjectStore, createWorkspaceContentStore, projectDatabase } from "./project-store.ts";
import { createWorkspaceContent } from "./workspace-content.ts";
import { createSupportPublication } from "./support-publication.ts";
import { createSupportPublicationStore } from "./support-publication-store.ts";
import { createSupportPublicationAdapter } from "./support-publication-provider.ts";
import { createWorkspaceInvites } from "./workspace-invites.ts";
import { createWorkspaceInviteStore } from "./workspace-invites-store.ts";
import type { MatchingCommand } from "./matching-contract.ts";
import { cipherFromSecret } from "./certified/crypto.ts";

const membership = "app.certified.groups.membership.list";
const groupMembers = "app.certified.group.member.list";

/** Keep bounded SDK refresh/state cleanup alive after inner provider deadlines. */
export async function withProjectAuthCleanup<T>(
  auth: { settle(request: Request): Promise<void> }, request: Request, run: () => Promise<T>,
): Promise<T> {
  try { return await run(); }
  finally { await auth.settle(request); }
}

async function createRuntime(env: NodeJS.ProcessEnv) {
  if (env.WEAVE_PROJECTS_ENABLED !== "true") return null;
  const access = createProjectAccess(env.WEAVE_PROJECT_ACCESS_MODE, env.WEAVE_PROJECT_PILOT_DIDS);
  const account = accountConfiguration(env);
  if (!account || !account.secureCookies) throw Error("projects_require_https");
  const required = (key: string) => {
    if (!env[key]) throw Error("projects_not_configured");
    return env[key]!;
  };
  const groupServiceOrigin = required("WEAVE_CERTIFIED_GROUP_ORIGIN");
  const groupPdsOrigin = required("WEAVE_CERTIFIED_GROUP_PDS_ORIGIN");
  const workspaceUrl = required("WEAVE_PROJECT_WORKSPACE_DATABASE_URL");
  const oauthUrl = required("WEAVE_PROJECT_OAUTH_DATABASE_URL");
  if (new URL(workspaceUrl).username === new URL(oauthUrl).username) throw Error("distinct_project_roles_required");
  const sql = projectDatabase(workspaceUrl, account.databaseCa, env.WEAVE_PROJECT_DATABASE_POOL_MODE);
  const authSql = projectDatabase(oauthUrl, account.databaseCa, env.WEAVE_PROJECT_DATABASE_POOL_MODE);
  const resolveActor = createProjectActorResolver(
    createSupabaseAccountProvider(account.supabase, account.key), sql, account.secureCookies,
  );
  const auth = await createCertifiedProjectAuth({
    origin: account.origin,
    cgsOrigin: groupServiceOrigin,
    resolveActor,
    allowsDid: access.allowsDid,
    store: projectOAuthStore(authSql, cipherFromSecret(
      required("WEAVE_PROJECT_OAUTH_ENCRYPTION_KEYS"), `${account.origin}/api/certified-project-client`,
    )),
    signingKeys: JSON.parse(required("WEAVE_PROJECT_OAUTH_SIGNING_KEYS")),
  });
  const store = createProjectStore(sql);
  const content = createWorkspaceContentStore(sql);
  const discovery = createProjectDiscoveryStore(sql);
  const publications = createSupportPublicationStore(sql);
  const invitations = createWorkspaceInviteStore(sql);
  const allowedActor = access.restrict(resolveActor);
  function providerFor(request: Request) {
    const optionalGrant = async <T>(call: () => Promise<T>) => {
      try { return await call(); }
      catch (error) {
        if (error instanceof AccountError && error.code === "project_consent_required") return null;
        throw error;
      }
    };
    return createCertifiedProjectProvider({
      groupServiceOrigin, groupPdsOrigin,
      pdsOrigins: env.WEAVE_CERTIFIED_PROJECT_PDS_ORIGINS?.split(",").map(origin => origin.trim()).filter(Boolean),
      serviceAuth: ({ actorDid, method, signal }) =>
        optionalGrant(() => auth.mintServiceAuth(request, actorDid, method, signal)),
      serviceProxy: ({ actorDid, method, init, query, signal }) =>
        optionalGrant(() => auth.proxyServiceRequest(request, actorDid, method, { ...init, signal }, query)),
    });
  }
  return {
    auth,
    origin: account.origin,
    async matching(request: Request, command: MatchingCommand) {
      return withProjectAuthCleanup(auth, request, async () => {
        const actor = await allowedActor(request);
        return await createWorkspaceContent(providerFor(request), content, store).match(actor, command);
      });
    },
    projects: createProjectHandler({
      origin: account.origin,
      resolveActor: allowedActor,
      async execute(request, actor, command) {
        return withProjectAuthCleanup(auth, request, async () => {
          const provider = providerFor(request);
          if (command.action === "claim_invite" || command.action === "create_invite" || command.action === "list_invites"
              || command.action === "revoke_invite" || command.action === "approve_invite")
            return createWorkspaceInvites(provider, invitations, { projects: store, content })(actor, command, request.signal);
          if (command.action === "list_projects" || command.action === "list_project_groups" || command.action === "list_workspaces")
            return createProjectDiscovery(provider, discovery, { projects: store, content })(actor, command, request.signal);
          if (command.action === "support_state" || command.action === "support_review" || command.action === "support_publish"
              || command.action === "support_withdraw" || command.action === "support_reconcile") {
            const adapter = createSupportPublicationAdapter({
              projectProvider: provider, groupServiceOrigin,
              assertGrant: (did, methods) => auth.assertGrant(request, did, methods as CertifiedProjectRpc[]),
              serviceAuth: (did, method, signal) => auth.mintServiceAuth(request, did, method as CertifiedProjectRpc, signal),
              personalWrite: (did, operation, input, signal) => auth.writeSupportRecord(request, did, operation, input, signal),
              groupConditionalDeleteVerified: env.WEAVE_SUPPORT_GROUP_LIFECYCLE_VERIFIED === "true",
            });
            return createSupportPublication(provider, publications, adapter).execute(actor, command);
          }
          if (command.action === "public_evidence")
            return createWorkspaceContent(provider, content, store).publicEvidence(actor, command.workspaceId);
          if (command.action === "team_load" || command.action === "team_save")
            return createWorkspaceContent(provider, content, store).saveOrLoad(actor, command);
          if (command.action === "create") await auth.assertGrant(request, actor.did, [
            membership, "app.certified.group.register", "app.certified.group.repo.createRecord",
          ]);
          if (command.action === "add_member_and_grant") await auth.assertGrant(request, actor.did, [
            membership, groupMembers, "app.certified.group.member.add",
          ]);
          return createProjectCommands(provider, store, groupPdsOrigin)(actor, command);
        });
      },
    }),
  };
}

let runtime: ReturnType<typeof createRuntime> | undefined;
export function projectRuntime() {
  return runtime ??= createRuntime(process.env).catch(() => null);
}
export const projectUnavailable = () => Response.json({ error: "project_workspace_unavailable" }, {
  status: 503, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
});
