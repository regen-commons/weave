import assert from "node:assert/strict";
import { test } from "node:test";
import { expectProjectAccess, forgetProjectAccess, ProjectAccessTrip, projectAccessAddress, takeProjectAccess } from "../src/initiative/consent-chain.ts";

function tab() {
  const kept = new Map<string, string>();
  return { kept, storage: () => ({ getItem: (key: string) => kept.get(key) ?? null, setItem: (key: string, value: string) => { kept.set(key, value); },
    removeItem: (key: string) => { kept.delete(key); } }) };
}

test("project access follows only a finished sign-in that said it would, once", () => {
  const t = tab();
  let now = 1_000_000;
  expectProjectAccess(t.storage, () => now);
  assert.equal(t.kept.size, 1);
  assert.doesNotMatch([...t.kept.values()].join(), /did:|@|[a-f\d]{8}-/u, "the note names nobody");
  now += 90_000;
  assert.equal(takeProjectAccess(t.storage, "signed-in", true, () => now), true);
  assert.equal(t.kept.size, 0, "reading it removes it");
  assert.equal(takeProjectAccess(t.storage, "signed-in", true, () => now), false, "a reload never repeats the trip to Certified");

  // A sign-in from anywhere else leaves no note, so it only identifies the person.
  assert.equal(takeProjectAccess(tab().storage, "signed-in", true, () => now), false);
});

test("a sign-in that did not finish, took too long or never started is followed by nothing", () => {
  for (const result of ["cancelled", "failed", "expired", null, "anything"]) {
    const t = tab();
    expectProjectAccess(t.storage, () => 0);
    assert.equal(takeProjectAccess(t.storage, result, true, () => 1000), false, String(result));
    assert.equal(t.kept.size, 0, "and the note does not wait for a later sign-in");
  }
  const late = tab();
  expectProjectAccess(late.storage, () => 0);
  assert.equal(takeProjectAccess(late.storage, "signed-in", true, () => 10 * 60_000), false, "after ten minutes it is not acted on");
  const never = tab();
  expectProjectAccess(never.storage, () => 0);
  forgetProjectAccess(never.storage);
  assert.equal(takeProjectAccess(never.storage, "signed-in", true, () => 1000), false);
});

test("a note that is malformed, set far ahead or unreadable is never acted on", () => {
  for (const value of ["", "soon", "NaN", "1e99", String(1000 + 11 * 60_000)]) {
    const t = tab();
    t.kept.set("weave-sign-in-then-projects", value);
    assert.equal(takeProjectAccess(t.storage, "signed-in", true, () => 1000), false, value);
  }
  const blocked = () => { throw new Error("storage is blocked"); };
  assert.doesNotThrow(() => expectProjectAccess(blocked));
  assert.doesNotThrow(() => forgetProjectAccess(blocked));
  assert.equal(takeProjectAccess(blocked, "signed-in", true), false);
});

test("the trip waits for device writes, never leaves unsaved words behind, and asks Certified once", async () => {
  const order: string[] = [];
  const address = "https://certified.one/oauth/authorize?client_id=synthetic&request_uri=urn%3Asynthetic";
  const device = (storage: string, start: () => Promise<string> = async () => { order.push("start"); return address; }) => ({
    settled: async () => { order.push("settled"); }, storage: () => { order.push("storage"); return storage; }, start });
  assert.equal(await projectAccessAddress(device("saved")), address);
  assert.deepEqual(order, ["settled", "storage", "start"], "the same order as a pressed Allow");
  assert.equal(await projectAccessAddress(device("none")), address, "an empty device has nothing to store");
  for (const storage of ["loading", "saving", "memory", "unknown"]) {
    order.length = 0;
    await assert.rejects(projectAccessAddress(device(storage)), /device_storage_unsettled/, storage);
    assert.deepEqual(order, ["settled", "storage"], "Certified is never asked while the latest words are not stored");
  }
  // A refusal, an outage or a signed-out answer from the server is passed on; the page then shows Allow.
  await assert.rejects(projectAccessAddress(device("saved", async () => { throw new Error("project_consent_failed"); })), /project_consent_failed/);
});

test("a sign-in that returns to any other page is followed by nothing, and its note is gone", () => {
  const t = tab();
  expectProjectAccess(t.storage, () => 0);
  assert.equal(takeProjectAccess(t.storage, "signed-in", false, () => 1000), false, "the page that said what follows is the only one that goes on");
  assert.equal(t.kept.size, 0);
  // Pressing Sign In anywhere else clears an earlier note before leaving.
  const stale = tab();
  expectProjectAccess(stale.storage, () => 0);
  forgetProjectAccess(stale.storage);
  assert.equal(takeProjectAccess(stale.storage, "signed-in", true, () => 1000), false);
});

