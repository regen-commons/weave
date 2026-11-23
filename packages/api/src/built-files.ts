// The app's build, as the record page and sitemap functions read it. Vercel bundles the files with each
// function (`includeFiles` in packages/app/vercel.json); a deployment without them reads its own static
// copies instead, and says so.
import { readFile } from "node:fs/promises";
import { parseRecordPreviews, RECORD_PREVIEWS_FILE, type RecordPreviews } from "./record-page-http.ts";

const TIMEOUT_MS = 3000;

/**
 * The app's build, each file at its own address beside this module: it runs from packages/api/src in
 * tests and from packages/api/dist when deployed, so the app's dist is two folders up either way.
 * Each address is written out in full. Vercel's file tracer reads these to decide what a function needs,
 * and a path built while running (from `process.cwd()`, say) makes it take the whole repository, which
 * broke the build on 22 November 2026 (#171: it reached `.agents/skills`, a link Vercel cannot follow).
 */
export const BUILT_FILES = {
  "shell.html": new URL("../../app/dist/shell.html", import.meta.url),
  "index.html": new URL("../../app/dist/index.html", import.meta.url),
  [RECORD_PREVIEWS_FILE]: new URL("../../app/dist/share/records.json", import.meta.url),
} as const satisfies Record<string, URL>;
export type BuiltFileName = keyof typeof BUILT_FILES;

/** Which copy served the last read, for a header a check after a deploy can read. */
let source: "bundle" | "deployment" = "bundle";
export const builtSource = (): "bundle" | "deployment" => source;

/**
 * The first of the build's files that exists, from the function's bundle, or else the first from the
 * deployment it belongs to. Over the network a missing file would come back as the app's page, so only
 * the first is asked for there. `read` is the file system's, replaced only in tests.
 */
export async function builtFile(
  files: BuiltFileName | readonly BuiltFileName[],
  request: Request,
  read: (address: URL) => Promise<string> = (address) => readFile(address, "utf8"),
): Promise<string> {
  const names: readonly BuiltFileName[] = typeof files === "string" ? [files] : files;
  for (const file of names) {
    try {
      const text = await read(BUILT_FILES[file]);
      source = "bundle";
      return text;
    } catch {
      // Not in this build or not bundled; try the next one.
    }
  }
  const response = await fetch(new URL(`/${names[0]}`, request.url), { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "error" });
  if (!response.ok) throw Error("built_file_unavailable");
  source = "deployment";
  return response.text();
}

/** Kept for the life of the function instance once read: a deployment's build never changes. */
export function once<T>(read: (request: Request) => Promise<T>): (request: Request) => Promise<T> {
  let kept: Promise<T> | undefined;
  return (request) => {
    const current = kept ??= read(request);
    // A failed read is tried again by the next request instead of being kept.
    current.catch(() => { if (kept === current) kept = undefined; });
    return current;
  };
}

/** The build's record previews, read once per function instance. */
export const builtPreviews = once(async (request): Promise<RecordPreviews> =>
  parseRecordPreviews(JSON.parse(await builtFile(RECORD_PREVIEWS_FILE, request))));
