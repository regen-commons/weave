import { deviceCloudConsent, deviceConsent, type ConsentStorage, type SpeechConsent } from "./speech-consent.ts";
import { deviceSpeechRecord, type BrowserSpeechRecord } from "./speech-fallback.ts";

/**
 * The way of talking a person chose in Settings (the user's decision of 25 November 2026): one choice
 * among speech on this device, the browser's own speech service, cloud speech, or no talking. Choosing
 * is agreeing: each option's own line is its notice, so choosing the browser's service or cloud speech
 * stores that agreement and withdraws the other, and choosing the device or Off withdraws both. With no
 * choice made, Talk It Out keeps its own order and asks at first use (DL-138).
 */
export type SpeechChoice = "device" | "browser" | "cloud" | "off";
export const SPEECH_CHOICES: readonly SpeechChoice[] = ["device", "browser", "cloud", "off"];
export const SPEECH_CHOICE_KEY = "weave-speech-choice";

export interface SpeechChoiceStore {
  /** The stored choice, or null where the person has not chosen. */
  chosen(): SpeechChoice | null;
  /** Records a choice and the agreements it carries. Only from the person's own press in Settings. */
  choose(choice: SpeechChoice): void;
  /** Forgets the choice, so Talk It Out goes back to its own order. Agreements already given stay. */
  clear(): void;
  subscribe(listener: () => void): () => void;
}

const isChoice = (value: unknown): value is SpeechChoice => SPEECH_CHOICES.includes(value as SpeechChoice);

/**
 * The choice kept in this browser, beside the agreements it sets. A browser that stores nothing keeps it
 * for the visit. Choosing the browser's service again also forgets a failure this device noted for it,
 * since the person asked to try it (`speech-fallback.ts`).
 */
export function storedSpeechChoice({
  storage = () => globalThis.localStorage,
  events = globalThis.window,
  browser = deviceConsent(),
  cloud = deviceCloudConsent(),
  record = deviceSpeechRecord(),
}: {
  storage?: () => ConsentStorage | undefined;
  events?: Pick<EventTarget, "addEventListener" | "removeEventListener" | "dispatchEvent"> | undefined;
  browser?: SpeechConsent;
  cloud?: SpeechConsent;
  record?: Pick<BrowserSpeechRecord, "forget">;
} = {}): SpeechChoiceStore {
  const CHANGED = `${SPEECH_CHOICE_KEY}-change`;
  let visit: SpeechChoice | null | undefined;
  const read = (): SpeechChoice | null => {
    if (visit !== undefined) return visit;
    try {
      const value = storage()?.getItem(SPEECH_CHOICE_KEY);
      return isChoice(value) ? value : null;
    } catch {
      return null;
    }
  };
  const write = (value: SpeechChoice | null) => {
    try {
      const store = storage();
      if (!store) throw new Error("No storage");
      if (value) store.setItem(SPEECH_CHOICE_KEY, value);
      else store.removeItem(SPEECH_CHOICE_KEY);
      visit = undefined;
    } catch {
      visit = value;
    }
    events?.dispatchEvent(new Event(CHANGED));
  };
  return {
    chosen: read,
    choose(choice) {
      if (choice === "browser") { browser.agree(); cloud.withdraw(); record.forget(); }
      else if (choice === "cloud") { cloud.agree(); browser.withdraw(); }
      else { browser.withdraw(); cloud.withdraw(); }
      write(choice);
    },
    clear: () => write(null),
    subscribe(listener) {
      if (!events) return () => {};
      const storageChange = (event: Event) => {
        if (!("key" in event) || event.key === SPEECH_CHOICE_KEY || event.key === null) listener();
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

/** A choice held in memory: for examples and tests. */
export function memorySpeechChoice(initial: SpeechChoice | null = null): SpeechChoiceStore {
  let value = initial;
  const listeners = new Set<() => void>();
  const set = (next: SpeechChoice | null) => { if (value === next) return; value = next; for (const listener of listeners) listener(); };
  return { chosen: () => value, choose: set, clear: () => set(null),
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); } };
}

let device: SpeechChoiceStore | undefined;
/** This browser's choice, shared by Settings and every page with Talk It Out. */
export function deviceSpeechChoice(): SpeechChoiceStore {
  return (device ??= storedSpeechChoice());
}