function clock() {
  const timers = new Map<number, { run: () => void; milliseconds: number }>();
  let next = 0;
  return { set: (run: () => void, milliseconds: number) => { timers.set(++next, { run, milliseconds }); return next; },
    clear: (handle: unknown) => { timers.delete(handle as number); },
    pending: () => [...timers.values()].map((timer) => timer.milliseconds),
    fire: () => { for (const [handle, timer] of [...timers]) { timers.delete(handle); timer.run(); } } };
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
const settled = () => new Promise<void>((resolve) => setImmediate(resolve));
const address = "https://certified.one/oauth/authorize?client_id=synthetic&request_uri=urn%3Asynthetic";
const known = { answered: true, signedIn: true, ready: true };

test("the trip starts once everything is known, goes once, and is over", async () => {
  const went: string[] = [], time = clock();
  let starts = 0;
  const trip = new ProjectAccessTrip(true, (to) => went.push(to), time);
  const start = async () => { starts++; return address; };
  assert.equal(trip.pending(), true, "the page holds its shape from the first paint");
  const leave = trip.attend();
  trip.update({ answered: false, signedIn: false, ready: true }, start);
  trip.update({ answered: true, signedIn: true, ready: false }, start);
  assert.equal(starts, 0, "not before the session is checked and the device's drafts are read");
  trip.update(known, start);
  trip.update(known, start);
  assert.equal(starts, 1, "a second effect run does not start a second trip");
  await settled();
  assert.deepEqual(went, [address]);
  assert.equal(trip.pending(), true, "while the browser leaves, the page keeps its shape and offers no second Allow");
  // The person comes back with the browser's Back: the page shows what it always did.
  trip.returned();
  assert.equal(trip.pending(), false);
  assert.deepEqual(time.pending(), [], "the limit is cleared with the trip");
  // Leaving and coming back, any time later, starts nothing: one page load, one trip.
  leave();
  trip.attend();
  trip.update(known, start);
  await settled();
  assert.equal(starts, 1);
  assert.deepEqual(went, [address]);

  // A page load that is not such a return never starts one.
  const none = new ProjectAccessTrip(false, (to) => went.push(to), time);
  none.attend();
  none.update(known, start);
  assert.equal(none.pending(), false);
  assert.equal(starts, 1);
});

test("a trip that cannot start falls back to the button and is not tried again", async () => {
  const went: string[] = [], time = clock();
  let starts = 0, notified = 0;
  const trip = new ProjectAccessTrip(true, (to) => went.push(to), time);
  trip.subscribe(() => { notified++; });
  const leave = trip.attend();
  // Certified is unavailable, the connection is lost, or the session ended on the way.
  trip.update(known, async () => { starts++; throw new Error("certified_project_auth_unavailable"); });
  await settled();
  assert.equal(trip.pending(), false, "the page shows what it always did");
  assert.equal(notified, 1);
  leave();
  trip.attend();
  trip.update(known, async () => { starts++; return address; });
  await settled();
  assert.equal(starts, 1, "coming back to the page does not start it again");
  assert.deepEqual(went, []);
});

test("a person who moved on is not taken to Certified, and the address is dropped", async () => {
  const went: string[] = [], time = clock(), answer = deferred<string>();
  const trip = new ProjectAccessTrip(true, (to) => went.push(to), time);
  const leave = trip.attend();
  trip.update(known, () => answer.promise);
  leave();
  answer.resolve(address);
  await settled();
  assert.equal(went.length, 0, "nobody is on the page to take");
  assert.equal(trip.pending(), false);
  trip.attend();
  trip.update(known, async () => address);
  await settled();
  assert.equal(went.length, 0, "the address that arrived unseen is never used later");

  // React mounts, unmounts and mounts a page once in development: the second mount is on screen.
  const strict = new ProjectAccessTrip(true, (to) => went.push(to), time), again = deferred<string>();
  strict.attend()();
  strict.attend();
  strict.update(known, () => again.promise);
  again.resolve(address);
  await settled();
  assert.deepEqual(went, [address]);
  // A browser that never leaves does not hold the page for good.
  assert.equal(strict.pending(), true);
  time.fire();
  assert.equal(strict.pending(), false, "after 20 seconds the page stops waiting to leave");
  strict.returned();
  assert.equal(strict.pending(), false);
});

test("nobody signed in, or a check that never answers, ends the trip instead of holding the page", async () => {
  const went: string[] = [], time = clock();
  let starts = 0;
  const start = async () => { starts++; return address; };
  // The sign-in did not hold: the session check answers that nobody is signed in.
  const signedOut = new ProjectAccessTrip(true, (to) => went.push(to), time);
  signedOut.attend();
  signedOut.update({ answered: true, signedIn: false, ready: true }, start);
  assert.equal(signedOut.pending(), false);
  // The session check fails and never answers, or the device store never opens.
  for (const stuck of [{ answered: false, signedIn: false, ready: true }, { answered: true, signedIn: true, ready: false }]) {
    const trip = new ProjectAccessTrip(true, (to) => went.push(to), time);
    trip.attend();
    trip.attend();
    trip.update(stuck, start);
    assert.deepEqual(time.pending(), [20000], "one limit, however many times the page mounts");
    assert.equal(trip.pending(), true);
    time.fire();
    assert.equal(trip.pending(), false, "after 20 seconds the page stops waiting");
    // An answer that comes later, such as on the next return to the tab, starts nothing.
    trip.update(known, start);
    await settled();
  }
  assert.equal(starts, 0);
  assert.equal(went.length, 0);
  // The limit does not cut off a trip that has started: the request has its own.
  const slow = new ProjectAccessTrip(true, (to) => went.push(to), time), late = deferred<string>();
  slow.attend();
  slow.update(known, () => late.promise);
  time.fire();
  assert.equal(slow.pending(), true);
  late.resolve(address);
  await settled();
  assert.deepEqual(went, [address]);
});
