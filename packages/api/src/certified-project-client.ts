import { observeApi } from "./usage.ts";
import { projectRuntime, projectUnavailable } from "./project-runtime.ts";
export const GET = observeApi("certified-project-client", async () => (await projectRuntime())?.auth.metadata() ?? projectUnavailable());
