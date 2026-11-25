import { observeApi } from "./usage.ts";
import { projectRuntime, projectUnavailable } from "./project-runtime.ts";
export const GET = observeApi("certified-project-jwks", async () => (await projectRuntime())?.auth.jwks() ?? projectUnavailable());
