/**
 * Cloud speech: where a browser cannot turn speech into text at all, a person who agrees can
 * record what they say and have the recording turned into text by the provider the notice names
 * (the owner's decision of 23 November 2026, in `docs/platform/open-decisions.md`).
 *
 * What the code holds to:
 * - Nothing records before the person agrees (`speech-consent.ts`), and withdrawing the
 *   agreement stops a recording at once and sends nothing.
 * - The recording stays in this tab's memory until Stop, or until it reaches the time limit. It
 *   is then sent once to Weave's own `/api/transcribe`, with the language chosen, no cookies and
 *   nothing else, and dropped whether or not the words come back. It is never tried a second
 *   time and never stored, on the device or the server. Discard drops it unsent. The device
 *   notes only when a recording was sent and how long it was (`speech-cloud-log.ts`).
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
 * Asks the server whether cloud speech is on. Null means the server did not answer: it could not
 * be reached, or said something unexpected.
 */
export async function fetchSpeechStatus(send: typeof fetch = fetch, timeoutMs = 4000): Promise<SpeechStatus | null> {
  try {
    const response = await send(CLOUD_SPEECH.path, { cache: "no-store", credentials: "omit", signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    return body !== null && typeof body === "object" && "enabled" in body ? parseSpeechStatus(body) : null;
  } catch {
    return null;
  }
}

let known: Promise<SpeechStatus | null> | undefined;
/**
 * The server's answer for this visit, asked once. An answer, on or off, is kept, so a browser
 * that cannot be offered cloud speech asks once and not on every page. No answer counts as off
 * and is asked for again the next time.
 */
export async function speechStatusOnce(ask: () => Promise<SpeechStatus | null> = fetchSpeechStatus): Promise<SpeechStatus> {
  const current = (known ??= ask());
  const status = await current;
  if (status === null && known === current) known = undefined;
  return status ?? OFF;
}
/** Forgets the server's answer. For tests. */
export function forgetSpeechStatus(): void {
  known = undefined;
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

/**
 * How long sending a recording and getting its words may take. It is longer than the server
 * allows itself (`@weave/api` transcribe), so the server's own answer arrives first.
 */
export const CLOUD_SEND_MS = 60000;
/** How long a recorder may take to hand over its last piece after it is told to stop. */
const HANDOVER_MS = 5000;
/** The longest a session can take from Stop to its end. Talk It Out shows Finishing for no longer. */
export const CLOUD_FINISH_MS = HANDOVER_MS + CLOUD_SEND_MS;

const delay: Wait = (then, milliseconds) => {
  const timer = setTimeout(then, milliseconds);
  return () => clearTimeout(timer);
};

/**
 * Where this tab's cloud speech session stands, for what Talk It Out shows: `starting` while the
 * browser opens the microphone, when nothing is recorded yet; `recording`, with the time it
 * began; `sending` once the recording is on its way, whether Stop or the time limit ended it.
 */
export interface CloudSessionView {
  readonly phase: "idle" | "starting" | "recording" | "sending";
  /** When the recording began, as `Date.now()` gives it. Null unless recording. */
  readonly since: number | null;
}
const IDLE: CloudSessionView = { phase: "idle", since: null };
let view: CloudSessionView = IDLE;
let discardCurrent: (() => void) | undefined;
/** The session the view describes. A session that is not the latest one changes nothing here. */
let owner: object | undefined;
const viewListeners = new Set<() => void>();
function show(next: CloudSessionView) {
  if (view.phase === next.phase && view.since === next.since) return;
  view = next;
  for (const listener of viewListeners) listener();
}
export const cloudSession = {
  view: (): CloudSessionView => view,
  subscribe(listener: () => void): () => void {
    viewListeners.add(listener);
    return () => viewListeners.delete(listener);
  },
  /** Drops the recording being made, unsent. Does nothing once it is on its way or when nothing records. */
  discard(): void {
    discardCurrent?.();
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
  let stream: RecordingStream | undefined;
  let session: RecorderSession | undefined;
  let chunks: Blob[] = [];
  let bytes = 0;
  let began: number | null = null;
  let uploading = false;
  const token = {};
  const tell = (next: CloudSessionView) => {
    if (owner === token) show(next);
  };
  const waits = new Set<() => void>();
  const sending = new AbortController();
  let withdrawn: () => void = () => {};
  const ended = () => phase === "ended";
  const after = (run: () => void, milliseconds: number) => {
    const stop = later(() => {
      waits.delete(stop);
      run();
    }, milliseconds);
    waits.add(stop);
  };
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
    if (owner === token) {
      owner = undefined;
      discardCurrent = undefined;
      show(IDLE);
    }
  };
  const fail = (problem: SpeechProblem) => {
    if (phase === "ended") return;
    callbacks.error(problem);
    dispose();
    callbacks.end(false);
  };
  /** The person's own Discard: the recording is dropped and nothing is sent. Too late once it is on its way. */
  const discard = () => {
    if (phase === "starting" || phase === "recording") fail("discarded");
  };
  owner = token;
  discardCurrent = discard;
  tell({ phase: "starting", since: null });
  signal?.addEventListener("abort", dispose, { once: true });
  // Withdrawing the agreement, here or in another tab, stops the recording and sends nothing. One
  // already on its way is cancelled, but may have arrived, so the page does not say it was not sent.
  withdrawn = consent.subscribe(() => {
    if (!consent.agreed()) fail(phase === "sending" ? "withdrawn-sending" : "withdrawn");
  });

  /** Sends the recording, once. Answers the words, or the problem to say. */
  const post = async (recording: Blob, seconds: number): Promise<{ text: string } | { problem: SpeechProblem }> => {
    const timeout = AbortSignal.timeout(CLOUD_SEND_MS);
    const sentAt = new Date(now()).toISOString();
    const note = () => log.add({ at: sentAt, seconds });
    let response: Response;
    try {
      response = await send(CLOUD_SPEECH.path, {
        method: "POST",
        headers: {
          "Content-Type": type.split(";")[0]!,
          [CLOUD_SPEECH.agreementHeader]: CLOUD_SPEECH.agreement,
          [CLOUD_SPEECH.languageHeader]: language,
        },
        body: recording,
        cache: "no-store",
        // The endpoint needs no sign-in, so no cookie goes with the recording.
        credentials: "omit",
        signal: AbortSignal.any([sending.signal, timeout]),
      });
    } catch {
      // A request that timed out, or that this session cancelled while it was on its way (the
      // page left, or the agreement was withdrawn), had been sent, and is noted. One the network
      // refused outright is taken as not sent.
      if (timeout.aborted || sending.signal.aborted) {
        note();
        return { problem: "cloud-failed" };
      }
      return { problem: online() ? "cloud-unreachable" : "cloud-offline" };
    }
    // The server answered, so the recording left this device, whatever the answer.
    note();
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) return { problem: problemFor(parseSpeechFailure(body)) };
    try {
      return parseTranscript(body);
    } catch {
      // An answer that is not words is never shown as words.
      return { problem: "cloud-failed" };
    }
  };
  const upload = async () => {
    if (uploading || phase !== "sending") return;
    uploading = true;
    for (const stop of waits) stop();
    waits.clear();
    release();
    const recording = new Blob(chunks, { type: type.split(";")[0] });
    chunks = [];
    if (!recording.size) return fail("no-speech");
    const outcome = await post(recording, Math.max(0, Math.round((recordedUntil - (began ?? recordedUntil)) / 1000)));
    if (phase !== "sending") return;
    if ("problem" in outcome) return fail(outcome.problem);
    const text = outcome.text.trim();
    if (!text) return fail("no-speech");
    try {
      callbacks.result(text, "");
    } catch (error) {
      // The page's own failure is reported as any uncaught error is, and the session still ends.
      (globalThis as { reportError?: (error: unknown) => void }).reportError?.(error);
    }
    // A page that ended the session from inside `result`, as when its box is full, gets no second end.
    if (ended()) return;
    dispose();
    callbacks.end(true);
  };
  /** When the recording stopped, for its length. */
  let recordedUntil = 0;
  /** Stops the recording and sends it: from the person's Stop, or at the limit. Nothing else sends. */
  const finish = () => {
    if (phase !== "recording" || !session) return;
    phase = "sending";
    recordedUntil = now();
    tell({ phase: "sending", since: null });
    for (const stop of waits) stop();
    waits.clear();
    // A recorder hands over its last piece and then stops. One that never says it has stopped is
    // not waited for: what it gave is sent.
    after(() => void upload(), HANDOVER_MS);
    try {
      session.stop();
    } catch {
      void upload();
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
    try {
      session = new recorder(granted, { mimeType: type, audioBitsPerSecond: 32000 });
      session.ondataavailable = (event) => {
        // The last piece arrives after stop() and before `onstop`, so it is kept while sending too.
        if ((phase !== "recording" && phase !== "sending") || uploading || !event.data?.size) return;
        chunks.push(event.data);
        bytes += event.data.size;
        // A browser that ignores the bit rate fills the limit early. Stop while it still fits.
        if (phase === "recording" && bytes > limits.maxBytes * 0.9) finish();
      };
      // A recorder that stops by itself, as when the microphone is unplugged or its sharing is
      // stopped from the browser's own indicator, was not stopped by the person and has not
      // reached the limit. Nothing is sent: the recording is dropped, and the page says so.
      session.onstop = () => {
        if (phase === "recording") fail("cloud-interrupted");
        else void upload();
      };
      session.onerror = () => fail("audio-capture");
      phase = "recording";
      session.start(1000);
    } catch {
      return fail("audio-capture");
    }
    began = now();
    tell({ phase: "recording", since: began });
    after(finish, limits.maxSeconds * 1000);
  };
  void begin();
  return {
    stop: () => {
      // Stop before the browser has opened the microphone ends at once and quietly: nothing was
      // recorded, so there is nothing to send and nothing to say.
      if (phase === "starting") fail("aborted");
      else finish();
    },
    dispose,
  };
}
