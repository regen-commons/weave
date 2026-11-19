import tokens from "@regen-commons/design-system/tokens.json" with { type: "json" };
import type { HtmlTagDescriptor, Plugin } from "vite";
import { SCHEMES, themeColorMedia, type Scheme } from "../src/theme-color.ts";

/** Each theme's page surface, from the generated tokens: index.html cannot read CSS. */
export const SURFACES: Record<Scheme, string> = {
  light: tokens.themes.light.surface,
  dark: tokens.themes.dark.surface,
};

/**
 * One `theme-color` for each scheme, following the system until a theme is pinned. `data-scheme`
 * lets `applyTheme` find each one and say when it applies.
 */
export function themeColorTags(surfaces: Record<Scheme, string> = SURFACES): HtmlTagDescriptor[] {
  return SCHEMES.map((scheme) => ({
    tag: "meta",
    attrs: { name: "theme-color", media: themeColorMedia(null, scheme), content: surfaces[scheme], "data-scheme": scheme },
    injectTo: "head",
  }));
}

/**
 * The script that draws a pinned theme before the first paint (`public/theme-boot.js`, DL-097). It
 * is a file of the site's own with nothing inline, so the security policy needs no exception, and
 * it follows the theme colours in the head because it sets when each applies.
 */
export function themeBootTag(): HtmlTagDescriptor {
  return { tag: "script", attrs: { src: "/theme-boot.js" }, injectTo: "head" };
}

/** Adds the theme colours and the theme's first-paint script to index.html, in the build and on the dev server alike. */
export function themeColor(): Plugin {
  return {
    name: "weave-theme-color",
    transformIndexHtml: { order: "post", handler: () => [...themeColorTags(), themeBootTag()] },
  };
}
