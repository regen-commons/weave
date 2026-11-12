import { posix } from "node:path";
import type { HtmlTagDescriptor, IndexHtmlTransformContext, Plugin } from "vite";

/** What the build hands index.html's transform: every file it emitted. */
export type BuildBundle = NonNullable<IndexHtmlTransformContext["bundle"]>;

/**
 * The faces a first visit draws: Space Grotesk for the interface, Fraunces for titles, its italic
 * for the word Home's hero sets in italic, and Source Serif 4 for reading. The design system
 * declares each with `font-display: optional` and a metric-matched fallback, so text never swaps
 * once it is drawn. Without a preload, a first visit asks for a face only after the page has laid
 * out its text, too late for it to be used, and the fallback stays for that page. Preloading lets
 * the first paint use them (DL-057). The service worker caches every font file on that visit
 * anyway, so the italic costs no extra bytes on pages without it.
 */
export const FIRST_FACES = [
  "space-grotesk-latin.woff2",
  "fraunces-latin.woff2",
  "fraunces-italic-latin.woff2",
  "source-serif-4-latin.woff2",
] as const;

/** One preload link per face. Fonts are fetched in CORS mode, so the link must say so to be reused. */
export function fontPreloadTags(hrefs: readonly string[]): HtmlTagDescriptor[] {
  return hrefs.map((href) => ({
    tag: "link",
    attrs: { rel: "preload", href, as: "font", type: "font/woff2", crossorigin: true },
    injectTo: "head",
  }));
}

/** The address the build gave each face. A face the build did not emit is an error, not a missing link. */
export function builtFontHrefs(bundle: BuildBundle, base: string, faces: readonly string[] = FIRST_FACES): string[] {
  const assets = Object.values(bundle).flatMap((file) => (file.type === "asset" ? [file] : []));
  return faces.map((face) => {
    const asset = assets.find((file) => file.originalFileNames.some((name) => name.endsWith(`/fonts/${face}`)));
    if (!asset) throw new Error(`The build emitted no ${face} to preload.`);
    return base + asset.fileName;
  });
}

/** The dev server serves the design system's files from outside the app's root under /@fs. */
export function devFontHrefs(fontsCss: string, faces: readonly string[] = FIRST_FACES): string[] {
  const directory = posix.dirname(fontsCss.split("\\").join("/"));
  return faces.map((face) => `/@fs${directory.startsWith("/") ? "" : "/"}${directory}/${face}`);
}

/** Adds the first faces' preloads to index.html, in the build and on the dev server alike. */
export function fontPreloads(): Plugin {
  let base = "/";
  return {
    name: "weave-font-preloads",
    configResolved(config) {
      base = config.base;
    },
    transformIndexHtml: {
      order: "post",
      async handler(_html, context) {
        if (context.bundle) return fontPreloadTags(builtFontHrefs(context.bundle, base));
        if (!context.server) return [];
        const fontsCss = await context.server.pluginContainer.resolveId("@regen-commons/design-system/fonts.css");
        if (!fontsCss) throw new Error("The design system's fonts.css did not resolve.");
        return fontPreloadTags(devFontHrefs(fontsCss.id));
      },
    },
  };
}
