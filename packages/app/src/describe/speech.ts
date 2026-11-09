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
export interface SpeechConstructor {
  new (): LocalSpeechSession;
  prototype: object;
  available(options: { langs: string[]; processLocally: true }): Promise<string>;
}
export const speechConstructor = (): SpeechConstructor | undefined => {
  const scope = globalThis as unknown as {
    SpeechRecognition?: SpeechConstructor;
    webkitSpeechRecognition?: SpeechConstructor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
};
export async function availableSpeech(language: string, constructor = speechConstructor()): Promise<boolean> {
  try {
    return (
      !!constructor &&
      "processLocally" in constructor.prototype &&
      typeof constructor.available === "function" &&
      (await constructor.available({ langs: [language], processLocally: true })) === "available"
    );
  } catch {
    return false;
  }
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
