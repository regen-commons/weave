/**
 * Where the browser's own speech service cannot work, cloud speech is offered instead, with its own
 * agreement (DL-138, revised 23 November 2026). Two things say so:
 *
 * - **Brave.** It has the Web Speech API's recognizer but none of the speech service behind it, so a
 *   session fails with `network` once the microphone is allowed (brave/brave-browser#2802). Brave says
 *   who it is through `navigator.brave.isBrave()`.
 * - **This device's own record.** A browser whose service heard the microphone and gave nothing back,
 *   or failed with `network`, before it had ever given words here, is noted as not working. The next
 *   press of Talk It Out then offers cloud speech. Once the service has given words on this device,
 *   a later failure is taken as a passing one and changes nothing.
 *
 * Only that one word is stored, never what was said. Turning cloud speech off in Settings forgets it,
 * so the browser's own service is offered again.
 */

export type BrowserSpeechRecordState = "unknown" | "worked" | "failed";

export interface BrowserSpeechRecord {
  state(): BrowserSpeechRecordState;
  /** The browser's own service gave words on this device. */
  worked(): void;
  /** It failed before it had ever given words here. Ignored once it has worked. */
  failed(): void;
  /** Forgets a failure, so the browser's own service is offered again. */
  forget(): void;
  /** Calls back when the record changes here or in another tab of this browser. */
  subscribe(listener: () => void): () => void;
}

/** Where the record is kept. Any other stored value counts as unknown. */
export const BROWSER_SPEECH_RECORD_KEY = "weave-browser-speech-record";

interface RecordStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** A record held in memory only: for tests, and for a browser that stores nothing. */
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
  const listeners = new Set<() => void>();
  const read = (): BrowserSpeechRecordState => {
    try {
      const place = storage();
      if (!place) return visit;
      const value = place.getItem(BROWSER_SPEECH_RECORD_KEY);
      return value === "worked" || value === "failed" ? value : "unknown";
    } catch {
      return visit;
    }
  };
  const write = (next: BrowserSpeechRecordState) => {
    if (read() === next) return;
    visit = next;
    try {
      const place = storage();
      if (next === "unknown") place?.removeItem(BROWSER_SPEECH_RECORD_KEY);
      else place?.setItem(BROWSER_SPEECH_RECORD_KEY, next);
    } catch {
      /* Kept for this visit only. */
    }
    for (const listener of listeners) listener();
  };
  const fromOtherTab = (event: Event) => {
    if ((event as StorageEvent).key === BROWSER_SPEECH_RECORD_KEY) for (const listener of listeners) listener();
  };
  return {
    state: read,
    worked: () => write("worked"),
    failed: () => {
      if (read() !== "worked") write("failed");
    },
    forget: () => {
      if (read() === "failed") write("unknown");
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

/**
 * Whether this is Brave, which says so itself. Any other browser, one that does not answer, and an
 * answer that is not `true` all count as no.
 */
export async function isBrave(scope: unknown = globalThis.navigator): Promise<boolean> {
  try {
    const brave = (scope as { brave?: { isBrave?: () => unknown } } | undefined)?.brave;
    if (typeof brave?.isBrave !== "function") return false;
    return (await brave.isBrave()) === true;
  } catch {
    return false;
  }
}
