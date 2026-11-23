// What the browser and the server agree on for cloud speech: where a browser cannot turn speech
// into text, a person who agrees can have one short recording turned into text by the provider
// named here (the owner's decision of 23 November 2026, D35 for transcription). The app reads
// these values for its notice and its limits, so the words on the screen and the server's checks
// come from one place.

export const CLOUD_SPEECH = {
  path: "/api/transcribe",
  /** The company and the service that process the recording, as the notice names them. */
  provider: "Cloudflare Workers AI",
  company: "Cloudflare",
  model: "Whisper",
  /** The longest recording the app makes. */
  maxSeconds: 180,
  /** The largest recording the server reads. Vercel refuses a request body over 4.5 MB. */
  maxBytes: 3_000_000,
  /** Sent with every recording. It is a tripwire against a request the app did not make, not proof of agreement. */
  agreementHeader: "x-weave-speech-agreement",
  agreement: "cloud",
  /** The language the person chose to speak in, as a BCP 47 tag such as `pt-BR`. Optional. */
  languageHeader: "x-weave-speech-language",
  /** What browsers record: WebM or Ogg with Opus in Chrome and Firefox, MP4 with AAC in Safari. */
  audioTypes: ["audio/webm", "audio/mp4", "audio/ogg"],
} as const;

/** Why a recording was not turned into text. Stable codes: the app chooses its words from them. */
export type SpeechFailure =
  | "method_not_allowed"
  | "origin_required"
  | "agreement_required"
  | "audio_required"
  | "invalid_language"
  | "recording_empty"
  | "recording_too_large"
  | "recording_unreadable"
  | "request_timeout"
  /** Cloud speech is switched off or not configured. */
  | "speech_unavailable"
  /** The provider's allowance for the day is used up. */
  | "speech_limit_reached"
  /** The provider has no capacity right now. */
  | "speech_busy"
  | "speech_timeout"
  | "speech_failed";

export interface SpeechStatus {
  enabled: boolean;
  maxSeconds: number;
  maxBytes: number;
}

const OFF: SpeechStatus = { enabled: false, maxSeconds: CLOUD_SPEECH.maxSeconds, maxBytes: CLOUD_SPEECH.maxBytes };

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** The server's answer about cloud speech, read as data. Anything unexpected means it is off. */
export function parseSpeechStatus(value: unknown): SpeechStatus {
  const status = object(value);
  if (status?.enabled !== true) return OFF;
  const { maxSeconds, maxBytes } = status;
  if (typeof maxSeconds !== "number" || !Number.isInteger(maxSeconds) || maxSeconds < 1 || maxSeconds > CLOUD_SPEECH.maxSeconds) return OFF;
  if (typeof maxBytes !== "number" || !Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > CLOUD_SPEECH.maxBytes) return OFF;
  return { enabled: true, maxSeconds, maxBytes };
}

/** The longest text one recording may come back as: the most a step's box holds. */
export const TRANSCRIPT_LIMIT = 20000;

/** The words one recording became. Throws on anything else, so a bad answer is never shown as words. */
export function parseTranscript(value: unknown): { text: string } {
  const text = object(value)?.text;
  if (typeof text !== "string" || text.length > TRANSCRIPT_LIMIT) throw new Error("Not a transcript");
  return { text };
}

/** The failure code in an error answer, or `speech_failed` when the answer is anything else. */
export function parseSpeechFailure(value: unknown): SpeechFailure {
  const code = object(value)?.error;
  return typeof code === "string" && (FAILURES as readonly string[]).includes(code) ? (code as SpeechFailure) : "speech_failed";
}

const FAILURES: readonly SpeechFailure[] = [
  "method_not_allowed",
  "origin_required",
  "agreement_required",
  "audio_required",
  "invalid_language",
  "recording_empty",
  "recording_too_large",
  "recording_unreadable",
  "request_timeout",
  "speech_unavailable",
  "speech_limit_reached",
  "speech_busy",
  "speech_timeout",
  "speech_failed",
];
