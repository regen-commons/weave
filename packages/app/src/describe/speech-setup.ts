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

/** What Talk it out shows in its button's place and in the one line under it (DL-110). */
export interface TalkControls {
  /** The one button, or null where a plain line or nothing stands in its place. */
  readonly action: "talk" | "stop" | "set-up" | "setting-up" | null;
  readonly label: string;
  /** One plain sentence in the reserved line under the button. Empty when there is nothing to say. */
  readonly note: string;
  /** Another language may work, so the language choice is offered. */
  readonly language: boolean;
}
/** Said in one plain line where the browser has no speech on the device. The typed path is the same box. */
export const NO_SPEECH = "Talking needs speech on this device, and this browser does not offer it. You can type instead.";

/**
 * The button and the line for each state of speech. The button keeps its place from Set up to
 * Talk it out to Stop, so pressing it never moves the page. Where the browser has no speech on
 * the device (Brave, Safari, Chrome on Android: DL-076), a plain line says so in the button's
 * place; the option is never hidden without a word.
 */
export function talkControls(
  state: SpeechSetupState,
  {
    listening = false,
    setUpHere = false,
    asking = false,
    secondary = false,
  }: {
    listening?: boolean;
    setUpHere?: boolean;
    asking?: boolean;
    /**
     * A second Talk it out on the same page. The first offers the speech setup and says the one
     * line about a browser without speech, so this one shows nothing until talking works.
     */
    secondary?: boolean;
  } = {},
): TalkControls {
  if (listening)
    return { action: "stop", label: "Stop", note: "Listening on this device. Audio is not sent to a server.", language: false };
  if (secondary && (asking || state !== "ready")) return { action: null, label: "", note: "", language: false };
  if (asking) return { action: null, label: "", note: "Checking speech for this language.", language: true };
  switch (state) {
    case "checking":
      return { action: null, label: "", note: "", language: false };
    case "none":
      return { action: null, label: "", note: NO_SPEECH, language: false };
    case "language":
      return {
        action: null,
        label: "",
        note: "Speech on this device does not cover this language. Choose another, or type instead.",
        language: true,
      };
    case "offer":
      return {
        action: "set-up",
        label: "Set Up Speech On This Device",
        note: "Your browser may download speech files for this language first. Audio stays on this device.",
        language: true,
      };
    case "installing":
      return { action: "setting-up", label: "Setting Up Speech", note: "Setting up speech on this device. You can type while you wait.", language: false };
    case "slow":
      return {
        action: "setting-up",
        label: "Setting Up Speech",
        note: "Still setting up. Your browser does not say how long it takes. You can type in the meantime.",
        language: false,
      };
    case "failed":
      return {
        action: "set-up",
        label: "Set Up Speech On This Device",
        note: "Your browser could not set up speech on this device. You can type instead, or try again.",
        language: true,
      };
    case "ready":
      return { action: "talk", label: "Talk It Out", note: setUpHere ? "Speech is ready. Audio stays on this device." : "", language: true };
  }
}

/**
 * How Talk It Out holds its button while it may not start a new session: while the words fill
 * the fields, or on a full list. Away from the focus it is plainly disabled. With the focus on it,
 * as after Stop pressed with the keyboard, it stays focusable and declines the press instead,
 * because a disabled button would drop the focus to the page.
 */
export function talkHold(
  action: TalkControls["action"],
  { working, disabled, focused }: { working: boolean; disabled: boolean; focused: boolean },
): "free" | "held" | "disabled" {
  if (action !== "talk" || !(working || disabled)) return "free";
  return focused ? "held" : "disabled";
}
