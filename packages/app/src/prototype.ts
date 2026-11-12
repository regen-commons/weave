import { applyTheme } from "./theme.ts";

const KIND = "weave-prototype";

/**
 * Prototype build only. The review page around the app sets the theme and steps back, and
 * hears the title of the page that is open. Titles of fictional example pages are all it sends.
 */
export function connectReviewPage(): void {
  if (window.parent === window) return;
  window.addEventListener("message", (event: MessageEvent<unknown>) => {
    const data = event.data;
    if (event.source !== window.parent || !data || typeof data !== "object") return;
    if (!("kind" in data) || data.kind !== KIND) return;
    if ("theme" in data && (data.theme === "system" || data.theme === "light" || data.theme === "dark"))
      applyTheme(data.theme);
    if ("back" in data && data.back === true) window.history.back();
  });
  const report = () => window.parent.postMessage({ kind: KIND, title: document.title }, "*");
  const title = document.querySelector("title");
  if (title) new MutationObserver(report).observe(title, { childList: true, characterData: true, subtree: true });
  report();
}
