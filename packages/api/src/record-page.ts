// GET /api/record-page: one fund's or initiative's page with its own link preview (record-page-http.ts).
// Vercel rewrites /funding/:id and /initiatives/:id here (packages/app/vercel.json), and bundles the
// build's index.html and share/records.json with the function, which reads them from the deployment's
// own files. A deployment without them reads its own static copies instead.
import { builtFile, builtPreviews, builtSource, once } from "./built-files.ts";
import { publicProject } from "./public-project-lookup.ts";
import { drawable } from "./record-image-drawing.ts";
import { pictureFaces } from "./record-image-fonts.ts";
import { recordImageAddress, recordImageAlt } from "./record-image-http.ts";
import { createRecordPageHandler, TEMPLATE_FILES } from "./record-page-http.ts";

const template = once((request) => builtFile(TEMPLATE_FILES, request));

const serve = createRecordPageHandler({
  template,
  previews: builtPreviews,
  project: publicProject,
  // The record's own picture (GET /api/record-image) where its faces can draw its words.
  picture: async (words) => (drawable(await pictureFaces(), words) ? { image: recordImageAddress(words), imageAlt: recordImageAlt(words) } : null),
});

/** The page, saying which copy of the build it came from, so a check after a deploy can tell. */
export async function GET(request: Request): Promise<Response> {
  const response = await serve(request);
  response.headers.set("X-Weave-Record-Source", builtSource());
  return response;
}
export const HEAD = GET;
