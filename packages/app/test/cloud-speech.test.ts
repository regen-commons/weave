// Cloud speech records a person's voice and sends it away from the device, so nothing records
// before their agreement, the recording goes once to Weave's own server and is then dropped, and
// every way it can stop says so and leaves typing open (the owner's decision of 23 November 2026).
import assert from "node:assert/strict";
import { test } from "node:test";
import { CLOUD_SPEECH, type SpeechStatus } from "@weave/api/transcribe-contract";
import {
  CLOUD_FINISH_MS,
  CLOUD_SEND_MS,
  cloudSession,
  cloudSpeechAvailable,
  fetchSpeechStatus,
  forgetSpeechStatus,
  recordingType,
  speechStatusOnce,
  startCloudSpeech,
  type RecorderConstructor,
  type RecorderSession,
  type RecordingDevices,
} from "../src/describe/speech-cloud.ts";
import { CLOUD_SPEECH_LOG_KEY, memoryLog, storedLog } from "../src/describe/speech-cloud-log.ts";
import { BROWSER_SPEECH_KEY, CLOUD_SPEECH_KEY, memoryConsent, storedConsent, type ConsentStorage } from "../src/describe/speech-consent.ts";
import {
  cloudSpeechUseLine,
  CLOUD_SPEECH_NOTE,
  CLOUD_SPEECH_NOTICE,
  recordingLabel,
  speechMode,
  speechNotStarted,
  speechProblem,
  speechSettingLine,
  speechSetupStore,
  SPEECH_SETTING,
  talkControls,
  talksHere,
} from "../src/describe/speech-setup.ts";
import { startSpeech, STOP_WAIT_MS, type SpeechConstructor, type Wait } from "../src/describe/speech.ts";

/** Lets every answer already given arrive. */
const settle = async () => {
  for (let turn = 0; turn < 5; turn++) await new Promise((resolve) => setImmediate(resolve));
};
const ON: SpeechStatus = { enabled: true, maxSeconds: 180, maxBytes: 3_000_000 };

/** A microphone and a recorder that a test drives by hand. */
function studio({ deny, types = ["audio/webm;codecs=opus"] }: { deny?: string; types?: string[] } = {}) {
  const track = { stopped: 0, stop() { this.stopped++; } };
  const recorders: Recorder[] = [];
  class Recorder implements RecorderSession {
    static isTypeSupported = (type: string) => types.includes(type);
    ondataavailable: RecorderSession["ondataavailable"] = null;
    onstop: RecorderSession["onstop"] = null;
    onerror: RecorderSession["onerror"] = null;
    slice: number | undefined;
    stopped = 0;
    options: { mimeType?: string; audioBitsPerSecond?: number } | undefined;
    constructor(_stream: unknown, options?: { mimeType?: string; audioBitsPerSecond?: number }) {
      this.options = options;
      recorders.push(this);
    }
    start(slice?: number) {
      this.slice = slice;
    }
    stop() {
      this.stopped++;
    }
    /** The browser hands over a piece of the recording. */
    give(bytes: number) {
      this.ondataavailable?.({ data: new Blob([new Uint8Array(bytes).fill(7)]) });
    }
    /** The browser has stopped: the last piece, then the stop. */
    end(lastBytes = 4) {
      this.give(lastBytes);
      this.onstop?.();
    }
  }
  const devices: RecordingDevices & { asked: number } = {
    asked: 0,
    async getUserMedia() {
      this.asked++;
      if (deny) throw Object.assign(new Error("refused"), { name: deny });
      return { getTracks: () => [track] };
    },
  };
  return { recorder: Recorder as unknown as RecorderConstructor, recorders, devices, track };
}

/** Weave's server, answering as told and recording what it was sent. */
function server(...answers: (Response | Error)[]) {
  const requests: { url: string; init: RequestInit; bytes: number }[] = [];
  const send = (async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), init: init ?? {}, bytes: init?.body instanceof Blob ? init.body.size : -1 });
    const answer = answers.shift() ?? Response.json({ text: "We grow seedlings" });
    if (answer instanceof Error) throw answer;
    return answer;
  }) as typeof fetch;
  return { send, requests };
}

/** A clock the test moves by hand. */
function clock() {
  const waits: { run(): void; milliseconds: number; stopped: boolean }[] = [];
  const later: Wait = (run, milliseconds) => {
    const entry = { run, milliseconds, stopped: false };
    waits.push(entry);
    return () => {
      entry.stopped = true;
    };
  };
  return { later, waits };
}

/** Records what the page would hear, in order. */
function page() {
  const heard: string[] = [];
  return {
    heard,
    callbacks: {
      result: (final: string, interim: string) => heard.push(`result:${final}|${interim}`),
      error: (problem: string) => heard.push(`error:${problem}`),
      end: (requested: boolean) => heard.push(`end:${requested}`),
    },
  };
}

