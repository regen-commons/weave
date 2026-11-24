import { CLOUD_SPEECH } from "@weave/api/transcribe-contract";
import { speechConstructor, speechStatus, wait, type SpeechConstructor, type SpeechMode, type SpeechProblem, type Wait } from "./speech.ts";
import { cloudSpeechAvailable } from "./speech-cloud.ts";
export type { Wait } from "./speech.ts";

/**
 * Where speech stands for one language, in the owner's order of preference (19 November 2026):
 * speech on this device first, including the browser's own speech pack set up after a tap (D32);
 * otherwise the browser's own speech service, after the person agrees, because that service may
 * send the audio to the browser vendor; otherwise no talking, and on a touch screen a line about
 * the keyboard's own microphone key. Weave downloads no model.
 *
 * Since 23 November 2026 there is one more step before "no talking": where the browser has no
 * speech recognition at all and the server has cloud speech switched on, a person who agrees can
 * record what they say and have the recording turned into text by the provider the notice names
 * (`speech-cloud.ts`). That is the only case in which Weave records or sends audio.
 */
export type SpeechSetupState =
  /** The browser has not answered yet, so nothing about speech shows. */
  | "checking"
  /** This browser has no speech recognition at all, as in Firefox, and cloud speech is not on offer. */
  | "none"
  /** No speech recognition at all, but the page can record and cloud speech is on. Talking asks first. */
  | "cloud"
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
  state === "ready" ? "device" : state === "browser" ? "browser" : state === "cloud" ? "cloud" : null;

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
  cloud = cloudSpeechAvailable,
}: {
  /** null: a browser with no speech recognition at all. */
  speech?: SpeechConstructor | null;
  slowAfter?: number;
  later?: Wait;
  touch?: boolean;
  /**
   * Whether cloud speech can be offered: the browser can record and the server has it on. Asked
   * only where the browser has no speech recognition at all, so no other browser calls the
   * server. A failure to answer counts as no.
   */
  cloud?: () => Promise<boolean>;
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
      void speechSupport(language, speech)
        .then(async (support) => (support === "none" && (await cloud().catch(() => false)) ? "cloud" : support))
        .then((support) => {
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

/**
 * Said beside Talk It Out before the person agrees to cloud speech. Unlike the browser's service,
 * Weave knows who turns the recording into text, so the line names the company.
 */
export const CLOUD_SPEECH_NOTE = `Weave can turn a recording of your voice into text with ${CLOUD_SPEECH.company}. It asks first.`;

/**
 * The notice before the first recording on a device. Each sentence is what the code does or what
 * the provider states: the page records and sends the recording once, on Stop or at the time
 * limit, through Weave's own server
 * (`speech-cloud.ts`, `@weave/api/transcribe`), Weave stores neither the recording nor the words
 * there, and the two things only the provider can know are given as what it says. Cloudflare can
 * run a request in any of its regions, so the notice does not name a place.
 */
export const CLOUD_SPEECH_NOTICE = {
  title: "Send Your Recording To Be Turned Into Text?",
  body: [
    `This browser cannot turn speech into text on this device. Weave can record what you say and, when you press Stop or the recording reaches its limit of ${CLOUD_SPEECH.maxSeconds / 60} minutes at most, send it to ${CLOUD_SPEECH.provider}, which turns it into text with the ${CLOUD_SPEECH.model} model.`,
    `Weave does not keep the recording. ${CLOUD_SPEECH.company} says it does not keep it or use it to train models. It may be processed outside your country.`,
    "Only the recording and the language you chose are sent. Typing always works instead. You can turn this off in Settings.",
  ],
  agree: "Agree And Record",
  decline: "Not Now",
} as const;

/** What Settings says about each agreement, and the one action that withdraws it. */
export const SPEECH_SETTING = {
  agreed:
    "Where speech on this device is not available, your browser's speech service turns your voice into text. Weave does not receive the audio.",
  notAgreed:
    "Talking uses speech on this device where your browser offers it. Anywhere else, Weave asks before your voice leaves this device.",
  withdraw: "Stop Using Browser Speech",
  cloudAgreed: `Where this browser cannot turn speech into text, Weave sends your recording to ${CLOUD_SPEECH.provider} to turn it into text. Weave does not keep it.`,
  withdrawCloud: "Stop Using Cloud Speech",
} as const;

/**
 * The one line Settings says about speech: each agreement in force, or that Weave asks first.
 * It is one status line, so withdrawing an agreement is heard as the line it leaves behind.
 */
export const speechSettingLine = (browser: boolean, cloud: boolean): string =>
  [browser && SPEECH_SETTING.agreed, cloud && SPEECH_SETTING.cloudAgreed].filter(Boolean).join(" ") || SPEECH_SETTING.notAgreed;

/**
 * What Settings says about the recordings this device has sent, from the device's own record
 * (`speech-cloud-log.ts`). Empty where none was sent. It stays after the agreement is withdrawn:
 * the recordings were still sent.
 */
export function cloudSpeechUseLine(uses: readonly { at: string }[]): string {
  const last = uses.at(-1);
  if (!last) return "";
  const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(new Date(last.at));
  return uses.length === 1
    ? `This device has sent 1 recording to be turned into text, on ${day}.`
    : `This device has sent ${uses.length} recordings to be turned into text, the last on ${day}.`;
}

/** The longest one recording runs, as Talk It Out shows it: "3:00". */
export const recordingTime = (seconds: number): string => {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
};
/**
 * The box's label while cloud speech records: the time used and the time one recording may take.
 * Until the browser has opened the microphone, which can wait on its own question to the person,
 * nothing is being recorded yet, and the label says so. An example, which records nothing, has
 * no time to count and says only Recording.
 */
export const recordingLabel = (
  phase: "starting" | "recording" | "example",
  elapsedSeconds = 0,
  maxSeconds: number = CLOUD_SPEECH.maxSeconds,
): string =>
  phase === "starting"
    ? "Waiting for the microphone"
    : phase === "example"
      ? "Recording"
      : `Recording ${recordingTime(Math.min(elapsedSeconds, maxSeconds))} of ${recordingTime(maxSeconds)}`;

/** Drops the recording being made, unsent. Shown beside the line only while cloud speech records. */
export const DISCARD_RECORDING = "Discard";

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
    starting = false,
    setUpHere = false,
    asking = false,
    secondary = false,
    agreed = false,
    touch = false,
  }: {
    listening?: boolean;
    /** Stop was pressed and the recognizer has not ended yet. Only read while listening. */
    stopping?: boolean;
    /** Cloud speech only: the browser has not opened the microphone yet, so nothing is being recorded. */
    starting?: boolean;
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
    return {
      ...SILENT,
      action: "finishing",
      label: "Finishing",
      // The recording leaves the device only now, and the line says where it goes.
      note: mode === "cloud" ? `Sending your recording to ${CLOUD_SPEECH.company} to be turned into text.` : "Finishing your words.",
      mode,
    };
  if (listening)
    return {
      ...SILENT,
      action: "stop",
      label: "Stop",
      note:
        mode === "cloud"
          ? starting
            ? "Waiting for the microphone. Nothing is recorded yet."
            : // Short, so Discard fits beside it in the room the line always keeps.
              "Recording. Nothing is sent yet."
          : mode === "browser"
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
    case "cloud":
      return agreed
        ? { ...SILENT, action: "talk", label: "Talk It Out", language: true, mode }
        : { ...SILENT, action: "talk", label: "Talk It Out", note: CLOUD_SPEECH_NOTE, mode, agreement: true };
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
 * keyboard's microphone key. Every code has a line: a session the page itself ends never reaches
 * the page, so whatever does reach it is news to the person, and an empty line read as nothing
 * having happened (23 November 2026).
 */
export function speechProblem(problem: SpeechProblem, mode: SpeechMode, touch = false): string {
  const instead = touch
    ? "If your keyboard has a microphone key, you can use it, or type in the box."
    : "Your words are still here, and you can type in the box.";
  switch (problem) {
    // The browser ended the session itself, as some phones do when another app takes the microphone.
    case "aborted":
      return "Your browser stopped listening. Press Talk It Out to try again, or type in the box.";
    // Cloud speech only: Stop came while the browser was still asking about the microphone.
    case "stopped-early":
      return "The microphone was not ready, so nothing was recorded or sent. Try again, or type in the box.";
    case "not-allowed":
      return "Your browser did not allow the microphone here. Your words are still here, and you can type in the box.";
    case "audio-capture":
      return "Your browser could not use a microphone. Check that one is connected, or type in the box.";
    // Also how a session ends when Stop brought no words at all (`speech.ts`).
    case "no-speech":
      return "No speech was heard. Check your microphone and try again, or type in the box.";
    case "network":
      return mode === "browser"
        ? `Your browser's speech service could not be reached. ${instead}`
        : "Speech on this device stopped. Your words are still here, and you can type in the box.";
    case "service-not-allowed":
      return `Your browser's speech service does not work here. ${instead}`;
    case "language-not-supported":
      return "Speech for this language is not available. Choose another language, or type in the box.";
    case "withdrawn":
      return mode === "cloud"
        ? "Cloud speech was turned off in Settings. Nothing was sent, and you can type in the box."
        : "Browser speech was turned off in Settings. Your words are still here, and you can type in the box.";
    // Turned off while the recording was on its way. It was cancelled, but may already have arrived.
    case "withdrawn-sending":
      return "Cloud speech was turned off in Settings while the recording was being sent. No words were added, and you can type in the box.";
    case "discarded":
      return "The recording was discarded. Nothing was sent. Press Talk It Out to try again, or type in the box.";
    // The microphone went away mid-recording. The person did not press Stop, so nothing is sent.
    case "cloud-interrupted":
      return "The microphone stopped, so the recording was dropped. Nothing was sent. Press Talk It Out to try again, or type in the box.";
    // Cloud speech (`speech-cloud.ts`). The recording is dropped in every one of these.
    case "cloud-offline":
      return "You are offline, so the recording could not be sent. It was not kept. You can type in the box.";
    case "cloud-unreachable":
      return "The recording could not be sent. It was not kept. Try again, or type in the box.";
    case "cloud-busy":
      return `${CLOUD_SPEECH.company} is busy right now, so the recording was not turned into text. It was not kept. Try again in a moment, or type in the box.`;
    case "cloud-limit":
      return "Cloud speech has reached its limit for today. The recording was not kept. You can type in the box.";
    case "cloud-off":
      return "Cloud speech is not available right now. The recording was not kept. You can type in the box.";
    case "cloud-too-long":
      return "That recording was too long to send. It was not kept. Say it in shorter parts, or type in the box.";
    case "cloud-unreadable":
      return "The recording could not be read. It was not kept. Try again, or type in the box.";
    case "cloud-failed":
      return "The recording could not be turned into text. It was not kept. Try again, or type in the box.";
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
    : mode === "cloud"
      ? "Recording did not start. Nothing was sent, and you can type in the box."
      : "Your browser's speech service did not start. You can type in the box.";
