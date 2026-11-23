// GET /api/record-image: a fund's or an initiative's own link picture (record-image-http.ts), drawn by
// @vercel/og in the design system's faces, which are read from the repository's own files. This module
// is the only one that loads the renderer, so a record's page never does.
import { ImageResponse } from "@vercel/og";
import { builtPreviews } from "./built-files.ts";
import { publicProject } from "./public-project-lookup.ts";
import { PICTURE_HEIGHT, PICTURE_WIDTH } from "./record-image-drawing.ts";
import { pictureFaces } from "./record-image-fonts.ts";
import { createRecordImageHandler } from "./record-image-http.ts";

const serve = createRecordImageHandler({
  previews: builtPreviews,
  project: publicProject,
  faces: pictureFaces,
  render: async (nodes, faces) => {
    const fonts = [faces.title, faces.label, faces.line].map(({ name, data, weight, style }) => ({ name, data, weight, style }));
    const picture = new ImageResponse(nodes as unknown as ConstructorParameters<typeof ImageResponse>[0], { width: PICTURE_WIDTH, height: PICTURE_HEIGHT, fonts });
    return new Uint8Array(await picture.arrayBuffer());
  },
});

export const GET = serve;
export const HEAD = serve;
