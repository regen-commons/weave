/**
 * The person's agreement to let their browser's own speech service turn their voice into text
 * where speech on this device is not available (the owner's decision of 19 November 2026, in
 * `docs/platform/open-decisions.md`). That service is the browser vendor's, so the browser sends
 * the audio away from the device; Weave never receives it, only the words that come back.
 *
 * Nothing starts a session of the browser's speech service without this agreement, and on-device
 * speech never falls back to it. The agreement is kept in this browser, like the theme, and
 * Settings withdraws it.
 */
export interface BrowserSpeechConsent {
  agreed(): boolean;
  /** Only from the person's own press of the agreement in the notice. */
  agree(): void;
  withdraw(): void;
  /** Calls back when the agreement changes here or in another tab of this browser. */
  subscribe(listener: () => void): () => void;
}

/** Where the agreement is kept. Any other stored value counts as no agreement. */
export const BROWSER_SPEECH_KEY = "weave-browser-speech";
const AGREED = "agreed";
const CHANGED = "weave-browser-speech-change";

/** An agreement held in memory only: for examples, for tests, and for a browser that stores nothing. */
export function memoryConsent(initial = false): BrowserSpeechConsent {
  let agreed = initial;
  const listeners = new Set<() => void>();
  const set = (value: boolean) => {
    if (agreed === value) return;
    agreed = value;
    for (const listener of listeners) listener();
  };
  return {
    agreed: () => agreed,
    agree: () => set(true),
    withdraw: () => set(false),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** The storage the device agreement reads and writes: this browser's `localStorage` in the app. */
export interface ConsentStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * The agreement kept in this browser. A browser that refuses storage keeps it for this visit only,
 * so the person is asked again next time rather than assumed to have agreed.
 */
export function storedConsent(
  storage: () => ConsentStorage | undefined = () => globalThis.localStorage,
  events: Pick<EventTarget, "addEventListener" | "removeEventListener" | "dispatchEvent"> | undefined = globalThis.window,
): BrowserSpeechConsent {
  let visit: boolean | undefined;
  const read = (): boolean => {
    if (visit !== undefined) return visit;
    try {
      return storage()?.getItem(BROWSER_SPEECH_KEY) === AGREED;
    } catch {
      return false;
    }
  };
  const write = (value: boolean) => {
    try {
      const store = storage();
      if (!store) throw new Error("No storage");
      if (value) store.setItem(BROWSER_SPEECH_KEY, AGREED);
      else store.removeItem(BROWSER_SPEECH_KEY);
      visit = undefined;
    } catch {
      visit = value;
    }
    events?.dispatchEvent(new Event(CHANGED));
  };
  return {
    agreed: read,
    agree: () => write(true),
    withdraw: () => write(false),
    subscribe(listener) {
      if (!events) return () => {};
      const storageChange = (event: Event) => {
        if (!("key" in event) || event.key === BROWSER_SPEECH_KEY || event.key === null) listener();
      };
      events.addEventListener(CHANGED, listener);
      events.addEventListener("storage", storageChange);
      return () => {
        events.removeEventListener(CHANGED, listener);
        events.removeEventListener("storage", storageChange);
      };
    },
  };
}

let device: BrowserSpeechConsent | undefined;
/** This browser's agreement, shared by every page and Settings. */
export function deviceConsent(): BrowserSpeechConsent {
  return (device ??= storedConsent());
}
