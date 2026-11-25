import { observeApi } from "./usage.ts";
// GET /api/project-index-refresh is the daily Vercel Cron run of the all-public project index.
import { connectProjectIndex } from "./project-index-postgres.ts";
import { createProjectIndexRefreshHandler } from "./project-index-refresh-http.ts";

export const GET = observeApi("project-index-refresh", createProjectIndexRefreshHandler({
  env: process.env,
  connect: (url, ca) => connectProjectIndex(url, { ca }),
}));
