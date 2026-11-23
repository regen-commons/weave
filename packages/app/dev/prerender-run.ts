/**
 * Draws the app's first views for dev/prerender.ts, in a process of its own. It is given the addresses
 * as a JSON list and writes one line, RESULT_MARK followed by a JSON record of address to HTML.
 *
 * The app is written for the browser, so this stands in for the few browser globals its modules and
 * first draw read: an address, an empty history, no storage, no stored preference and a connection.
 * What it draws is what a visitor with nothing stored sees before anything has loaded. A store read
 * with useSyncExternalStore gives its browser value here, since nothing will hydrate this HTML.
 */
import { createRequire } from "node:module";
import { RESULT_MARK } from "./prerender.ts";

type Snapshot = () => unknown;
type UseStore = (subscribe: (change: () => void) => () => void, snapshot: Snapshot, server?: Snapshot) => unknown;

// Before anything imports React as a module, so every module sees the same function.
const react = createRequire(import.meta.url)("react") as { useSyncExternalStore: UseStore };
const useStore = react.useSyncExternalStore;
react.useSyncExternalStore = (subscribe, snapshot) => useStore(subscribe, snapshot, snapshot);

const paths: unknown = JSON.parse(process.argv[2] ?? "[]");
if (!Array.isArray(paths) || !paths.every((path) => typeof path === "string")) throw new Error("Give the addresses as a JSON list.");

const ORIGIN = "https://weave.regencommons.com";
const ignore = () => {};
const element = () => ({
  dataset: {},
  style: {},
  classList: { add: ignore, remove: ignore, toggle: ignore, contains: () => false },
  setAttribute: ignore,
  getAttribute: () => null,
  addEventListener: ignore,
  removeEventListener: ignore,
});
const location = { pathname: "/", search: "", hash: "", href: `${ORIGIN}/`, origin: ORIGIN };
const history = { state: null, length: 1, replaceState: ignore, pushState: ignore, scrollRestoration: "auto" };
const navigator = { onLine: true, userAgent: "Weave prerender", language: "en", languages: ["en"] };
const media = () => ({ matches: false, addEventListener: ignore, removeEventListener: ignore });
const document = {
  addEventListener: ignore,
  removeEventListener: ignore,
  visibilityState: "visible",
  readyState: "loading",
  title: "",
  documentElement: element(),
  body: element(),
  head: element(),
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementById: () => null,
  createElement: element,
};
const window: Record<string, unknown> = {
  location, history, navigator, document, matchMedia: media, scrollY: 0, addEventListener: ignore, removeEventListener: ignore,
};
window.parent = window;
const globals: Record<string, unknown> = {
  window, document, location, history, navigator, matchMedia: media, addEventListener: ignore, removeEventListener: ignore,
};
for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });

const { createServer } = await import("vite");
const { createElement } = await import("react");
const { renderToString } = await import("react-dom/server");
const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom", logLevel: "error" });
try {
  const app = (await server.ssrLoadModule("/src/App.tsx")) as {
    App: () => unknown;
    preloadPage: (location: string) => Promise<void>;
  };
  const views: Record<string, string> = {};
  for (const path of paths as string[]) {
    const address = new URL(path, ORIGIN);
    Object.assign(location, { pathname: address.pathname, search: address.search, href: address.href });
    await app.preloadPage(path);
    views[path] = renderToString(createElement(app.App as () => null));
  }
  // Written to a pipe, which may finish after this returns: wait for it before ending the process.
  await new Promise<void>((done) => process.stdout.write(`\n${RESULT_MARK}${JSON.stringify(views)}\n`, () => done()));
} finally {
  await server.close();
}
// The stand-ins and the server leave handles open that would keep this process, and so the build,
// waiting. The result is written; end here.
process.exit(0);
