export interface SpeechEvent {
  results: ArrayLike<{ isFinal: boolean; [index: number]: { transcript: string } | undefined }>;
}
export interface LocalSpeechSession {
  processLocally: boolean;
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
  /** The browser's answer is read as data: see `speechStatus`. */
  available(options: LocalSpeechOptions): Promise<unknown>;
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
export async function speechStatus(language: string, constructor = speechConstructor()): Promise<SpeechStatus> {
  try {
    if (!constructor || !("processLocally" in constructor.prototype) || typeof constructor.available !== "function")
      return "unavailable";
    const answer = await constructor.available({ langs: [language], processLocally: true });
    return STATUSES.find((status) => status === answer) ?? "unavailable";
  } catch {
    return "unavailable";
  }
}
export async function availableSpeech(language: string, constructor = speechConstructor()): Promise<boolean> {
  return (await speechStatus(language, constructor)) === "available";
}
export async function startSpeech(
  language: string,
  callbacks: { result(finalText: string, interimText: string): void; error(): void; end(): void },
  constructor = speechConstructor(),
  signal?: AbortSignal,
): Promise<{ stop(): void; dispose(): void }> {
  if (!constructor || !(await availableSpeech(language, constructor)))
    throw new Error("Local speech is not ready. You can type below.");
  signal?.throwIfAborted();
  const session = new constructor();
  session.processLocally = true;
  session.lang = language;
  session.continuous = true;
  session.interimResults = true;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    signal?.removeEventListener("abort", dispose);
    session.onresult = null;
    session.onerror = null;
    session.onend = null;
    session.abort();
  };
  signal?.addEventListener("abort", dispose, { once: true });
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
  session.onerror = () => {
    if (!disposed) {
      callbacks.error();
      dispose();
      callbacks.end();
    }
  };
  session.onend = () => {
    if (!disposed) {
      callbacks.end();
      dispose();
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
      if (!disposed) session.stop();
    },
    dispose,
  };
}
