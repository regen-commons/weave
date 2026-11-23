// GET /api/record-image: a fund's or an initiative's own link picture (23 November 2026, the user's
// choice of @vercel/og). A record's page names it as og:image and twitter:image (record-page-http.ts), at
// an address that carries a key of exactly what the picture shows, so a crawler storm renders it once: a
// fund's is kept a year at the CDN, and an initiative's as long as the public list is, so a withdrawn
// project's name and publisher leave the picture as fast as they leave the list. A record that is not
// there, cannot be looked up, has words its faces cannot draw, or fails to render is sent its section's
// picture instead, and an address with another key is sent to the current one rather than drawn.
import { createHash } from "node:crypto";
import { PUBLIC_ORIGIN } from "./page-preview.ts";
import type { PublicProjectCard } from "./public-projects-contract.ts";
import { drawable, recordImageNodes, type PictureNode, type RecordImageWords } from "./record-image-drawing.ts";
import type { PictureFaces } from "./record-image-fonts.ts";
import { fundPage, initiativePage, LOOKUP_TIMEOUT_MS, recordAsk, type RecordPreviews } from "./record-page-http.ts";

/**
 * Raised whenever the drawing or the renderer (@vercel/og) changes, so every picture gets a new address
 * and no old one is served from a cache. The faces' own bytes are in the key already.
 */
export const RECORD_IMAGE_DESIGN = "1";

/** A key of exactly what a record's picture shows: its drawing, faces, section, address and words. */
export const recordImageRevision = (words: RecordImageWords, faces: Pick<PictureFaces, "digest">): string =>
  createHash("sha256")
    .update(JSON.stringify([RECORD_IMAGE_DESIGN, faces.digest, words.section, words.path, words.title, words.subtitle]))
    .digest("hex").slice(0, 16);

/** A record's picture's full address, which changes whenever the picture would. */
export function recordImageAddress(words: RecordImageWords, faces: Pick<PictureFaces, "digest">): string {
  const page = new URL(words.path, PUBLIC_ORIGIN);
  const [, section, id] = page.pathname.split("/");
  const query = new URLSearchParams({ kind: section === "funding" ? "funding" : "initiative", id: id ?? "" });
  const program = page.searchParams.get("program");
  if (program) query.set("program", program);
  query.set("v", recordImageRevision(words, faces));
  return `${PUBLIC_ORIGIN}/api/record-image?${query}`;
}

/** A record's own picture for its page's preview, or null where its faces cannot draw its words. */
export const recordPicture = (words: RecordImageWords, faces: PictureFaces): { image: string; imageAlt: string } | null =>
  drawable(faces, words) ? { image: recordImageAddress(words, faces), imageAlt: recordImageAlt(words) } : null;

/** What a picture says to people who cannot see it. */
export const recordImageAlt = (words: RecordImageWords): string =>
  `${words.title}${words.subtitle ? `. ${words.subtitle}` : ""}. Weave, part of Regen Commons.`;

/** A fund's picture at its current address: kept a day in browsers and a year at the CDN. */
const KEPT = { "Cache-Control": "public, max-age=86400, s-maxage=31536000, immutable" };
/**
 * An initiative's picture at its current address: kept as the public list is (public-projects-http.ts),
 * a minute in browsers and five at the CDN with ten more while it refreshes, so a withdrawal reaches the
 * picture within about seventeen minutes, as it reaches the list.
 */
const LISTED = { "Cache-Control": "public, max-age=60", "CDN-Cache-Control": "public, max-age=300, stale-while-revalidate=600" };
/** A redirect or a fallback that may change: five minutes. */
const BRIEF = { "Cache-Control": "public, max-age=300, s-maxage=300" };
const NOT_CACHED = { "Cache-Control": "no-store" };

/** The section's own picture, which every page of the section names when it has none of its own. */
const sectionPicture = (section: RecordImageWords["section"], cache: Record<string, string>) =>
  new Response(null, { status: 307, headers: { Location: `/share/${section}.png`, ...cache } });

function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error("lookup_timeout")), ms); });
  return Promise.race([work, late]).finally(() => clearTimeout(timer));
}

/**
 * Serves a record's picture to GET, and its headers to HEAD without drawing it. The address names the
 * record as a record page's does (`kind`, `id`, and `program` for a fund) and `v`, the picture's key: a
 * picture asked for at its current key is kept for a year, at any other key for five minutes.
 */
export function createRecordImageHandler(options: {
  previews(request: Request): Promise<RecordPreviews>;
  /** A public project's card, null when the list does not show it. Rejects when the list cannot be read. */
  project(uri: string): Promise<PublicProjectCard | null>;
  faces(): Promise<PictureFaces>;
  /** Draws the nodes as a 1200 x 630 PNG in the faces. */
  render(nodes: PictureNode, faces: PictureFaces): Promise<Uint8Array<ArrayBuffer>>;
  lookupTimeoutMs?: number;
}) {
  const lookupTimeoutMs = options.lookupTimeoutMs ?? LOOKUP_TIMEOUT_MS;
  return async (request: Request): Promise<Response> => {
    if (request.method !== "GET" && request.method !== "HEAD")
      return new Response(null, { status: 405, headers: { Allow: "GET, HEAD", ...NOT_CACHED } });
    const url = new URL(request.url);
    const ask = recordAsk(url);
    if (!ask) return new Response(null, { status: 404, headers: BRIEF });
    const section = ask.kind === "funding" ? "funding" : "initiatives";
    let previews: RecordPreviews;
    try { previews = await options.previews(request); } catch { return sectionPicture(section, NOT_CACHED); }
    let words: RecordImageWords | undefined;
    if (ask.kind === "funding") words = fundPage(previews, ask)?.picture;
    else {
      let card: PublicProjectCard | null;
      try { card = await withDeadline(options.project(ask.uri), lookupTimeoutMs); } catch { return sectionPicture(section, NOT_CACHED); }
      words = card ? initiativePage(previews, ask, card).picture : undefined;
    }
    if (!words) return sectionPicture(section, BRIEF);
    let faces: PictureFaces;
    try { faces = await options.faces(); } catch { return sectionPicture(section, NOT_CACHED); }
    if (!drawable(faces, words)) return sectionPicture(section, BRIEF);
    // Only the current key is drawn, so no client can make the function draw again by changing it.
    const current = recordImageAddress(words, faces);
    if (url.searchParams.get("v") !== new URL(current).searchParams.get("v") || url.searchParams.getAll("v").length !== 1)
      return new Response(null, { status: 307, headers: { Location: current, ...BRIEF } });
    const kept = section === "funding" ? KEPT : LISTED;
    const headers = { "Content-Type": "image/png", "X-Content-Type-Options": "nosniff" };
    // HEAD is not kept, so a cache can never hold its empty answer in the picture's place.
    if (request.method === "HEAD") return new Response(null, { status: 200, headers: { ...headers, ...NOT_CACHED } });
    let png: Uint8Array<ArrayBuffer>;
    try { png = await options.render(recordImageNodes(faces, words), faces); } catch { return sectionPicture(section, NOT_CACHED); }
    return new Response(png, { status: 200, headers: { ...headers, ...kept, "Content-Length": String(png.byteLength) } });
  };
}
