// When a new version takes over, tabs that are not on screen move to it and tabs on screen are
// left alone (DL-114). The rule is a file the service worker reads, so it is run here against a
// stand-in for the worker's own scope.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test, type TestContext } from "node:test";

const SCRIPT = readFileSync(new URL("../public/update-tabs.js", import.meta.url), "utf8");
interface Tab { id: string; url: string; visibilityState: "hidden" | "visible"; reloads: number; navigate(url: string): Promise<void> }
const tab = (id: string, visibilityState: Tab["visibilityState"], fails = false): Tab => ({
  id, url: `https://weave.example/${id}`, visibilityState, reloads: 0,
  async navigate(url) { assert.equal(url, this.url, "a tab is reloaded where it is"); if (fails) throw new TypeError("not controlled"); this.reloads++; },
});
/** Runs the file in a worker's scope and returns what a browser would call. */
function worker(t: TestContext, tabs: Tab[], active: boolean) {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const listeners = new Map<string, (event: { waitUntil(work: Promise<unknown>): void }) => void>();
  const scope = {
    registration: { active: active ? {} : null },
    clients: { matchAll: async (options: unknown) => { assert.deepEqual(options, { type: "window", includeUncontrolled: true }); return [...tabs]; } },
    addEventListener: (name: string, listener: (event: { waitUntil(work: Promise<unknown>): void }) => void) => void listeners.set(name, listener),
  };
  new Function("self", SCRIPT)(scope);
  let waits = 0;
  const fire = (name: string) => listeners.get(name)!({ waitUntil: () => { waits++; } });
  return {
    install: () => fire("install"),
    activate: () => fire("activate"),
    /** How many times the worker asked the browser to hold an event open. */
    waits: () => waits,
    /** Lets the wait pass and the reloads start. */
    async finish() { for (let step = 0; step < 6; step++) { await Promise.resolve(); t.mock.timers.tick(2000); } for (let step = 0; step < 6; step++) await Promise.resolve(); },
  };
}

test("an update reloads the tabs that are not on screen, and never one that is", async t => {
  const tabs = [tab("front", "visible"), tab("behind", "hidden"), tab("also-behind", "hidden")];
  const sw = worker(t, tabs, true);
  sw.install();
  sw.activate();
  await sw.finish();
  assert.deepEqual(tabs.map((item) => [item.id, item.reloads]), [["front", 0], ["behind", 1], ["also-behind", 1]]);
});

test("a first install reloads nothing, because there is no older version to leave", async t => {
  const tabs = [tab("front", "visible"), tab("behind", "hidden")];
  const sw = worker(t, tabs, false);
  sw.install();
  sw.activate();
  await sw.finish();
  assert.deepEqual(tabs.map((item) => item.reloads), [0, 0]);
});

test("a hidden tab the person comes back to during the wait is left alone", async t => {
  const tabs = [tab("behind", "hidden"), tab("returned", "hidden")];
  const sw = worker(t, tabs, true);
  sw.install();
  sw.activate();
  await Promise.resolve();
  tabs[1]!.visibilityState = "visible";
  await sw.finish();
  assert.deepEqual(tabs.map((item) => [item.id, item.reloads]), [["behind", 1], ["returned", 0]]);
});

test("nothing is reloaded before the wait is over, and a tab that cannot be reloaded stops no other", async t => {
  const tabs = [tab("stuck", "hidden", true), tab("behind", "hidden")];
  const sw = worker(t, tabs, true);
  sw.install();
  sw.activate();
  for (let step = 0; step < 5; step++) await Promise.resolve();
  t.mock.timers.tick(1999);
  for (let step = 0; step < 5; step++) await Promise.resolve();
  assert.deepEqual(tabs.map((item) => item.reloads), [0, 0], "the last write to storage gets its time");
  await sw.finish();
  assert.deepEqual(tabs.map((item) => item.reloads), [0, 1]);
});

test("activation never waits for the reloads, which this worker cannot answer until it is active", async t => {
  // Found in a real browser: with the reloads inside `waitUntil`, activation waited for page
  // loads that were themselves waiting for activation, and every page of the site hung.
  const tabs = [tab("behind", "hidden")];
  const sw = worker(t, tabs, true);
  sw.install();
  sw.activate();
  await sw.finish();
  assert.equal(tabs[0]!.reloads, 1);
  assert.equal(sw.waits(), 0, "no event is held open for a reload");
  assert.doesNotMatch(SCRIPT.replace(/^\s*\/\/.*$/gmu, ""), /waitUntil/u);
});

test("the service worker is built to read this file, and takes over at once as before", () => {
  const config = readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8");
  assert.match(config, /importScripts: \["update-tabs\.js"\]/u);
  for (const kept of ['registerType: "autoUpdate"', 'injectRegister: "script"', "skipWaiting: true", "clientsClaim: true"])
    assert.ok(config.includes(kept), kept);
});
