import { CLOUD_SPEECH } from "@weave/api/transcribe-contract";
import { speechConstructor, speechStatus, wait, type SpeechConstructor, type SpeechMode, type SpeechProblem, type Wait } from "./speech.ts";
import { cloudSpeechAvailable } from "./speech-cloud.ts";
import { deviceSpeechRecord, isBrave, type BrowserSpeechRecord } from "./speech-fallback.ts";
import { deviceSpeechChoice, type SpeechChoice, type SpeechChoiceStore } from "./speech-choice.ts";
export type { Wait } from "./speech.ts";

/**
 * Where speech stands for one language, in the owner's order of preference (19 November 2026):
 * speech on this device first, including the browser's own speech pack set up after a tap (D32);
 * otherwise the browser's own speech service, after the person agrees, because that service may
 * send the audio to the browser vendor; otherwise no talking, and on a touch screen a line about
 * the keyboard's own microphone key. Weave downloads no model.
 *
 * Since 23 November 2026 there is one more step before "no talking": where the browser cannot turn
 * speech into text itself and the server has cloud speech switched on, a person who agrees can
 * record what they say and have the recording turned into text by the provider the notice names
 * (`speech-cloud.ts`). The browser cannot when it has no speech recognition at all, or when its own
 * speech service cannot work here: Brave, or a failure this device noted (`speech-fallback.ts`).
 * That is the only case in which Weave records or sends audio.
 */
export type SpeechSetupState =
  /** The browser has not answered yet, so nothing about speech shows. */
  | "checking"
  /** The browser has no usable speech recognition here and cloud speech is unavailable. */
  | "none"
  /** The person chose Off in Settings: no talking, typing only (25 November 2026). */
  | "off"
  /**
   * The browser cannot turn speech into text itself, the page can record and cloud speech is on:
   * no speech recognition at all, or a speech service that cannot work here (`speech-fallback.ts`).
   * Talking asks first.
   */
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
export const talksHere = (state: SpeechSetupState): boolean => state !== "none" && state !== "off";

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
  /** What each way of talking can do here for one language, whatever was chosen; null until the browser answers. */
  availability(language: string): SpeechAvailability | null;
  /** Asks about every way of talking for one language, cloud speech included, as Settings does to offer them. */
  inspect(language: string): void;
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

/** What each way of talking can do here, for Settings to offer only what works (25 November 2026). */
export interface SpeechAvailability {
  /** Speech on this device: ready, can be set up after a tap, or not offered by this browser. */
  readonly device: "ready" | "offer" | "none";
  /** The browser's own speech service: present, missing, or Brave's, which has no service behind it. */
  readonly browser: "present" | "none" | "brave";
  /** The browser's service failed here before it ever gave words (`speech-fallback.ts`). */
  readonly browserFailed: boolean;
  /**
   * Cloud speech: the page can record and the server has it on. Null where nobody asked: Talk It Out asks
   * the server only where it needs to, and Settings asks to see every option (`inspect`).
   */
  readonly cloud: boolean | null;
}

