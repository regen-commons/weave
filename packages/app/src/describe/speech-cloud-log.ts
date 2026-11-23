/**
 * The device's own record of cloud speech: when a recording was sent, and how long it was. It
 * holds no audio and no words. It is kept in this browser, like the agreement, so the person can
 * see in Settings how often their voice has left this device. The server keeps no such record.
 *
 * It is not part of the draft's assistant records: an older tab reads a draft strictly and would
 * refuse a kind of record it does not know (DL-114).
 */
export interface CloudSpeechUse {
  /** When the recording was sent, as an ISO time. */
  at: string;
  /** How long the recording was, in whole seconds. */
  seconds: number;
}

export interface CloudSpeechLog {
  list(): readonly CloudSpeechUse[];
  add(use: CloudSpeechUse): void;
  subscribe(listener: () => void): () => void;
}

export const CLOUD_SPEECH_LOG_KEY = "weave-cloud-speech-log";
/** The most uses kept. Older ones drop off the front. */
const KEPT = 100;

function read(value: string | null | undefined): CloudSpeechUse[] {
  try {
    const parsed: unknown = JSON.parse(value ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is CloudSpeechUse =>
          item !== null &&
          typeof item === "object" &&
          typeof (item as CloudSpeechUse).at === "string" &&
          !Number.isNaN(Date.parse((item as CloudSpeechUse).at)) &&
          Number.isInteger((item as CloudSpeechUse).seconds) &&
          (item as CloudSpeechUse).seconds >= 0,
      )
      .map(({ at, seconds }) => ({ at, seconds }))
      .slice(-KEPT);
  } catch {
    return [];
  }
}

/** A record held in memory only: for tests, and for a browser that stores nothing. */
export function memoryLog(): CloudSpeechLog {
  let uses: readonly CloudSpeechUse[] = [];
  const listeners = new Set<() => void>();
  return {
    list: () => uses,
    add(use) {
      uses = [...uses, use].slice(-KEPT);
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** The record kept in this browser. A browser that refuses storage keeps it for this visit only. */
export function storedLog(
  storage: () => Pick<Storage, "getItem" | "setItem"> | undefined = () => globalThis.localStorage,
  events: Pick<EventTarget, "addEventListener" | "removeEventListener"> | undefined = globalThis.window,
): CloudSpeechLog {
  const visit = memoryLog();
  let raw: string | null | undefined;
  let uses: readonly CloudSpeechUse[] = [];
  const listeners = new Set<() => void>();
  // The same list is answered until storage changes, so a page that reads it does not re-render for nothing.
  const list = (): readonly CloudSpeechUse[] => {
    let stored: string | null | undefined;
    try {
      stored = storage()?.getItem(CLOUD_SPEECH_LOG_KEY);
    } catch {
      return visit.list();
    }
    if (stored !== raw) {
      raw = stored;
      uses = read(stored);
    }
    return uses.length ? uses : visit.list();
  };
  return {
    list,
    add(use) {
      try {
        const store = storage();
        if (!store) throw new Error("No storage");
        store.setItem(CLOUD_SPEECH_LOG_KEY, JSON.stringify([...read(store.getItem(CLOUD_SPEECH_LOG_KEY)), use].slice(-KEPT)));
      } catch {
        visit.add(use);
      }
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      const storageChange = (event: Event) => {
        if (!("key" in event) || event.key === CLOUD_SPEECH_LOG_KEY || event.key === null) listener();
      };
      events?.addEventListener("storage", storageChange);
      return () => {
        listeners.delete(listener);
        events?.removeEventListener("storage", storageChange);
      };
    },
  };
}

let device: CloudSpeechLog | undefined;
/** This browser's record, shared by every page and Settings. */
export function deviceCloudSpeechLog(): CloudSpeechLog {
  return (device ??= storedLog());
}
