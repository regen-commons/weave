// Cloud speech sends a person's voice to a provider, so every way in is checked before a byte
// leaves, every failure answers with a stable code and nothing of the provider's, and it stays
// off until it is configured.
import assert from "node:assert/strict";
import { test } from "node:test";
import { configuredSpeech, createTranscribeHandlers } from "./transcribe.ts";
import { CLOUD_SPEECH, parseSpeechFailure, parseSpeechStatus, parseTranscript } from "./transcribe-contract.ts";
import { createCloudflareSpeech, SpeechError, whisperLanguage, type SpeechProvider } from "./transcribe-provider.ts";

const ORIGIN = "https://weave.example";
const AUDIO = new Uint8Array([26, 69, 223, 163, 1, 2, 3, 4]);

/** A provider that records what it was asked and answers as told. */
function provider(answer: () => Promise<{ text: string }> = async () => ({ text: "We grow seedlings" })) {
  const calls: { bytes: number[]; language: string | null }[] = [];
  const speech: SpeechProvider = {
    transcribe(audio, { language }) {
      calls.push({ bytes: [...audio], language });
      return answer();
    },
  };
  return { speech, calls };
}

function recording({
  headers = {},
  body = AUDIO,
  method = "POST",
}: { headers?: Record<string, string | null>; body?: Uint8Array | null; method?: string } = {}): Request {
  const all = new Headers({
    origin: ORIGIN,
    "content-type": "audio/webm;codecs=opus",
    [CLOUD_SPEECH.agreementHeader]: CLOUD_SPEECH.agreement,
    [CLOUD_SPEECH.languageHeader]: "pt-BR",
  });
  for (const [key, value] of Object.entries(headers)) {
    if (value === null) all.delete(key);
    else all.set(key, value);
  }
  return new Request(`${ORIGIN}${CLOUD_SPEECH.path}`, {
    method,
    headers: all,
    body: method === "GET" || body === null ? undefined : body,
    duplex: "half",
  } as RequestInit);
}

async function read(response: Response): Promise<{ status: number; body: unknown; cache: string | null }> {
  return { status: response.status, body: await response.json(), cache: response.headers.get("cache-control") };
}

test("one recording from the app's own page becomes words, and the answer holds nothing else", async () => {
  const { speech, calls } = provider();
  const result = await read(await createTranscribeHandlers({ provider: speech }).POST(recording()));
  assert.deepEqual(result, { status: 200, body: { text: "We grow seedlings" }, cache: "no-store" });
  assert.deepEqual(calls, [{ bytes: [...AUDIO], language: "pt" }], "the recording is passed on whole, with the language's Whisper code");
});

test("the status says whether cloud speech is on, and its limits, to anyone who asks", async () => {
  const on = await read(createTranscribeHandlers({ provider: provider().speech }).GET());
  assert.deepEqual(on, { status: 200, body: { enabled: true, maxSeconds: 180, maxBytes: 3_000_000 }, cache: "no-store" });
  const off = await read(createTranscribeHandlers({ provider: null }).GET());
  assert.deepEqual(off.body, { enabled: false, maxSeconds: 180, maxBytes: 3_000_000 });
});

test("nothing reaches the provider unless the request is the app's own, agreed and audio", async () => {
  const cases: [string, Parameters<typeof recording>[0], number, string][] = [
    ["another site", { headers: { origin: "https://elsewhere.example" } }, 403, "origin_required"],
    ["no origin, as from a script outside a browser", { headers: { origin: null } }, 403, "origin_required"],
    ["no agreement", { headers: { [CLOUD_SPEECH.agreementHeader]: null } }, 403, "agreement_required"],
    ["some other agreement", { headers: { [CLOUD_SPEECH.agreementHeader]: "browser" } }, 403, "agreement_required"],
    ["JSON", { headers: { "content-type": "application/json" } }, 415, "audio_required"],
    ["a video", { headers: { "content-type": "video/webm" } }, 415, "audio_required"],
    ["no type", { headers: { "content-type": null } }, 415, "audio_required"],
    ["a language that is not a tag", { headers: { [CLOUD_SPEECH.languageHeader]: "en; drop" } }, 400, "invalid_language"],
    ["an empty recording", { body: new Uint8Array(0) }, 400, "recording_empty"],
    ["no body", { body: null }, 400, "recording_empty"],
  ];
  for (const [name, request, status, error] of cases) {
    const { speech, calls } = provider();
    const result = await read(await createTranscribeHandlers({ provider: speech }).POST(recording(request)));
    assert.deepEqual([result.status, result.body, result.cache], [status, { error }, "no-store"], name);
    assert.equal(calls.length, 0, `${name}: nothing was sent to the provider`);
  }
});

