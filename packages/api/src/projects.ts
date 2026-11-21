import { renewalSettings } from "./account-runtime.ts";
import { withRenewedSession } from "./account-session.ts";
import { projectRuntime, projectUnavailable } from "./project-runtime.ts";
// Renews a lapsed access token first, so a 401 here means the session ended, as from /api/account.
export const POST = withRenewedSession(
  async (request: Request) => (await projectRuntime())?.projects(request) ?? projectUnavailable(), renewalSettings);