test("nothing records, and the microphone is not asked for, without the person's agreement", async () => {
  const { recorder, recorders, devices } = studio();
  const { send, requests } = server();
  const options = { recorder, devices, send, status: async () => ON };
  await assert.rejects(startCloudSpeech("en-US", page().callbacks, options), /agreement/u, "no agreement given at all");
  await assert.rejects(startCloudSpeech("en-US", page().callbacks, { ...options, consent: memoryConsent(false) }), /agreement/u);
  // Withdrawn while the server was asked whether cloud speech is on.
  const consent = memoryConsent(true);
  await assert.rejects(
    startCloudSpeech("en-US", page().callbacks, { ...options, consent, status: async () => (consent.withdraw(), ON) }),
    /agreement/u,
  );
  await assert.rejects(startCloudSpeech("en-US", page().callbacks, { ...options, consent: memoryConsent(true), status: async () => ({ ...ON, enabled: false }) }), /off/u);
  await assert.rejects(startCloudSpeech("en-US", page().callbacks, { ...options, consent: memoryConsent(true), recorder: studio({ types: [] }).recorder }), /record/u);
  await assert.rejects(startCloudSpeech("en-US", page().callbacks, { ...options, consent: memoryConsent(true), devices: undefined }), /record/u);
  const cancelled = new AbortController();
  cancelled.abort();
  await assert.rejects(startCloudSpeech("en-US", page().callbacks, { ...options, consent: memoryConsent(true), signal: cancelled.signal }));
  await settle();
  assert.equal(devices.asked, 0);
  assert.equal(recorders.length, 0);
  assert.equal(requests.length, 0);
  // The agreement to the browser's speech service is not an agreement to this.
  const speech = null as SpeechConstructor | null;
  await assert.rejects(startSpeech("cloud", "en-US", page().callbacks, { speech, consent: memoryConsent(false) }), /agreement/u);
});

test("a recording is sent once, on Stop, with the language and nothing else, and then dropped", async () => {
  const { recorder, recorders, devices, track } = studio();
  const { send, requests } = server(Response.json({ text: "  We grow seedlings for the school  " }));
  const { later, waits } = clock();
  const { heard, callbacks } = page();
  const handle = await startCloudSpeech("pt-BR", callbacks, { consent: memoryConsent(true), recorder, devices, send, later, now: () => 5000, status: async () => ON });
  await settle();
  assert.equal(devices.asked, 1);
  const session = recorders[0]!;
  assert.deepEqual(session.options, { mimeType: "audio/webm;codecs=opus", audioBitsPerSecond: 32000 });
  assert.equal(session.slice, 1000, "pieces arrive each second, so the size is known as it grows");
  assert.deepEqual(cloudSession.view(), { phase: "recording", since: 5000 }, "Talk It Out can show the time used");
  assert.deepEqual(waits.map((wait) => wait.milliseconds), [180000], "one limit, the longest a recording runs");
  session.give(100);
  session.give(100);
  assert.deepEqual(heard, [], "no words come back while it records");
  assert.equal(requests.length, 0, "nothing is sent while it records");
  handle.stop();
  assert.equal(session.stopped, 1);
  handle.stop();
  assert.equal(session.stopped, 1, "a second press stops nothing more");
  assert.equal(requests.length, 0, "the recorder hands over its last piece first");
  session.end(50);
  assert.equal(track.stopped, 1, "the microphone is let go before the recording is sent");
  assert.equal(cloudSession.view().phase, "sending", "Talk It Out says it is on its way");
  await settle();
  assert.equal(cloudSession.view().phase, "idle");
  assert.equal(requests.length, 1);
  const [{ url, init, bytes }] = requests as [(typeof requests)[number]];
  assert.equal(url, "/api/transcribe", "Weave's own server, the only address the page may call");
  assert.equal(init.method, "POST");
  assert.equal(bytes, 250, "every piece, the last one included");
  assert.deepEqual(Object.fromEntries(new Headers(init.headers)), {
    "content-type": "audio/webm",
    "x-weave-speech-agreement": "cloud",
    "x-weave-speech-language": "pt-BR",
  });
  assert.equal(init.credentials, "omit", "no session cookie goes with the recording");
  assert.equal(init.cache, "no-store");
  assert.deepEqual(heard, ["result:We grow seedlings for the school|", "end:true"], "the words once, then the person's Stop");
  assert.ok(waits.every((wait) => wait.stopped), "no limit or wait is left running");
  handle.stop();
  handle.dispose();
  session.end();
  await settle();
  assert.equal(requests.length, 1, "a finished session sends nothing again");
  assert.deepEqual(heard.length, 2);
});

test("Safari's and Firefox's recordings are sent as what they are", async () => {
  for (const [types, sent] of [[["audio/mp4"], "audio/mp4"], [["audio/ogg;codecs=opus"], "audio/ogg"], [["audio/webm"], "audio/webm"]] as const) {
    const { recorder, recorders, devices } = studio({ types: [...types] });
    const { send, requests } = server();
    const handle = await startCloudSpeech("en-US", page().callbacks, { consent: memoryConsent(true), recorder, devices, send, status: async () => ON });
    await settle();
    handle.stop();
    recorders[0]!.end();
    await settle();
    assert.equal(new Headers(requests[0]?.init.headers).get("content-type"), sent);
  }
  assert.equal(recordingType(studio({ types: ["video/webm"] }).recorder), null);
  assert.equal(recordingType(undefined), null);
});

test("a refused or missing microphone says so, and nothing is sent", async () => {
  for (const [name, problem] of [["NotAllowedError", "not-allowed"], ["SecurityError", "not-allowed"], ["NotFoundError", "audio-capture"], ["NotReadableError", "audio-capture"]] as const) {
    const { recorder, recorders, devices } = studio({ deny: name });
    const { send, requests } = server();
    const { heard, callbacks } = page();
    await startCloudSpeech("en-US", callbacks, { consent: memoryConsent(true), recorder, devices, send, status: async () => ON });
    await settle();
    assert.deepEqual(heard, [`error:${problem}`, "end:false"], name);
    assert.equal(recorders.length, 0);
    assert.equal(requests.length, 0);
    assert.match(speechProblem(problem, "cloud"), /type in the box\.$/u);
  }
});

