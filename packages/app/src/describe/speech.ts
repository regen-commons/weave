import type { BrowserSpeechConsent } from "./speech-consent.ts";

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
 */
export type SpeechMode = "device" | "browser";

/**
 * Why a session stopped early: the Web Speech API's error codes as the browser gives them, and
 * `withdrawn` when the person turned browser speech off while it listened. Read as data, so an
 * unknown code is kept and said plainly as a microphone that could not continue.
 */
export type SpeechProblem = string;

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
  }: {
    speech?: SpeechConstructor | null;
    /** Required for `browser`: a session starts only while it says the person agreed. */
    consent?: BrowserSpeechConsent;
    signal?: AbortSignal;
  } = {},
): Promise<{ stop(): void; dispose(): void }> {
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
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    signal?.removeEventListener("abort", dispose);
    withdrawn?.();
    session.onresult = null;
    session.onerror = null;
    session.onend = null;
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
    const final: string[] = [],
      interim: string[] = [];
    for (let index = 0; index < event.results.length; index++) {
      const item = event.results[index];
      if (item) (item.isFinal ? final : interim).push(item[0]?.transcript ?? "");
    }
    callbacks.result(final.join(" ").trim(), interim.join(" ").trim());
  };
  session.onerror = (event) => fail(typeof event?.error === "string" ? event.error : "unknown");
  session.onend = () => {
    if (!disposed) {
      const byPerson = requested;
      dispose();
      callbacks.end(byPerson);
    }
  };
  try {
    session.start();
  } catch (error) {
    dispose();
    throw error;
  }
  return {
    stop: () => {
      if (disposed) return;
      requested = true;
      session.stop();
    },
    dispose,
  };
}
