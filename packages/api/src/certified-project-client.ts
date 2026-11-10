import { projectRuntime, projectUnavailable } from "./project-runtime.ts";
export const GET = async () => (await projectRuntime())?.auth.metadata() ?? projectUnavailable();
