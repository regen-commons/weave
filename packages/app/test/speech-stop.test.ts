// Stop never ends in silence (23 November 2026). A person pressed Stop on the describe step, and
// nothing reached the box and nothing was said. Two causes in the session: words a recognizer hands
// over only after Stop, later than the Stop deadline, were thrown away; and a session that ended
// after Stop with no words told the page nothing, which the describe step took as nothing to say.
// Two more endings said nothing either: the browser's own "aborted", and a cloud recording stopped
// before the microphone had opened.
import assert from "node:assert/strict";
import { test } from "node:test";
import * as speechModule from "../src/describe/speech.ts";
import { STOP_WAIT_MS, startSpeech, type LocalSpeechSession, type SpeechConstructor, type SpeechEvent, type Wait } from "../src/describe/speech.ts";
import { cloudSession, startCloudSpeech, type RecorderConstructor, type RecordingDevices } from "../src/describe/speech-cloud.ts";
import { memoryConsent } from "../src/describe/speech-consent.ts";
import { speechProblem, talkControls } from "../src/describe/speech-setup.ts";

/** How long Stop waits while no words have come. Read from the module, so its absence fails a test, not the file. */
const STOP_WAIT_NO_WORDS_MS = (speechModule as { STOP_WAIT_NO_WORDS_MS?: number }).STOP_WAIT_NO_WORDS_MS ?? Number.NaN;

function recognizer({ local = false }: { local?: boolean } = {}) {
  const sessions: Session[] = [];
  class Session implements LocalSpeechSession {
    lang = "";
    continuous = false;
    interimResults = false;
    onresult: ((event: SpeechEvent) => void) | null = null;
    onerror: ((event: { error: string }) => void) | null = null;
    onend: (() => void) | null = null;
    aborted = 0;
    constructor() {
      sessions.push(this);
    }
    start() {}
    stop() {}
    abort() {
      this.aborted++;
    }
    say(text: string, isFinal = true) {
      this.onresult?.({ results: [Object.assign([{ transcript: text }], { isFinal })] });
    }
  }
  if (local) Object.defineProperty(Session.prototype, "processLocally", { value: false, writable: true });
  return { speech: Session as unknown as SpeechConstructor, sessions };
}

/** A clock the test moves by hand. `run` runs every wait due by then, as time passing would. */
function clock() {
  let now = 0;
  const waits: { at: number; run(): void; stopped: boolean }[] = [];
  const later: Wait = (run, milliseconds) => {
    const entry = { at: now + milliseconds, run, stopped: false };
    waits.push(entry);
    return () => {
      entry.stopped = true;
    };
  };
  const pass = (milliseconds: number) => {
    const until = now + milliseconds;
    // Each wait runs at its own time, so a wait set by another starts from when that one ran.
    for (;;) {
      const due = waits.filter((w) => !w.stopped && w.at <= until).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      now = due.at;
      due.stopped = true;
      due.run();
    }
    now = until;
  };
  return { later, pass };
}

function page() {
  const heard: string[] = [];
  return {
    heard,
    callbacks: {
      result: (final: string, interim: string) => heard.push(`result:${[final, interim].filter(Boolean).join(" ")}`),
      error: (problem: string) => heard.push(`error:${problem}`),
      end: (requested: boolean) => heard.push(`end:${requested}`),
    },
  };
}

test("words a recognizer hands over only after Stop, later than the Stop deadline, reach the page", async () => {
  // A recognizer that shows nothing while the person talks and gives every word after Stop, as a
  // slow phone or a far speech service can. The page waited 2.5 s, then threw them away.
  const { speech, sessions } = recognizer();
  const { heard, callbacks } = page();
  const time = clock();
  const handle = await startSpeech("browser", "en-US", callbacks, { speech, consent: memoryConsent(true), later: time.later });
  handle.stop();
  time.pass(STOP_WAIT_MS + 1500);
  assert.deepEqual(heard, [], "with no words yet, Stop waits past its usual deadline");
  assert.equal(sessions[0]?.aborted, 0, "and the recognizer is not let go");
  sessions[0]?.say("We are River Keepers, based in Nairobi");
  sessions[0]?.onend?.();
  assert.deepEqual(heard, ["result:We are River Keepers, based in Nairobi", "end:true"], "the words arrive, then the person's Stop ends it");
});

