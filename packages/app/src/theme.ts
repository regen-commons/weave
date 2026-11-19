import { themeColorMedia } from "./theme-color.ts";

export type Theme = "system" | "light" | "dark";
/** The full choice, in the order and words Settings and a phone's You tab offer it. */
export const THEME_CHOICES: readonly { value: Theme; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];
const CHANGED = "rc-theme-change";
/** Where a pinned theme is kept. `public/theme-boot.js` reads the same place before the first paint. */
export const THEME_KEY = "rc-theme";
export function readTheme(): Theme {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}
export function applyTheme(theme: Theme): void {
  if (theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  document
    .querySelector('meta[name="color-scheme"]')
    ?.setAttribute("content", theme === "system" ? "light dark" : theme);
  // The browser's bar and an installed app's status bar follow the theme on screen, pinned or not.
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"][data-scheme]')) {
    const scheme = meta.dataset.scheme;
    if (scheme === "light" || scheme === "dark")
      meta.setAttribute("media", themeColorMedia(theme === "system" ? null : theme, scheme));
  }
  try {
    if (theme === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* The choice still applies for this visit. */
  }
  // The header's switch and Settings show the same choice, so each hears the other's change.
  window.dispatchEvent(new Event(CHANGED));
}
/** Calls back when the theme is chosen here, or in another tab of this browser. */
export function subscribeTheme(listener: () => void): () => void {
  window.addEventListener(CHANGED, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(CHANGED, listener);
    window.removeEventListener("storage", listener);
  };
}
/** The theme on screen: the pinned one, or the system's while none is pinned. */
export function shownTheme(theme: Theme, systemDark: boolean): "light" | "dark" {
  return theme === "system" ? (systemDark ? "dark" : "light") : theme;
}
/**
 * What the header's switch chooses: the opposite of what is on screen. Choosing the theme the
 * system already has goes back to following the system, so the switch never pins by accident.
 */
export function switchedTheme(theme: Theme, systemDark: boolean): Theme {
  const next = shownTheme(theme, systemDark) === "dark" ? "light" : "dark";
  return next === (systemDark ? "dark" : "light") ? "system" : next;
}
