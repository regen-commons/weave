import { speechConstructor, speechStatus, wait, type SpeechConstructor, type SpeechMode, type SpeechProblem, type Wait } from "./speech.ts";
export type { Wait } from "./speech.ts";

/**
 * Where speech stands for one language, in the owner's order of preference (19 November 2026):
 * speech on this device first, including the browser's own speech pack set up after a tap (D32);
 * otherwise the browser's own speech service, after the person agrees, because that service may
 * send the audio to the browser vendor; otherwise no talking, and on a touch screen a line about
 * the keyboard's own microphone key. Weave downloads no model and records or uploads no audio.
 */
export type SpeechSetupState =
  /** The browser has not answered yet, so nothing about speech shows. */
  | "checking"
  /** This browser has no speech recognition at all, as in Firefox on Android. */
  | "none"
  /** No speech on this device for this language, but the browser has its own speech service. Talking asks first. */
  | "browser"
  /** The browser can set up speech for this language after a tap. */
  | "offer"
  /** The browser is setting it up. It reports no progress, so the page says only that it is under way. */
  | "installing"
  /** Still under way after a long wait. */
  | "slow"
  /** The browser could not set it up. Setup can be tried again, and typing still works. */
  | "failed"
  /** Speech on this device works. */
  | "ready";

/** Talking can be offered here; where it cannot, the page asks for writing. */
export const talksHere = (state: SpeechSetupState): boolean => state !== "none";

/** Which recognizer Talk It Out would use in this state, or null where it cannot be offered. */
export const speechMode = (state: SpeechSetupState): SpeechMode | null =>
  state === "ready" ? "device" : state === "browser" ? "browser" : null;

/** Setting up speech is on offer or under way, so the setup takes Speak's place. */
export const offersSetup = (state: SpeechSetupState): boolean =>
  state === "offer" || state === "installing" || state === "slow" || state === "failed";

/**
 * What a page can offer for one language before the person taps anything. Speech on this device
 * comes first. Where the browser cannot set it up, its own speech service is next, which is only
 * offered, never started: talking through it waits for the person's agreement.
 */