test("withdrawing the agreement stops the recording at once and sends nothing", async () => {
  const { recorder, recorders, devices, track } = studio();
  const { send, requests } = server();
  const { heard, callbacks } = page();
  const consent = memoryConsent(true);
  await startCloudSpeech("en-US", callbacks, { consent, recorder, devices, send, status: async () => ON });
  await settle();
  recorders[0]!.give(100);
  consent.withdraw();
  assert.deepEqual(heard, ["error:withdrawn", "end:false"]);
  assert.equal(recorders[0]!.stopped, 1);
  assert.equal(track.stopped, 1);
  assert.equal(cloudSession.view().phase, "idle");
  recorders[0]!.end();
  await settle();
  assert.equal(requests.length, 0, "the recording made before the withdrawal is dropped, not sent");
  assert.match(speechProblem("withdrawn", "cloud"), /^Cloud speech was turned off in Settings\. Nothing was sent/u);
  assert.match(speechProblem("withdrawn", "browser"), /^Browser speech was turned off/u);

  // Withdrawn while the recording is on its way: the request is cancelled and no words are shown.
  const later = studio();
  let cancelled = false;
  const slow = ((_url: unknown, init?: RequestInit) =>
    new Promise((_resolve, reject) =>
      init?.signal?.addEventListener("abort", () => {
        cancelled = true;
        reject(new DOMException("Aborted", "AbortError"));
      }),
    )) as typeof fetch;
  const second = page();
  const agreed = memoryConsent(true);
  const handle = await startCloudSpeech("en-US", second.callbacks, { consent: agreed, recorder: later.recorder, devices: later.devices, send: slow, status: async () => ON });
  await settle();
  handle.stop();
  later.recorders[0]!.end();
  await settle();
  agreed.withdraw();
  await settle();
  assert.equal(cancelled, true);
  assert.deepEqual(second.heard, ["error:withdrawn-sending", "end:false"]);
  // It was cancelled, but may have arrived first, so the page does not claim that nothing was sent.
  assert.doesNotMatch(speechProblem("withdrawn-sending", "cloud"), /Nothing was sent|not kept/u);
  assert.match(speechProblem("withdrawn-sending", "cloud"), /No words were added, and you can type in the box\.$/u);
});

test("each way the server can refuse says what happened, that the recording was not kept, and keeps typing open", async () => {
  const refusals: [Response | Error, boolean, string, RegExp][] = [
    [Response.json({ error: "speech_limit_reached" }, { status: 503 }), true, "cloud-limit", /reached its limit for today/u],
    [Response.json({ error: "speech_busy" }, { status: 503 }), true, "cloud-busy", /^Cloudflare is busy right now/u],
    [Response.json({ error: "speech_unavailable" }, { status: 503 }), true, "cloud-off", /not available right now/u],
    [Response.json({ error: "recording_too_large" }, { status: 413 }), true, "cloud-too-long", /too long to send/u],
    [Response.json({ error: "recording_unreadable" }, { status: 422 }), true, "cloud-unreadable", /could not be read/u],
    [Response.json({ error: "speech_timeout" }, { status: 504 }), true, "cloud-failed", /could not be turned into text/u],
    [Response.json({ error: "made_up" }, { status: 500 }), true, "cloud-failed", /could not be turned into text/u],
    [new Response("<html>", { status: 502 }), true, "cloud-failed", /could not be turned into text/u],
    [Response.json({ words: "not a transcript" }), true, "cloud-failed", /could not be turned into text/u],
    [new TypeError("Failed to fetch"), true, "cloud-unreachable", /could not be sent/u],
    [new TypeError("Failed to fetch"), false, "cloud-offline", /You are offline/u],
  ];
  for (const [answer, online, problem, said] of refusals) {
    const { recorder, recorders, devices } = studio();
    const { send, requests } = server(answer, Response.json({ text: "never asked for" }));
    const { heard, callbacks } = page();
    const handle = await startCloudSpeech("en-US", callbacks, { consent: memoryConsent(true), recorder, devices, send, status: async () => ON, online: () => online, log: memoryLog() });
    await settle();
    handle.stop();
    recorders[0]!.end();
    await settle();
    assert.deepEqual(heard, [`error:${problem}`, "end:false"], problem);
    assert.equal(requests.length, 1, `${problem}: sent once and never tried again`);
    const line = speechProblem(problem, "cloud");
    assert.match(line, said, problem);
    assert.match(line, /(It|The recording) was not kept\./u, `${problem}: the recording is gone`);
    assert.match(line, /type in the box\.$/u, `${problem}: typing still works`);
    assert.doesNotMatch(line, /[—→]/u);
  }
});

test("silence, or a recording with nothing in it, is said plainly as no speech", async () => {
  const empty = studio();
  const none = server();
  const first = page();
  const one = await startCloudSpeech("en-US", first.callbacks, { consent: memoryConsent(true), recorder: empty.recorder, devices: empty.devices, send: none.send, status: async () => ON });
  await settle();
  one.stop();
  empty.recorders[0]!.end(0);
  await settle();
  assert.deepEqual(first.heard, ["error:no-speech", "end:false"]);
  assert.equal(none.requests.length, 0, "an empty recording is not sent");

  const quiet = studio();
  const blank = server(Response.json({ text: "   " }));
  const second = page();
  const two = await startCloudSpeech("en-US", second.callbacks, { consent: memoryConsent(true), recorder: quiet.recorder, devices: quiet.devices, send: blank.send, status: async () => ON });
  await settle();
  two.stop();
  quiet.recorders[0]!.end();
  await settle();
  assert.deepEqual(second.heard, ["error:no-speech", "end:false"], "the page never fills fields from nothing");
});

