/**
 * Cloud speech: where a browser cannot turn speech into text at all, a person who agrees can
 * record what they say and have the recording turned into text by the provider the notice names
 * (the owner's decision of 23 November 2026, in `docs/platform/open-decisions.md`).
 *
 * What the code holds to:
 * - Nothing records before the person agrees (`speech-consent.ts`), and withdrawing the
 *   agreement stops a recording at once and sends nothing.
 * - The recording stays in this tab's memory until Stop. It is then sent once to Weave's own
 *   `/api/transcribe`, with the language chosen and nothing else, and dropped whether or not
 *   the words come back. It is never stored on the device or the server. The device notes only
 *   when a recording was sent and how long it was (`speech-cloud-log.ts`).
 * - A session is one mode from start to end. A failure never starts another way of listening.
 * - It is offered only while the server says cloud speech is on.
 */
import {
  CLOUD_SPEECH,
  parseSpeechFailure,
  parseSpeechStatus,
  parseTranscript,
  type SpeechFailure,
  type SpeechStatus,
} from "@weave/api/transcribe-contract";
import type { SpeechCallbacks, SpeechProblem, Wait } from "./speech.ts";
import { deviceCloudSpeechLog, type CloudSpeechLog } from "./speech-cloud-log.ts";
import type { SpeechConsent } from "./speech-consent.ts";

