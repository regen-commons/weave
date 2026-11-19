import type { ManifestOptions } from "vite-plugin-pwa";

/** The picture a home screen shows, at its own sizes. A shortcut uses the first. */
const ICONS = [
  { src: "/brand/logo/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
  { src: "/brand/logo/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
  // A maskable one may be cut to a circle.
  { src: "/brand/logo/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  { src: "/brand/logo/mark.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
] as const;

/**
 * The sections a long press on the installed app's icon offers, by the names the tab bar gives
 * them (DL-092). Home is where the icon itself opens. A test holds each to its route.
 */
export const APP_SHORTCUTS = [
  { name: "Funding", url: "/funding" },
  { name: "Initiatives", url: "/initiatives" },
  { name: "Your Initiatives", url: "/your-initiatives" },
] as const;

/**
 * What the install sheet shows of the app before it is installed (DL-095): three phone screens,
 * all one size, as Android's sheet asks. They are captures of this app's own build with no
 * example data and no one's initiative in them, in `public/install/screens`. A test holds each
 * to its file and its size. Take them again when Home's top, its three steps or its kinds change.
 */
export const APP_SCREENSHOTS = [
  { src: "/install/screens/home.jpg", label: "Home: find partners and funding for regenerative work" },
  { src: "/install/screens/steps.jpg", label: "Three steps: describe your initiative, add what you need and can offer, see funding and partners" },
  { src: "/install/screens/kinds.jpg", label: "Money is one of eight kinds of support" },
] as const;
/** The size every capture has: a 360 by 780 phone at two pixels a point. */
export const SCREENSHOT_SIZE = { width: 720, height: 1560 } as const;

/**
 * The installed app. It cannot read CSS, so its colours come from the generated tokens, and it can
 * name one theme colour only: index.html's own, one for each scheme, take over once the page is
 * open (theme-color.ts). `id` is the address the app already had by default, written down so
 * that changing where it starts never makes an installed copy a different app.
 */
export function appManifest(surface: string): Partial<ManifestOptions> {
  return {
    id: "/",
    name: "Weave",
    short_name: "Weave",
    description: "Find partners and funding for regenerative work.",
    lang: "en",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: surface,
    theme_color: surface,
    icons: ICONS.map((icon) => ({ ...icon })),
    shortcuts: APP_SHORTCUTS.map((shortcut) => ({ ...shortcut, icons: [{ src: ICONS[0].src, sizes: ICONS[0].sizes, type: ICONS[0].type }] })),
    screenshots: APP_SCREENSHOTS.map((screen) => ({
      ...screen,
      sizes: `${SCREENSHOT_SIZE.width}x${SCREENSHOT_SIZE.height}`,
      type: "image/jpeg",
      form_factor: "narrow" as const,
    })),
  };
}