export async function speechSupport(
  language: string,
  speech: SpeechConstructor | null | undefined = speechConstructor(),
): Promise<"none" | "browser" | "offer" | "ready"> {
  const status = await speechStatus(language, speech);
  if (status === "available") return "ready";
  if (status !== "unavailable" && typeof speech?.install === "function") return "offer";
  return speech ? "browser" : "none";
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

/** Speech on this device for each language a page asks about, shared by the pages of one visit. */
export interface SpeechSetupStore {
  /** Where speech stands for one language: "checking" until the browser first answers. */
  state(language: string): SpeechSetupState;
  subscribe(listener: () => void): () => void;
  /** Asks the browser again, as a page opens or the language changes. A setup under way is left to finish. */
  check(language: string): void;
  /** Sets up speech for one language. Call it from the tap: see `installSpeech`. */
  setUp(language: string): void;
  /** A touch screen is the main way in, so a keyboard's microphone key may help where talking cannot. */
  readonly touch: boolean;
}

/**
 * The device is used mainly by touch. `pointer: coarse` describes the primary pointer, so a laptop
 * with a touch screen and a trackpad is not counted, and a phone with a mouse attached is.
 */
export function touchPrimary(media: ((query: string) => { matches: boolean }) | undefined = globalThis.matchMedia): boolean {
  try {
    return media?.("(pointer: coarse)").matches ?? false;
  } catch {
    return false;
  }
}

export function speechSetupStore({
  speech = speechConstructor(),
  slowAfter = SLOW_SETUP_MS,
  later = wait,
  touch = touchPrimary(),
}: {
  /** null: a browser with no speech recognition at all. */
  speech?: SpeechConstructor | null;
  slowAfter?: number;
  later?: Wait;
  touch?: boolean;
} = {}): SpeechSetupStore {
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
    touch,
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
  readonly action: "talk" | "stop" | "finishing" | "set-up" | "setting-up" | null;
  readonly label: string;
  /** One plain sentence in the reserved line under the button. Empty when there is nothing to say. */
  readonly note: string;
  /** Show the language choice beside the line, where another language may help and there is room. */
  readonly language: boolean;
  /** Which recognizer Talk It Out uses, so the words and the code can tell them apart. */
  readonly mode: SpeechMode | null;
  /** Talk It Out first asks the person to agree to the browser's speech service. */
  readonly agreement: boolean;
}

/** Said in one plain line where the browser cannot turn speech into text. The typed path is the same box. */
export const NO_SPEECH = "This browser cannot turn speech into text here. You can type instead.";
/**
 * Said instead on a touch screen, where many keyboards have their own microphone key. Not every
 * keyboard has one, so the line says "if". The keyboard's dictation is the phone's, not Weave's.
 */
export const KEYBOARD_MIC = "If your keyboard has a microphone key, you can use it to talk into the box.";
/**
 * Said beside Talk It Out before the person agrees to the browser's speech service. While it
 * listens the line says so again, and the language dialog names it, so the mode is never hidden.
 * Once agreed, the language choice takes the line's place, as it does for speech on the device:
 * both together would make the line taller than while listening, and the page would move.
 */
export const BROWSER_SPEECH_NOTE = "Your browser's speech service turns your voice into text.";

/**
 * The notice before the first use of the browser's speech service on a device. Weave cannot know
 * which company runs it, so it names none. Each sentence is what the code does: the browser sends
 * the audio, Weave gets only text (`speech.ts`), and typing never needs it.
 */
export const BROWSER_SPEECH_NOTICE = {
  title: "Use Your Browser's Speech Service?",
  body: [
    "Speech on this device is not available here. Your browser can send your voice to its own speech service, which turns it into text.",
    "Weave does not receive or keep the audio, only the words that come back. Typing always works instead.",
    "You can turn this off in Settings.",
  ],
  agree: "Agree And Talk It Out",
  decline: "Not Now",
} as const;

/** What Settings says about the agreement, and the one action that withdraws it. */
export const SPEECH_SETTING = {
  agreed:
    "Where speech on this device is not available, your browser's speech service turns your voice into text. Weave does not receive the audio.",
  notAgreed:
    "Talking uses speech on this device where your browser offers it. Anywhere else, Weave asks before using your browser's speech service.",
  withdraw: "Stop Using Browser Speech",
} as const;

const SILENT: TalkControls = { action: null, label: "", note: "", language: false, mode: null, agreement: false };

/**
 * The button and the line for each state of speech. The button keeps its place from Set up to
 * Talk it out to Stop, so pressing it never moves the page. Stop answers the press at once: the
 * button reads Finishing, with a Spinner, while the recognizer hands over its last words, which
 * can take a moment and showed nothing before (DL-133). Set Up Speech and Setting Up Speech
 * are close in width for the same reason: a longer label sent the line under the button on a wide
 * screen, and the box jumped when the setup began (DL-127). Where the browser cannot turn speech
 * into text, a plain line says so in the button's place, or on a touch screen points to the
 * keyboard's microphone key; the option is never hidden without a word. Beside a working Talk It
 * Out the keyboard line is not shown, so a page offers one way to talk at a time.
 */
export function talkControls(
  state: SpeechSetupState,
  {
    listening = false,
    stopping = false,
    setUpHere = false,
    asking = false,
    secondary = false,
    agreed = false,
    touch = false,
  }: {
    listening?: boolean;
    /** Stop was pressed and the recognizer has not ended yet. Only read while listening. */
    stopping?: boolean;
    setUpHere?: boolean;
    asking?: boolean;
    /**
     * A second Talk it out on the same page. The first offers the speech setup and says the one
     * line about a browser without speech, so this one shows nothing until talking works.
     */
    secondary?: boolean;
    /** The person agreed to the browser's speech service on this device. */
    agreed?: boolean;
    /** The device is used mainly by touch. */
    touch?: boolean;
  } = {},
): TalkControls {
  const mode = speechMode(state);
  if (listening && stopping)
    return { ...SILENT, action: "finishing", label: "Finishing", note: "Finishing your words.", mode };
  if (listening)
    return {
      ...SILENT,
      action: "stop",
      label: "Stop",
      note:
        mode === "browser"
          ? "Listening. Your browser's speech service turns your voice into text."
          : "Listening on this device. Audio is not sent to a server.",
      mode,
    };
  if (secondary && (asking || !mode)) return SILENT;
  if (asking) return { ...SILENT, note: "Checking speech for this language.", language: true };
  switch (state) {
    case "checking":
      return SILENT;
    case "none":
      return { ...SILENT, note: touch ? KEYBOARD_MIC : NO_SPEECH };
    case "offer":
      return {
        ...SILENT,
        action: "set-up",
        label: "Set Up Speech",
        note: "Your browser may download speech files for this language first. Audio stays on this device.",
      };
    case "installing":
      return { ...SILENT, action: "setting-up", label: "Setting Up Speech", note: "Downloading and setting up. You can type while you wait." };
    case "slow":
      return {
        ...SILENT,
        action: "setting-up",
        label: "Setting Up Speech",
        note: "Still setting up. Your browser does not say how long it takes. You can type meanwhile.",
      };
    case "failed":
      return {
        ...SILENT,
        action: "set-up",
        label: "Set Up Speech",
        note: "Your browser could not set up speech on this device. You can type instead, or try again.",
      };
    case "browser":
      return agreed
        ? { ...SILENT, action: "talk", label: "Talk It Out", language: true, mode }
        : { ...SILENT, action: "talk", label: "Talk It Out", note: BROWSER_SPEECH_NOTE, mode, agreement: true };
    case "ready":
      return { ...SILENT, action: "talk", label: "Talk It Out", note: setUpHere ? "Speech is ready. Audio stays on this device." : "", language: !setUpHere, mode };
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

/**
 * What the page says when a session stops early, in the status line under the box. It says only
 * what the browser reported, and every line keeps typing open. Talk It Out stays where it was, so
 * the page does not move and the focus stays on the button; pressing it again tries again. On a
 * touch screen, a service that cannot be reached or will not work here also points to the
 * keyboard's microphone key. An empty answer means nothing to say, as when the page itself
 * stopped the session.
 */
export function speechProblem(problem: SpeechProblem, mode: SpeechMode, touch = false): string {
  const instead = touch
    ? "If your keyboard has a microphone key, you can use it, or type in the box."
    : "Your words are still here, and you can type in the box.";
  switch (problem) {
    case "aborted":
      return "";
    case "not-allowed":
      return "Your browser did not allow the microphone here. Your words are still here, and you can type in the box.";
    case "audio-capture":
      return "Your browser could not use a microphone. Check that one is connected, or type in the box.";
    case "no-speech":
      return "No speech was heard. Press Talk It Out to try again, or type in the box.";
    case "network":
      return mode === "browser"
        ? `Your browser's speech service could not be reached. ${instead}`
        : "Speech on this device stopped. Your words are still here, and you can type in the box.";
    case "service-not-allowed":
      return `Your browser's speech service does not work here. ${instead}`;
    case "language-not-supported":
      return "Speech for this language is not available. Choose another language, or type in the box.";
    case "withdrawn":
      return "Browser speech was turned off in Settings. Your words are still here, and you can type in the box.";
    default:
      return "The microphone could not continue. Your words are still here, and you can type in the box.";
  }
}

/**
 * Said when the recognizer ended by itself, as the browser's speech service does after a pause.
 * `words` is whether the box holds any text. A session can end before anything is heard, so the
 * line says words are in the box only when they are.
 */
export const speechPaused = (words: boolean): string =>
  words
    ? "Listening stopped after a pause. Your words are in the box. Press Talk It Out to say more."
    : "Listening stopped after a pause. Press Talk It Out to try again, or type in the box.";

/** Said when a session could not start at all. */
export const speechNotStarted = (mode: SpeechMode): string =>
  mode === "device"
    ? "Speech is not ready on this device. You can type in the box."
    : "Your browser's speech service did not start. You can type in the box.";