test("a recording over the limit is refused, whether it says its size or not", async () => {
  const { speech, calls } = provider();
  const handlers = createTranscribeHandlers({ provider: speech, maxBytes: 16 });
  const declared = await read(await handlers.POST(recording({ headers: { "content-length": "17" } })));
  assert.deepEqual([declared.status, declared.body], [413, { error: "recording_too_large" }]);
  const streamed = await read(await handlers.POST(recording({ body: new Uint8Array(17) })));
  assert.deepEqual([streamed.status, streamed.body], [413, { error: "recording_too_large" }]);
  const exact = await read(await handlers.POST(recording({ body: new Uint8Array(16).fill(1) })));
  assert.equal(exact.status, 200, "the limit itself is allowed");
  assert.equal(calls.length, 1);
});

test("a recording that arrives too slowly is given up on", async () => {
  const { speech, calls } = provider();
  const stalled = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(AUDIO);
    },
  });
  const request = new Request(`${ORIGIN}${CLOUD_SPEECH.path}`, {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "audio/mp4", [CLOUD_SPEECH.agreementHeader]: CLOUD_SPEECH.agreement },
    body: stalled,
    duplex: "half",
  } as RequestInit);
  const result = await read(await createTranscribeHandlers({ provider: speech, uploadTimeoutMs: 20 }).POST(request));
  assert.deepEqual([result.status, result.body], [408, { error: "request_timeout" }]);
  assert.equal(calls.length, 0);
});

test("the language is optional, and one Whisper takes no hint for is left to the model", async () => {
  for (const [tag, expected] of [[null, null], ["en-US", "en"], ["sw-KE", "sw"], ["zh-CN", "zh"], ["tlh", null]] as const) {
    const { speech, calls } = provider();
    const response = await createTranscribeHandlers({ provider: speech }).POST(recording({ headers: { [CLOUD_SPEECH.languageHeader]: tag } }));
    assert.equal(response.status, 200, String(tag));
    assert.equal(calls[0]?.language, expected, String(tag));
  }
  assert.equal(whisperLanguage("pt-BR"), "pt");
  assert.equal(whisperLanguage("PT"), "pt");
  assert.equal(whisperLanguage("xx-YY"), null);
  for (const bad of ["", "e", "en_US", "en US", "../etc", "en-", "a".repeat(40)]) assert.equal(whisperLanguage(bad), undefined, bad);
});

test("while cloud speech is off a recording is refused before it is read", async () => {
  let read = false;
  // Nothing is pulled until a reader asks, so a pull means the handler read the recording.
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        read = true;
        controller.enqueue(AUDIO);
        controller.close();
      },
    },
    { highWaterMark: 0 },
  );
  const request = new Request(`${ORIGIN}${CLOUD_SPEECH.path}`, {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "audio/webm", [CLOUD_SPEECH.agreementHeader]: CLOUD_SPEECH.agreement },
    body,
    duplex: "half",
  } as RequestInit);
  const response = await createTranscribeHandlers({ provider: null }).POST(request);
  assert.deepEqual([response.status, await response.json()], [503, { error: "speech_unavailable" }]);
  assert.equal(read, false);
});

test("a provider failure answers with its stable code, and an unknown one says only that it failed", async () => {
  const handlers = (failure: unknown) =>
    createTranscribeHandlers({ provider: provider(() => Promise.reject(failure)).speech });
  const limit = await read(await handlers(new SpeechError(503, "speech_limit_reached")).POST(recording()));
  assert.deepEqual([limit.status, limit.body], [503, { error: "speech_limit_reached" }]);
  const unknown = await read(await handlers(new Error("token cf-secret-123 rejected")).POST(recording()));
  assert.deepEqual([unknown.status, unknown.body], [502, { error: "speech_failed" }], "the provider's own words never reach the browser");
});

test("words longer than a box holds are cut, not refused", async () => {
  const long = "word ".repeat(5000);
  const result = await read(await createTranscribeHandlers({ provider: provider(async () => ({ text: long })).speech }).POST(recording()));
  assert.equal((result.body as { text: string }).text.length, 20000);
});

/** A stand-in for Cloudflare's API that records the one request it gets. */
function cloudflare(status: number, body: unknown) {
  const requests: { url: string; init: RequestInit }[] = [];
  const send = (async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), init: init ?? {} });
    return typeof body === "string" ? new Response(body, { status }) : Response.json(body, { status });
  }) as typeof fetch;
  return { send, requests };
}
const ACCOUNT = "0123456789abcdef0123456789abcdef";
const TOKEN = "test-token-not-a-real-one-000000";
const never = new AbortController().signal;