test("words that only begin to arrive near the usual deadline are all kept", async () => {
  // Found in review: Stop with nothing shown, then the first words at 2.4 s and the rest at 3 s.
  const { speech, sessions } = recognizer();
  const { heard, callbacks } = page();
  const time = clock();
  const handle = await startSpeech("browser", "en-US", callbacks, { speech, consent: memoryConsent(true), later: time.later });
  handle.stop();
  time.pass(STOP_WAIT_MS - 100);
  sessions[0]?.say("We are River", false);
  time.pass(600);
  sessions[0]?.say("We are River Keepers in Nairobi");
  sessions[0]?.onend?.();
  assert.deepEqual(heard, ["result:We are River", "result:We are River Keepers in Nairobi", "end:true"]);
});

test("a recognizer that hands over words after Stop and never ends is ended at the longest wait, with them", async () => {
  const { speech, sessions } = recognizer();
  const { heard, callbacks } = page();
  const time = clock();
  const handle = await startSpeech("browser", "en-US", callbacks, { speech, consent: memoryConsent(true), later: time.later });
  handle.stop();
  time.pass(5000);
  sessions[0]?.say("We restore the riverbank");
  time.pass(STOP_WAIT_NO_WORDS_MS - 5000);
  assert.deepEqual(heard, ["result:We restore the riverbank", "end:true"]);
  assert.equal(sessions[0]?.aborted, 1);
});

test("leaving the page while Stop waits for words ends the session with nothing more said", async () => {
  const { speech, sessions } = recognizer();
  const { heard, callbacks } = page();
  const time = clock();
  const handle = await startSpeech("browser", "en-US", callbacks, { speech, consent: memoryConsent(true), later: time.later });
  handle.stop();
  time.pass(STOP_WAIT_MS + 1000);
  handle.dispose();
  time.pass(STOP_WAIT_NO_WORDS_MS);
  sessions[0]?.say("too late");
  assert.deepEqual(heard, [], "the page went away; it is told nothing");
  assert.equal(sessions[0]?.aborted, 1);
});

test("words revised to nothing count as none, and a browser answering Stop with aborted is still the person's Stop", async () => {
  const revised = recognizer();
  const blank = page();
  const first = await startSpeech("browser", "en-US", blank.callbacks, { speech: revised.speech, consent: memoryConsent(true), later: clock().later });
  revised.sessions[0]?.say("um", false);
  revised.sessions[0]?.say("", true);
  first.stop();
  revised.sessions[0]?.onend?.();
  assert.deepEqual(blank.heard.slice(-2), ["error:no-speech", "end:false"]);

  const answered = recognizer();
  const stopping = page();
  const second = await startSpeech("browser", "en-US", stopping.callbacks, { speech: answered.speech, consent: memoryConsent(true), later: clock().later });
  answered.sessions[0]?.say("We grow seedlings");
  second.stop();
  answered.sessions[0]?.onerror?.({ error: "aborted" });
  answered.sessions[0]?.onend?.();
  assert.deepEqual(stopping.heard, ["result:We grow seedlings", "end:true"], "the page goes on with the words, as after any Stop");
});

test("a recognizer that already gave words still ends at the usual deadline, with them", async () => {
  const { speech, sessions } = recognizer();
  const { heard, callbacks } = page();
  const time = clock();
  const handle = await startSpeech("browser", "en-US", callbacks, { speech, consent: memoryConsent(true), later: time.later });
  sessions[0]?.say("We restore the riverbank", false);
  handle.stop();
  time.pass(STOP_WAIT_MS);
  assert.deepEqual(heard, ["result:We restore the riverbank", "end:true"]);
  assert.equal(sessions[0]?.aborted, 1);
});

