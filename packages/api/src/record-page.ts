// GET /api/record-page: one fund's or initiative's page with its own link preview (record-page-http.ts).
// Vercel rewrites /funding/:id and /initiatives/:id here (packages/app/vercel.json), and bundles the
// build's index.html and share/records.json with the function, which reads them from the deployment's
// own files. A deployment without them reads its own static copies instead.
import { readFile } from "node:fs/promises";
import { PUBLIC_ORIGIN } from "./page-preview.ts";
import { GET as publicProjects } from "./public-projects.ts";
import { parsePublicProjectPage, type PublicProjectCard } from "./public-projects-contract.ts";
import { createRecordPageHandler, parseRecordPreviews, RECORD_PREVIEWS_FILE, type RecordPreviews } from "./record-page-http.ts";

const TIMEOUT_MS = 3000;

/**
 * The app's build, each file at its own address beside this module: it runs from packages/api/src in
 * tests and from packages/api/dist when deployed, so the app's dist is two folders up either way.
 * Each address is written out in full. Vercel's file tracer reads these to decide what the function
 * needs, and a path built while running (from `process.cwd()`, say) makes it take the whole repository,
 * which broke the build on 22 November 2026 (it reached `.agents/skills`, a link to a folder Vercel
 * does not have).
 */
export const BUILT_FILES = {
  "index.html": new URL("../../app/dist/index.html", import.meta.url),
  [RECORD_PREVIEWS_FILE]: new URL("../../app/dist/share/records.json", import.meta.url),
} as const satisfies Record<string, URL>;
type BuiltFile = keyof typeof BUILT_FILES;

/** Which copy served the last read, for the `X-Weave-Record-Source` header a check can read. */
let source: "bundle" | "deployment" = "bundle";

/** One of the build's files: from the function's bundle, or else from the deployment it belongs to. */
async function builtFile(file: BuiltFile, request: Request): Promise<string> {
  try {
    const text = await readFile(BUILT_FILES[file], "utf8");
    source = "bundle";
    return text;
  } catch {
    // Not bundled with this function: ask the deployment for its copy.
  }
  const response = await fetch(new URL(`/${file}`, request.url), { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "error" });
  if (!response.ok) throw Error("record_page_unavailable");
  source = "deployment";
  return response.text();
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

const serve = createRecordPageHandler({ template, previews, project });

/** The page, saying which copy of the build it came from, so a check after a deploy can tell. */
export async function GET(request: Request): Promise<Response> {
  const response = await serve(request);
  response.headers.set("X-Weave-Record-Source", source);
  return response;
}
export const HEAD = GET;
