import { useId, useSyncExternalStore } from "react";
import { applyTheme, readTheme, shownTheme, subscribeTheme, switchedTheme, THEME_CHOICES } from "../theme.ts";
import { Icon } from "./Icon.tsx";

const DARK = "(prefers-color-scheme: dark)";
function subscribeSystem(listener: () => void): () => void {
  const query = window.matchMedia(DARK);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}
/** The theme chosen on this device, kept in step with Settings and the header's switch. */
export function useTheme() {
  const theme = useSyncExternalStore(subscribeTheme, readTheme);
  const systemDark = useSyncExternalStore(subscribeSystem, () => window.matchMedia(DARK).matches);
  return { theme, systemDark, shown: shownTheme(theme, systemDark) };
}

/**
 * Theme switch: an Icon button in the app header on a wide screen that changes between light and
 * dark at once (DL-079). It shows the theme it changes to and says so in words for assistive
 * technology. Settings keeps the full choice, with System.
 */
export function ThemeSwitch() {
  const { theme, systemDark, shown } = useTheme();
  const label = shown === "dark" ? "Use light theme" : "Use dark theme";
  return (
    <button
      className="rc-icon-button"
      type="button"
      data-from="wide"
      aria-label={label}
      title={label}
      onClick={() => applyTheme(switchedTheme(theme, systemDark))}
    >
      <Icon name={shown === "dark" ? "sun" : "moon"} />
    </button>
  );
}

/**
 * Theme choice: the full choice, System included, as a Chip group under its legend, changed at
 * once. A phone's You tab has it, where a wide screen has the header's switch (DL-086).
 */
export function ThemeChoice() {
  const { theme } = useTheme();
  const name = useId();
  return (
    <fieldset>
      <legend>Theme</legend>
      <div className="rc-chip-group">
        {THEME_CHOICES.map((choice) => (
          <label className="rc-chip" key={choice.value}>
            <input
              className="rc-check"
              type="radio"
              name={name}
              checked={theme === choice.value}
              onChange={() => applyTheme(choice.value)}
            />
            {choice.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
