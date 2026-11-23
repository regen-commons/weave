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
export interface SpeechConsent {
  agreed(): boolean;
  /** Only from the person's own press of the agreement in the notice. */
  agree(): void;
  withdraw(): void;
  /** Calls back when the agreement changes here or in another tab of this browser. */
  subscribe(listener: () => void): () => void;
}
/** The agreement to the browser's own speech service. */
export type BrowserSpeechConsent = SpeechConsent;

/** Where the agreement is kept. Any other stored value counts as no agreement. */
export const BROWSER_SPEECH_KEY = "weave-browser-speech";
/**
 * Where the agreement to cloud speech is kept: a recording sent through Weave to the provider the
 * notice names, where the browser cannot turn speech into text at all (the owner's decision of
 * 23 November 2026). It is a separate agreement. Agreeing to one never agrees to the other.
 */
export const CLOUD_SPEECH_KEY = "weave-cloud-speech";
const AGREED = "agreed";

/** An agreement held in memory only: for examples, for tests, and for a browser that stores nothing. */
export function memoryConsent(initial = false): SpeechConsent {
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
  key: string = BROWSER_SPEECH_KEY,
): SpeechConsent {
  // Each agreement tells its own listeners, so a change to one never looks like a change to the other.
  const CHANGED = `${key}-change`;
  let visit: boolean | undefined;
  const read = (): boolean => {
    if (visit !== undefined) return visit;
    try {
      return storage()?.getItem(key) === AGREED;
    } catch {
      return false;
    }
  };
  const write = (value: boolean) => {
    try {
      const store = storage();
      if (!store) throw new Error("No storage");
      if (value) store.setItem(key, AGREED);
      else store.removeItem(key);
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
        if (!("key" in event) || event.key === key || event.key === null) listener();
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

let device: SpeechConsent | undefined;
/** This browser's agreement to its own speech service, shared by every page and Settings. */
export function deviceConsent(): SpeechConsent {
  return (device ??= storedConsent());
}

let cloud: SpeechConsent | undefined;
/** This browser's agreement to cloud speech, shared by every page and Settings. */
export function deviceCloudConsent(): SpeechConsent {
  return (cloud ??= storedConsent(undefined, undefined, CLOUD_SPEECH_KEY));
}