test("a recording stops by itself at the time limit or before it outgrows what the server takes", async () => {
  const timed = studio();
  const first = server();
  const { later, waits } = clock();
  const one = page();
  await startCloudSpeech("en-US", one.callbacks, { consent: memoryConsent(true), recorder: timed.recorder, devices: timed.devices, send: first.send, later, status: async () => ({ ...ON, maxSeconds: 60 }) });
  await settle();
  assert.equal(waits[0]?.milliseconds, 60000, "the server's limit is the one used");
  waits[0]!.run();
  assert.equal(timed.recorders[0]!.stopped, 1);
  // No press brought this about, so the session itself says the recording is on its way.
  assert.equal(cloudSession.view().phase, "sending");
  assert.equal(talkControls("cloud", { agreed: true, listening: true, stopping: true }).note, "Sending your recording to Cloudflare to be turned into text.");
  timed.recorders[0]!.end();
  await settle();
  assert.deepEqual(one.heard, ["result:We grow seedlings|", "end:true"], "what was said in time is turned into text, as after Stop");

  const large = studio();
  const second = server();
  const two = page();
  await startCloudSpeech("en-US", two.callbacks, { consent: memoryConsent(true), recorder: large.recorder, devices: large.devices, send: second.send, status: async () => ({ ...ON, maxBytes: 1000 }) });
  await settle();
  large.recorders[0]!.give(500);
  assert.equal(large.recorders[0]!.stopped, 0);
  large.recorders[0]!.give(450);
  assert.equal(large.recorders[0]!.stopped, 1, "stopped while it still fits");
  large.recorders[0]!.end(20);
  await settle();
  assert.equal(second.requests[0]?.bytes, 970);
  assert.ok(second.requests[0]!.bytes <= 1000);
  assert.deepEqual(two.heard, ["result:We grow seedlings|", "end:true"]);
});

test("Stop before the microphone answers ends quietly, and leaving the page drops the recording", async () => {
  // The browser is still asking about the microphone when Stop is pressed.
  let grant: (stream: { getTracks(): { stop(): void }[] }) => void = () => {};
  const track = { stopped: 0, stop() { this.stopped++; } };
  const waiting: RecordingDevices = { getUserMedia: () => new Promise((resolve) => (grant = resolve)) };
  const { recorder, recorders } = studio();
  const { send, requests } = server();
  const { heard, callbacks } = page();
  const handle = await startCloudSpeech("en-US", callbacks, { consent: memoryConsent(true), recorder, devices: waiting, send, status: async () => ON });
  assert.equal(cloudSession.view().phase, "starting", "nothing is recorded yet, and Talk It Out says so");
  handle.stop();
  assert.deepEqual(heard, ["error:aborted", "end:false"], "ended at once, whether or not the browser ever answers");
  assert.equal(cloudSession.view().phase, "idle");
  grant({ getTracks: () => [track] });
  await settle();
  assert.deepEqual(heard, ["error:aborted", "end:false"], "a late answer ends nothing twice");
  assert.equal(speechProblem("aborted", "cloud"), "", "nothing to say: the person stopped it themselves");
  assert.equal(track.stopped, 1, "the microphone is let go at once");
  assert.equal(recorders.length, 0);
  assert.equal(requests.length, 0);

  // The page goes away mid-recording: no words, no end, nothing sent.
  const leaving = studio();
  const gone = server();
  const second = page();
  const cancel = new AbortController();
  await startCloudSpeech("en-US", second.callbacks, { consent: memoryConsent(true), recorder: leaving.recorder, devices: leaving.devices, send: gone.send, signal: cancel.signal, status: async () => ON });
  await settle();
  leaving.recorders[0]!.give(100);
  cancel.abort();
  assert.equal(leaving.recorders[0]!.stopped, 1);
  assert.equal(leaving.track.stopped, 1);
  leaving.recorders[0]!.end();
  await settle();
  assert.equal(gone.requests.length, 0);
  assert.deepEqual(second.heard, []);

  // Disposed while the microphone was still being asked for.
  let late: (stream: { getTracks(): { stop(): void }[] }) => void = () => {};
  const lateTrack = { stopped: 0, stop() { this.stopped++; } };
  const third = await startCloudSpeech("en-US", page().callbacks, { consent: memoryConsent(true), recorder, devices: { getUserMedia: () => new Promise((resolve) => (late = resolve)) }, send, status: async () => ON });
  third.dispose();
  late({ getTracks: () => [lateTrack] });
  await settle();
  assert.equal(lateTrack.stopped, 1);
});

test("a recorder that breaks says the microphone could not be used", async () => {
  const { recorder, recorders, devices, track } = studio();
  const { send, requests } = server();
  const { heard, callbacks } = page();
  await startCloudSpeech("en-US", callbacks, { consent: memoryConsent(true), recorder, devices, send, status: async () => ON });
  await settle();
  recorders[0]!.onerror?.();
  assert.deepEqual(heard, ["error:audio-capture", "end:false"]);
  assert.equal(track.stopped, 1);
  assert.equal(requests.length, 0);
});

