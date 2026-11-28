/// <reference lib="dom" />
import assert from "node:assert/strict";
import { test } from "node:test";
import { browserSessionEvents } from "../src/account/session-events.ts";
import { AccountSession } from "../src/account/session.ts";

type Browser = NonNullable<Parameters<typeof browserSessionEvents>[0]>;
function browser(channel?: typeof BroadcastChannel) {
  const target = new EventTarget(), document = new EventTarget();
  Object.assign(document, { visibilityState: "visible" });
  const writes: [string, string][] = [];
  Object.assign(target, { BroadcastChannel: channel, document, localStorage: { setItem(key: string, value: string) { writes.push([key, value]); } } });
  return { target: target as unknown as Browser & EventTarget, writes, document };
}
function storageEvent(key: string, newValue: string) {
  return Object.assign(new Event("storage"), { key, newValue });
}

test("two independent clients receive a real channel sign-out with no identity, tokens or private data", { timeout: 3000 }, async () => {
  const firstBrowser = browser(BroadcastChannel), secondBrowser = browser(BroadcastChannel);
  const response = { available: true, signIn: "certified", user: { id: "b1000000-0000-4000-8000-000000000001", email: null } };
  const first = new AccountSession(async () => response), second = new AccountSession(async () => response);
  const closeFirst = first.connect(browserSessionEvents(firstBrowser.target));
  const closeSecond = second.connect(browserSessionEvents(secondBrowser.target));
  const spy = new BroadcastChannel("weave-account-session");
  try {
    await Promise.all([first.refresh(), second.refresh()]);
    const observed = new Promise<unknown>(resolve => spy.addEventListener("message", event => resolve(event.data), { once: true }));
    const cleared = new Promise<void>(resolve => {
      const unsubscribe = second.subscribe(() => { if (!second.getSnapshot()?.user) { unsubscribe(); resolve(); } });
    });
    first.clear();
    await cleared;
    assert.equal(await observed, "ended");
    assert.equal(second.getSnapshot()?.user, null);
    assert.deepEqual(firstBrowser.writes, []);
  } finally { closeFirst(); closeSecond(); spy.close(); }
});

test("storage fallback accepts only its session marker and removes every listener on close", () => {
  const first = browser(), second = browser();
  const changes: string[] = [];
  let resumes = 0;
  const sender = browserSessionEvents(first.target)(() => {}, () => {});
  const receiver = browserSessionEvents(second.target)(change => changes.push(change), () => resumes++);
  sender.publish("ended");
  const [key, value] = first.writes[0]!;
  assert.equal(key, "weave-account-session");
  assert.match(value, /^ended:[\da-f-]{36}$/u);
  second.target.dispatchEvent(storageEvent(key, value));
  second.target.dispatchEvent(storageEvent("device-draft", value));
  second.target.dispatchEvent(storageEvent(key, "ended:secret"));
  assert.deepEqual(changes, ["ended"]);
  second.target.dispatchEvent(new Event("focus"));
  second.document.dispatchEvent(new Event("visibilitychange"));
  second.target.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
  assert.equal(resumes, 3);
  Object.assign(second.document, { visibilityState: "hidden" });
  second.document.dispatchEvent(new Event("visibilitychange"));
  second.target.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: false }));
  assert.equal(resumes, 3);
  receiver.close(); sender.close();
  second.target.dispatchEvent(storageEvent(key, value));
  second.target.dispatchEvent(new Event("focus"));
  second.document.dispatchEvent(new Event("visibilitychange"));
  second.target.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
  assert.deepEqual(changes, ["ended"]);
  assert.equal(resumes, 3);
});

test("blocked messaging and storage still permit focus reconciliation and safe cleanup", () => {
  class BlockedChannel { constructor() { throw new Error("blocked"); } }
  const current = browser(BlockedChannel as unknown as typeof BroadcastChannel);
  Object.defineProperty(current.target, "localStorage", { get() { throw new Error("blocked"); } });
  let resumes = 0;
  const connection = browserSessionEvents(current.target)(() => assert.fail("no incoming channel"), () => resumes++);
  assert.doesNotThrow(() => connection.publish("changed"));
  current.target.dispatchEvent(new Event("focus"));
  assert.equal(resumes, 1);
  connection.close();
  current.target.dispatchEvent(new Event("focus"));
  assert.equal(resumes, 1);
});
