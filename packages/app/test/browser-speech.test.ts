// The browser's own speech service may send the person's voice away from the device, so it starts
// only after their agreement, never stands in for speech on the device, and every way it stops
// leaves typing open (the owner's decision of 19 November 2026).
import assert from "node:assert/strict";
import { test } from "node:test";
import { startSpeech, STOP_WAIT_MS, type LocalSpeechSession, type SpeechConstructor, type SpeechEvent, type Wait } from "../src/describe/speech.ts";
import { BROWSER_SPEECH_KEY, memoryConsent, storedConsent, type ConsentStorage } from "../src/describe/speech-consent.ts";

/** A recognizer like Safari's or Chrome's on Android: a constructor, no on-device question. */
function recognizer({ local = false, startThrows = false }: { local?: boolean; startThrows?: boolean } = {}) {
  const sessions: Session[] = [];
  class Session implements LocalSpeechSession {
    lang = "";
    continuous = false;
    interimResults = false;
    onresult: ((event: SpeechEvent) => void) | null = null;
    onerror: ((event: { error: string }) => void) | null = null;
    onend: (() => void) | null = null;
    declare processLocally?: boolean;
    started = 0;
    stopped = 0;
    aborted = 0;
    constructor() {
      sessions.push(this);
    }
    start() {
      if (startThrows) throw new DOMException("Already started", "InvalidStateError");
      this.started++;
    }
    stop() {
      this.stopped++;
    }
    abort() {
      this.aborted++;
    }
    /** The browser says words. */
    say(text: string, isFinal = true) {
      this.onresult?.({ results: [Object.assign([{ transcript: text }], { isFinal })] });
    }
  }
  if (local) Object.defineProperty(Session.prototype, "processLocally", { value: false, writable: true });
  return { speech: Session as unknown as SpeechConstructor, sessions };
}

/** Records what the page would hear. */
function page() {
  const heard: { results: string[]; errors: string[]; ends: boolean[] } = { results: [], errors: [], ends: [] };
  return {
    heard,
    callbacks: {
      result: (final: string, interim: string) => heard.results.push([final, interim].filter(Boolean).join(" ")),
      error: (problem: string) => heard.errors.push(problem),
      end: (requested: boolean) => heard.ends.push(requested),
    },
  };
}

test("no session of the browser's speech service starts without the person's agreement", async () => {
  const { speech, sessions } = recognizer();
  const { callbacks } = page();
  await assert.rejects(startSpeech("browser", "en-US", callbacks, { speech }), "no agreement given at all");
  await assert.rejects(startSpeech("browser", "en-US", callbacks, { speech, consent: memoryConsent(false) }));
  assert.equal(sessions.length, 0, "nothing was even created");
  const handle = await startSpeech("browser", "en-US", callbacks, { speech, consent: memoryConsent(true) });
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0]?.started, 1);
  assert.deepEqual([sessions[0]?.lang, sessions[0]?.continuous, sessions[0]?.interimResults], ["en-US", true, true]);
  handle.dispose();
});

test("the browser's speech service is never asked to promise the device, and the device never falls back to it", async () => {
  const chrome = recognizer({ local: true });
  const { callbacks } = page();
  const handle = await startSpeech("browser", "sw-KE", callbacks, { speech: chrome.speech, consent: memoryConsent(true) });
  assert.equal(chrome.sessions[0]?.processLocally, false, "left at the browser's default: the specification lets it run elsewhere");
  handle.dispose();
  // On the device, Chrome without a pack for the language: no session at all, agreement or not.
  Object.defineProperty(chrome.speech, "available", { value: async () => "unavailable" });
  await assert.rejects(startSpeech("device", "sw-KE", callbacks, { speech: chrome.speech, consent: memoryConsent(true) }));
  assert.equal(chrome.sessions.length, 1, "the failed device start did not open a browser session");
  await assert.rejects(startSpeech("browser", "en-US", callbacks, { speech: null, consent: memoryConsent(true) }), "Firefox on Android");
});