test("the server is asked about cloud speech only where the browser can record, and any doubt means off", async () => {
  const { recorder, devices } = studio();
  let asked = 0;
  const status = async () => (asked++, ON);
  assert.equal(await cloudSpeechAvailable({ recorder, devices, status }), true);
  assert.equal(asked, 1);
  assert.equal(await cloudSpeechAvailable({ recorder: studio({ types: [] }).recorder, devices, status }), false);
  assert.equal(await cloudSpeechAvailable({ recorder, devices: undefined, status }), false);
  assert.equal(asked, 1, "a browser that cannot record never calls the server");
  assert.equal(await cloudSpeechAvailable({ recorder, devices, status: async () => ({ ...ON, enabled: false }) }), false);

  // An answer, on or off, is an answer. Anything else is no answer at all.
  const answers: [Response | Error, boolean | null][] = [
    [Response.json({ enabled: true, maxSeconds: 180, maxBytes: 3_000_000 }), true],
    [Response.json({ enabled: false, maxSeconds: 180, maxBytes: 3_000_000 }), false],
    [Response.json({ enabled: true }), false],
    [Response.json({ enabled: true, maxSeconds: 180, maxBytes: 3_000_000 }, { status: 500 }), null],
    [Response.json({ other: 1 }), null],
    [new Response("<!doctype html>", { status: 200 }), null],
    [new TypeError("Failed to fetch"), null],
  ];
  for (const [answer, enabled] of answers) {
    const { send, requests } = server(answer);
    assert.equal((await fetchSpeechStatus(send))?.enabled ?? null, enabled);
    assert.equal(requests[0]?.url, CLOUD_SPEECH.path);
    assert.equal(requests[0]?.init.method, undefined, "a plain GET");
    assert.equal(requests[0]?.init.credentials, "omit");
  }
  // The server is asked once a visit, whatever it answers, and again only if it did not answer.
  for (const [reply, calls] of [[ON, 1], [{ ...ON, enabled: false }, 1], [null, 3]] as const) {
    forgetSpeechStatus();
    let count = 0;
    const ask = async () => (count++, reply);
    for (let time = 0; time < 3; time++) assert.equal((await speechStatusOnce(ask)).enabled, reply?.enabled ?? false);
    assert.equal(count, calls, JSON.stringify(reply));
  }
  forgetSpeechStatus();
});

test("cloud speech is offered only where the browser has no speech recognition at all", async () => {
  let asked = 0;
  const cloud = async () => (asked++, true);
  const none = speechSetupStore({ speech: null, cloud });
  none.check("en-US");
  await settle();
  assert.equal(none.state("en-US"), "cloud");
  assert.equal(speechMode("cloud"), "cloud");
  assert.equal(talksHere("cloud"), true);
  assert.equal(asked, 1);

  // A browser with its own speech service, as Safari has, keeps it: cloud speech is never asked about.
  class Service {
    lang = "";
    continuous = false;
    interimResults = false;
    onresult = null;
    onerror = null;
    onend = null;
    start() {}
    stop() {}
    abort() {}
  }
  const safari = speechSetupStore({ speech: Service as unknown as SpeechConstructor, cloud });
  safari.check("en-US");
  await settle();
  assert.equal(safari.state("en-US"), "browser");
  assert.equal(asked, 1);

  // Where the server has it off, cannot be reached, or the question fails, it is plain "none".
  for (const answer of [async () => false, async () => Promise.reject(new Error("offline"))]) {
    const off = speechSetupStore({ speech: null, cloud: answer });
    off.check("en-US");
    await settle();
    assert.equal(off.state("en-US"), "none");
  }
  // Left to itself in a place with no microphone API, as in this test run, nothing is asked of any server.
  const plain = speechSetupStore({ speech: null });
  plain.check("en-US");
  await settle();
  assert.equal(plain.state("en-US"), "none");
});

test("Talk It Out says where the recording goes before, during and after, and asks first", () => {
  const before = talkControls("cloud");
  assert.deepEqual([before.action, before.label, before.mode, before.agreement], ["talk", "Talk It Out", "cloud", true]);
  assert.equal(before.note, CLOUD_SPEECH_NOTE);
  assert.match(CLOUD_SPEECH_NOTE, /with Cloudflare\. It asks first\.$/u);
  const agreed = talkControls("cloud", { agreed: true });
  assert.deepEqual([agreed.action, agreed.agreement, agreed.language, agreed.note], ["talk", false, true, ""]);
  const recording = talkControls("cloud", { agreed: true, listening: true });
  assert.deepEqual([recording.action, recording.label], ["stop", "Stop"]);
  assert.equal(recording.note, "Recording. Nothing is sent yet.");
  // Until the browser opens the microphone, which may wait on its own question, nothing is recorded.
  const waiting = talkControls("cloud", { agreed: true, listening: true, starting: true });
  assert.deepEqual([waiting.action, waiting.note], ["stop", "Waiting for the microphone. Nothing is recorded yet."]);
  assert.equal(talkControls("ready", { listening: true, starting: true }).note, talkControls("ready", { listening: true }).note, "only cloud speech waits this way");
  const sending = talkControls("cloud", { agreed: true, listening: true, stopping: true });
  assert.deepEqual([sending.action, sending.label], ["finishing", "Finishing"]);
  assert.equal(sending.note, "Sending your recording to Cloudflare to be turned into text.");
  // Neither other way of talking ever says a recording is sent.
  for (const state of ["ready", "browser"] as const)
    for (const options of [{}, { agreed: true }, { listening: true }, { listening: true, stopping: true }])
      assert.doesNotMatch(talkControls(state, options).note, /Recording|Cloudflare|sent yet/u, state);
  // A second list on the page gets Talk It Out too, and the agreement asked for in one counts for both.
  assert.equal(talkControls("cloud", { secondary: true }).action, "talk");
  // The notice is plain sentences, names the provider and offers a way out.
  assert.equal(CLOUD_SPEECH_NOTICE.title, "Send Your Recording To Be Turned Into Text?");
  assert.deepEqual([CLOUD_SPEECH_NOTICE.agree, CLOUD_SPEECH_NOTICE.decline], ["Agree And Record", "Not Now"]);
  for (const line of [...CLOUD_SPEECH_NOTICE.body, CLOUD_SPEECH_NOTE, SPEECH_SETTING.cloudAgreed, speechNotStarted("cloud")]) {
    assert.match(line, /^[A-Z][^]*\.$/u, line);
    assert.doesNotMatch(line, /[—→·]/u, line);
  }
  assert.match(CLOUD_SPEECH_NOTICE.body.join(" "), /Typing always works instead/u);
  assert.match(CLOUD_SPEECH_NOTICE.body[0]!, /when you press Stop or the recording reaches its limit of 3 minutes at most, send it to Cloudflare Workers AI/u, "said before agreeing: the limit sends it too");
  assert.match(speechNotStarted("cloud"), /Nothing was sent/u);
});

