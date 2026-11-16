import type { ConnectSession, SessionChange } from "./session.ts";

const channelName = "weave-account-session";
const isChange = (value: unknown): value is SessionChange => value === "ended" || value === "changed";
type BrowserSession = Pick<Window, "addEventListener" | "removeEventListener" | "localStorage" | "document"> & {
  BroadcastChannel?: typeof BroadcastChannel;
};

/** Signals carry no identity, tokens or private content. Focus also reconciles a suspended tab. */
export function browserSessionEvents(browser: BrowserSession = window): ConnectSession {
  return (receive, resume) => {
    let channel: BroadcastChannel | undefined;
    try { if (browser.BroadcastChannel) channel = new browser.BroadcastChannel(channelName); } catch { /* Use storage events when a channel is unavailable. */ }
    const message = (event: MessageEvent<unknown>) => { if (isChange(event.data)) receive(event.data); };
    const storage = (event: StorageEvent) => {
      if (event.key !== channelName || !event.newValue) return;
      const [change, nonce] = event.newValue.split(":");
      if (isChange(change) && /^[\da-f-]{36}$/u.test(nonce ?? "")) receive(change);
    };
    const visible = () => { if (browser.document.visibilityState === "visible") resume(); };
    const restored = (event: PageTransitionEvent) => { if (event.persisted) resume(); };
    channel?.addEventListener("message", message);
    if (!channel) browser.addEventListener("storage", storage);
    browser.addEventListener("focus", resume);
    browser.addEventListener("pageshow", restored);
    browser.document.addEventListener("visibilitychange", visible);
    return {
      publish(change) {
        try {
          if (channel) channel.postMessage(change);
          else browser.localStorage.setItem(channelName, `${change}:${crypto.randomUUID()}`);
        } catch { /* Focus reconciliation remains available if browser messaging and storage are blocked. */ }
      },
      close() {
        channel?.removeEventListener("message", message);
        channel?.close();
        browser.removeEventListener("storage", storage);
        browser.removeEventListener("focus", resume);
        browser.removeEventListener("pageshow", restored);
        browser.document.removeEventListener("visibilitychange", visible);
      },
    };
  };
}