test("each error the browser reports reaches the page once, then the session ends as not requested", async () => {
  for (const code of ["not-allowed", "audio-capture", "network", "service-not-allowed", "language-not-supported", "no-speech"]) {
    const { speech, sessions } = recognizer();
    const { heard, callbacks } = page();
    await startSpeech("browser", "en-US", callbacks, { speech, consent: memoryConsent(true) });
    const session = sessions[0]!;
    session.say("Seed");
    session.onerror?.({ error: code });
    // Chrome fires end after an error; it must not count twice.
    session.onend?.();
    assert.deepEqual(heard.errors, [code], code);
    assert.deepEqual(heard.ends, [false], `${code}: one end, not the person's Stop`);
    assert.deepEqual(heard.results, ["Seed"], `${code}: the words said before stay with the page`);
    assert.equal(session.aborted, 1);
    assert.equal(session.onresult, null, "nothing more is heard");
  }
});

test("a recognizer that ends by itself after a pause is told apart from the person's Stop", async () => {
  const { speech, sessions } = recognizer();
  const paused = page();
  await startSpeech("browser", "en-US", paused.callbacks, { speech, consent: memoryConsent(true) });
  sessions[0]?.say("We grow seedlings");
  sessions[0]?.onend?.();
  assert.deepEqual(paused.heard.ends, [false], "Chrome on Android ends each phrase by itself: continuous has no effect there");
  const stopped = page();
  const handle = await startSpeech("browser", "en-US", stopped.callbacks, { speech, consent: memoryConsent(true) });
  handle.stop();
  assert.equal(sessions[1]?.stopped, 1);
  sessions[1]?.onend?.();
  assert.deepEqual(stopped.heard.ends, [true]);
  handle.stop();
  assert.equal(sessions[1]?.stopped, 1, "a finished session is not stopped again");
});

test("Stop always finishes: a recognizer that does not end in time is ended with the words it gave (DL-133)", async () => {
  // A clock the test moves by hand, so no test waits for real time.
  const waits: { run(): void; stopped: boolean; milliseconds: number }[] = [];
  const later: Wait = (run, milliseconds) => {
    const entry = { run, stopped: false, milliseconds };
    waits.push(entry);
    return () => {
      entry.stopped = true;
    };
  };
  // A recognizer that never ends after stop() left the page waiting without end. Continuous mode
  // on iOS is reported to leave the microphone open (docs/platform/research/local-ai-and-stack.md).
  const hung = recognizer();
  const stuck = page();
  const handle = await startSpeech("browser", "en-US", stuck.callbacks, { speech: hung.speech, consent: memoryConsent(true), later });
  hung.sessions[0]?.say("We grow seedlings");
  hung.sessions[0]?.say("for the school", false);
  handle.stop();
  assert.deepEqual(waits.map((entry) => entry.milliseconds), [STOP_WAIT_MS], "one deadline, set by the person's Stop");
  assert.deepEqual(stuck.heard.ends, [], "the recognizer still has its time to hand over the last words");
  handle.stop();
  assert.equal(hung.sessions[0]?.stopped, 1, "a second press asks nothing more of the recognizer");
  assert.equal(waits.length, 1, "and starts no second deadline");
  waits[0]?.run();
  assert.deepEqual(stuck.heard.ends, [true], "ended as the person's Stop, so the page goes on with the words");
  assert.deepEqual(stuck.heard.results.at(-1), "for the school", "the words not yet final were already with the page");
  assert.equal(hung.sessions[0]?.aborted, 1, "the recognizer is let go");
  hung.sessions[0]?.say("too late");
  hung.sessions[0]?.onend?.();
  assert.deepEqual(stuck.heard.ends, [true], "a late end is not a second one");
  assert.equal(stuck.heard.results.includes("too late"), false, "and nothing is heard after the end");

  // The usual case: the recognizer ends by itself first, and the deadline is called off.
  const prompt = recognizer();
  const quick = page();
  const second = await startSpeech("browser", "en-US", quick.callbacks, { speech: prompt.speech, consent: memoryConsent(true), later });
  second.stop();
  prompt.sessions[0]?.say("We grow seedlings");
  prompt.sessions[0]?.onend?.();
  assert.deepEqual(quick.heard.results, ["We grow seedlings"], "the last words arrive after Stop and are kept");
  assert.deepEqual(quick.heard.ends, [true]);
  assert.equal(waits[1]?.stopped, true);
  waits[1]?.run();
  assert.deepEqual(quick.heard.ends, [true], "a deadline that still ran would change nothing");

  // A session that fails or is dropped after Stop does not end a second time either.
  const failing = recognizer();
  const failed = page();
  const third = await startSpeech("browser", "en-US", failed.callbacks, { speech: failing.speech, consent: memoryConsent(true), later });
  third.stop();
  failing.sessions[0]?.onerror?.({ error: "network" });
  assert.deepEqual(failed.heard.ends, [false]);
  assert.equal(waits[2]?.stopped, true);
});