test("the box counts the time while it records, up to the limit", () => {
  assert.equal(recordingLabel("starting"), "Waiting for the microphone", "nothing is recorded until the browser opens the microphone");
  assert.equal(recordingLabel("recording", 0), "Recording 0:00 of 3:00");
  assert.equal(recordingLabel("recording", 42.9), "Recording 0:42 of 3:00");
  assert.equal(recordingLabel("recording", 125), "Recording 2:05 of 3:00");
  assert.equal(recordingLabel("recording", 999), "Recording 3:00 of 3:00", "never past the limit");
  assert.equal(recordingLabel("recording", 30, 60), "Recording 0:30 of 1:00");
  assert.equal(recordingLabel("example"), "Recording", "an example records nothing, so it counts nothing");
  assert.ok(CLOUD_FINISH_MS > STOP_WAIT_MS, "sending a recording may take longer than a recognizer's last words");
  assert.ok(CLOUD_FINISH_MS > CLOUD_SEND_MS, "Finishing lasts as long as the one send may");
});

test("the two agreements are kept apart, and Settings says which are in force", () => {
  const values = new Map<string, string>();
  const storage: ConsentStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  };
  const events = new EventTarget();
  const browser = storedConsent(() => storage, events);
  const cloud = storedConsent(() => storage, events, CLOUD_SPEECH_KEY);
  let browserChanges = 0;
  let cloudChanges = 0;
  browser.subscribe(() => browserChanges++);
  cloud.subscribe(() => cloudChanges++);
  cloud.agree();
  assert.deepEqual([browser.agreed(), cloud.agreed()], [false, true], "agreeing to cloud speech is not agreeing to browser speech");
  assert.deepEqual([...values.keys()], [CLOUD_SPEECH_KEY]);
  assert.deepEqual([browserChanges, cloudChanges], [0, 1], "each agreement tells only its own listeners");
  browser.agree();
  cloud.withdraw();
  assert.deepEqual([browser.agreed(), cloud.agreed()], [true, false]);
  assert.deepEqual([...values.keys()], [BROWSER_SPEECH_KEY]);

  assert.equal(speechSettingLine(false, false), SPEECH_SETTING.notAgreed);
  assert.match(SPEECH_SETTING.notAgreed, /Weave asks before your voice leaves this device\.$/u);
  assert.equal(speechSettingLine(true, false), SPEECH_SETTING.agreed);
  assert.equal(speechSettingLine(false, true), SPEECH_SETTING.cloudAgreed);
  assert.equal(speechSettingLine(true, true), `${SPEECH_SETTING.agreed} ${SPEECH_SETTING.cloudAgreed}`);
  assert.match(SPEECH_SETTING.cloudAgreed, /Cloudflare Workers AI[^]*Weave does not keep it\.$/u);
  assert.equal(SPEECH_SETTING.withdrawCloud, "Stop Using Cloud Speech");
});

test("the device notes each recording sent, with its time and length and nothing of what was said", async () => {
  const log = memoryLog();
  let changes = 0;
  log.subscribe(() => changes++);
  // Sent, and words came back.
  const { recorder, recorders, devices } = studio();
  let time = Date.parse("2026-11-23T10:00:00.000Z");
  const first = await startCloudSpeech("en-US", page().callbacks, { consent: memoryConsent(true), recorder, devices, send: server().send, status: async () => ON, now: () => time, log });
  await settle();
  time += 42_400;
  first.stop();
  recorders[0]!.end();
  await settle();
  assert.deepEqual(log.list(), [{ at: "2026-11-23T10:00:42.400Z", seconds: 42 }]);
  // Sent, and the server refused: it still left the device, so it is still noted, once.
  const failing = studio();
  const second = await startCloudSpeech("en-US", page().callbacks, { consent: memoryConsent(true), recorder: failing.recorder, devices: failing.devices, send: server(Response.json({ error: "speech_limit_reached" }, { status: 503 })).send, status: async () => ON, now: () => time, log });
  await settle();
  second.stop();
  failing.recorders[0]!.end();
  await settle();
  assert.equal(log.list().length, 2);
  // Never sent: an empty recording, a withdrawn agreement, a refused microphone.
  const empty = studio();
  const third = await startCloudSpeech("en-US", page().callbacks, { consent: memoryConsent(true), recorder: empty.recorder, devices: empty.devices, send: server().send, status: async () => ON, log });
  await settle();
  third.stop();
  empty.recorders[0]!.end(0);
  const consent = memoryConsent(true);
  const withdrawn = studio();
  await startCloudSpeech("en-US", page().callbacks, { consent, recorder: withdrawn.recorder, devices: withdrawn.devices, send: server().send, status: async () => ON, log });
  await settle();
  consent.withdraw();
  const refused = studio({ deny: "NotAllowedError" });
  await startCloudSpeech("en-US", page().callbacks, { consent: memoryConsent(true), recorder: refused.recorder, devices: refused.devices, send: server().send, status: async () => ON, log });
  await settle();
  // The length is the recording's, however long the answer took to come back.
  assert.equal(log.list()[1]?.seconds, 0, "stopped the moment it began, in this test's clock");
  const slowAnswer = studio();
  let clockNow = Date.parse("2026-11-23T11:00:00.000Z");
  const lengths = memoryLog();
  const answering = ((..._args: unknown[]) => {
    clockNow += 30_000;
    return Promise.resolve(Response.json({ text: "after a long wait" }));
  }) as typeof fetch;
  const timedSession = await startCloudSpeech("en-US", page().callbacks, { consent: memoryConsent(true), recorder: slowAnswer.recorder, devices: slowAnswer.devices, send: answering, status: async () => ON, now: () => clockNow, log: lengths });
  await settle();
  clockNow += 10_000;
  timedSession.stop();
  slowAnswer.recorders[0]!.end();
  await settle();
  assert.deepEqual(lengths.list(), [{ at: "2026-11-23T11:00:10.000Z", seconds: 10 }], "ten seconds recorded, noted when it was sent");
  // Leaving the page while it is on its way cancels the request, but it had been sent: it is counted.
  const leaving = studio();
  const left = memoryLog();
  const hanging = ((_url: unknown, init?: RequestInit) =>
    new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))))) as typeof fetch;
  const going = await startCloudSpeech("en-US", page().callbacks, { consent: memoryConsent(true), recorder: leaving.recorder, devices: leaving.devices, send: hanging, status: async () => ON, log: left });
  await settle();
  going.stop();
  leaving.recorders[0]!.end();
  await settle();
  assert.equal(left.list().length, 0, "not counted before anything is known");
  going.dispose();
  await settle();
  assert.equal(left.list().length, 1, "sent, then cancelled: it left the device");
  // Offline, the recording never left, so it is not counted as sent.
  const offline = studio();
  const fourth = await startCloudSpeech("en-US", page().callbacks, { consent: memoryConsent(true), recorder: offline.recorder, devices: offline.devices, send: server(new TypeError("Failed to fetch")).send, status: async () => ON, online: () => false, log });
  await settle();
  fourth.stop();
  offline.recorders[0]!.end();
  await settle();
  assert.equal(log.list().length, 2, "only what left the device is noted");
  assert.equal(changes, 2);
  assert.deepEqual(Object.keys(log.list()[0]!), ["at", "seconds"], "no words, no audio, no language");

  // Settings says how many, and when the last one was. It says nothing where none was sent.
  assert.equal(cloudSpeechUseLine([]), "");
  assert.equal(cloudSpeechUseLine(log.list().slice(0, 1)), "This device has sent 1 recording to be turned into text, on 23 November 2026.");
  assert.equal(cloudSpeechUseLine(log.list()), "This device has sent 2 recordings to be turned into text, the last on 23 November 2026.");
});

