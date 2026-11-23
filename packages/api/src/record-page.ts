// GET /api/record-page: one fund's or initiative's page with its own link preview (record-page-http.ts).
// Vercel rewrites /funding/:id and /initiatives/:id here (packages/app/vercel.json), and bundles the
// build's index.html and share/records.json with the function, which reads them from the deployment's
// own files. A deployment without them reads its own static copies instead.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PUBLIC_ORIGIN } from "./page-preview.ts";
import { GET as publicProjects } from "./public-projects.ts";
import { parsePublicProjectPage, type PublicProjectCard } from "./public-projects-contract.ts";
import { createRecordPageHandler, parseRecordPreviews, RECORD_PREVIEWS_FILE, type RecordPreviews } from "./record-page-http.ts";

const TIMEOUT_MS = 3000;

/** One of the build's files: from the function's bundle, or else from the deployment it belongs to. */
async function builtFile(file: string, request: Request): Promise<string> {
  try {
    return await readFile(join(process.cwd(), "dist", file), "utf8");
  } catch {
    const response = await fetch(new URL(`/${file}`, request.url), { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "error" });
    if (!response.ok) throw Error("record_page_unavailable");
    return response.text();
  }
}

/** Kept for the life of the function instance once read: a deployment's build never changes. */
function once<T>(read: (request: Request) => Promise<T>): (request: Request) => Promise<T> {
  let kept: Promise<T> | undefined;
  return (request) => {
    const current = kept ??= read(request);
    // A failed read is tried again by the next request instead of being kept.
    current.catch(() => { if (kept === current) kept = undefined; });
    return current;
  };
}

const template = once((request) => builtFile("index.html", request));
const previews = once(async (request): Promise<RecordPreviews> => parseRecordPreviews(JSON.parse(await builtFile(RECORD_PREVIEWS_FILE, request))));

/** One project from the public list, through its own handler, so it is the card the list shows. */
async function project(uri: string): Promise<PublicProjectCard | null> {
  const response = await publicProjects(new Request(`${PUBLIC_ORIGIN}/api/public-projects?uri=${encodeURIComponent(uri)}`));
  if (!response.ok) throw Error("public_projects_unavailable");
  const page = parsePublicProjectPage(await response.json());
  return page.projects.find((card) => card.uri === uri) ?? null;
}

export const GET = createRecordPageHandler({ template, previews, project });
