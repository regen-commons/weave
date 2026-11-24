import { cloudSpeechAvailable, startCloudSpeech } from "./speech-cloud.ts";
import type { SpeechConsent } from "./speech-consent.ts";
import { deviceSpeechRecord, type BrowserSpeechRecord } from "./speech-fallback.ts";

export interface SpeechEvent {
  results: ArrayLike<{ isFinal: boolean; [index: number]: { transcript: string } | undefined }>;
}
export interface LocalSpeechSession {
  /** Absent where the browser cannot recognize speech on the device, as in Safari. */
  processLocally?: boolean;
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  /** The recognizer has begun listening. A browser fires it only once the microphone is open. */
  onstart?: (() => void) | null;
  onaudiostart?: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
/** Every question about speech names one language and asks for recognition on the device only. */
export interface LocalSpeechOptions {
  langs: string[];
  processLocally: true;
}
export interface SpeechConstructor {
  new (): LocalSpeechSession;
  prototype: object;
  /** The browser's answer is read as data: see `speechStatus`. Absent where the browser has no on-device question, as in Safari. */
  available?(options: LocalSpeechOptions): Promise<unknown>;
  /** Asks the browser to set up its own speech pack. Absent where the browser cannot. */
  install?(options: LocalSpeechOptions): Promise<unknown>;
}
export const speechConstructor = (): SpeechConstructor | undefined => {
  const scope = globalThis as unknown as {
    SpeechRecognition?: SpeechConstructor;
    webkitSpeechRecognition?: SpeechConstructor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
};
/** The four answers of `SpeechRecognition.available()` in the Web Speech API. */
export type SpeechStatus = "unavailable" | "downloadable" | "downloading" | "available";
const STATUSES: readonly SpeechStatus[] = ["unavailable", "downloadable", "downloading", "available"];
/**
 * What the browser says about recognizing one language on the device. A browser without the
 * question, one that fails to answer and any other answer all count as unavailable. Chrome tells a
 * site that has not set up a language "downloadable" even when its pack is already on the device,
 * so the answer does not promise a download.
 */
export async function speechStatus(
  language: string,
  constructor: SpeechConstructor | null | undefined = speechConstructor(),
): Promise<SpeechStatus> {
  try {
    if (!constructor || !("processLocally" in constructor.prototype) || typeof constructor.available !== "function")
      return "unavailable";
    const answer = await constructor.available({ langs: [language], processLocally: true });
    return STATUSES.find((status) => status === answer) ?? "unavailable";
  } catch {
    return "unavailable";
  }
}
export async function availableSpeech(
  language: string,
  constructor: SpeechConstructor | null | undefined = speechConstructor(),
): Promise<boolean> {
  return (await speechStatus(language, constructor)) === "available";
}
/**
 * Which recognizer a session uses, and so where the audio goes. The two never mix: a session is
 * one mode from its start to its end, and a failure in one never starts the other.
 * - `device`: the browser recognizes speech on this device (`processLocally = true`). Audio stays here.
 * - `browser`: the browser's own speech service, which may send the audio to the browser vendor.
 *   Only with the person's agreement (`speech-consent.ts`).
 * - `cloud`: where the browser cannot turn speech into text itself, a recording made in the page
 *   and sent once, on Stop, through Weave to the provider its notice names (`speech-cloud.ts`).
 *   Only with the person's own, separate agreement. No words come back until Stop.
 */
export type SpeechMode = "device" | "browser" | "cloud";

/**
 * Why a session stopped early: the Web Speech API's error codes as the browser gives them,
 * `withdrawn` when the person turned that way of talking off while it listened, and the
 * `cloud-` codes of `speech-cloud.ts`. Read as data, so an unknown code is kept and said plainly
 * as a microphone that could not continue.
 */
export type SpeechProblem = string;

/** Waits, then runs; the answer stops the wait. */
export type Wait = (then: () => void, milliseconds: number) => () => void;
export const wait: Wait = (then, milliseconds) => {
  const timer = setTimeout(then, milliseconds);
  return () => clearTimeout(timer);
};

/**
 * How long a session may take, after the person's Stop, to hand over its last words when it has
 * already given some. A recognizer finishes the audio it has heard and then ends, usually well
 * inside this. One that never ends, or takes longer, is ended here with the words it has given,
 * so Stop always finishes (DL-133).
 */
export const STOP_WAIT_MS = 2500;
/**
 * How long Stop waits instead where the recognizer had shown no words by the time Stop was
 * pressed. Some recognizers show nothing while the person talks and hand over every word only
 * after Stop, as a slow phone or a far speech service can; ending them at STOP_WAIT_MS threw all
 * the words away. Past this a session ends, with any words it was given, or saying no speech came
 * through. Talk It Out shows Finishing this long at most.
 */
export const STOP_WAIT_NO_WORDS_MS = 10000;

/**
 * How long a session took, kept where the browser's own tools can read it and nowhere else:
 * `performance.getEntriesByType("measure")` in the console lists them after a session, on any
 * device. `weave-speech-first-words` runs from the start to the first words heard, and
 * `weave-speech-stop` from the person's Stop to the recognizer's end.
 */
export const SPEECH_MEASURES = { firstWords: "weave-speech-first-words", stop: "weave-speech-stop" } as const;
function measure(name: string, start: number | undefined): void {
  try {
    if (start !== undefined) globalThis.performance?.measure?.(name, { start, end: globalThis.performance.now() });
  } catch {
    /* A browser without the measure options keeps no record. Speech is not affected. */
  }
}
const now = (): number | undefined => globalThis.performance?.now?.();

/**
 * How long the microphone must have been open in a session of the browser's own speech service,
 * with no words back by Stop, before the service is taken as not answering. A person who has talked
 * this long to a working service has seen words; a shorter silence may only be a quick Stop.
 */
export const SERVICE_SILENT_MS = 3000;

export interface SpeechCallbacks {
  result(finalText: string, interimText: string): void;
  error(problem: SpeechProblem): void;
  /** `requested` is true after the person's own Stop, false when the recognizer ended by itself. */
  end(requested: boolean): void;
}

export async function startSpeech(
  mode: SpeechMode,
  language: string,
  callbacks: SpeechCallbacks,
  {
    speech = speechConstructor(),
    consent,
    signal,
    stopWait = STOP_WAIT_MS,
    noWordsWait = STOP_WAIT_NO_WORDS_MS,
    later = wait,
    record = deviceSpeechRecord(),
    cloudOffered = cloudSpeechAvailable,
    clock = () => globalThis.performance?.now?.() ?? Date.now(),
  }: {
    speech?: SpeechConstructor | null;
    /** Required for `browser` and `cloud`: a session starts only while it says the person agreed to that mode. */
    consent?: SpeechConsent;
    signal?: AbortSignal;
    /** How long the recognizer may take to end after Stop, once it has given words, before the session is ended for it. */
    stopWait?: number;
    /** The same while it has given none. */
    noWordsWait?: number;
    later?: Wait;
    /** Whether the browser's own speech service has worked on this device (`speech-fallback.ts`). */
    record?: BrowserSpeechRecord;
    /** Whether cloud speech can be offered here, asked only while the browser's service is untried. */
    cloudOffered?: () => Promise<boolean>;
    clock?: () => number;
  } = {},
): Promise<{ stop(): void; dispose(): void }> {
  // Cloud speech records in the page and has its own session: nothing below runs for it.
  if (mode === "cloud") return startCloudSpeech(language, callbacks, { consent, signal });
  if (!speech) throw new Error("This browser has no speech recognition.");
  if (mode === "device" && !(await availableSpeech(language, speech)))
    throw new Error("Local speech is not ready. You can type below.");
  if (mode === "browser" && !consent?.agreed()) throw new Error("Browser speech needs the person's agreement first.");
  signal?.throwIfAborted();
  const session = new speech();
  // On the device, the browser must not send audio anywhere. The browser's own service is left to
  // the browser's default, which the specification lets it run elsewhere.
  if (mode === "device") session.processLocally = true;
  session.lang = language;
  session.continuous = true;
  session.interimResults = true;
  let disposed = false;
  let requested = false;
  let withdrawn: (() => void) | undefined;
  let stopWaiting: (() => void) | undefined;
  let startedAt: number | undefined;
  let stoppedAt: number | undefined;
  let heard = false;
  /** When the microphone opened, by `clock`. Unset while the browser has not opened it, as while it asks. */
  let opened: number | undefined;
  let stopPressed: number | undefined;
  /**
   * The browser's own service has not given words on this device yet, so a failure now may mean it
   * cannot work here. Whether cloud speech could take its place is asked as the session starts, so
   * the answer is there when a failure is said.
   */
  const untried = mode === "browser" && record.state() !== "worked";
  let offered = false;
  if (untried) void cloudOffered().then((yes) => (offered = yes), () => {});
  /** The browser's service failed before it ever worked here: noted, and cloud speech offered where it can be. */
  const serviceFailed = (problem: SpeechProblem): SpeechProblem => {
    record.failed();
    return offered ? "browser-failed" : problem;
  };
  /**
   * The recognizer's latest results hold words, final or not, so the page has something to show
   * and keep. A recognizer can revise its words to nothing, so this follows the latest results.
   */
  let words = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    signal?.removeEventListener("abort", dispose);
    withdrawn?.();
    stopWaiting?.();
    session.onresult = null;
    session.onerror = null;
    session.onend = null;
    session.onstart = null;
    session.onaudiostart = null;
    session.abort();
  };
  const fail = (problem: SpeechProblem) => {
    if (disposed) return;
    callbacks.error(problem);
    dispose();
    callbacks.end(false);
  };
  signal?.addEventListener("abort", dispose, { once: true });
  // Withdrawing the agreement, here or in another tab, stops the browser's service at once.
  if (mode === "browser" && consent)
    withdrawn = consent.subscribe(() => {
      if (!consent.agreed()) fail("withdrawn");
    });
  session.onresult = (event) => {
    if (disposed) return;
    if (!heard) {
      heard = true;
      measure(SPEECH_MEASURES.firstWords, startedAt);
    }
    const final: string[] = [],
      interim: string[] = [];
    for (let index = 0; index < event.results.length; index++) {
      const item = event.results[index];
      if (item) (item.isFinal ? final : interim).push(item[0]?.transcript ?? "");
    }
    const finalText = final.join(" ").trim();
    const interimText = interim.join(" ").trim();
    words = Boolean(finalText || interimText);
    if (words && untried && record.state() !== "worked") record.worked();
    callbacks.result(finalText, interimText);
  };
  const open = () => {
    opened ??= clock();
  };
  session.onstart = open;
  session.onaudiostart = open;
  session.onerror = (event) => {
    const problem = typeof event?.error === "string" ? event.error : "unknown";
    // A browser that answers the person's own Stop with "aborted" has not stopped by itself.
    if (requested && problem === "aborted") return disposed ? undefined : stopped();
    // The service could not be reached, or is not allowed here, before it ever worked: as in Brave.
    if (untried && record.state() !== "worked" && (problem === "network" || problem === "service-not-allowed"))
      return fail(serviceFailed(problem));
    fail(problem);
  };
  /**
   * The end of a session the person stopped. One that brought no words says so, so the page always
   * has a line to show: an empty box and an empty line looked like nothing happened.
   */
  const stopped = () => {
    measure(SPEECH_MEASURES.stop, stoppedAt);
    if (words) {
      dispose();
      return callbacks.end(true);
    }
    // The browser never opened the microphone, as while it still asks the person about it.
    if (opened === undefined) return fail("no-microphone");
    // The microphone was open long enough to hear words, and the browser's service gave none back.
    const listened = (stopPressed ?? clock()) - opened;
    if (untried && record.state() !== "worked" && listened >= SERVICE_SILENT_MS) return fail(serviceFailed("no-speech"));
    fail("no-speech");
  };
  session.onend = () => {
    if (disposed) return;
    if (requested) return stopped();
    // Ended by itself, as after a pause. The page says listening stopped, with or without words.
    dispose();
    callbacks.end(false);
  };
  try {
    startedAt = now();
    session.start();
  } catch (error) {
    dispose();
    throw error;
  }
  return {
    stop: () => {
      if (disposed || requested) return;
      requested = true;
      stoppedAt = now();
      stopPressed = clock();
      // Words already shown when the person pressed Stop. Only then can the session end at the
      // usual deadline without losing what the person said.
      const shown = words;
      session.stop();
      // The recognizer ends by itself once it has handed over its last words. If it has not by
      // the deadline, the session ends here: the words already given are with the page. Where it
      // had shown none by Stop, ending then would lose what it is still handing over, even if it
      // has begun, so Stop waits for longer before it gives up.
      stopWaiting = later(() => {
        if (disposed) return;
        if (shown) return stopped();
        stopWaiting = later(() => {
          if (!disposed) stopped();
        }, Math.max(0, noWordsWait - stopWait));
      }, stopWait);
    },
    dispose,
  };
}
