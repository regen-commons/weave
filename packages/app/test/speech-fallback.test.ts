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
import { chosenSpeech, SPEECH_OFF, speechMode, speechOptions, speechProblem, speechSetupStore, talkControls, talksHere } from "../src/describe/speech-setup.ts";
import { memorySpeechChoice, SPEECH_CHOICE_KEY, storedSpeechChoice } from "../src/describe/speech-choice.ts";

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
  assert.match(speechProblem("browser-failed", "browser"), /Press Talk It Out to send a recording to Cloudflare instead, after Weave asks, or type in the box\./u);

  // Where cloud speech is off, the failure is still noted, and the line is the plain one.
  const off = await session({ cloud: false });
  off.recognizer.onerror?.({ error: "network" });
  assert.deepEqual(off.heard, ["error:network", "end:false"]);
  assert.equal(off.record.state(), "failed");

  const refused = await session();
  refused.recognizer.onerror?.({ error: "service-not-allowed" });
  assert.deepEqual(refused.heard, ["error:browser-failed", "end:false"]);
});

test("a speech service that twice heard the microphone and gave nothing back is noted, after long enough to have heard words", async () => {
  // Chromium's own service with no key: audio starts, and after Stop it ends with no words and no
  // error. Once may be a person thinking, so the first time only says no speech was heard.
  const record = memorySpeechRecord();
  const first = await session({ record });
  first.clock.pass(SERVICE_SILENT_MS);
  first.handle.stop();
  first.recognizer.onend?.();
  assert.deepEqual(first.heard, ["error:no-speech", "end:false"]);
  assert.equal(record.state(), "quiet");
  const second = await session({ record });
  second.clock.pass(SERVICE_SILENT_MS);
  second.handle.stop();
  second.recognizer.onend?.();
  assert.deepEqual(second.heard, ["error:browser-failed", "end:false"]);
  assert.equal(record.state(), "failed");

  // A quick Stop is not enough to tell: it may only have been a quick Stop.
  const quick = await session();
  quick.clock.pass(SERVICE_SILENT_MS - 1);
  quick.handle.stop();
  quick.recognizer.onend?.();
  assert.deepEqual(quick.heard, ["error:no-speech", "end:false"]);
  assert.equal(quick.record.state(), "unknown");
});

test("the time that counts runs from when audio capture began, not from when the recognizer said it started", async () => {
  // Chromium says start at once and audiostart about a second later; Brave 1.6 s later.
  const browser = recognizer({ opens: false });
  const { heard, callbacks } = page();
  const clock = time();
  const record = memorySpeechRecord("quiet");
  const handle = await startSpeech("browser", "en-US", callbacks, { speech: browser.speech, consent: memoryConsent(true), later: clock.later, clock: clock.clock, record, cloudOffered: async () => true });
  browser.sessions[0]?.onstart?.();
  clock.pass(2000);
  browser.sessions[0]?.onaudiostart?.();
  clock.pass(SERVICE_SILENT_MS - 1);
  handle.stop();
  browser.sessions[0]?.onend?.();
  assert.deepEqual(heard, ["error:no-speech", "end:false"]);
  assert.equal(record.state(), "quiet", "not long enough with audio to count");
});

