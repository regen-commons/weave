// Where the browser's own speech service cannot work, cloud speech is offered in its place, with its
// own agreement (DL-138, revised 23 November 2026). Brave was the case reported: its recognizer has no
// speech service behind it, so a session never opened the microphone while Brave asked about it, and
// failed with "network" once it was allowed.
import assert from "node:assert/strict";
import { test } from "node:test";
import { SERVICE_SILENT_MS, startSpeech, type LocalSpeechSession, type SpeechConstructor, type SpeechEvent, type Wait } from "../src/describe/speech.ts";
import { memoryConsent } from "../src/describe/speech-consent.ts";
import {
  BROWSER_SPEECH_RECORD_KEY,
  isBrave,
  memorySpeechRecord,
  storedSpeechRecord,
  type BrowserSpeechRecordState,
} from "../src/describe/speech-fallback.ts";
import { speechProblem, speechSetupStore, talkControls } from "../src/describe/speech-setup.ts";

const settle = () => new Promise((resolve) => setImmediate(resolve));

/** A recognizer. `opens` says whether the browser opens the microphone when it starts. */
function recognizer({ opens = true, local = true, status = "unavailable" }: { opens?: boolean; local?: boolean; status?: string } = {}) {
  const sessions: Session[] = [];
  class Session implements LocalSpeechSession {
    lang = "";
    continuous = false;
    interimResults = false;
    onresult: ((event: SpeechEvent) => void) | null = null;
    onerror: ((event: { error: string }) => void) | null = null;
    onend: (() => void) | null = null;
    onstart?: (() => void) | null = null;
    onaudiostart?: (() => void) | null = null;
    aborted = 0;
    constructor() {
      sessions.push(this);
    }
    start() {
      if (opens) {
        this.onstart?.();
        this.onaudiostart?.();
      }
    }
    stop() {}
    abort() {
      this.aborted++;
    }
    say(text: string) {
      this.onresult?.({ results: [Object.assign([{ transcript: text }], { isFinal: true })] });
    }
    static async available() {
      return status;
    }
  }
  if (local) Object.defineProperty(Session.prototype, "processLocally", { value: false, writable: true });
  return { speech: Session as unknown as SpeechConstructor, sessions };
}

/** A clock the session reads, moved by hand. */
function time() {
  let now = 1000;
  const never: Wait = () => () => {};
  return { clock: () => now, pass: (ms: number) => (now += ms), later: never };
}

function page() {
  const heard: string[] = [];
  return {
    heard,
    callbacks: {
      result: (final: string) => heard.push(`result:${final}`),
      error: (problem: string) => heard.push(`error:${problem}`),
      end: (requested: boolean) => heard.push(`end:${requested}`),
    },
  };
}

/** Starts a session of the browser's own service with a record and a cloud answer the test holds. */
async function session({
  opens = true,
  record = memorySpeechRecord(),
  cloud = true,
  mode = "browser" as "browser" | "device",
} = {}) {
  const browser = recognizer({ opens, status: mode === "device" ? "available" : "unavailable" });
  const { heard, callbacks } = page();
  const clock = time();
  let asked = 0;
  const handle = await startSpeech(mode, "en-US", callbacks, {
    speech: browser.speech,
    consent: memoryConsent(true),
    later: clock.later,
    clock: clock.clock,
    record,
    cloudOffered: async () => {
      asked++;
      return cloud;
    },
  });
  await settle();
  return { handle, heard, record, clock, recognizer: browser.sessions[0]!, asked: () => asked };
}

test("Stop before the browser opens the microphone says so, and does not count against its speech service", async () => {
  // Brave on first use: it asks about the microphone, and until the person answers nothing starts.
  // Stop ends the session at once, with no words and no error. Before, the page said nothing.
  const { handle, heard, record, recognizer: browser } = await session({ opens: false });
  handle.stop();
  browser.onend?.();
  assert.deepEqual(heard, ["error:no-microphone", "end:false"]);
  assert.equal(record.state(), "unknown", "the service was never reached, so nothing is noted");
  assert.match(speechProblem("no-microphone", "browser"), /microphone did not turn on/u);
  assert.match(speechProblem("no-microphone", "browser"), /Allow it if your browser asks/u);
});