test("the recording goes to Cloudflare's Whisper once, as base64, with the token in a header only", async () => {
  const { send, requests } = cloudflare(200, { success: true, errors: [], result: { text: "  we grow\n seedlings ", transcription_info: { duration: 3.2 } } });
  const speech = createCloudflareSpeech({ accountId: ACCOUNT, token: TOKEN, send });
  assert.deepEqual(await speech.transcribe(AUDIO, { language: "pt", signal: never }), { text: "we grow seedlings" });
  assert.equal(requests.length, 1);
  const [{ url, init }] = requests as [{ url: string; init: RequestInit }];
  assert.equal(url, `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/ai/run/@cf/openai/whisper-large-v3-turbo`);
  assert.equal(url.includes(TOKEN), false);
  assert.equal(init.method, "POST");
  assert.equal(init.redirect, "error");
  assert.equal(new Headers(init.headers).get("authorization"), `Bearer ${TOKEN}`);
  assert.deepEqual(JSON.parse(String(init.body)), {
    audio: Buffer.from(AUDIO).toString("base64"),
    task: "transcribe",
    vad_filter: true,
    language: "pt",
  });
  await createCloudflareSpeech({ accountId: ACCOUNT, token: TOKEN, send }).transcribe(AUDIO, { language: null, signal: never });
  assert.equal("language" in JSON.parse(String(requests[1]?.init.body)), false, "no hint is sent when the language is left to the model");
});

test("each way Cloudflare refuses becomes one stable code, and its message is dropped", async () => {
  const refusals: [number, unknown, number, string][] = [
    [429, { success: false, errors: [{ code: 3036, message: "You have used up your daily free allocation of 10,000 neurons." }] }, 503, "speech_limit_reached"],
    [429, { success: false, errors: [{ code: 3040, message: "Capacity temporarily exceeded, please try again." }] }, 503, "speech_busy"],
    [429, { success: false, errors: [] }, 503, "speech_busy"],
    [413, { success: false, errors: [{ code: 3006, message: "Request too large" }] }, 413, "recording_too_large"],
    [408, { success: false, errors: [{ code: 3007 }] }, 504, "speech_timeout"],
    [400, { success: false, errors: [{ code: 5004, message: "Invalid data" }] }, 422, "recording_unreadable"],
    [400, { success: false, errors: [{ code: 3003 }] }, 422, "recording_unreadable"],
    [401, { success: false, errors: [{ code: 10000, message: "Authentication error" }] }, 503, "speech_unavailable"],
    [403, { success: false, errors: [{ code: 3023, message: "Account blocked" }] }, 503, "speech_unavailable"],
    [500, { success: false, errors: [{ code: 3001 }] }, 502, "speech_failed"],
    [200, { success: false, errors: [] }, 502, "speech_failed"],
    [200, { success: true, result: { text: 7 } }, 502, "speech_failed"],
    [200, { success: true }, 502, "speech_failed"],
    [200, "<html>not json</html>", 502, "speech_failed"],
    [200, [], 502, "speech_failed"],
  ];
  for (const [status, body, expected, code] of refusals) {
    const speech = createCloudflareSpeech({ accountId: ACCOUNT, token: TOKEN, send: cloudflare(status, body).send });
    await assert.rejects(
      speech.transcribe(AUDIO, { language: null, signal: never }),
      (error: unknown) => error instanceof SpeechError && error.status === expected && error.code === code && !/neurons|blocked|Authentication/i.test(error.message),
      `${status} ${JSON.stringify(body).slice(0, 60)}`,
    );
  }
});

test("a provider that hangs, cannot be reached or is cancelled ends cleanly", async () => {
  const hang = ((_url: unknown, init?: RequestInit) =>
    new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason)))) as typeof fetch;
  await assert.rejects(
    createCloudflareSpeech({ accountId: ACCOUNT, token: TOKEN, send: hang, timeoutMs: 20 }).transcribe(AUDIO, { language: null, signal: never }),
    (error: unknown) => error instanceof SpeechError && error.status === 504 && error.code === "speech_timeout",
  );
  const down = (async () => {
    throw new TypeError(`fetch failed: Bearer ${TOKEN}`);
  }) as typeof fetch;
  await assert.rejects(
    createCloudflareSpeech({ accountId: ACCOUNT, token: TOKEN, send: down }).transcribe(AUDIO, { language: null, signal: never }),
    (error: unknown) => error instanceof SpeechError && error.code === "speech_failed" && !error.message.includes(TOKEN),
  );
  const cancel = new AbortController();
  const pending = createCloudflareSpeech({ accountId: ACCOUNT, token: TOKEN, send: hang }).transcribe(AUDIO, { language: null, signal: cancel.signal });
  cancel.abort();
  await assert.rejects(pending, (error: unknown) => !(error instanceof SpeechError), "the caller's own cancellation is not reported as the provider's failure");
});

