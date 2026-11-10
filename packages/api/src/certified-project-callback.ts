import { projectRuntime, projectUnavailable } from "./project-runtime.ts";
export const GET = async (request: Request) => (await projectRuntime())?.auth.callback(request) ?? projectUnavailable();