test("a speech service that cannot be reached while the device is offline is not written off", async () => {
  const browser = recognizer();
  const { heard, callbacks } = page();
  const record = memorySpeechRecord();
  await startSpeech("browser", "en-US", callbacks, {
    speech: browser.speech,
    consent: memoryConsent(true),
    later: time().later,
    record,
    cloudOffered: async () => true,
    online: () => false,
  });
  await settle();
  browser.sessions[0]?.onerror?.({ error: "network" });
  assert.deepEqual(heard, ["error:network", "end:false"]);
  assert.equal(record.state(), "unknown");
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
  const identifyBrave = () => isBrave({ userAgentData: { brands: [{ brand: "Chromium" }, { brand: "Brave" }] } });
  const on = speechSetupStore({ speech: brave.speech, cloud: async () => true, brave: identifyBrave, record: memorySpeechRecord() });
  on.check("en-US");
  await settle();
  assert.equal(on.state("en-US"), "cloud");
  const controls = talkControls("cloud");
  assert.deepEqual([controls.action, controls.mode, controls.agreement], ["talk", "cloud", true], "cloud speech still asks first");

  let cloudAvailable = false;
  const off = speechSetupStore({ speech: brave.speech, cloud: async () => cloudAvailable, brave: async () => true, record: memorySpeechRecord() });
  off.check("en-US");
  await settle();
  assert.equal(off.state("en-US"), "none", "Brave's browser speech service cannot work when cloud speech is off");
  cloudAvailable = true;
  off.check("en-US");
  await settle();
  assert.equal(off.state("en-US"), "cloud", "a later check can offer cloud speech again");

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

test("a failure noted again makes Talk It Out look again, so the line and the offer never disagree", async () => {
  // Found in review: the record already said failed, but the store's first question about cloud
  // speech got no answer, so it stayed on the browser's service. The session's own question got a
  // yes, so its line offered cloud speech. Noting the failure again now makes the store ask again.
  const record = memorySpeechRecord("failed");
  const answers = [false, true];
  const store = speechSetupStore({ speech: recognizer().speech, cloud: async () => answers.shift() ?? true, brave: async () => false, record });
  store.check("en-US");
  await settle();
  assert.equal(store.state("en-US"), "browser");
  record.failed();
  await settle();
  assert.equal(store.state("en-US"), "cloud");
});

test("a failure noted while the first answer is still on its way is not lost", async () => {
  const record = memorySpeechRecord();
  // The first question about cloud speech is still on its way when the failure is noted; the
  // answer it brings is from before, and is not the one that stands.
  let answer: (yes: boolean) => void = () => {};
  let questions = 0;
  const store = speechSetupStore({
    speech: recognizer().speech,
    cloud: () => (++questions === 1 ? new Promise<boolean>((resolve) => (answer = resolve)) : Promise.resolve(true)),
    brave: async () => false,
    record,
  });
  record.failed();
  store.check("en-US");
  await settle();
  assert.equal(store.state("en-US"), "checking", "the first answer is on its way");
  // Noted again in another tab, say, while that answer is still out.
  record.failed();
  answer(false);
  await settle();
  await settle();
  await settle();
  assert.equal(questions, 2, "asked again once the first answer came");
  assert.equal(store.state("en-US"), "cloud", "the later answer stands");
});

test("Settings offers one choice of four, and choosing is agreeing (25 November 2026)", () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key) };
  const browser = memoryConsent(false), cloud = memoryConsent(false), record = memorySpeechRecord("failed");
  const choice = storedSpeechChoice({ storage: () => storage, events: new EventTarget(), browser, cloud, record });
  assert.equal(choice.chosen(), null, "nothing is chosen until the person chooses");
  choice.choose("cloud");
  assert.deepEqual([browser.agreed(), cloud.agreed(), values.get(SPEECH_CHOICE_KEY)], [false, true, "cloud"]);
  choice.choose("browser");
  assert.deepEqual([browser.agreed(), cloud.agreed(), record.state()], [true, false, "unknown"], "choosing the service again forgets its failure");
  for (const off of ["off", "device"] as const) {
    choice.choose("cloud");
    choice.choose(off);
    assert.deepEqual([browser.agreed(), cloud.agreed(), choice.chosen()], [false, false, off], off);
  }
  values.set(SPEECH_CHOICE_KEY, "something-else");
  assert.equal(choice.chosen(), null, "an unknown stored value is no choice");
});

test("Talk It Out honours the choice wherever it works here, and Off turns talking off", async () => {
  const choice = memorySpeechChoice();
  const store = speechSetupStore({ speech: recognizer().speech, cloud: async () => true, brave: async () => false, record: memorySpeechRecord(), choice });
  const look = async () => { store.check("en-US"); for (let turn = 0; turn < 4; turn++) await settle(); return store.state("en-US"); };
  assert.equal(await look(), "browser", "with no choice, the browser's service comes before cloud speech");
  assert.deepEqual(store.availability("en-US"), { device: "none", browser: "present", browserFailed: false, cloud: null },
    "Talk It Out does not ask the server about cloud speech it does not need");
  store.inspect("en-US");
  for (let turn = 0; turn < 4; turn++) await settle();
  assert.equal(store.availability("en-US")?.cloud, true, "Settings asks, to offer every option");
  choice.choose("cloud");
  assert.equal(await look(), "cloud");
  choice.choose("off");
  assert.equal(await look(), "off");
  assert.equal(talksHere("off"), false);
  assert.deepEqual(talkControls("off"), { action: null, label: "", note: SPEECH_OFF, language: false, mode: null, agreement: false });
  choice.choose("device");
  assert.equal(await look(), "browser", "a choice that cannot work here gives way to Talk It Out's own order");
  assert.deepEqual(["checking", "ready", "offer", "browser", "cloud", "none", "off"].map((state) => chosenSpeech(state as Parameters<typeof chosenSpeech>[0])),
    [null, "device", "device", "browser", "cloud", "off", "off"]);
});

