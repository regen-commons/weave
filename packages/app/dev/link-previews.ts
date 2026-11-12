import type { Plugin } from "vite";
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
    title: "Your initiatives | Weave",
    description: "Open the initiatives you saved, see the partners that fit them, and choose what you share.",
    headline: { lines: ["Your"], accent: ["initiatives"] },
  },
];

const escape = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

/** Where a preview's page and picture live, as full addresses: a preview is read far from the site. */
export function previewAddresses(preview: LinkPreview, origin = PUBLIC_ORIGIN): { page: string; image: string } {
  return { page: origin + pathTo(preview.route), image: `${origin}/share/${preview.image}.png` };
}

/** What the picture shows, for people who cannot see it. */
export function previewAlt(preview: LinkPreview): string {
  return `${[...preview.headline.lines, ...preview.headline.accent].join(" ")}. Weave, part of Regen Commons.`;
}

/** The head tags a preview is read from. */
export function previewTags(preview: LinkPreview, origin = PUBLIC_ORIGIN): string[] {
  const { page, image } = previewAddresses(preview, origin);
  const meta = (key: "property" | "name", name: string, content: string) =>
    `<meta ${key}="${name}" content="${escape(content)}">`;
  return [
    meta("property", "og:type", "website"),
    meta("property", "og:site_name", "Weave"),
    meta("property", "og:title", preview.title),
    meta("property", "og:description", preview.description),
    meta("property", "og:url", page),
    meta("property", "og:image", image),
    meta("property", "og:image:width", "1200"),
    meta("property", "og:image:height", "630"),
    meta("property", "og:image:alt", previewAlt(preview)),
    meta("name", "twitter:card", "summary_large_image"),
  ];
}

/**
 * The app's HTML with one section's words in its head: the title and description a browser tab and
 * a search result show, and the preview tags. The page must have exactly one title, one description
 * and one head to change, or the file is not the one this was written for.
 */
export function withPreview(html: string, preview: LinkPreview, origin = PUBLIC_ORIGIN): string {
  const swaps: [RegExp, string][] = [
    [/<title>[^<]*<\/title>/g, `<title>${escape(preview.title)}</title>`],
    [/<meta name="description" content="[^"]*">/g, `<meta name="description" content="${escape(preview.description)}">`],
    [/<\/head>/g, `  ${previewTags(preview, origin).join("\n    ")}\n  </head>`],
  ];
  return swaps.reduce((page, [pattern, replacement]) => {
    const found = page.match(pattern)?.length ?? 0;
    if (found !== 1) throw new Error(`Expected one match for ${pattern} in index.html, found ${found}.`);
    return page.replace(pattern, () => replacement);
  }, html);
}

/**
 * A page with one section's preview taken out of its head again, ready for another's. Each tag must
 * be there exactly as it was written.
 */
export function withoutPreview(html: string, preview: LinkPreview, origin = PUBLIC_ORIGIN): string {
  return previewTags(preview, origin).reduce((page, tag) => {
    if (page.split(tag).length !== 2) throw new Error(`Expected one ${tag} in index.html.`);
    return page.replace(tag, "").replace(/\n[ \t]*\n/g, "\n");
  }, html);
}

/** The file a section's copy is written to, beside the app's own index.html. Home is that file itself. */
export function previewFile(preview: LinkPreview): string {
  const path = pathTo(preview.route).replace(/^\/|\/$/g, "");
  return path ? `${path}/index.html` : "index.html";
}

/**
 * Gives index.html Home's preview, and in a build writes each other section's copy of it. A copy is
 * made from the finished index.html, whatever other plugins put in it and in whatever order, so a
 * person who lands on a section gets the same scripts, styles and service worker as one who lands
 * on Home.
 */
export function linkPreviews(origin = PUBLIC_ORIGIN): Plugin {
  const [home, ...sections] = LINK_PREVIEWS;
  if (!home || previewFile(home) !== "index.html") throw new Error("The first link preview must be Home's.");
  return {
    name: "weave-link-previews",
    enforce: "post",
    transformIndexHtml: { order: "post", handler: (html) => withPreview(html, home, origin) },
    generateBundle(_options, bundle) {
      const built = bundle["index.html"];
      if (built?.type !== "asset" || typeof built.source !== "string")
        throw new Error("index.html was not built before its link previews.");
      const base = withoutPreview(built.source, home, origin);
      for (const preview of sections)
        this.emitFile({ type: "asset", fileName: previewFile(preview), source: withPreview(base, preview, origin) });
    },
  };
}