test("the device's record is read as data, kept short, and kept for the visit where storage refuses", () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => void values.set(key, value) };
  const log = storedLog(() => storage, undefined);
  assert.deepEqual(log.list(), []);
  assert.equal(log.list(), log.list(), "the same list until it changes, so a page does not render again for nothing");
  log.add({ at: "2026-11-23T10:00:00.000Z", seconds: 12 });
  assert.deepEqual(JSON.parse(values.get(CLOUD_SPEECH_LOG_KEY)!), [{ at: "2026-11-23T10:00:00.000Z", seconds: 12 }]);
  // Whatever else is in storage is dropped, not trusted.
  values.set(CLOUD_SPEECH_LOG_KEY, JSON.stringify([{ at: "2026-11-23T10:00:00.000Z", seconds: 12, words: "secret" }, { at: "not a date", seconds: 1 }, { at: "2026-11-23T10:00:00.000Z", seconds: -1 }, "x", null]));
  assert.deepEqual(log.list(), [{ at: "2026-11-23T10:00:00.000Z", seconds: 12 }]);
  for (const junk of ["{", "null", '"text"', "{}"]) {
    values.set(CLOUD_SPEECH_LOG_KEY, junk);
    assert.deepEqual(log.list(), [], junk);
  }
  values.delete(CLOUD_SPEECH_LOG_KEY);
  for (let use = 0; use < 130; use++) log.add({ at: new Date(Date.UTC(2026, 10, 23, 0, use)).toISOString(), seconds: use });
  assert.equal(log.list().length, 100, "the oldest drop off");
  assert.equal(log.list().at(-1)?.seconds, 129);
  // A browser that refuses storage keeps the record for this visit, and never throws.
  const refusing = storedLog(() => {
    throw new Error("blocked");
  }, undefined);
  refusing.add({ at: "2026-11-23T10:00:00.000Z", seconds: 3 });
  assert.deepEqual(refusing.list(), [{ at: "2026-11-23T10:00:00.000Z", seconds: 3 }]);
});

test("Discard drops the recording unsent, and is too late only once it is on its way", async () => {
  const { recorder, recorders, devices, track } = studio();
  const { send, requests } = server();
  const { heard, callbacks } = page();
  const log = memoryLog();
  await startCloudSpeech("en-US", callbacks, { consent: memoryConsent(true), recorder, devices, send, status: async () => ON, log });
  await settle();
  recorders[0]!.give(300);
  cloudSession.discard();
  assert.deepEqual(heard, ["error:discarded", "end:false"]);
  assert.equal(recorders[0]!.stopped, 1);
  assert.equal(track.stopped, 1);
  assert.equal(cloudSession.view().phase, "idle");
  recorders[0]!.end();
  await settle();
  assert.equal(requests.length, 0);
  assert.equal(log.list().length, 0);
  assert.equal(speechProblem("discarded", "cloud"), "The recording was discarded. Nothing was sent. Press Talk It Out to try again, or type in the box.");
  cloudSession.discard();
  assert.deepEqual(heard.length, 2, "with nothing recording, Discard does nothing");

  // Once Stop has been pressed the recording is on its way, and Discard cannot call it back.
  const sent = studio();
  const second = page();
  const gone = server();
  const handle = await startCloudSpeech("en-US", second.callbacks, { consent: memoryConsent(true), recorder: sent.recorder, devices: sent.devices, send: gone.send, status: async () => ON, log: memoryLog() });
  await settle();
  handle.stop();
  cloudSession.discard();
  sent.recorders[0]!.end();
  await settle();
  assert.deepEqual(second.heard, ["result:We grow seedlings|", "end:true"]);
});

