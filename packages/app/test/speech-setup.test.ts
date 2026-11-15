import assert from "node:assert/strict";
import { test } from "node:test";
import { speechStatus, type SpeechConstructor } from "../src/describe/speech.ts";
import {
  installSpeech,
  offersSetup,
  speechSetupStore,
  speechSupport,
  voiceControls,
  type SpeechSetupState,
  type Wait,
} from "../src/describe/speech-setup.ts";
import { listVoice, speechSetupList } from "../src/intake/ask-page.ts";
import { emptyAskStep } from "../src/intake/contracts.ts";
import { addEntry } from "../src/intake/entries.ts";

/** Lets every answer the stub browser has already given arrive. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

/**
 * A stub browser recognizer. `status` answers `available()` for a language; `install`, when given,
 * becomes `install()`. Every question is recorded, so a test can see what the page asked.
 */
function browser({
  status,
  install,
  local = true,
}: {
  status: (language: string) => unknown;
  install?: (options: unknown) => unknown;
  local?: boolean;
}) {
  const asked: { available: unknown[]; install: unknown[] } = { available: [], install: [] };
  class Speech {
    lang = "";
    continuous = false;
    interimResults = false;
    onresult = null;
    onerror = null;
    onend = null;
    start() {}
    stop() {}
    abort() {}
    static async available(options: { langs: string[] }) {
      asked.available.push(options);
      return status(options.langs[0] ?? "");
    }
  }
  // Chrome's recognizer has processLocally; a remote-only one, like Safari's, does not.
  if (local) Object.defineProperty(Speech.prototype, "processLocally", { value: false, writable: true });
  if (install)
    Object.defineProperty(Speech, "install", {
      value: (options: unknown) => {
        asked.install.push(options);
        return install(options);
      },
    });
  return { speech: Speech as unknown as SpeechConstructor, asked };
}

/** A promise the test settles by hand, like a speech pack that is still downloading. */
function pending<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

/** A wait the test runs by hand, so "taking a while" needs no real two minutes. */
function clock() {
  const waits: { then: () => void; milliseconds: number; stopped: boolean }[] = [];
  const later: Wait = (then, milliseconds) => {
    const entry = { then, milliseconds, stopped: false };
    waits.push(entry);
    return () => {
      entry.stopped = true;
    };
  };
  return { later, waits };
}

test("the browser's answer is read as data, and anything unexpected is unavailable", async () => {
  for (const answer of ["unavailable", "downloadable", "downloading", "available"])
    assert.equal(await speechStatus("en-US", browser({ status: () => answer }).speech), answer);
  for (const answer of ["maybe", 42, null, undefined, { status: "available" }])
    assert.equal(await speechStatus("en-US", browser({ status: () => answer }).speech), "unavailable");
  const failing = browser({
    status: () => {
      throw new DOMException("Not fully active", "InvalidStateError");
    },
  });
  assert.equal(await speechStatus("en-US", failing.speech), "unavailable", "a refusal is no speech");
  assert.equal(await speechStatus("en-US", undefined), "unavailable", "no recognizer at all");
  assert.equal(
    await speechStatus("en-US", browser({ status: () => "available", local: false }).speech),
    "unavailable",
    "a recognizer that cannot promise to stay on the device is never asked",
  );
  const asking = browser({ status: () => "available" });
  await speechStatus("pt-BR", asking.speech);
  assert.deepEqual(asking.asked.available, [{ langs: ["pt-BR"], processLocally: true }]);
});

