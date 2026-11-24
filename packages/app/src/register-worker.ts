// The service worker that keeps Weave working offline (vite-plugin-pwa writes it as /sw.js). Its
// registration used to run on the window's load event from a script of its own, and on a slow phone
// that task landed while the page was still busy starting up. It now waits until the page has loaded
// and the browser is idle, so it never competes with the first draw or the first taps.

/** The parts of the window this reads. */
export interface WorkerWindow {
  readonly document: { readonly readyState: string };
  readonly navigator: { readonly serviceWorker?: { register(url: string, options: { scope: string }): Promise<unknown> } };
  addEventListener(type: "load", listener: () => void, options: { once: true }): void;
  setTimeout(run: () => void, ms: number): unknown;
  requestIdleCallback?: (run: () => void, options: { timeout: number }) => unknown;
}

/** The longest the registration waits for an idle moment once the page has loaded. */
export const IDLE_TIMEOUT_MS = 10_000;
/** Where a browser with no idle callback registers instead, after the page has loaded. */
export const FALLBACK_DELAY_MS = 3_000;

export function registerWorkerWhenIdle(win: WorkerWindow): void {
  const worker = win.navigator.serviceWorker;
  if (!worker) return;
  const register = () => {
    // A worker that cannot register leaves the app working online; nothing to tell the person.
    worker.register("/sw.js", { scope: "/" }).catch(() => {});
  };
  const whenIdle = () => {
    if (win.requestIdleCallback) win.requestIdleCallback(register, { timeout: IDLE_TIMEOUT_MS });
    else win.setTimeout(register, FALLBACK_DELAY_MS);
  };
  if (win.document.readyState === "complete") whenIdle();
  else win.addEventListener("load", whenIdle, { once: true });
}
