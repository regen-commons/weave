// GET /api/transcribe says whether cloud speech is on, and its limits.
// POST /api/transcribe turns one short recording into text and answers with the words.
//
// A browser that cannot turn speech into text records the person's voice, only after they agree
// to a notice that names the provider, and posts the recording here once (the owner's decision of
// 23 November 2026). Audio and words go only through the provider and are never stored or logged.
//
// It needs no sign-in, because describing an initiative comes before one. Every real provider
// call needs a reservation against the connection's quota and Weave's shared daily quota.
import { CLOUD_SPEECH, TRANSCRIPT_LIMIT, type SpeechFailure, type SpeechStatus } from "./transcribe-contract.ts";
import { createCloudflareSpeech, createSyntheticSpeech, SpeechError, whisperLanguage, type SpeechProvider } from "./transcribe-provider.ts";
import { configuredSpeechQuota, type SpeechQuota } from "./transcribe-quota.ts";

/** Reads at most `limit` bytes of a request body, and gives up on one that arrives too slowly. */
async function boundedBytes(request: Request, limit: number, timeoutMs: number): Promise<Uint8Array> {
  if (Number(request.headers.get("content-length") ?? 0) > limit) throw new SpeechError(413, "recording_too_large");
  const reader = request.body?.getReader();
  if (!reader) throw new SpeechError(400, "recording_empty");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void reader.cancel();
  }, timeoutMs);
  try {
    while (true) {
      const result = await reader.read();
      if (timedOut) throw new SpeechError(408, "request_timeout");
      if (result.done) break;
      bytes += result.value.byteLength;
      if (bytes > limit) {
        void reader.cancel();
        throw new SpeechError(413, "recording_too_large");
      }
      chunks.push(result.value);
    }
  } catch (error) {
    if (error instanceof SpeechError) throw error;
    throw new SpeechError(timedOut ? 408 : 400, timedOut ? "request_timeout" : "recording_empty");
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
  if (!bytes) throw new SpeechError(400, "recording_empty");
  const joined = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return joined;
}

export function createTranscribeHandlers({
  provider,
  quota,
  maxSeconds = CLOUD_SPEECH.maxSeconds,
  maxBytes = CLOUD_SPEECH.maxBytes,
  uploadTimeoutMs = 20000,
}: {
  /** null: cloud speech is off or not configured. */
  provider: SpeechProvider | null;
  quota: SpeechQuota | null;
  maxSeconds?: number;
  maxBytes?: number;
  /**
   * How long the recording may take to arrive. The quota and provider waits keep the total
   * inside the app's own wait and the function's time limit.
   */
  uploadTimeoutMs?: number;
}) {
  const answer = (status: number, body: unknown, headers?: Record<string, string>) =>
    Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
  const refuse = (error: unknown) => {
    const known = error instanceof SpeechError ? error : new SpeechError(502, "speech_failed");
    return answer(known.status, { error: known.code satisfies SpeechFailure }, {
      ...(known.status === 405 ? { Allow: "GET, POST" } : {}),
      ...(known.retryAt === undefined ? {} : { "Retry-After": new Date(known.retryAt).toUTCString() }),
    });
  };
  return {
    GET(): Response {
      return answer(200, { enabled: provider !== null && quota !== null, maxSeconds, maxBytes } satisfies SpeechStatus);
    },
    async POST(request: Request): Promise<Response> {
      try {
        if (request.method !== "POST") throw new SpeechError(405, "method_not_allowed");
        // Only the app's own page may send a recording: another site's script cannot set this origin.
        if (request.headers.get("origin") !== new URL(request.url).origin) throw new SpeechError(403, "origin_required");
        if (request.headers.get(CLOUD_SPEECH.agreementHeader) !== CLOUD_SPEECH.agreement)
          throw new SpeechError(403, "agreement_required");
        const type = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
        if (!(CLOUD_SPEECH.audioTypes as readonly string[]).includes(type)) throw new SpeechError(415, "audio_required");
        const tag = request.headers.get(CLOUD_SPEECH.languageHeader);
        const language = tag === null ? null : whisperLanguage(tag);
        if (language === undefined) throw new SpeechError(400, "invalid_language");
        // Checked before the body is read, so a browser is told at once and sends nothing more.
        if (!provider || !quota) throw new SpeechError(503, "speech_unavailable");
        const audio = await boundedBytes(request, maxBytes, uploadTimeoutMs);
        request.signal.throwIfAborted();
        const reservation = await quota(request).catch(() => {
          throw new SpeechError(503, "speech_unavailable");
        });
        if (!reservation.allowed) {
          const code = reservation.limit === "caller" ? "speech_caller_limited" : "speech_limit_reached";
          throw new SpeechError(429, code, reservation.retryAt);
        }
        // Keep the reservation even if the call fails or is cancelled. It may already have cost work.
        request.signal.throwIfAborted();
        const { text } = await provider.transcribe(audio, { language, signal: request.signal });
        return answer(200, { text: text.slice(0, TRANSCRIPT_LIMIT) });
      } catch (error) {
        return refuse(error);
      }
    },
  };
}

/**
 * The provider this deployment is configured for, or null. A missing or malformed setting leaves
 * cloud speech off and says nothing about why. The synthetic provider answers local runs only:
 * never where VERCEL is set, as on every deployment, and never in a production build.
 */
function usesSpeechFixture(env: NodeJS.ProcessEnv): boolean {
  return env.WEAVE_CLOUD_SPEECH_FIXTURE === "true" && !env.VERCEL && env.NODE_ENV !== "production";
}

export function configuredSpeech(env: NodeJS.ProcessEnv = process.env): SpeechProvider | null {
  if (usesSpeechFixture(env)) return createSyntheticSpeech();
  if (env.WEAVE_CLOUD_SPEECH_ENABLED !== "true") return null;
  const accountId = env.WEAVE_CLOUDFLARE_ACCOUNT_ID ?? "";
  const token = env.WEAVE_CLOUDFLARE_AI_TOKEN ?? "";
  if (!/^[0-9a-f]{32}$/.test(accountId) || !/^[\x21-\x7e]{20,400}$/.test(token)) return null;
  return createCloudflareSpeech({ accountId, token });
}

const handlers = createTranscribeHandlers({
  provider: configuredSpeech(),
  quota: usesSpeechFixture(process.env) ? async () => ({ allowed: true }) : configuredSpeechQuota(),
});
export const { GET, POST } = handlers;