test("withdrawing the agreement stops a session of the browser's speech service at once", async () => {
  const { speech, sessions } = recognizer();
  const { heard, callbacks } = page();
  const consent = memoryConsent(true);
  await startSpeech("browser", "en-US", callbacks, { speech, consent });
  consent.withdraw();
  assert.deepEqual(heard.errors, ["withdrawn"]);
  assert.deepEqual(heard.ends, [false]);
  assert.equal(sessions[0]?.aborted, 1);
  sessions[0]?.say("Anything after");
  assert.deepEqual(heard.results, [], "nothing is heard after the withdrawal");
  consent.agree();
  consent.withdraw();
  assert.deepEqual(heard.errors, ["withdrawn"], "a finished session no longer listens to the agreement");
});

test("a session that fails to start, or is cancelled before it starts, leaves nothing listening", async () => {
  const failing = recognizer({ startThrows: true });
  const consent = memoryConsent(true);
  await assert.rejects(startSpeech("browser", "en-US", page().callbacks, { speech: failing.speech, consent }), { name: "InvalidStateError" });
  assert.equal(failing.sessions[0]?.aborted, 1);
  consent.withdraw();
  const cancel = new AbortController();
  cancel.abort();
  const { speech, sessions } = recognizer();
  await assert.rejects(startSpeech("browser", "en-US", page().callbacks, { speech, consent: memoryConsent(true), signal: cancel.signal }));
  assert.equal(sessions.length, 0);
});

/** A `localStorage` stand-in that can refuse, as a private window or blocked storage does. */
function storage(refuse = false): ConsentStorage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  const check = () => {
    if (refuse) throw new DOMException("Denied", "SecurityError");
  };
  return {
    values,
    getItem: (key) => (check(), values.get(key) ?? null),
    setItem: (key, value) => (check(), void values.set(key, value)),
    removeItem: (key) => (check(), void values.delete(key)),
  };
}

test("the agreement is kept on the device, read as data, and withdrawn as easily as it was given", () => {
  const kept = storage();
  const events = new EventTarget();
  const consent = storedConsent(() => kept, events);
  let heard = 0;
  const stop = consent.subscribe(() => heard++);
  assert.equal(consent.agreed(), false, "no agreement is assumed");
  consent.agree();
  assert.equal(kept.values.get(BROWSER_SPEECH_KEY), "agreed");
  assert.equal(storedConsent(() => kept, events).agreed(), true, "the next visit remembers it");
  consent.withdraw();
  assert.equal(kept.values.has(BROWSER_SPEECH_KEY), false, "withdrawing removes it");
  assert.equal(heard, 2);
  for (const value of ["yes", "true", "AGREED", ""]) {
    kept.values.set(BROWSER_SPEECH_KEY, value);
    assert.equal(consent.agreed(), false, `"${value}" is not an agreement`);
  }
  // Another tab's change arrives as a storage event.
  const other = new Event("storage");
  Object.defineProperty(other, "key", { value: BROWSER_SPEECH_KEY });
  events.dispatchEvent(other);
  assert.equal(heard, 3);
  const unrelated = new Event("storage");
  Object.defineProperty(unrelated, "key", { value: "rc-theme" });
  events.dispatchEvent(unrelated);
  assert.equal(heard, 3, "another setting's change is not this one");
  stop();
  consent.agree();
  assert.equal(heard, 3);
});

test("a browser that refuses storage keeps the agreement for this visit only, and never assumes it", () => {
  const refused = storage(true);
  const consent = storedConsent(() => refused, new EventTarget());
  assert.equal(consent.agreed(), false);
  consent.agree();
  assert.equal(consent.agreed(), true, "the person's agreement still holds while they are here");
  consent.withdraw();
  assert.equal(consent.agreed(), false);
  assert.equal(storedConsent(() => refused, new EventTarget()).agreed(), false, "the next visit asks again");
  assert.equal(storedConsent(() => undefined, undefined).agreed(), false, "no storage at all, as in Node");
});