test("cloud speech stays off until it is switched on with a well-formed account and token", () => {
  const on = { WEAVE_CLOUD_SPEECH_ENABLED: "true", WEAVE_CLOUDFLARE_ACCOUNT_ID: ACCOUNT, WEAVE_CLOUDFLARE_AI_TOKEN: TOKEN };
  assert.ok(configuredSpeech(on));
  const off: Record<string, string | undefined>[] = [
    {},
    { ...on, WEAVE_CLOUD_SPEECH_ENABLED: undefined },
    { ...on, WEAVE_CLOUD_SPEECH_ENABLED: "TRUE" },
    { ...on, WEAVE_CLOUD_SPEECH_ENABLED: "1" },
    { ...on, WEAVE_CLOUDFLARE_ACCOUNT_ID: undefined },
    { ...on, WEAVE_CLOUDFLARE_ACCOUNT_ID: "../../other" },
    { ...on, WEAVE_CLOUDFLARE_ACCOUNT_ID: ACCOUNT.toUpperCase() },
    { ...on, WEAVE_CLOUDFLARE_AI_TOKEN: undefined },
    { ...on, WEAVE_CLOUDFLARE_AI_TOKEN: "short" },
    { ...on, WEAVE_CLOUDFLARE_AI_TOKEN: `${TOKEN}\nX-Other: 1` },
  ];
  for (const env of off) assert.equal(configuredSpeech(env), null, JSON.stringify(env).replaceAll(TOKEN, "…"));
});

test("the local stand-in never answers on a deployment, and calls nothing", async () => {
  const fixture = { WEAVE_CLOUD_SPEECH_FIXTURE: "true" };
  assert.equal(configuredSpeech({ ...fixture, VERCEL: "1" }), null, "Vercel sets VERCEL on every deployment");
  assert.equal(configuredSpeech({ ...fixture, NODE_ENV: "production" }), null, "nor in any production build");
  assert.ok(configuredSpeech({ ...fixture, VERCEL: "1", WEAVE_CLOUD_SPEECH_ENABLED: "true", WEAVE_CLOUDFLARE_ACCOUNT_ID: ACCOUNT, WEAVE_CLOUDFLARE_AI_TOKEN: TOKEN }), "a deployment with the real settings uses the real provider");
  const local = configuredSpeech(fixture);
  assert.ok(local);
  const sent = globalThis.fetch;
  let called = false;
  globalThis.fetch = (async () => {
    called = true;
    throw new Error("no network in tests");
  }) as typeof fetch;
  try {
    const { text } = await local.transcribe(AUDIO, { language: null, signal: never });
    assert.ok(text.length > 0);
  } finally {
    globalThis.fetch = sent;
  }
  assert.equal(called, false);
});

test("the app reads the server's answers as data", () => {
  assert.deepEqual(parseSpeechStatus({ enabled: true, maxSeconds: 120, maxBytes: 1000 }), { enabled: true, maxSeconds: 120, maxBytes: 1000 });
  const off = { enabled: false, maxSeconds: 180, maxBytes: 3_000_000 };
  for (const bad of [null, "on", [], {}, { enabled: "true" }, { enabled: true }, { enabled: true, maxSeconds: 9999, maxBytes: 10 }, { enabled: true, maxSeconds: 60, maxBytes: 1e12 }, { enabled: true, maxSeconds: 1.5, maxBytes: 10 }])
    assert.deepEqual(parseSpeechStatus(bad), off, JSON.stringify(bad));
  assert.deepEqual(parseTranscript({ text: "words", extra: 1 }), { text: "words" });
  for (const bad of [null, {}, { text: 4 }, { text: "x".repeat(20001) }, "words"]) assert.throws(() => parseTranscript(bad));
  assert.equal(parseSpeechFailure({ error: "speech_busy" }), "speech_busy");
  for (const bad of [null, {}, { error: "made_up" }, { error: 5 }, "speech_busy"]) assert.equal(parseSpeechFailure(bad), "speech_failed");
});
