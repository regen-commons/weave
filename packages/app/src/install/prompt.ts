/**
 * Chromium's offer to install the app. It arrives once, soon after the page loads, and has to be
 * kept to be acted on later, when a person presses Install. The browser's own way of offering is
 * left alone: this only remembers the offer.
 */
interface InstallOffer extends Event {
  prompt(): Promise<unknown>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type InstallOutcome = "accepted" | "dismissed" | "unavailable";

let offer: InstallOffer | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => {
  for (const listener of listeners) listener();
};

/** Starts listening for the browser's offer. Call once, as the app starts. */
export function watchInstallOffer(target: Pick<Window, "addEventListener"> = window): void {
  target.addEventListener("beforeinstallprompt", (event) => {
    offer = event as InstallOffer;
    notify();
  });
  target.addEventListener("appinstalled", () => {
    offer = null;
    installed = true;
    notify();
  });
}

export function subscribeInstall(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** "offered" while the browser's offer stands, "installed" once it has been taken up in this visit. */
export function installState(): "offered" | "installed" | "none" {
  return installed ? "installed" : offer ? "offered" : "none";
}

/** Shows the browser's own install dialog. An offer can be shown once; after that it is spent. */
export async function acceptInstallOffer(): Promise<InstallOutcome> {
  const current = offer;
  if (!current) return "unavailable";
  offer = null;
  notify();
  try {
    await current.prompt();
    return (await current.userChoice).outcome;
  } catch {
    // The browser declined to show it, as some do when the offer was not held back first.
    return "unavailable";
  }
}
