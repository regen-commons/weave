import type { Plugin } from "vite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { previewTags as pageTags, withPagePreview, type PagePreview } from "@weave/api/page-preview";
import { parseRecordPreviews, RECORD_PREVIEWS_FILE, type RecordPreviews } from "@weave/api/record-page-http";
import { CatalogSchema } from "../src/funding/contracts.ts";
import { PUBLIC_ORIGIN } from "../src/public-origin.ts";
import { pathTo, type RouteName } from "../src/routes.ts";

/**
 * What a shared link shows before anyone opens it (DL-068): a title, a sentence and a picture for
 * each section. The app is one HTML file that draws every page in the browser, and the services
 * that build previews do not run it, so each section gets its own copy of that file with its own
 * words in the head. A section's copy is a plain file at the section's address; any other address
 * still falls back to the first file and shows Home's card.
 */
export interface LinkPreview {
  readonly route: RouteName;
  /** The picture's name in public/share, without its extension. */
  readonly image: string;
  readonly title: string;
  readonly description: string;
  /** The picture's headline: plain lines, then the line set in italic, as the page's own title is. */
  readonly headline: { readonly lines: readonly string[]; readonly accent: readonly string[] };
}

export const LINK_PREVIEWS: readonly LinkPreview[] = [
  {
    route: "home",
    image: "home",
    title: "Weave: find partners and funding for regenerative work",
    description: "Describe your initiative once, then see the funding and the partners that fit it. Part of Regen Commons.",
    headline: { lines: ["Find partners", "and funding for"], accent: ["regenerative work"] },
  },
  {
    route: "initiatives",
    image: "initiatives",
    title: "Initiatives | Weave",
    description: "See the work people are sharing across the regenerative movement, and what each initiative needs and offers.",
    headline: { lines: ["The work people"], accent: ["are sharing"] },
  },
  {
    route: "funding",
    image: "funding",
    title: "Funding | Weave",
    description: "Funding for regenerative work: hundreds of programs, each checked against its own source, to search and filter.",
    headline: { lines: ["Funding for"], accent: ["regenerative work"] },
  },
  {
    route: "initiative",
    image: "describe",
    title: "Describe your initiative | Weave",
    description: "Four short fields about your initiative, then what you need and what you can offer. No sign-in to start.",
    headline: { lines: ["Describe your", "initiative"], accent: ["once"] },
  },
  {
    route: "your-initiatives",
    image: "your-initiatives",
    title: "Your Initiatives | Weave",
    description: "Open the initiatives you saved, see the partners that fit them, and choose what you share.",
    headline: { lines: ["Your"], accent: ["Initiatives"] },
  },
];

/** Where a preview's page and picture live, as full addresses: a preview is read far from the site. */
export function previewAddresses(preview: LinkPreview, origin = PUBLIC_ORIGIN): { page: string; image: string } {
  return { page: origin + pathTo(preview.route), image: `${origin}/share/${preview.image}.png` };
}

/** What the picture shows, for people who cannot see it. */
export function previewAlt(preview: LinkPreview): string {
  return `${[...preview.headline.lines, ...preview.headline.accent].join(" ")}. Weave, part of Regen Commons.`;
}

/** A section's preview with its page and picture as full addresses, as the head and the API take it. */
export function pagePreview(preview: LinkPreview, origin = PUBLIC_ORIGIN): PagePreview {
  const { page, image } = previewAddresses(preview, origin);
  return { title: preview.title, description: preview.description, url: page, image, imageAlt: previewAlt(preview) };
}

/** The head tags a section's preview is read from (see `previewTags` in `@weave/api/page-preview`). */
export const previewTags = (preview: LinkPreview, origin = PUBLIC_ORIGIN): string[] => pageTags(pagePreview(preview, origin));

/** The app's HTML with one section's words in its head, in place of any preview it had. */
export const withPreview = (html: string, preview: LinkPreview, origin = PUBLIC_ORIGIN): string =>
  withPagePreview(html, pagePreview(preview, origin));

/** The file a section's copy is written to, beside the app's own index.html. Home is that file itself. */
export function previewFile(preview: LinkPreview): string {
  const path = pathTo(preview.route).replace(/^\/|\/$/g, "");
  return path ? `${path}/index.html` : "index.html";
}

/**
 * What GET /api/record-page needs to give a fund or an initiative its own preview (22 November 2026): the
 * Funding and Initiatives previews it starts from, and each fund's name, description and program names
 * from the catalog this build bundles. Read back through the API's own parser, so a file it would refuse
 * fails the build instead of every record's preview.
 */
export function recordPreviews(catalog: unknown, origin = PUBLIC_ORIGIN): RecordPreviews {
  const section = (route: RouteName) => pagePreview(LINK_PREVIEWS.find((preview) => preview.route === route)!, origin);
  const funds = CatalogSchema.parse(catalog).funds.map((fund) => [fund.id, {
    name: fund.displayName,
    description: fund.description,
    programs: Object.fromEntries((fund.enrichment as { programs?: { id: string; name: string }[] }).programs?.map(({ id, name }) => [id, name]) ?? []),
  }] as const);
  return parseRecordPreviews({ sections: { funding: section("funding"), initiatives: section("initiatives") }, funds: Object.fromEntries(funds) });
}

/** The catalog the app bundles, from the repository's built data. */
const CATALOG = "../../dist/data/funders.json";

/**
 * Gives index.html Home's preview, and in a build writes each other section's copy of it, and the
 * record previews GET /api/record-page reads. A copy is made from the finished index.html, whatever
 * other plugins put in it and in whatever order, so a person who lands on a section gets the same
 * scripts, styles and service worker as one who lands on Home.
 */
export function linkPreviews(origin = PUBLIC_ORIGIN): Plugin {
  const [home, ...sections] = LINK_PREVIEWS;
  if (!home || previewFile(home) !== "index.html") throw new Error("The first link preview must be Home's.");
  let root = process.cwd();
  return {
    name: "weave-link-previews",
    enforce: "post",
    configResolved(config) {
      root = config.root;
    },
    transformIndexHtml: { order: "post", handler: (html) => withPreview(html, home, origin) },
    generateBundle(_options, bundle) {
      const built = bundle["index.html"];
      if (built?.type !== "asset" || typeof built.source !== "string")
        throw new Error("index.html was not built before its link previews.");
      for (const preview of sections)
        this.emitFile({ type: "asset", fileName: previewFile(preview), source: withPreview(built.source, preview, origin) });
      const catalog: unknown = JSON.parse(readFileSync(join(root, CATALOG), "utf8"));
      this.emitFile({ type: "asset", fileName: RECORD_PREVIEWS_FILE, source: JSON.stringify(recordPreviews(catalog, origin)) });
    },
  };
}