test("each answer decides what a page can offer before any tap", async () => {
  const withInstall = { install: () => true };
  assert.equal(await speechSupport("en-US", browser({ status: () => "available", ...withInstall }).speech), "ready");
  assert.equal(await speechSupport("en-US", browser({ status: () => "downloadable", ...withInstall }).speech), "offer");
  assert.equal(await speechSupport("en-US", browser({ status: () => "downloading", ...withInstall }).speech), "offer");
  assert.equal(
    await speechSupport("en-US", browser({ status: () => "downloadable" }).speech),
    "language",
    "a browser that cannot install is not asked to",
  );
  const elsewhere = browser({ status: (language) => (language === "en-US" ? "downloadable" : "unavailable"), ...withInstall });
  assert.equal(await speechSupport("sw-KE", elsewhere.speech), "language", "another language may work");
  assert.deepEqual(elsewhere.asked.available, [
    { langs: ["sw-KE"], processLocally: true },
    { langs: ["en-US"], processLocally: true },
  ]);
  const nowhere = browser({ status: () => "unavailable", ...withInstall });
  assert.equal(await speechSupport("sw-KE", nowhere.speech), "none", "Brave and Chrome on Android answer this way");
  const english = browser({ status: () => "unavailable" });
  assert.equal(await speechSupport("en-US", english.speech), "none");
  assert.equal(english.asked.available.length, 1, "English is not asked twice");
  assert.equal(await speechSupport("en-US", undefined), "none", "Safari and Firefox have no on-device question");
});

test("setting up asks the browser during the tap, on the device only, and reads only true as ready", async () => {
  const tapped = browser({ status: () => "downloadable", install: () => Promise.resolve(true) });
  const answer = installSpeech("pt-BR", tapped.speech);
  assert.deepEqual(
    tapped.asked.install,
    [{ langs: ["pt-BR"], processLocally: true }],
    "asked before anything is awaited, while the tap still counts",
  );
  assert.equal(await answer, true);
  for (const [outcome, expected] of [
    [() => Promise.resolve(false), false],
    [() => Promise.resolve("yes"), false],
    [() => Promise.reject(new DOMException("Requires handling a user gesture", "NotAllowedError")), false],
    [
      () => {
        throw new TypeError("Langs array cannot be empty.");
      },
      false,
    ],
  ] as const)
    assert.equal(await installSpeech("en-US", browser({ status: () => "downloadable", install: outcome }).speech), expected);
  assert.equal(await installSpeech("en-US", browser({ status: () => "downloadable" }).speech), false, "no install()");
});

test("a tap sets up speech once, shows it under way, and Speak follows the browser's own answer", async () => {
  let status = "downloadable";
  const download = pending<boolean>();
  const chrome = browser({ status: () => status, install: () => download.promise });
  const store = speechSetupStore({ speech: chrome.speech, later: clock().later });
  let changes = 0;
  store.subscribe(() => changes++);
  assert.equal(store.state("en-US"), "checking", "nothing shows before the browser answers");
  store.check("en-US");
  await settle();
  assert.equal(store.state("en-US"), "offer");
  store.setUp("en-US");
  assert.equal(chrome.asked.install.length, 1, "install() is called inside the tap");
  assert.equal(store.state("en-US"), "installing");
  store.setUp("en-US");
  store.check("en-US");
  await settle();
  assert.equal(chrome.asked.install.length, 1, "a second tap or page joins the setup under way");
  assert.equal(store.state("en-US"), "installing", "a new question does not interrupt it");
  status = "available";
  download.resolve(true);
  await settle();
  assert.equal(store.state("en-US"), "ready");
  assert.ok(changes >= 3, "pages hear each change");
});

test("a pack already on the device, hidden from this site, needs one tap and no download", async () => {
  // Chrome answers "downloadable" to a site that has not asked before, then true at once.
  let unmasked = false;
  const chrome = browser({
    status: () => (unmasked ? "available" : "downloadable"),
    install: () => {
      unmasked = true;
      return Promise.resolve(true);
    },
  });
  const store = speechSetupStore({ speech: chrome.speech, later: clock().later });
  store.check("en-US");
  await settle();
  store.setUp("en-US");
  await settle();
  assert.equal(store.state("en-US"), "ready");
});

