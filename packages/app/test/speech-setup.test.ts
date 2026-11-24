import assert from "node:assert/strict";
import { test } from "node:test";
import { speechStatus, type SpeechConstructor } from "../src/describe/speech.ts";
import {
  installSpeech,
  holdsTalkRoom,
  offersSetup,
  speechSetupStore,
  speechSupport,
  NO_SPEECH,
  BROWSER_SPEECH_NOTE,
  BROWSER_SPEECH_NOTICE,
  KEYBOARD_MIC,
  speechPaused,
  SPEECH_SETTING,
  speechMode,
  speechNotStarted,
  speechProblem,
  talkControls,
  talkHold,
  talksHere,
  touchPrimary,
  type SpeechSetupState,
  type Wait,
} from "../src/describe/speech-setup.ts";

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

test("each answer decides what a page can offer before any tap, on the device first", async () => {
  const withInstall = { install: () => true };
  assert.equal(await speechSupport("en-US", browser({ status: () => "available", ...withInstall }).speech), "ready");
  assert.equal(await speechSupport("en-US", browser({ status: () => "downloadable", ...withInstall }).speech), "offer");
  assert.equal(await speechSupport("en-US", browser({ status: () => "downloading", ...withInstall }).speech), "offer");
  assert.equal(
    await speechSupport("en-US", browser({ status: () => "downloadable" }).speech),
    "browser",
    "a browser that cannot install is not asked to, and its own speech service is offered instead",
  );
  // Chrome on a computer for a language it has no pack for, Chrome on Android and Brave all answer
  // "unavailable" but have a recognizer: its own speech service is next (19 November 2026).
  const nowhere = browser({ status: () => "unavailable", ...withInstall });
  assert.equal(await speechSupport("sw-KE", nowhere.speech), "browser");
  assert.deepEqual(nowhere.asked.available, [{ langs: ["sw-KE"], processLocally: true }], "one question per language");
  assert.equal(nowhere.asked.install.length, 0, "nothing is installed before a tap");
  // Safari has a recognizer without the on-device question.
  assert.equal(await speechSupport("en-US", browser({ status: () => "available", local: false }).speech), "browser");
  assert.equal(await speechSupport("en-US", null), "none", "Firefox on Android has no speech recognition");
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
  assert.equal(store.state("sw-KE"), "browser");
  store.setUp("en-US");
  store.setUp("sw-KE");
  assert.equal(chrome.asked.install.length, 0);
  const nothing = speechSetupStore({ speech: null });
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

test("Talk it out says plainly where speech stands, and where it cannot work it says so in one line (DL-110)", () => {
  const states: SpeechSetupState[] = ["checking", "none", "browser", "offer", "installing", "slow", "failed", "ready"];
  for (const state of states)
    for (const options of [{}, { touch: true }, { agreed: true }, { listening: true }, { listening: true, stopping: true }]) {
      const controls = talkControls(state, options);
      assert.doesNotMatch(controls.note + controls.label, /[\u2014\u2192\u00b7]/, `${state} breaks the voice rules`);
      if (controls.note) assert.match(controls.note, /^[A-Z][^]*\.$/, `${state} is a plain sentence`);
      // Only the browser's own speech service mentions it, and it does before the agreement and while listening.
      const named = /speech service turns your voice/.test(controls.note);
      assert.ok(!named || controls.mode === "browser", `${state}: only the browser's service names it`);
      if (controls.mode === "browser" && (controls.agreement || controls.action === "stop")) assert.ok(named, `${state} names its mode`);
    }
  // A browser without speech recognition (Firefox on Android) is told so, never left guessing.
  assert.deepEqual(talkControls("none"), { action: null, label: "", note: NO_SPEECH, language: false, mode: null, agreement: false });
  assert.match(NO_SPEECH, /You can type instead\.$/);
  assert.deepEqual(
    talkControls("checking"),
    { action: null, label: "", note: "", language: false, mode: null, agreement: false },
    "no flash before the browser answers",
  );
  assert.deepEqual(
    [talkControls("offer").action, talkControls("offer").label],
    ["set-up", "Set Up Speech"],
  );
  // The setup's line waits for the press, so a phone's box is higher; the press then says what it does.
  assert.equal(talkControls("offer").note, "You can also type in the box below.", "before the press, only what is true whatever the setup does");
  assert.doesNotMatch(talkControls("offer").note, /download|speech files|Audio/u, "what the setup does waits for the press");
  assert.match(talkControls("installing").note, /may download/, "it does not claim a download that may not happen");
  assert.match(talkControls("ready", { setUpHere: true }).note, /Audio stays on this device/, "where the audio goes is said once speech works");
  for (const state of ["installing", "slow"] as const) {
    assert.equal(talkControls(state).action, "setting-up");
    assert.match(talkControls(state).note, /type/, "typing still works while it runs");
  }
  assert.notEqual(talkControls("slow").note, talkControls("installing").note);
  assert.equal(talkControls("failed").action, "set-up", "the same action keeps its name to try again");
  assert.match(talkControls("failed").note, /could not set up speech/);
  // One button in one place: Talk It Out, then Stop while it listens.
  assert.deepEqual(talkControls("ready"), { action: "talk", label: "Talk It Out", note: "", language: true, mode: "device", agreement: false });
  assert.match(talkControls("ready", { setUpHere: true }).note, /^Speech is ready/);
  assert.equal(talkControls("ready", { setUpHere: true }).language, false, "a longer line takes the room");
  assert.deepEqual(
    [talkControls("ready", { listening: true }).action, talkControls("ready", { listening: true }).label],
    ["stop", "Stop"],
  );
  assert.match(talkControls("ready", { listening: true }).note, /^Listening on this device/);
  // Stop answers the press at once, before the recognizer has handed over its last words (DL-133).
  for (const state of ["ready", "browser"] as const) {
    const finishing = talkControls(state, { listening: true, stopping: true, agreed: true });
    assert.deepEqual([finishing.action, finishing.label, finishing.note], ["finishing", "Finishing", "Finishing your words."]);
    assert.equal(finishing.language, false, "one line beside the button, as while listening");
    assert.equal(finishing.mode, speechMode(state), "it is still the same session");
  }
  assert.equal(talkControls("ready", { stopping: true }).action, "talk", "nothing is finishing unless something listens");
  for (const state of ["offer", "ready", "browser"] as const)
    assert.equal(talkControls(state, { asking: true }).action, null, `no button while a new language is asked about, in ${state}'s place`);
  assert.deepEqual(
    states.filter(offersSetup),
    ["offer", "installing", "slow", "failed"],
    "the setup takes the button's place only while it is on offer or under way",
  );
});

test("the browser's own speech service is offered with its mode in view, and asks for agreement until given", () => {
  const before = talkControls("browser");
  assert.deepEqual([before.action, before.label, before.mode, before.agreement], ["talk", "Talk It Out", "browser", true]);
  assert.equal(before.note, BROWSER_SPEECH_NOTE);
  assert.equal(before.language, false, "one line at a time beside the button, so pressing it moves nothing");
  const after = talkControls("browser", { agreed: true });
  assert.equal(after.agreement, false, "an agreement given on this device is not asked for again");
  assert.deepEqual([after.note, after.language], ["", true], "once agreed, the language choice takes the line's place, as on the device");
  const listening = talkControls("browser", { listening: true, agreed: true });
  assert.equal(listening.mode, "browser");
  assert.match(listening.note, /^Listening\. Your browser's speech service/);
  assert.doesNotMatch(listening.note, /on this device/, "it never claims the audio stays here");
  assert.equal(talkControls("ready").agreement, false, "speech on this device needs no agreement");
  assert.equal(talkControls("ready", { listening: true }).mode, "device");
  assert.deepEqual(
    (["checking", "none", "browser", "offer", "installing", "slow", "failed", "ready"] as const).map(speechMode),
    [null, null, "browser", null, null, null, null, "device"],
    "a state is one mode or none, never both",
  );
});

test("the notice before browser speech names no company, says where the audio goes and that typing works", () => {
  const notice = BROWSER_SPEECH_NOTICE.body.join(" ");
  assert.match(notice, /send your voice to its own speech service/);
  assert.match(notice, /Weave does not receive or keep the audio/);
  assert.match(notice, /Typing always works/);
  assert.match(notice, /turn this off in Settings/);
  assert.doesNotMatch(notice, /Google|Apple|Microsoft|Siri|Brave|Chrome|Safari|Edge/u, "Weave cannot know who runs the service");
  for (const line of [...BROWSER_SPEECH_NOTICE.body, SPEECH_SETTING.agreed, SPEECH_SETTING.notAgreed])
    assert.doesNotMatch(line, /[\u2014\u2192]/);
  assert.equal(BROWSER_SPEECH_NOTICE.agree, "Agree And Talk It Out", "the action keeps its name through the flow");
  assert.equal(SPEECH_SETTING.withdraw, "Stop Using Browser Speech");
});

test("on a touch screen with no way to talk, one calm line points to the keyboard's microphone key", () => {
  const controls = talkControls("none", { touch: true });
  assert.equal(controls.note, KEYBOARD_MIC);
  assert.equal(controls.action, null);
  assert.match(KEYBOARD_MIC, /^If your keyboard has a microphone key/, "not every keyboard has one");
  assert.equal(talkControls("none").note, NO_SPEECH, "a computer keyboard has no such key, so the line does not mention it");
  for (const state of ["ready", "browser", "offer", "failed"] as const)
    assert.notEqual(talkControls(state, { touch: true }).note, KEYBOARD_MIC, `${state}: one way to talk at a time`);
  assert.equal(talkControls("none", { touch: true, secondary: true }).note, "", "the second list on a page stays quiet");
  assert.equal(touchPrimary(() => ({ matches: true })), true);
  assert.equal(touchPrimary(() => ({ matches: false })), false);
  assert.equal(touchPrimary(undefined), false, "no media queries, as in Node, is not a touch screen");
  let asked = "";
  touchPrimary((query) => {
    asked = query;
    return { matches: false };
  });
  assert.equal(asked, "(pointer: coarse)", "the primary pointer, not any pointer, so a touch laptop with a trackpad is not counted");
});

test("each way the browser's speech service can stop says only what is known, and keeps typing open", () => {
  const codes = [
    "not-allowed",
    "audio-capture",
    "no-speech",
    "network",
    "service-not-allowed",
    "language-not-supported",
    "phrases-not-supported",
    "bad-grammar",
    "withdrawn",
    "something new",
  ];
  for (const mode of ["device", "browser"] as const)
    for (const code of codes) {
      const line = speechProblem(code, mode);
      assert.match(line, /^[A-Z][^]*\.$/, `${code} is a plain sentence`);
      assert.match(line, /type in the box/, `${code}: typing still works`);
      assert.doesNotMatch(line, /[\u2014\u2192]/);
    }
  // The page's own abort never reaches it, so "aborted" is the browser stopping by itself: said, never silence.
  assert.match(speechProblem("aborted", "browser"), /Your browser stopped listening/u);
  assert.match(speechProblem("not-allowed", "browser"), /did not allow the microphone/);
  assert.match(speechProblem("audio-capture", "browser"), /could not use a microphone/);
  assert.match(speechProblem("network", "browser"), /speech service could not be reached/);
  assert.doesNotMatch(speechProblem("network", "device"), /speech service/, "speech on the device has no service to reach");
  assert.match(speechProblem("service-not-allowed", "browser"), /does not work here/);
  assert.match(speechProblem("language-not-supported", "browser"), /Choose another language/);
  assert.match(speechProblem("withdrawn", "browser"), /turned off in Settings/);
  assert.match(speechProblem("something new", "browser"), /could not continue/, "an unknown code is said plainly, not guessed at");
  // A recognizer that ended by itself says so either way, and never says words are in an empty box.
  assert.equal(speechPaused(true), "Listening stopped after a pause. Your words are in the box. Press Talk It Out to say more.");
  assert.match(speechPaused(false), /^Listening stopped after a pause\./);
  assert.doesNotMatch(speechPaused(false), /words are in the box/, "nothing was heard, so no words are claimed");
  assert.match(speechPaused(false), /try again, or type in the box\.$/, "the next step stays open with an empty box");
  assert.match(speechNotStarted("device"), /not ready on this device/);
  assert.match(speechNotStarted("browser"), /speech service did not start/);
});

test("a failed session leaves Talk It Out in place, so the page does not move and the focus stays", async () => {
  // What is offered comes from the browser's answer alone, never from how a session ended: the
  // button keeps its place after every error, as Set Up does after a failed setup, and pressing it
  // again tries again. The error is said in the status line under the box.
  const safari = browser({ status: () => "unavailable", local: false });
  const store = speechSetupStore({ speech: safari.speech });
  store.check("en-US");
  await settle();
  assert.equal(store.state("en-US"), "browser");
  assert.equal("report" in store, false, "there is no way for a failure to change the controls");
  assert.equal(talkControls(store.state("en-US"), { agreed: true }).action, "talk");
  // On a touch screen, a service that cannot be reached or will not work here also points to the keyboard.
  for (const code of ["network", "service-not-allowed"]) {
    assert.match(speechProblem(code, "browser", true), /If your keyboard has a microphone key/);
    assert.doesNotMatch(speechProblem(code, "browser"), /keyboard/, "a computer keyboard has no such key");
  }
  assert.doesNotMatch(speechProblem("not-allowed", "browser", true), /keyboard/, "a refused microphone would refuse the keyboard too");
});

test("a second Talk it out on a page stays quiet until talking works, so setup and the missing-speech line show once", () => {
  for (const state of ["checking", "none", "offer", "installing", "slow", "failed"] as const)
    assert.deepEqual(
      talkControls(state, { secondary: true }),
      { action: null, label: "", note: "", language: false, mode: null, agreement: false },
      `${state}: the first list on the page says it`,
    );
  assert.equal(talkControls("ready", { secondary: true }).action, "talk", "both lists get Talk It Out");
  assert.equal(talkControls("browser", { secondary: true }).action, "talk", "the browser's own service too");
  assert.equal(talkControls("none", { secondary: true, listening: true }).action, "stop", "stopping always works");
});

test("Talk It Out keeps the keyboard focus while it is held", () => {
  // Stop pressed with the keyboard: the button turns back into Talk It Out while the fields fill.
  // A disabled button would drop the focus to the page, so the next Tab would start from the top.
  assert.equal(talkHold("talk", { working: true, disabled: false, focused: true }), "held");
  // A list that the fill made full holds it the same way, after the fill ends.
  assert.equal(talkHold("talk", { working: false, disabled: true, focused: true }), "held");
  // Away from the focus, a held button is plainly disabled and leaves the Tab order.
  assert.equal(talkHold("talk", { working: true, disabled: false, focused: false }), "disabled");
  assert.equal(talkHold("talk", { working: false, disabled: true, focused: false }), "disabled");
  assert.equal(talkHold("talk", { working: false, disabled: false, focused: true }), "free");
  // Stopping always works, and the setup holds itself with aria-busy.
  for (const action of ["stop", "finishing", "set-up", "setting-up"] as const)
    assert.equal(talkHold(action, { working: true, disabled: true, focused: true }), "free", `${action} is never held here`);
});

test("until the browser answers, the button's place is held, so the button arrives without moving the box (DL-110)", async () => {
  // On load, and while a newly chosen language is asked about, the controls have no button yet.
  assert.equal(talkControls("checking").action, null);
  assert.equal(holdsTalkRoom("checking"), true);
  assert.equal(talkControls("ready", { asking: true }).action, null);
  assert.equal(holdsTalkRoom("ready", { asking: true }), true);
  // Once it answers, the button or the plain line takes the place, and nothing is held.
  for (const state of ["none", "browser", "cloud", "offer", "installing", "slow", "failed", "ready"] as const)
    assert.equal(holdsTalkRoom(state), false, state);
  // The second Talk It Out on a page shows nothing until talking works, so it holds nothing either.
  assert.equal(holdsTalkRoom("checking", { secondary: true }), false);
  const { readFileSync } = await import("node:fs");
  const talk = readFileSync(new URL("../src/ui/TalkItOut.tsx", import.meta.url), "utf8");
  assert.match(talk, /!controls\.action && holdsTalkRoom\(speech\.state, \{ asking: speech\.asking, secondary \}\) && \(\s*<span className="rc-skeleton" data-shape="room" aria-hidden="true">/u);
  const css = readFileSync(new URL("../../design-system/css/organisms.css", import.meta.url), "utf8");
  assert.match(css, /\.rc-voice-slot > \.rc-skeleton\[data-shape="room"\] \{ display: flex; flex: 1 1 100%; \}/u);
});