test("Stop that brings no words says so, never nothing", async () => {
  // The recognizer ends after Stop with nothing, and no error: a muted microphone, or a speech
  // service that answered with nothing, as Chromium's own does when it has no words.
  const ended = recognizer();
  const quiet = page();
  const first = await startSpeech("browser", "en-US", quiet.callbacks, { speech: ended.speech, consent: memoryConsent(true), later: clock().later });
  first.stop();
  ended.sessions[0]?.onend?.();
  assert.deepEqual(quiet.heard, ["error:no-speech", "end:false"]);

  // Only empty words, which shows nothing either.
  const blank = recognizer({ local: true });
  const blankPage = page();
  const second = await startSpeech("device", "en-US", blankPage.callbacks, {
    speech: Object.assign(blank.speech, { available: async () => "available" }),
    later: clock().later,
  });
  blank.sessions[0]?.say("   ", false);
  second.stop();
  blank.sessions[0]?.onend?.();
  assert.deepEqual(blankPage.heard.slice(-2), ["error:no-speech", "end:false"]);

  // The recognizer never answers at all: the longest wait ends it, and says so.
  const hung = recognizer();
  const waiting = page();
  const time = clock();
  const third = await startSpeech("browser", "en-US", waiting.callbacks, { speech: hung.speech, consent: memoryConsent(true), later: time.later });
  third.stop();
  assert.ok(Number.isFinite(STOP_WAIT_NO_WORDS_MS), "a longest wait is set");
  time.pass(STOP_WAIT_NO_WORDS_MS - 1);
  assert.deepEqual(waiting.heard, []);
  time.pass(1);
  assert.deepEqual(waiting.heard, ["error:no-speech", "end:false"]);
  assert.equal(hung.sessions[0]?.aborted, 1, "the recognizer is let go");
  assert.match(speechProblem("no-speech", "browser"), /microphone/, "the line says what to check");
  assert.match(speechProblem("no-speech", "browser"), /try again, or type in the box\.$/u, "and what to do next");
});

test("a recognizer that ends by itself with no words is still a pause, not a problem", async () => {
  const { speech, sessions } = recognizer();
  const { heard, callbacks } = page();
  await startSpeech("browser", "en-US", callbacks, { speech, consent: memoryConsent(true), later: clock().later });
  sessions[0]?.onend?.();
  assert.deepEqual(heard, ["end:false"], "the page says listening stopped after a pause");
});

test("Talk It Out shows Finishing for as long as a session may wait for its words", () => {
  assert.ok(STOP_WAIT_NO_WORDS_MS > STOP_WAIT_MS);
  assert.ok(STOP_WAIT_NO_WORDS_MS <= 15000, "and no longer than a person would wait for an answer");
  assert.equal(talkControls("ready", { listening: true, stopping: true }).action, "finishing");
});

test("every way a session can stop has a line to say, with a next step", () => {
  // Each code a session can hand the page. None may leave the status line empty.
  const codes = ["aborted", "no-speech", "not-allowed", "audio-capture", "network", "withdrawn", "stopped-early", "something new"];
  for (const mode of ["device", "browser", "cloud"] as const)
    for (const code of codes) {
      const line = speechProblem(code, mode);
      assert.notEqual(line, "", `${mode} ${code}: never silence`);
      assert.match(line, /type in the box|type instead/u, `${mode} ${code}: typing still works`);
      assert.doesNotMatch(line, /[—→]/u);
    }
  // The browser stopped listening by itself: the page's own abort never reaches the page.
  assert.match(speechProblem("aborted", "browser"), /stopped listening/u);
  assert.match(speechProblem("stopped-early", "cloud"), /nothing was recorded or sent/u);
});

test("a cloud recording stopped before the microphone opened says nothing was recorded", async () => {
  let grant: (stream: { getTracks(): { stop(): void }[] }) => void = () => {};
  const waiting: RecordingDevices = { getUserMedia: () => new Promise((resolve) => (grant = resolve)) };
  const recorder = Object.assign(function () {}, { isTypeSupported: () => true }) as unknown as RecorderConstructor;
  const { heard, callbacks } = page();
  const handle = await startCloudSpeech("en-US", callbacks, {
    consent: memoryConsent(true),
    recorder,
    devices: waiting,
    send: (async () => Response.json({ text: "unused" })) as typeof fetch,
    status: async () => ({ enabled: true, maxSeconds: 180, maxBytes: 3_000_000 }),
  });
  assert.equal(cloudSession.view().phase, "starting");
  handle.stop();
  assert.deepEqual(heard, ["error:stopped-early", "end:false"]);
  grant({ getTracks: () => [{ stop() {} }] });
});
