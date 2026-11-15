import { speechConstructor, speechStatus, type SpeechConstructor } from "./speech.ts";

/**
 * Where speech on this device stands for one language. A speech pack that the browser manages is
 * a local browser capability (D32), so Weave may ask the browser to set one up after a tap. Weave
 * downloads no model of its own and sends audio nowhere (the user's decision of 15 November 2026).
 */
export type SpeechSetupState =
  /** The browser has not answered yet, so nothing about speech shows. */
  | "checking"
  /** This browser cannot recognize speech on the device, so the page does not offer it. */
  | "none"
  /** Not in this language, though another may work, so the language choice stays. */
  | "language"
  /** The browser can set up speech for this language after a tap. */
  | "offer"
  /** The browser is setting it up. It reports no progress, so the page says only that it is under way. */
  | "installing"
  /** Still under way after a long wait. */
  | "slow"
  /** The browser could not set it up. Setup can be tried again, and typing still works. */
  | "failed"
  /** Speak works. */
  | "ready";

/** Setting up speech is on offer or under way, so the setup takes Speak's place. */
export const offersSetup = (state: SpeechSetupState): boolean =>
  state === "offer" || state === "installing" || state === "slow" || state === "failed";

/**
 * A language that every browser recognizing speech on the device covers. When it is unavailable
 * too, the browser has no on-device speech at all, as Brave, Safari and Chrome on Android answer,
 * so the page shows no voice controls rather than a language choice that cannot help.
 */
const ANY_SPEECH = "en-US";

/** What a page can offer for one language before the person taps anything. */
export async function speechSupport(
  language: string,
  speech = speechConstructor(),
): Promise<"none" | "language" | "offer" | "ready"> {
  const status = await speechStatus(language, speech);
  if (status === "available") return "ready";
  if (status !== "unavailable") return typeof speech?.install === "function" ? "offer" : "language";
  const elsewhere = language === ANY_SPEECH ? status : await speechStatus(ANY_SPEECH, speech);
  return elsewhere === "unavailable" ? "none" : "language";
}

/**
 * Asks the browser to set up its speech pack for one language, and answers true once it is ready.
 * Call it from the tap itself: Chrome downloads only for a page the person has just tapped and
 * refuses otherwise. Chrome also answers false unless the question asks for recognition on the
 * device. It reports no progress or size, sets no time limit and does not say why it failed.
 */
export function installSpeech(language: string, speech: SpeechConstructor): Promise<boolean> {
  try {
    return Promise.resolve(speech.install?.({ langs: [language], processLocally: true })).then(
      (installed) => installed === true,
      () => false,
    );
  } catch {
    return Promise.resolve(false);
  }
}

/** How long setting up may run before the page says it is taking a while. */
export const SLOW_SETUP_MS = 2 * 60 * 1000;

/** Waits, then runs; the answer stops the wait. */
export type Wait = (then: () => void, milliseconds: number) => () => void;
const wait: Wait = (then, milliseconds) => {
  const timer = setTimeout(then, milliseconds);
  return () => clearTimeout(timer);
};

/** Speech on this device for each language a page asks about, shared by the pages of one visit. */
export interface SpeechSetupStore {
  /** Where speech stands for one language: "checking" until the browser first answers. */
  state(language: string): SpeechSetupState;
  subscribe(listener: () => void): () => void;
  /** Asks the browser again, as a page opens or the language changes. A setup under way is left to finish. */
  check(language: string): void;
  /** Sets up speech for one language. Call it from the tap: see `installSpeech`. */
  setUp(language: string): void;
}

export function speechSetupStore({
  speech = speechConstructor(),
  slowAfter = SLOW_SETUP_MS,
  later = wait,
}: { speech?: SpeechConstructor; slowAfter?: number; later?: Wait } = {}): SpeechSetupStore {
  const states = new Map<string, SpeechSetupState>();
  const asking = new Set<string>();
  const listeners = new Set<() => void>();
  const state = (language: string): SpeechSetupState => states.get(language) ?? "checking";
  const underWay = (language: string) => state(language) === "installing" || state(language) === "slow";
  const publish = (language: string, next: SpeechSetupState) => {
    if (states.get(language) === next) return;
    states.set(language, next);
    for (const listener of listeners) listener();
  };
  return {
    state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    check(language) {
      if (asking.has(language) || underWay(language)) return;
      asking.add(language);
      void speechSupport(language, speech).then((support) => {
        asking.delete(language);
        if (!underWay(language)) publish(language, support);
      });
    },
    setUp(language) {
      const current = state(language);
      if (!speech || (current !== "offer" && current !== "failed")) return;
      // Asked before anything else, while the tap still counts.
      const installing = installSpeech(language, speech);
      publish(language, "installing");
      const stopWaiting = later(() => {
        if (state(language) === "installing") publish(language, "slow");
      }, slowAfter);
      void installing.then(async () => {
        stopWaiting();
        // Speak starts only on the browser's own "available", whatever the setup answered.
        publish(language, (await speechStatus(language, speech)) === "available" ? "ready" : "failed");
      });
    },
  };
}

/** What Voice input shows for where speech stands. */
export interface VoiceControls {
  /** Where the browser cannot recognize speech on the device, Voice input does not show at all. */
  readonly shown: boolean;
  /** Its one button: Speak, the offer to set up speech, or the setup under way. */
  readonly action: "speak" | "set-up" | "setting-up" | null;
  /** What the button says when it is not Speak. */
  readonly label: string;
  /** One plain sentence under the button, or nothing. */
  readonly note: string;
}
const SET_UP = "Set up speech on this device";
const SETTING_UP = "Setting up speech";
const HIDDEN: VoiceControls = { shown: false, action: null, label: "", note: "" };

/**
 * The words and the one button for each state. The setup keeps one button in one place, so the
 * focus stays on it from Set up to Speak. `setUpHere` is true on the page that asked for the
 * setup, which alone says that speech is ready. While the browser answers for a newly chosen
 * language (`asking`), only the language choice shows, in the place the last answer gave it.
 */
export function voiceControls(
  state: SpeechSetupState,
  {
    listening = false,
    setUpHere = false,
    asking = false,
  }: { listening?: boolean; setUpHere?: boolean; asking?: boolean } = {},
): VoiceControls {
  if (listening)
    return { shown: true, action: "speak", label: "", note: "Listening on this device. Audio is not sent to a server." };
  if (asking) return { ...HIDDEN, shown: voiceControls(state).shown };
  switch (state) {
    case "checking":
    case "none":
      return HIDDEN;
    case "language":
      return {
        shown: true,
        action: null,
        label: "",
        note: "Local speech is not available for this language. You can type below.",
      };
    case "offer":
      return {
        shown: true,
        action: "set-up",
        label: SET_UP,
        note: "Your browser may download speech files for this language first. Audio stays on this device.",
      };
    case "installing":
      return {
        shown: true,
        action: "setting-up",
        label: SETTING_UP,
        note: "Setting up speech on this device. You can type while you wait.",
      };
    case "slow":
      return {
        shown: true,
        action: "setting-up",
        label: SETTING_UP,
        note: "Still setting up. Your browser does not say how long it takes; you can type in the meantime.",
      };
    case "failed":
      return {
        shown: true,
        action: "set-up",
        label: SET_UP,
        note: "Your browser could not set up speech on this device. You can type below or try again.",
      };
    case "ready":
      return {
        shown: true,
        action: "speak",
        label: "",
        note: setUpHere ? "Speech is ready. Audio stays on this device." : "",
      };
  }
}