test("a speech service that fails with network before it ever worked is noted, and cloud speech is offered", async () => {
  // Brave once the microphone is allowed: audio starts, then "network" about two seconds later.
  const offered = await session();
  offered.recognizer.onerror?.({ error: "network" });
  assert.deepEqual(offered.heard, ["error:browser-failed", "end:false"]);
  assert.equal(offered.record.state(), "failed");
  assert.match(speechProblem("browser-failed", "browser"), /speech service did not answer/u);
  assert.match(speechProblem("browser-failed", "browser"), /Press Talk It Out to use Weave's own transcription instead, or type in the box\./u);

  // Where cloud speech is off, the failure is still noted, and the line is the plain one.
  const off = await session({ cloud: false });
  off.recognizer.onerror?.({ error: "network" });
  assert.deepEqual(off.heard, ["error:network", "end:false"]);
  assert.equal(off.record.state(), "failed");

  const refused = await session();
  refused.recognizer.onerror?.({ error: "service-not-allowed" });
  assert.deepEqual(refused.heard, ["error:browser-failed", "end:false"]);
});

test("a speech service that heard the microphone and gave nothing back is noted, after long enough to have heard words", async () => {
  // Chromium's own service with no key: audio starts, and after Stop it ends with no words and no error.
  const silent = await session();
  silent.clock.pass(SERVICE_SILENT_MS);
  silent.handle.stop();
  silent.recognizer.onend?.();
  assert.deepEqual(silent.heard, ["error:browser-failed", "end:false"]);
  assert.equal(silent.record.state(), "failed");

  // A quick Stop is not enough to tell: it may only have been a quick Stop.
  const quick = await session();
  quick.clock.pass(SERVICE_SILENT_MS - 1);
  quick.handle.stop();
  quick.recognizer.onend?.();
  assert.deepEqual(quick.heard, ["error:no-speech", "end:false"]);
  assert.equal(quick.record.state(), "unknown");
});

test("once the service has given words on this device, a later failure is a passing one", async () => {
  const first = await session();
  first.recognizer.say("We grow seedlings");
  first.handle.stop();
  first.recognizer.onend?.();
  assert.equal(first.record.state(), "worked");
  const later = await session({ record: first.record });
  later.recognizer.onerror?.({ error: "network" });
  assert.deepEqual(later.heard, ["error:network", "end:false"], "the service's own line, no offer");
  assert.equal(later.record.state(), "worked");
  assert.equal(later.asked(), 0, "and the server is not asked about cloud speech once the service has worked");
  const silent = await session({ record: first.record });
  silent.clock.pass(SERVICE_SILENT_MS * 2);
  silent.handle.stop();
  silent.recognizer.onend?.();
  assert.deepEqual(silent.heard, ["error:no-speech", "end:false"]);
});

test("speech on the device never counts against the browser's service, and never asks about cloud speech", async () => {
  const local = await session({ mode: "device" });
  local.recognizer.onerror?.({ error: "network" });
  assert.deepEqual(local.heard, ["error:network", "end:false"]);
  assert.equal(local.record.state(), "unknown");
  assert.equal(local.asked(), 0);
});

test("Brave is offered cloud speech from the first press, and only where cloud speech is on", async () => {
  const brave = recognizer();
  const on = speechSetupStore({ speech: brave.speech, cloud: async () => true, brave: async () => true, record: memorySpeechRecord() });
  on.check("en-US");
  await settle();
  assert.equal(on.state("en-US"), "cloud");
  const controls = talkControls("cloud");
  assert.deepEqual([controls.action, controls.mode, controls.agreement], ["talk", "cloud", true], "cloud speech still asks first");

  const off = speechSetupStore({ speech: brave.speech, cloud: async () => false, brave: async () => true, record: memorySpeechRecord() });
  off.check("en-US");
  await settle();
  assert.equal(off.state("en-US"), "browser", "with cloud speech off, Brave keeps what it has");

  // Speech on the device, where a browser has it, still comes first.
  const ready = speechSetupStore({ speech: recognizer({ status: "available" }).speech, cloud: async () => true, brave: async () => true, record: memorySpeechRecord() });
  ready.check("en-US");
  await settle();
  assert.equal(ready.state("en-US"), "ready");
});

test("a failure noted on this device puts cloud speech in the service's place, and forgetting it brings the service back", async () => {
  const record = memorySpeechRecord();
  let askedServer = 0;
  const store = speechSetupStore({
    speech: recognizer().speech,
    cloud: async () => {
      askedServer++;
      return true;
    },
    brave: async () => false,
    record,
  });
  store.check("en-US");
  await settle();
  assert.equal(store.state("en-US"), "browser", "Chrome: its own service first, after its agreement");
  assert.equal(askedServer, 0, "a browser with a working recognizer does not ask the server");
  record.failed();
  await settle();
  assert.equal(store.state("en-US"), "cloud", "the next press offers cloud speech, with its agreement");
  record.forget();
  await settle();
  assert.equal(store.state("en-US"), "browser", "turning cloud speech off in Settings forgets the failure");
});

test("the record keeps one word on the device, follows other tabs, and never notes a failure after the service worked", () => {
  const stored = new Map<string, string>();
  const storage = {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => void stored.set(key, value),
    removeItem: (key: string) => void stored.delete(key),
  };
  const events = new EventTarget();
  const tab = storedSpeechRecord(() => storage, events);
  const other = storedSpeechRecord(() => storage, events);
  const seen: BrowserSpeechRecordState[] = [];
  other.subscribe(() => seen.push(other.state()));
  tab.failed();
  assert.equal(stored.get(BROWSER_SPEECH_RECORD_KEY), "failed");
  events.dispatchEvent(Object.assign(new Event("storage"), { key: BROWSER_SPEECH_RECORD_KEY }));
  assert.deepEqual(seen, ["failed"], "another tab hears of it");
  tab.forget();
  assert.equal(stored.has(BROWSER_SPEECH_RECORD_KEY), false);
  tab.worked();
  tab.failed();
  assert.equal(tab.state(), "worked", "a service that worked here is not written off by one failure");
  tab.forget();
  assert.equal(tab.state(), "worked", "forgetting clears only a failure");
  stored.set(BROWSER_SPEECH_RECORD_KEY, "anything else");
  assert.equal(tab.state(), "unknown");
  // A browser that refuses storage keeps the record for the visit.
  const refusing = storedSpeechRecord(() => {
    throw new Error("blocked");
  }, events);
  refusing.failed();
  assert.equal(refusing.state(), "failed");
});

test("Brave is known by its own answer, and nothing else counts", async () => {
  assert.equal(await isBrave({ brave: { isBrave: async () => true } }), true);
  assert.equal(await isBrave({ brave: { isBrave: async () => "yes" } }), false);
  assert.equal(await isBrave({ brave: {} }), false);
  assert.equal(await isBrave({}), false);
  assert.equal(await isBrave(undefined), false);
  assert.equal(
    await isBrave({
      brave: {
        isBrave: () => {
          throw new Error("no");
        },
      },
    }),
    false,
  );
});
