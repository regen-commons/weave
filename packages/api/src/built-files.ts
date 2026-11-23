// The app's build, as the record page and sitemap functions read it. Vercel bundles the files with each
// function (`includeFiles` in packages/app/vercel.json); a deployment without them reads its own static
// copies instead, and says so.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseRecordPreviews, RECORD_PREVIEWS_FILE, type RecordPreviews } from "./record-page-http.ts";

const TIMEOUT_MS = 3000;

/**
 * Where the bundled build may sit in a function: under the app's own folder when the function runs from
 * it, or under its path in the repository when the bundle keeps the repository's layout. Both are tried
 * before the deployment is asked for its copy.
 */
export const BUILT_FOLDERS = ["dist", "packages/app/dist"] as const;

/** Which copy served the last read, for a header a check after a deploy can read. */
let source: "bundle" | "deployment" = "bundle";
export const builtSource = (): "bundle" | "deployment" => source;

/**
 * The first of the build's files that exists, from the function's bundle, or else the first from the
 * deployment it belongs to. Over the network a missing file would come back as the app's page, so only
 * the first is asked for there.
 */
export async function builtFile(files: string | readonly string[], request: Request): Promise<string> {
  const names = typeof files === "string" ? [files] : files;
  for (const file of names)
    for (const folder of BUILT_FOLDERS) {
      try {
        const text = await readFile(join(process.cwd(), folder, file), "utf8");
        source = "bundle";
        return text;
      } catch {
        // Not this file, or not in this layout; try the next one.
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