test("a failed setup says so, keeps typing, and can be tried again", async () => {
  let answer = false;
  const chrome = browser({ status: () => "downloadable", install: () => Promise.resolve(answer) });
  const store = speechSetupStore({ speech: chrome.speech, later: clock().later });
  store.check("en-US");
  await settle();
  store.setUp("en-US");
  await settle();
  assert.equal(store.state("en-US"), "failed");
  answer = true;
  store.setUp("en-US");
  assert.equal(store.state("en-US"), "installing");
  await settle();
  assert.equal(store.state("en-US"), "failed", "true without the browser's own available is still not Speak");
  assert.equal(chrome.asked.install.length, 2);
});

test("a refused tap is a failure, not a hang", async () => {
  const chrome = browser({
    status: () => "downloadable",
    install: () => Promise.reject(new DOMException("Requires handling a user gesture", "NotAllowedError")),
  });
  const store = speechSetupStore({ speech: chrome.speech, later: clock().later });
  store.check("en-US");
  await settle();
  store.setUp("en-US");
  await settle();
  assert.equal(store.state("en-US"), "failed");
});

test("a setup that runs long says so, and still ends in Speak when the browser finishes", async () => {
  let status = "downloading";
  const download = pending<boolean>();
  const time = clock();
  const store = speechSetupStore({
    speech: browser({ status: () => status, install: () => download.promise }).speech,
    later: time.later,
    slowAfter: 120_000,
  });
  store.check("en-US");
  await settle();
  assert.equal(store.state("en-US"), "offer", "a download another page started can be joined");
  store.setUp("en-US");
  assert.equal(time.waits[0]?.milliseconds, 120_000);
  time.waits[0]?.then();
  assert.equal(store.state("en-US"), "slow");
  status = "available";
  download.resolve(true);
  await settle();
  assert.equal(store.state("en-US"), "ready");
  assert.equal(time.waits[0]?.stopped, true);
});

test("a setup that finishes first stops the wait, so a late wait changes nothing", async () => {
  const time = clock();
  let status = "downloadable";
  const store = speechSetupStore({
    speech: browser({
      status: () => status,
      install: () => {
        status = "available";
        return Promise.resolve(true);
      },
    }).speech,
    later: time.later,
  });
  store.check("en-US");
  await settle();
  store.setUp("en-US");
  await settle();
  assert.equal(store.state("en-US"), "ready");
  assert.equal(time.waits[0]?.stopped, true);
  time.waits[0]?.then();
  assert.equal(store.state("en-US"), "ready");
});

test("no tap installs anything where speech is ready, unsupported or not yet known", async () => {
  const chrome = browser({
    status: (language) => (language === "en-US" ? "available" : language === "sw-KE" ? "unavailable" : "downloadable"),
    install: () => Promise.resolve(true),
  });
  const store = speechSetupStore({ speech: chrome.speech, later: clock().later });
  store.setUp("pt-BR");
  assert.equal(store.state("pt-BR"), "checking", "a tap before the browser answers does nothing");
  for (const language of ["en-US", "sw-KE"]) store.check(language);
  await settle();
  assert.equal(store.state("en-US"), "ready");
  assert.equal(store.state("sw-KE"), "language");
  store.setUp("en-US");
  store.setUp("sw-KE");
  assert.equal(chrome.asked.install.length, 0);
  const nothing = speechSetupStore({ speech: undefined });
  nothing.check("en-US");
  await settle();
  assert.equal(nothing.state("en-US"), "none");
  nothing.setUp("en-US");
  assert.equal(nothing.state("en-US"), "none");
});

test("languages are set up one by one, and a known state stays while the browser is asked again", async () => {
  let english = "downloadable";
  const download = pending<boolean>();
  const chrome = browser({
    status: (language) => (language === "en-US" ? english : "available"),
    install: () => download.promise,
  });
  const store = speechSetupStore({ speech: chrome.speech, later: clock().later });
  store.check("en-US");
  store.check("pt-BR");
  await settle();
  store.setUp("en-US");
  store.check("pt-BR");
  assert.equal(store.state("pt-BR"), "ready", "no flicker back to checking");
  assert.equal(store.state("en-US"), "installing");
  english = "available";
  download.resolve(true);
  await settle();
  assert.equal(store.state("en-US"), "ready");
});