export function speechSetupStore({
  speech = speechConstructor(),
  slowAfter = SLOW_SETUP_MS,
  later = wait,
  touch = touchPrimary(),
  cloud = cloudSpeechAvailable,
  record = deviceSpeechRecord(),
  brave = isBrave,
  choice = deviceSpeechChoice(),
}: {
  /** null: a browser with no speech recognition at all. */
  speech?: SpeechConstructor | null;
  slowAfter?: number;
  later?: Wait;
  touch?: boolean;
  /**
   * Whether cloud speech can be offered: the browser can record and the server has it on. Asked
   * only where the browser cannot turn speech into text itself: it has no speech recognition at
   * all, or its own speech service cannot work here (Brave, or a failure this device noted). A
   * failure to answer counts as no.
   */
  cloud?: () => Promise<boolean>;
  /** Whether the browser's own speech service has worked on this device (`speech-fallback.ts`). */
  record?: BrowserSpeechRecord;
  /** Whether this is Brave, whose recognizer has no speech service behind it. */
  brave?: () => Promise<boolean>;
  /** The way of talking the person chose in Settings, if any (`speech-choice.ts`). */
  choice?: Pick<SpeechChoiceStore, "chosen" | "clear" | "subscribe">;
} = {}): SpeechSetupStore {
  const states = new Map<string, SpeechSetupState>();
  const available = new Map<string, SpeechAvailability>();
  const availabilityChanged = new Set<string>();
  /** Languages Settings asked to see every option for, so cloud speech is asked about too. */
  const inspected = new Set<string>();
  const asking = new Set<string>();
  const listeners = new Set<() => void>();
  const state = (language: string): SpeechSetupState => states.get(language) ?? "checking";
  const underWay = (language: string) => state(language) === "installing" || state(language) === "slow";
  const publish = (language: string, next: SpeechSetupState) => {
    if (states.get(language) === next) return;
    states.set(language, next);
    for (const listener of listeners) listener();
  };
  /** Languages asked about again while an answer was on its way, so the later answer wins. */
  const again = new Set<string>();
  const offerCloud = () => cloud().catch(() => false);
  const check = (language: string) => {
    if (underWay(language)) return;
    if (asking.has(language)) {
      again.add(language);
      return;
    }
    asking.add(language);
    void speechSupport(language, speech)
      .then(async (support): Promise<SpeechSetupState> => {
        const isBrave = support !== "none" && (await brave().catch(() => false));
        const chosen = choice.chosen();
        // The server is asked about cloud speech only where Talk It Out may need it, or Settings shows every option.
        const needsCloud = inspected.has(language) || chosen === "cloud" || support === "none" || isBrave
          || (record.state() === "failed" && support === "browser");
        const cloudOn = needsCloud ? await offerCloud() : null;
        const here: SpeechAvailability = {
          device: support === "ready" || support === "offer" ? support : "none",
          browser: support === "none" ? "none" : isBrave ? "brave" : "present",
          browserFailed: record.state() === "failed",
          cloud: cloudOn,
        };
        if (JSON.stringify(available.get(language)) !== JSON.stringify(here)) { available.set(language, here); availabilityChanged.add(language); }
        // A choice made in Settings comes first, where it can work here; otherwise Talk It Out's own order.
        if (chosen === "off") return "off";
        if (chosen === "device" && here.device !== "none") return here.device;
        if (chosen === "browser" && here.browser === "present") return "browser";
        if (chosen === "cloud" && here.cloud) return "cloud";
        if (support === "ready" || support === "offer") return support;
        // Brave has no browser speech service. If cloud speech is unavailable, typing still works.
        if (support === "none" || isBrave) return cloudOn ? "cloud" : "none";
        if (here.browserFailed && cloudOn) return "cloud";
        return "browser";
      })
      .then((support) => {
        asking.delete(language);
        if (again.delete(language)) return check(language);
        if (!underWay(language)) publish(language, support);
        // Settings reads what each way of talking can do, which can change while the state stays the same.
        if (availabilityChanged.delete(language)) for (const listener of listeners) listener();
      });
  };
  // A failure noted, here or in another tab, or forgotten, changes what Talk It Out offers. A
  // language still waiting for its first answer is asked again too, so no answer from before stands.
  record.subscribe(() => {
    // Chosen in Settings and then failed here: the choice gives way, so cloud speech is offered instead.
    if (record.state() === "failed" && choice.chosen() === "browser") choice.clear();
    for (const language of new Set([...states.keys(), ...asking])) check(language);
  });
  choice.subscribe(() => {
    for (const language of new Set([...states.keys(), ...asking])) check(language);
  });
  return {
    state,
    availability: (language) => available.get(language) ?? null,
    inspect(language) {
      if (inspected.has(language)) return;
      inspected.add(language);
      check(language);
    },
    touch,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    check,
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
/** Said in Talk It Out's place where the person turned talking off in Settings. */
export const SPEECH_OFF = "Talking is off in Settings. You can type in the box.";
/** Under Set Up Speech until it is pressed: the box works whatever the setup does. */
export const TYPE_INSTEAD = "You can also type in the box below.";
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

/** One way of talking as Settings offers it: one radio option, with its notice as its own line. */
export interface SpeechOption {
  readonly key: SpeechChoice;
  readonly label: string;
  /** What choosing it means. For the browser's service and cloud speech this line is the notice: choosing is agreeing. */
  readonly note: string;
  /** Why it cannot be chosen here, or null where it can. */
  readonly unavailable: string | null;
}

/**
 * The four ways of talking Settings offers as one choice (the user's decision of 25 November 2026),
 * replacing a Stop button per agreement. An option that cannot work here stays in the list with its
 * reason, so nothing disappears without a word. The cloud option's line carries what its first-use
 * notice says (`CLOUD_SPEECH_NOTICE`), so choosing it is an informed agreement.
 */
export function speechOptions(here: SpeechAvailability | null): SpeechOption[] {
  const checking = "Checking what this browser can do.";
  return [
    { key: "device", label: "On this device",
      note: here?.device === "offer"
        ? "Your browser sets up speech for your language the first time you talk. Your voice never leaves this device."
        : "Your browser turns speech into text on this device. Your voice never leaves it.",
      unavailable: !here ? checking : here.device === "none" ? "Not available in this browser." : null },
    { key: "browser", label: "Your browser's speech service",
      note: `Your browser sends your voice to its own speech service, which turns it into text as you talk. Weave does not receive the audio.${
        here?.browserFailed ? " It did not answer on this device before; choose it to try again." : ""}`,
      unavailable: !here ? checking : here.browser === "none" ? "This browser has no speech recognition."
        : here.browser === "brave" ? "This browser has no speech service behind its recognizer." : null },
    { key: "cloud", label: `Cloud speech with ${CLOUD_SPEECH.company}`,
      note: `Weave records what you say and, when you stop, sends the recording (${CLOUD_SPEECH.maxSeconds / 60} minutes at most) to ${CLOUD_SPEECH.provider}, which turns it into text with the ${CLOUD_SPEECH.model} model. Weave does not keep the recording. ${CLOUD_SPEECH.company} says it does not keep it or use it to train models. It may be processed outside your country.`,
      unavailable: !here || here.cloud === null ? checking : here.cloud ? null : "Not available here right now." },
    { key: "off", label: "Off", note: "Talk It Out is hidden and you type instead. Nothing is recorded or sent.", unavailable: null },
  ];
}

/**
 * The option shown as chosen: the way Talk It Out uses now, which is the person's own choice wherever it
 * works here, since the intake reads the same store. Null while the browser has not answered.
 */
export function chosenSpeech(state: SpeechSetupState): SpeechChoice | null {
  if (state === "checking") return null;
  if (state === "off" || state === "none") return "off";
  const mode = speechMode(state);
  return mode === "browser" ? "browser" : mode === "cloud" ? "cloud" : "device";
}

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
    case "off":
      return { ...SILENT, note: SPEECH_OFF };
    // The button says what it does, and what the setup does waits for the press. The line's room is
    // kept, so nothing moves as speech is found on load or when the setup starts, and until the
    // press it holds a line that is true whatever the setup does (DL-127).
    case "offer":
      return { ...SILENT, action: "set-up", label: "Set Up Speech", note: TYPE_INSTEAD };
    case "installing":
      return {
        ...SILENT,
        action: "setting-up",
        label: "Setting Up Speech",
        note: "Your browser may download speech files for this language. You can type while you wait.",
      };
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
 * Whether the button's place is held, unseen, while the browser has not answered yet: on load, or
 * while a newly chosen language is asked about. Almost every answer brings a button, which on a
 * phone takes a row of its own, so the box under it would move when it came (DL-110, DL-127).
 * The second Talk It Out on a page shows nothing until talking works, so it holds nothing.
 */
export function holdsTalkRoom(state: SpeechSetupState, { asking = false, secondary = false }: { asking?: boolean; secondary?: boolean } = {}): boolean {
  return !secondary && (state === "checking" || asking);
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

/** Limits belong beside the microphone, where the person can see when to use it again. */
export function isCloudSpeechLimit(problem: SpeechProblem): boolean {
  return problem === "cloud-busy" || problem === "cloud-caller-limited" || problem === "cloud-limit";
}

/** What the page says when speech stops early. Every line leaves typing open. */
export function speechProblem(problem: SpeechProblem, mode: SpeechMode, touch = false, retryAt?: number): string {
  const instead = touch
    ? "If your keyboard has a microphone key, you can use it, or type in the box."
    : "Your words are still here, and you can type in the box.";
  const retry = () => {
    if (retryAt === undefined) return "You can type in the box.";
    // Round up so the displayed minute begins after the limit has reset.
    const time = new Intl.DateTimeFormat(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })
      .format(Math.ceil(retryAt / 60_000) * 60_000);
    return `Try again after ${time}, or type in the box.`;
  };
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
    // Stop came before the browser opened the microphone, as while it still asks about it.
    case "no-microphone":
      return "The microphone did not turn on. Allow it if your browser asks, then try again, or type in the box.";
    // The browser's own service failed before it ever worked here, and cloud speech can take its place.
    case "browser-failed":
      return `This browser's speech service did not answer. Press Talk It Out to send a recording to ${CLOUD_SPEECH.company} instead, after Weave asks, or type in the box.`;
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
      return `Cloud speech is busy right now. The recording was not kept. ${retryAt === undefined ? "Try again in a moment, or type in the box." : retry()}`;
    case "cloud-caller-limited":
      return `This connection has reached its limit for cloud speech. The recording was not kept. ${retry()}`;
    case "cloud-limit":
      return `Cloud speech has reached its daily limit. The recording was not kept. ${retry()}`;
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
