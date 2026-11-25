/**
 * Where the browser's own speech service cannot work, cloud speech is offered instead, with its own
 * agreement (DL-138, revised 23 November 2026). Two things say so:
 *
 * - **Brave.** It has the Web Speech API's recognizer but none of the speech service behind it, so a
 *   session fails with `network` once the microphone is allowed (brave/brave-browser#2802). Brave
 *   identifies itself through its own API or the browser brands in User-Agent Client Hints.
 * - **This device's own record**, before the service has ever given words here: it failed with
 *   `network` while the device was online, or with `service-not-allowed`; or it twice had the
 *   microphone open for a while and gave nothing back. One silent try may be a person thinking, so it
 *   takes two. The next press of Talk It Out then offers cloud speech. Once the service has given
 *   words on this device, a later failure is taken as a passing one and changes nothing.
 *
 * Only that one word is stored, never what was said. Settings forgets a failure, with Use Browser
 * Speech Again or with Stop Using Cloud Speech, so the browser's own service is offered again.
 */

/** `quiet`: one silent try, not yet a failure. */
export type BrowserSpeechRecordState = "unknown" | "quiet" | "worked" | "failed";

export interface BrowserSpeechRecord {
  state(): BrowserSpeechRecordState;
  /** The browser's own service gave words on this device. */
  worked(): void;
  /**
   * It failed before it had ever given words here. Ignored once it has worked. Tells its listeners
   * every time, so a page that missed the first failure looks again.
   */
  failed(): void;
  /** It had the microphone and gave nothing back. The second time before it has worked is a failure. Answers the state after. */
  quiet(): BrowserSpeechRecordState;
  /** Forgets a failure or a silent try, so the browser's own service is offered again. */
  forget(): void;
  /** Calls back when the record changes here or in another tab of this browser. */
  subscribe(listener: () => void): () => void;
}

/** Where the record is kept. Any other stored value counts as unknown. */
export const BROWSER_SPEECH_RECORD_KEY = "weave-browser-speech-record";

const STATES: readonly BrowserSpeechRecordState[] = ["quiet", "worked", "failed"];

interface RecordStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** A record held in memory only: for tests and examples, and for a browser that stores nothing. */
export function memorySpeechRecord(initial: BrowserSpeechRecordState = "unknown"): BrowserSpeechRecord {
  return speechRecord(() => undefined, undefined, initial);
}

/** The record kept in this browser's storage. A browser that refuses storage keeps it for this visit. */
export function storedSpeechRecord(
  storage: () => RecordStorage | undefined = () => globalThis.localStorage,
  events: Pick<EventTarget, "addEventListener" | "removeEventListener"> | undefined = globalThis.window,
): BrowserSpeechRecord {
  return speechRecord(storage, events, "unknown");
}

function speechRecord(
  storage: () => RecordStorage | undefined,
  events: Pick<EventTarget, "addEventListener" | "removeEventListener"> | undefined,
  initial: BrowserSpeechRecordState,
): BrowserSpeechRecord {
  let visit: BrowserSpeechRecordState = initial;
  // Storage that reads but refused a write is not believed for the rest of the visit.
  let unwritable = false;
  const listeners = new Set<() => void>();
  const tell = () => {
    for (const listener of listeners) listener();
  };
  const read = (): BrowserSpeechRecordState => {
    if (unwritable) return visit;
    try {
      const place = storage();
      if (!place) return visit;
      const value = place.getItem(BROWSER_SPEECH_RECORD_KEY);
      return STATES.find((state) => state === value) ?? "unknown";
    } catch {
      return visit;
    }
  };
  const write = (next: BrowserSpeechRecordState) => {
    visit = next;
    try {
      const place = storage();
      if (next === "unknown") place?.removeItem(BROWSER_SPEECH_RECORD_KEY);
      else place?.setItem(BROWSER_SPEECH_RECORD_KEY, next);
    } catch {
      unwritable = true;
    }
  };
  const fromOtherTab = (event: Event) => {
    if ((event as StorageEvent).key === BROWSER_SPEECH_RECORD_KEY) tell();
  };
  return {
    state: read,
    worked: () => {
      if (read() === "worked") return;
      write("worked");
      tell();
    },
    failed: () => {
      if (read() === "worked") return;
      write("failed");
      tell();
    },
    quiet: () => {
      const now = read();
      if (now === "worked") return now;
      const next = now === "unknown" ? "quiet" : "failed";
      write(next);
      if (next === "failed") tell();
      return next;
    },
    forget: () => {
      const now = read();
      if (now !== "failed" && now !== "quiet") return;
      write("unknown");
      tell();
    },
    subscribe(listener) {
      if (!listeners.size) events?.addEventListener("storage", fromOtherTab);
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (!listeners.size) events?.removeEventListener("storage", fromOtherTab);
      };
    },
  };
}

let device: BrowserSpeechRecord | undefined;
/** This browser's record, one for the whole visit. */
export function deviceSpeechRecord(): BrowserSpeechRecord {
  return (device ??= storedSpeechRecord());
}

/** Brave's own API is preferred. The declared brand can still be present when the API is hidden. */
export async function isBrave(scope: unknown = globalThis.navigator): Promise<boolean> {
  const browser = scope as {
    brave?: { isBrave?: () => unknown };
    userAgentData?: { brands?: readonly { brand: string }[] };
  } | undefined;
  try {
    if ((await browser?.brave?.isBrave?.()) === true) return true;
  } catch {
    // A failed API call can still leave the brand available.
  }
  return browser?.userAgentData?.brands?.some(({ brand }) => brand === "Brave") ?? false;
}