test("Voice input says plainly where speech stands, and never promises it where it cannot work", () => {
  const states: SpeechSetupState[] = ["checking", "none", "language", "offer", "installing", "slow", "failed", "ready"];
  for (const state of states) {
    const controls = voiceControls(state);
    assert.doesNotMatch(controls.note + controls.label, /[—→·]/, `${state} breaks the voice rules`);
    if (controls.note) assert.match(controls.note, /^[A-Z][^]*\.$/, `${state} is a plain sentence`);
  }
  assert.deepEqual(voiceControls("none"), { shown: false, action: null, label: "", note: "" });
  assert.equal(voiceControls("checking").shown, false, "no flash before the browser answers");
  assert.equal(voiceControls("language").action, null);
  assert.deepEqual(
    [voiceControls("offer").action, voiceControls("offer").label],
    ["set-up", "Set up speech on this device"],
  );
  assert.match(voiceControls("offer").note, /Audio stays on this device/);
  assert.match(voiceControls("offer").note, /may download/, "it does not claim a download that may not happen");
  for (const state of ["installing", "slow"] as const) {
    assert.equal(voiceControls(state).action, "setting-up");
    assert.match(voiceControls(state).note, /type/, "typing still works while it runs");
  }
  assert.notEqual(voiceControls("slow").note, voiceControls("installing").note);
  assert.equal(voiceControls("failed").action, "set-up", "the same action keeps its name to try again");
  assert.match(voiceControls("failed").note, /could not set up speech/);
  assert.deepEqual(voiceControls("ready"), { shown: true, action: "speak", label: "", note: "" });
  assert.match(voiceControls("ready", { setUpHere: true }).note, /^Speech is ready/);
  assert.match(voiceControls("installing", { listening: true }).note, /^Listening on this device/);
  for (const state of ["offer", "ready", "language"] as const)
    assert.deepEqual(
      voiceControls(state, { asking: true }),
      { shown: true, action: null, label: "", note: "" },
      `while a new language is asked about, only its choice shows, in ${state}'s place`,
    );
  assert.equal(voiceControls("none", { asking: true }).shown, false);
  assert.deepEqual(
    states.filter(offersSetup),
    ["offer", "installing", "slow", "failed"],
    "the setup takes Speak's place only while it is on offer or under way",
  );
});

test("the needs and offers page offers setup once, in the list the route opened unless it is full", () => {
  let full = emptyAskStep();
  for (const words of ["Seedlings", "Fencing", "A truck", "A map", "A meeting room"]) full = addEntry(full, words);
  const empty = emptyAskStep();
  assert.equal(speechSetupList("needs", { needs: empty, offers: empty }), "needs");
  assert.equal(speechSetupList("offers", { needs: empty, offers: empty }), "offers");
  assert.equal(speechSetupList("needs", { needs: full, offers: empty }), "offers");
  assert.equal(speechSetupList("offers", { needs: full, offers: full }), undefined);
});

test("a list's voice leads with Speak or the page's one setup, and the language choice stays where it helps", () => {
  const top = { full: false, hostsSetup: true, listening: false };
  const other = { ...top, hostsSetup: false };
  assert.equal(listVoice("ready", top), "top");
  assert.equal(listVoice("ready", other), "top", "both lists get Speak");
  for (const state of ["offer", "installing", "slow", "failed"] as const) {
    assert.equal(listVoice(state, top), "top");
    assert.equal(listVoice(state, other), null, "the page asks once");
  }
  assert.equal(listVoice("language", top), "top", "the choice stays where it was picked");
  assert.equal(listVoice("language", other), "conversation");
  for (const state of ["checking", "none"] as const) assert.equal(listVoice(state, top), null);
  assert.equal(listVoice("ready", { ...top, full: true }), null, "a full list takes no more");
  assert.equal(listVoice("none", { ...top, full: true, listening: true }), "top", "finishing always works");
});
