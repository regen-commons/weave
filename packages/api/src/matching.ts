import { boundedJson, sessionCookies } from "./account-http.ts";
import { AccountError, createSupabaseWeaveRpc } from "./account-provider.ts";
import { accountConfiguration } from "./account-runtime.ts";
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
    if (config) return createMatchingHandlers({
      provider: createMatchingProvider(createSupabaseWeaveRpc(config.supabase, config.key)),
      secureCookies: config.secureCookies,
      origin: config.origin,
    });
  } catch { /* Invalid configuration stays unavailable and discloses no details. */ }
  return createMatchingHandlers({ provider: null });
}
export const POST = async (request: Request) => {
  if (process.env.WEAVE_PROJECTS_ENABLED !== "true") return configuredHandlers().POST(request);
  const runtime = await projectRuntime();
  return createMatchingHandlers({
    origin: runtime?.origin,
    provider: runtime ? { execute: (_token, command) => runtime.matching(request, command) } : null,
  }).POST(request);
};
