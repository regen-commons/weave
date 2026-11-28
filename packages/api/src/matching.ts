import { boundedJson, sessionCookies } from "./account-http.ts";
import { AccountError, createSupabaseWeaveRpc } from "./account-provider.ts";
import { accountConfiguration, renewalSettings } from "./account-runtime.ts";
import { withRenewedSession } from "./account-session.ts";
import { parseMatchingCommand } from "./matching-contract.ts";
import { projectRuntime } from "./project-runtime.ts";
import { createMatchingProvider, type MatchingProvider } from "./matching-provider.ts";

export function createMatchingHandlers({ provider, secureCookies = true, origin }: {
  provider: MatchingProvider | null;
  secureCookies?: boolean;
  origin?: string;
}) {
  const cookies = sessionCookies(secureCookies);
  const response = (status: number, body: unknown) => Response.json(body, { status, headers: {
    "Cache-Control": "private, no-store",
    "Vary": "Cookie",
    ...(status === 405 ? { Allow: "POST" } : {}),
  } });
  return {
    async POST(request: Request) {
      try {
        if (request.method !== "POST") throw new AccountError(405, "method_not_allowed");
        const requestOrigin = new URL(request.url).origin;
        if ((origin && origin !== requestOrigin) || request.headers.get("origin") !== requestOrigin)
          throw new AccountError(403, "origin_required");
        if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json")
          throw new AccountError(415, "json_required");
        const token = cookies.token(request);
        if (!token) throw new AccountError(401, "sign_in_required");
        if (!provider) throw new AccountError(503, "matching_unavailable");
        const body = await boundedJson(request);
        let command;
        try { command = parseMatchingCommand(body); }
        catch { throw new AccountError(400, "invalid_data"); }
        // DL-155: nothing new is shared with signed-in Weave users (step 4), and published listings took over
        // matching (step 5). A share still on is withdrawn by Platform, so searching shares, withdrawing one
        // and the saved partners kept on the server end here; partners are kept on the device's shortlist.
        // `state` stays, since publishing a team's saved card reads its entry revisions until step 6.
        if (["preview", "share", "renew", "withdraw", "search", "leads", "set_lead"].includes(command.action))
          throw new AccountError(410, "matching_shares_retired");
        return response(200, await provider.execute(token, command));
      } catch (error) {
        const known = error instanceof AccountError ? error : new AccountError(503, "matching_unavailable");
        return response(known.status, { error: known.code });
      }
    },
  };
}

function configuredHandlers() {
  try {
    const config = accountConfiguration(process.env);
    if (config) {
      const provider = createMatchingProvider(createSupabaseWeaveRpc(config.supabase, config.key));
      return createMatchingHandlers({
        // A listing search needs a verified project workspace, which only the project runtime has.
        provider: { execute: (token, command) => command.action === "listing_search"
          ? Promise.reject(new AccountError(503, "matching_unavailable")) : provider.execute(token, command) },
        secureCookies: config.secureCookies,
        origin: config.origin,
      });
    }
  } catch { /* Invalid configuration stays unavailable and discloses no details. */ }
  return createMatchingHandlers({ provider: null });
}
// Renews a lapsed access token first, so a 401 here means the session ended, as from /api/account.
export const POST = withRenewedSession(async (request: Request) => {
  if (process.env.WEAVE_PROJECTS_ENABLED !== "true") return configuredHandlers().POST(request);
  const runtime = await projectRuntime();
  return createMatchingHandlers({
    origin: runtime?.origin,
    provider: runtime ? { execute: (_token, command) => runtime.matching(request, command) } : null,
  }).POST(request);
}, renewalSettings);
