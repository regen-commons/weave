import { projectRuntime, projectUnavailable } from "./project-runtime.ts";
export const POST = async (request: Request) => (await projectRuntime())?.auth.consent(request) ?? projectUnavailable();
