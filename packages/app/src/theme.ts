export type Theme = "system" | "light" | "dark";
export function readTheme(): Theme {
  try {
    const value = localStorage.getItem("rc-theme");
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
  try {
    if (theme === "system") localStorage.removeItem("rc-theme");
    else localStorage.setItem("rc-theme", theme);
  } catch {
    /* The choice still applies for this visit. */
  }
}