test("a failure after choosing the browser's service gives way to cloud speech", async () => {
  const record = memorySpeechRecord();
  const choice = memorySpeechChoice("browser");
  const store = speechSetupStore({ speech: recognizer().speech, cloud: async () => true, brave: async () => false, record, choice });
  store.check("en-US");
  for (let turn = 0; turn < 4; turn++) await settle();
  assert.equal(store.state("en-US"), "browser");
  record.failed();
  for (let turn = 0; turn < 4; turn++) await settle();
  assert.equal(choice.chosen(), null, "the choice is cleared");
  assert.equal(store.state("en-US"), "cloud");
  assert.equal(store.availability("en-US")?.browserFailed, true);
});

test("each option says what choosing it means, and one that cannot work here says why", () => {
  const checking = speechOptions(null);
  assert.deepEqual(checking.map((option) => option.key), ["device", "browser", "cloud", "off"]);
  assert.deepEqual(checking.map((option) => option.unavailable), ["Checking what this browser can do.", "Checking what this browser can do.", "Checking what this browser can do.", null]);
  const brave = speechOptions({ device: "none", browser: "brave", browserFailed: false, cloud: false });
  assert.deepEqual(brave.map((option) => option.unavailable), ["Not available in this browser.", "This browser has no speech service behind its recognizer.", "Not available here right now.", null]);
  const phone = speechOptions({ device: "none", browser: "present", browserFailed: true, cloud: true });
  assert.match(phone[1]!.note, /did not answer on this device before; choose it to try again\.$/u);
  assert.equal(phone[2]!.label, "Cloud speech with Cloudflare");
  assert.match(phone[2]!.note, /Cloudflare Workers AI[^]*Whisper[^]*Weave does not keep the recording\. Cloudflare says it does not keep it or use it to train models\. It may be processed outside your country\.$/u);
  assert.match(speechOptions({ device: "offer", browser: "present", browserFailed: false, cloud: false })[0]!.note, /first time you talk/u);
  for (const option of [...phone, ...brave]) for (const line of [option.label, option.note, option.unavailable ?? "Fine."]) {
    assert.doesNotMatch(line, /[—→·]/u, line);
  }
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
  tab.forget();
  stored.delete(BROWSER_SPEECH_RECORD_KEY);
  const fresh = storedSpeechRecord(() => storage, events);
  assert.equal(fresh.quiet(), "quiet", "one silent try is not a failure");
  assert.equal(fresh.quiet(), "failed", "the second is");
  fresh.forget();
  assert.equal(fresh.state(), "unknown", "and Use Browser Speech Again forgets it");
  // Storage that reads but refuses writes is not believed for the rest of the visit.
  const full = storedSpeechRecord(
    () => ({ ...storage, setItem: () => { throw new Error("full"); } }),
    events,
  );
  stored.delete(BROWSER_SPEECH_RECORD_KEY);
  full.failed();
  assert.equal(full.state(), "failed");
  // A browser that refuses storage keeps the record for the visit.
  const refusing = storedSpeechRecord(() => {
    throw new Error("blocked");
  }, events);
  refusing.failed();
  assert.equal(refusing.state(), "failed");
});

test("Brave is identified by its API or its declared browser brand", async () => {
  assert.equal(await isBrave({ brave: { isBrave: async () => true } }), true);
  assert.equal(await isBrave({ userAgentData: { brands: [{ brand: "Chromium" }, { brand: "Brave" }] } }), true);
  assert.equal(await isBrave({ userAgentData: { brands: [{ brand: "Chromium" }, { brand: "Google Chrome" }] } }), false);
  assert.equal(await isBrave({ userAgent: "Brave" }), false);
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