test("a recorder that stops by itself sends nothing, and one that never says it stopped still ends", async () => {
  // The microphone is unplugged, or its sharing is stopped from the browser's own indicator: the
  // person did not press Stop and the limit was not reached, so the recording is dropped.
  const unplugged = studio();
  const first = server();
  const one = page();
  const dropped = memoryLog();
  await startCloudSpeech("en-US", one.callbacks, { consent: memoryConsent(true), recorder: unplugged.recorder, devices: unplugged.devices, send: first.send, status: async () => ON, log: dropped });
  await settle();
  unplugged.recorders[0]!.give(200);
  unplugged.recorders[0]!.end(10);
  await settle();
  assert.equal(first.requests.length, 0, "nothing is sent without Stop or the limit");
  assert.deepEqual(one.heard, ["error:cloud-interrupted", "end:false"]);
  assert.equal(dropped.list().length, 0);
  assert.equal(cloudSession.view().phase, "idle");
  assert.equal(unplugged.track.stopped, 1);
  assert.equal(speechProblem("cloud-interrupted", "cloud"), "The microphone stopped, so the recording was dropped. Nothing was sent. Press Talk It Out to try again, or type in the box.");

  // Stop is pressed and the recorder never reports that it stopped.
  const silent = studio();
  const second = server();
  const two = page();
  const { later, waits } = clock();
  const handle = await startCloudSpeech("en-US", two.callbacks, { consent: memoryConsent(true), recorder: silent.recorder, devices: silent.devices, send: second.send, later, status: async () => ON, log: memoryLog() });
  await settle();
  silent.recorders[0]!.give(120);
  handle.stop();
  await settle();
  assert.deepEqual(two.heard, [], "it has a moment to hand over its last piece");
  const watchdog = waits.find((wait) => !wait.stopped);
  assert.equal(watchdog?.milliseconds, 5000);
  watchdog!.run();
  await settle();
  assert.equal(second.requests[0]?.bytes, 120);
  assert.deepEqual(two.heard, ["result:We grow seedlings|", "end:true"]);
  silent.recorders[0]!.end();
  await settle();
  assert.equal(second.requests.length, 1, "a late stop sends nothing twice");

  // A recorder whose stop() throws, as one already inactive does.
  const broken = studio();
  const third = server();
  const three = page();
  const last = await startCloudSpeech("en-US", three.callbacks, { consent: memoryConsent(true), recorder: broken.recorder, devices: broken.devices, send: third.send, status: async () => ON, log: memoryLog() });
  await settle();
  broken.recorders[0]!.give(64);
  broken.recorders[0]!.stop = () => {
    throw new DOMException("inactive", "InvalidStateError");
  };
  last.stop();
  await settle();
  assert.equal(third.requests[0]?.bytes, 64);
  assert.deepEqual(three.heard, ["result:We grow seedlings|", "end:true"]);
});

test("the page hears one end whatever it does with the words", async () => {
  // The page's own handling of the words fails: the session still ends, once.
  const { recorder, recorders, devices } = studio();
  const heard: string[] = [];
  const handle = await startCloudSpeech(
    "en-US",
    {
      result: () => {
        heard.push("result");
        throw new Error("the page could not take the words");
      },
      error: (problem) => heard.push(`error:${problem}`),
      end: (requested) => heard.push(`end:${requested}`),
    },
    { consent: memoryConsent(true), recorder, devices, send: server().send, status: async () => ON, log: memoryLog() },
  );
  await settle();
  const reported: unknown[] = [];
  const scope = globalThis as { reportError?: (error: unknown) => void };
  const before = scope.reportError;
  scope.reportError = (error) => void reported.push(error);
  try {
    handle.stop();
    recorders[0]!.end();
    await settle();
  } finally {
    scope.reportError = before;
  }
  assert.deepEqual(heard, ["result", "end:true"]);
  assert.equal(reported.length, 1, "the page's failure is reported, not hidden");

  // The page ends the session from inside `result`, as when its box is full: no end after that,
  // which is what the other ways of talking do.
  const full = studio();
  const second: string[] = [];
  const cancel = new AbortController();
  const other = await startCloudSpeech(
    "en-US",
    { result: () => (second.push("result"), cancel.abort()), error: (problem) => second.push(`error:${problem}`), end: (requested) => second.push(`end:${requested}`) },
    { consent: memoryConsent(true), recorder: full.recorder, devices: full.devices, send: server().send, signal: cancel.signal, status: async () => ON, log: memoryLog() },
  );
  await settle();
  other.stop();
  full.recorders[0]!.end();
  await settle();
  assert.deepEqual(second, ["result"]);
});

test("what Talk It Out shows follows the session that is running, not one that ended late", async () => {
  const first = studio();
  const second = studio();
  const options = { send: server().send, status: async () => ON, log: memoryLog() };
  const earlier = await startCloudSpeech("en-US", page().callbacks, { ...options, consent: memoryConsent(true), recorder: first.recorder, devices: first.devices });
  await settle();
  const later = await startCloudSpeech("en-US", page().callbacks, { ...options, consent: memoryConsent(true), recorder: second.recorder, devices: second.devices, now: () => 9000 });
  await settle();
  assert.deepEqual(cloudSession.view(), { phase: "recording", since: 9000 });
  earlier.dispose();
  assert.deepEqual(cloudSession.view(), { phase: "recording", since: 9000 }, "an older session ending changes nothing");
  cloudSession.discard();
  assert.equal(second.recorders[0]!.stopped, 1, "Discard is the running session's");
  assert.equal(cloudSession.view().phase, "idle");
  later.dispose();
});
