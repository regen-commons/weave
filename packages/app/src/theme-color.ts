// The colour a browser draws its own bar in, and an installed app its status bar: the page's
// surface, so the app reaches the edge of the screen in one colour in either theme (DL-087).
// index.html carries one `theme-color` for each scheme, added by dev/theme-color.ts from the
// design tokens, and `applyTheme` says when each applies.

/** The two schemes a theme-color is declared for. */
export type Scheme = "light" | "dark";
export const SCHEMES: readonly Scheme[] = ["light", "dark"];

/**
 * When a scheme's theme-color applies: with the system while no theme is pinned, always for the
 * pinned one, and never for the other.
 */
export function themeColorMedia(pinned: Scheme | null, scheme: Scheme): string {
  if (pinned === null) return `(prefers-color-scheme: ${scheme})`;
  return pinned === scheme ? "all" : "not all";
}
