import { observeApi } from "./usage.ts";
import { projectRuntime, projectUnavailable } from "./project-runtime.ts";
export const GET = observeApi("certified-project-callback", async (request: Request) => (await projectRuntime())?.auth.callback(request) ?? projectUnavailable());
