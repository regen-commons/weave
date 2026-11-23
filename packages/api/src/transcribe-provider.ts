// The one place a recording leaves Weave: Cloudflare Workers AI turns it into text with Whisper.
// Cloudflare's data-usage page says Workers AI keeps no inputs or outputs after a request and
// trains on none. Weave keeps neither the recording nor the words: this module returns the text
// to its caller and writes nothing, to storage or to a log.
import type { SpeechFailure } from "./transcribe-contract.ts";

/** A failure with the status and the stable code the handler answers with. Never a provider's own words. */
export class SpeechError extends Error {
  readonly status: number;
  readonly code: SpeechFailure;
  constructor(status: number, code: SpeechFailure) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

export interface SpeechProvider {
  /** Turns one recording into text. `language` is a Whisper language code, or null to let the model tell. */
  transcribe(audio: Uint8Array, options: { language: string | null; signal: AbortSignal }): Promise<{ text: string }>;
}

/** The languages Whisper takes a hint for. Any other language is left for the model to tell. */
const WHISPER_LANGUAGES = new Set(
  (
    "en zh de es ru ko fr ja pt tr pl ca nl ar sv it id hi fi vi he uk el ms cs ro da hu ta no th ur hr bg lt la mi ml cy sk te fa lv bn sr az sl kn et mk br eu is hy ne mn bs kk sq sw gl mr pa si km sn yo so af oc ka be tg sd gu am yi lo uz fo ht ps tk nn mt sa lb my bo tl mg as tt haw ln ha ba jw su yue"
  ).split(" "),
);

/**
 * The Whisper language for a BCP 47 tag such as `pt-BR`: its primary subtag, when Whisper knows
 * it. `undefined` means the tag is not a language tag at all; `null` means a real language that
 * Whisper takes no hint for.
 */
export function whisperLanguage(tag: string): string | null | undefined {
  if (!/^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8}){0,4}$/.test(tag)) return undefined;
  const primary = tag.split("-")[0]!.toLowerCase();
  return WHISPER_LANGUAGES.has(primary) ? primary : null;
}

const MODEL = "@cf/openai/whisper-large-v3-turbo";

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/**
 * What Cloudflare's refusal means for the person. Its codes are in the Workers AI errors page:
 * 3036 is the day's free allowance used up, 3040 no capacity right now, 3006 a request too
 * large, 3007 a timeout, and 5004 and 3003 input it could not read. A refused token or a blocked
 * account is Weave's configuration, so it reads as unavailable and says nothing more.
 */
function refusal(status: number, data: unknown): SpeechError {
  const first = object(data)?.errors;
  const code = Array.isArray(first) ? object(first[0])?.code : undefined;
  if (code === 3036) return new SpeechError(503, "speech_limit_reached");
  if (code === 3040) return new SpeechError(503, "speech_busy");
  if (code === 3006 || status === 413) return new SpeechError(413, "recording_too_large");
  if (code === 3007 || status === 408) return new SpeechError(504, "speech_timeout");
  if (code === 5004 || code === 3003 || status === 400) return new SpeechError(422, "recording_unreadable");
  if (status === 401 || status === 403) return new SpeechError(503, "speech_unavailable");
  if (status === 429) return new SpeechError(503, "speech_busy");
  return new SpeechError(502, "speech_failed");
}

export function createCloudflareSpeech({
  accountId,
  token,
  send = fetch,
  timeoutMs = 60000,
}: {
  accountId: string;
  token: string;
  send?: typeof fetch;
  timeoutMs?: number;
}): SpeechProvider {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${MODEL}`;
  return {
    async transcribe(audio, { language, signal }) {
      const deadline = AbortSignal.timeout(timeoutMs);
      let response: Response;
      let data: unknown;
      try {
        response = await send(url, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          // The voice-activity filter drops silence, which Whisper otherwise fills with invented words.
          body: JSON.stringify({
            audio: Buffer.from(audio.buffer, audio.byteOffset, audio.byteLength).toString("base64"),
            task: "transcribe",
            vad_filter: true,
            ...(language ? { language } : {}),
          }),
          redirect: "error",
          signal: AbortSignal.any([signal, deadline]),
        });
        data = await response.json();
      } catch {
        // The caller's own cancellation is theirs to report. Anything else is the provider's.
        signal.throwIfAborted();
        throw new SpeechError(deadline.aborted ? 504 : 502, deadline.aborted ? "speech_timeout" : "speech_failed");
      }
      const body = object(data);
      if (!response.ok || body?.success !== true) throw refusal(response.status, data);
      const text = object(body.result)?.text;
      if (typeof text !== "string") throw new SpeechError(502, "speech_failed");
      return { text: text.replace(/\s+/gu, " ").trim() };
    },
  };
}

/**
 * A stand-in for local runs, which answers with fixed words and calls nothing. It lets the app's
 * recording and sending be tried end to end with no account and no audio leaving the computer.
 */
export function createSyntheticSpeech(text = "We are Orchard Learning Circle, based in Lisbon. Families restore an old orchard together."): SpeechProvider {
  return {
    async transcribe(_audio, { signal }) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      signal.throwIfAborted();
      return { text };
    },
  };
}
