// GET /api/public-projects lists the listed public Certified projects Weave indexes. Until
// WEAVE_PUBLIC_PROJECTS_ENABLED=true and WEAVE_INDEX_DATABASE_URL are set it answers an empty `off`
// page, and the app shows its starter list.
import { createPublicProjects } from "./public-projects-http.ts";
import { connectPublicProjectReader, type PublicProjectReader } from "./public-projects-store.ts";

let reader: Promise<PublicProjectReader> | undefined;
function currentReader(): Promise<PublicProjectReader | null> {
  const url = process.env.WEAVE_INDEX_DATABASE_URL;
  if (process.env.WEAVE_PUBLIC_PROJECTS_ENABLED !== "true" || !url) return Promise.resolve(null);
  const current = reader ??= connectPublicProjectReader(url, { ca: process.env.WEAVE_DATABASE_CA_PEM });
  // A failed connection is retried by a later request instead of being kept.
  return current.catch((error: unknown) => {
    if (reader === current) reader = undefined;
    throw error;
  });
}

const list = createPublicProjects({ reader: currentReader });
export const GET = list.handler;
/** One shown project by its address, from the copy GET answers from. For other handlers in this package. */
export const findPublicProject = list.find;