/** The parts of the browser a recording needs, narrow enough for a test to stand in for them. */
export interface RecordingStream {
  getTracks(): { stop(): void }[];
}
export interface RecorderSession {
  ondataavailable: ((event: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
  onerror: (() => void) | null;
  start(timeslice?: number): void;
  stop(): void;
}
export interface RecorderConstructor {
  new (stream: RecordingStream, options?: { mimeType?: string; audioBitsPerSecond?: number }): RecorderSession;
  isTypeSupported(type: string): boolean;
}
export interface RecordingDevices {
  getUserMedia(constraints: { audio: true }): Promise<RecordingStream>;
}

/** What browsers record, in the order tried: Opus in WebM (Chrome, Firefox), AAC in MP4 (Safari), Opus in Ogg. */
const RECORDING_TYPES = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus", "audio/webm"];

/** The first format this browser records that the server takes, or null. */
export function recordingType(recorder: RecorderConstructor | undefined): string | null {
  try {
    return (recorder && RECORDING_TYPES.find((type) => recorder.isTypeSupported(type))) ?? null;
  } catch {
    return null;
  }
}

export const browserRecorder = (): RecorderConstructor | undefined =>
  (globalThis as unknown as { MediaRecorder?: RecorderConstructor }).MediaRecorder;
export const browserDevices = (): RecordingDevices | undefined => {
  const devices = (globalThis.navigator as unknown as { mediaDevices?: RecordingDevices } | undefined)?.mediaDevices;
  return typeof devices?.getUserMedia === "function" ? devices : undefined;
};

const OFF: SpeechStatus = parseSpeechStatus(null);

/**
 * Asks the server whether cloud speech is on. A server that cannot be reached, or answers
 * anything unexpected, counts as off, and is asked again the next time.
 */
export async function fetchSpeechStatus(send: typeof fetch = fetch, timeoutMs = 8000): Promise<SpeechStatus> {
  try {
    const response = await send(CLOUD_SPEECH.path, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
    return response.ok ? parseSpeechStatus(await response.json()) : OFF;
  } catch {
    return OFF;
  }
}

let known: Promise<SpeechStatus> | undefined;
/** The server's answer for this visit. Only an answer that cloud speech is on is kept. */
export function speechStatusOnce(ask: () => Promise<SpeechStatus> = fetchSpeechStatus): Promise<SpeechStatus> {
  const current = (known ??= ask());
  void current.then((status) => {
    if (!status.enabled && known === current) known = undefined;
  });
  return current;
}

/**
 * Whether this browser can be offered cloud speech now: it can record in a format the server
 * takes, and the server says cloud speech is on. The server is asked only where the browser can
 * record, so a browser that cannot never calls it.
 */
export async function cloudSpeechAvailable({
  recorder = browserRecorder(),
  devices = browserDevices(),
  status = speechStatusOnce,
}: {
  recorder?: RecorderConstructor;
  devices?: RecordingDevices;
  status?: () => Promise<SpeechStatus>;
} = {}): Promise<boolean> {
  if (!devices || !recordingType(recorder)) return false;
  return (await status()).enabled;
}

/** How long one attempt to send a recording and get its words may take. */
export const CLOUD_SEND_MS = 60000;
/** How long before a recording that could not be sent is tried once more. */
const RETRY_AFTER_MS = 1500;
/**
 * The longest a session can take from Stop to its end: two attempts and the wait between them.
 * Talk It Out shows Finishing for no longer than this.
 */
export const CLOUD_FINISH_MS = CLOUD_SEND_MS * 2 + RETRY_AFTER_MS;

const delay: Wait = (then, milliseconds) => {
  const timer = setTimeout(then, milliseconds);
  return () => clearTimeout(timer);
};

/** When this tab's recording began, for the time Talk It Out shows. Null while nothing records. */
let recordingSince: number | null = null;
const clockListeners = new Set<() => void>();
function setRecordingSince(value: number | null) {
  if (recordingSince === value) return;
  recordingSince = value;
  for (const listener of clockListeners) listener();
}
export const recordingClock = {
  since: (): number | null => recordingSince,
  subscribe(listener: () => void): () => void {
    clockListeners.add(listener);
    return () => clockListeners.delete(listener);
  },
};

/** What the page says for each way the server can refuse a recording: see `speechProblem`. */
function problemFor(failure: SpeechFailure): SpeechProblem {
  switch (failure) {
    case "speech_limit_reached":
      return "cloud-limit";
    case "speech_busy":
      return "cloud-busy";
    case "recording_too_large":
      return "cloud-too-long";
    case "recording_unreadable":
    case "audio_required":
    case "recording_empty":
      return "cloud-unreadable";
    case "speech_unavailable":
      return "cloud-off";
    default:
      return "cloud-failed";
  }
}

/** A failure worth one more try: the recording never arrived, or the provider was busy for a moment. */
const RETRIED: readonly SpeechProblem[] = ["cloud-unreachable", "cloud-busy"];

export async function startCloudSpeech(
  language: string,
  callbacks: SpeechCallbacks,
  {
    consent,
    signal,
    status = speechStatusOnce,
    recorder = browserRecorder(),
    devices = browserDevices(),
    send = fetch,
    later = delay,
    now = Date.now,
    online = () => globalThis.navigator?.onLine !== false,
    log = deviceCloudSpeechLog(),
  }: {
    /** Required: a recording starts only while it says the person agreed. */
    consent?: SpeechConsent;
    signal?: AbortSignal;
    status?: () => Promise<SpeechStatus>;
    recorder?: RecorderConstructor;
    devices?: RecordingDevices;
    send?: typeof fetch;
    later?: Wait;
    now?: () => number;
    online?: () => boolean;
    /** The device's record of recordings sent. */
    log?: CloudSpeechLog;
  } = {},
): Promise<{ stop(): void; dispose(): void }> {
  if (!consent?.agreed()) throw new Error("Cloud speech needs the person's agreement first.");
  const type = recordingType(recorder);
  if (!recorder || !devices || !type) throw new Error("This browser cannot record.");
  const limits = await status();
  if (!limits.enabled) throw new Error("Cloud speech is off.");
  signal?.throwIfAborted();
  // Asked again after the wait: the agreement may have been withdrawn while the server answered.
  if (!consent.agreed()) throw new Error("Cloud speech needs the person's agreement first.");

  let phase: "starting" | "recording" | "sending" | "ended" = "starting";
  let stopAsked = false;
  let stream: RecordingStream | undefined;
  let session: RecorderSession | undefined;
  let chunks: Blob[] = [];
  let bytes = 0;
  const waits = new Set<() => void>();
  const sending = new AbortController();
  let withdrawn: () => void = () => {};
  const release = () => {
    for (const track of stream?.getTracks() ?? []) track.stop();
    stream = undefined;
  };
  const dispose = () => {
    if (phase === "ended") return;
    const recording = phase === "recording";
    phase = "ended";
    signal?.removeEventListener("abort", dispose);
    withdrawn();
    for (const stop of waits) stop();
    waits.clear();
    sending.abort();
    if (session) {
      session.ondataavailable = null;
      session.onstop = null;
      session.onerror = null;
      if (recording) {
        try {
          session.stop();
        } catch {
          /* A recorder that has already stopped has nothing left to stop. */
        }
      }
    }
    // The recording is dropped here whatever happened to it.
    chunks = [];
    release();
    setRecordingSince(null);
  };
  const fail = (problem: SpeechProblem) => {
    if (phase === "ended") return;
    callbacks.error(problem);
    dispose();
    callbacks.end(false);
  };
  signal?.addEventListener("abort", dispose, { once: true });
  // Withdrawing the agreement, here or in another tab, stops the recording and sends nothing.
  withdrawn = consent.subscribe(() => {
    if (!consent.agreed()) fail("withdrawn");
  });

  /** One attempt to send the recording. Answers the words, or the problem to say. */
  const attempt = async (recording: Blob): Promise<{ text: string } | { problem: SpeechProblem }> => {
    const timeout = AbortSignal.timeout(CLOUD_SEND_MS);
    try {
      const response = await send(CLOUD_SPEECH.path, {
        method: "POST",
        headers: {
          "Content-Type": type.split(";")[0]!,
          [CLOUD_SPEECH.agreementHeader]: CLOUD_SPEECH.agreement,
          [CLOUD_SPEECH.languageHeader]: language,
        },
        body: recording,
        cache: "no-store",
        signal: AbortSignal.any([sending.signal, timeout]),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) return { problem: problemFor(parseSpeechFailure(body)) };
      try {
        return parseTranscript(body);
      } catch {
        // An answer that is not words is never shown as words.
        return { problem: "cloud-failed" };
      }
    } catch {
      if (timeout.aborted) return { problem: "cloud-failed" };
      return { problem: online() ? "cloud-unreachable" : "cloud-offline" };
    }
  };
  const upload = async () => {
    release();
    const began = recordingSince;
    setRecordingSince(null);
    const recording = new Blob(chunks, { type: type.split(";")[0] });
    chunks = [];
    if (!recording.size) return fail("no-speech");
    // Noted once, as the recording leaves the device, whatever comes back.
    log.add({ at: new Date(now()).toISOString(), seconds: began === null ? 0 : Math.max(0, Math.round((now() - began) / 1000)) });
    let outcome = await attempt(recording);
    if (phase !== "sending") return;
    if ("problem" in outcome && RETRIED.includes(outcome.problem)) {
      await new Promise<void>((resolve) => {
        const stop = later(() => {
          waits.delete(stop);
          resolve();
        }, RETRY_AFTER_MS);
        waits.add(stop);
      });
      if (phase !== "sending") return;
      outcome = await attempt(recording);
      if (phase !== "sending") return;
    }
    if ("problem" in outcome) return fail(outcome.problem);
    const text = outcome.text.trim();
    if (!text) return fail("no-speech");
    callbacks.result(text, "");
    dispose();
    callbacks.end(true);
  };
  /** Stops the recording and sends it: from the person's Stop, or at the limit. */
  const finish = () => {
    if (phase !== "recording" || !session) return;
    phase = "sending";
    for (const stop of waits) stop();
    waits.clear();
    session.onstop = () => void upload();
    try {
      session.stop();
    } catch {
      fail("audio-capture");
    }
  };
  const begin = async () => {
    let granted: RecordingStream;
    try {
      granted = await devices.getUserMedia({ audio: true });
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      return fail(name === "NotAllowedError" || name === "SecurityError" ? "not-allowed" : "audio-capture");
    }
    // Ended while the browser asked about the microphone: let it go at once.
    if (phase !== "starting") {
      for (const track of granted.getTracks()) track.stop();
      return;
    }
    stream = granted;
    // Stop pressed before anything was recorded ends quietly, with nothing to send.
    if (stopAsked) return fail("aborted");
    try {
      session = new recorder(granted, { mimeType: type, audioBitsPerSecond: 32000 });
      session.ondataavailable = (event) => {
        // The last piece arrives after stop() and before `onstop`, so it is kept while sending too.
        if ((phase !== "recording" && phase !== "sending") || !event.data?.size) return;
        chunks.push(event.data);
        bytes += event.data.size;
        // A browser that ignores the bit rate fills the limit early. Stop while it still fits.
        if (phase === "recording" && bytes > limits.maxBytes * 0.9) finish();
      };
      session.onerror = () => fail("audio-capture");
      phase = "recording";
      session.start(1000);
    } catch {
      return fail("audio-capture");
    }
    setRecordingSince(now());
    const stop = later(() => {
      waits.delete(stop);
      finish();
    }, limits.maxSeconds * 1000);
    waits.add(stop);
  };
  void begin();
  return {
    stop: () => {
      stopAsked = true;
      finish();
    },
    dispose,
  };
}
