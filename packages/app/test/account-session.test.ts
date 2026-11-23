import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { parseDocument } from "@weave/api/account-contract";
import { AccountFailure, accountRequest } from "../src/account/client.ts";
import { AccountSession, type ConnectSession, type SessionChange } from "../src/account/session.ts";
import { signOut } from "../src/account/sign-out.ts";
import { DraftController } from "../src/describe/controller.ts";
import { MemoryDraftRepository } from "../src/describe/repository.ts";
import { newDraft, revise } from "../src/describe/contracts.ts";
import { loadedDraft } from "../src/account/document.ts";
import { loadPersonalProject, saveForProject } from "../src/initiative/project-save.ts";

const owner = "b1000000-0000-4000-8000-000000000001";
const other = "b1000000-0000-4000-8000-000000000002";
const response = (id: string | null) => ({ available: true, signIn: "certified", user: id ? { id, email: null } : null,
  items: id ? [{ id: "b3000000-0000-4000-8000-000000000001", name: `Synthetic card for ${id}`, revision: 1, updatedAt: "2026-11-15T00:00:00Z" }] : [] });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
function tabs() {
  const receivers = new Set<(change: SessionChange) => void>();
  const resumes = new Set<() => void>();
  const messages: SessionChange[] = [];
  const connect: ConnectSession = (receive, resume) => {
    receivers.add(receive); resumes.add(resume);
    return { publish(change) { messages.push(change); for (const next of receivers) if (next !== receive) next(change); },
      close() { receivers.delete(receive); resumes.delete(resume); } };
  };
  return { connect, messages, receivers, resume: () => { for (const resume of resumes) resume(); } };
}
const changed = (error: unknown) => error instanceof AccountFailure && error.code === "account_changed";
const settled = () => new Promise<void>(resolve => setImmediate(resolve));

test("confirmed sign-out clears two independent tab clients and keeps device drafts and backups", async () => {
  const bus = tabs();
  let signedIn = true;
  const request: typeof accountRequest = async () => response(signedIn ? owner : null);
  const first = new AccountSession(request), second = new AccountSession(request);
  const closeFirst = first.connect(bus.connect), closeSecond = second.connect(bus.connect);
  const repository = new MemoryDraftRepository(revise(newDraft(), { composer: "Synthetic device words" }));
  const device = new DraftController(repository);
  await device.initialize();
  await device.replace(revise(newDraft(), { composer: "Synthetic current device draft" }));
  const before = device.getSnapshot(), backups = [...await device.backups()];
  await Promise.all([first.refresh(), second.refresh()]);
  assert.equal(second.getSnapshot()?.items.length, 1);
  await signOut(async () => { signedIn = false; }, first.clear);
  assert.equal(first.getSnapshot()?.user, null);
  assert.equal(second.getSnapshot()?.user, null, "the other tab must stop showing signed-in controls");
  assert.deepEqual(second.getSnapshot()?.items, [], "the other tab must drop private cloud cards");
  assert.deepEqual(bus.messages, ["ended"], "receiving a sign-out never broadcasts it again");
  assert.equal(device.getSnapshot(), before);
  assert.deepEqual(await device.backups(), backups);
  closeFirst(); closeSecond();
  assert.equal(bus.receivers.size, 0);
});

test("a pre-sign-out refresh cannot restore an old account even when its transport ignores cancellation", async () => {
  const bus = tabs(), pending = deferred<Record<string, unknown>>();
  let calls = 0;
  const request: typeof accountRequest = async () => ++calls === 1 ? response(owner) : pending.promise;
  const first = new AccountSession(async () => response(owner)), second = new AccountSession(request);
  const closeFirst = first.connect(bus.connect), closeSecond = second.connect(bus.connect);
  await Promise.all([first.refresh(), second.refresh()]);
  const stale = second.refresh();
  first.clear();
  pending.resolve(response(owner));
  await assert.rejects(stale, changed);
  assert.equal(second.getSnapshot()?.user, null);
  assert.deepEqual(second.getSnapshot()?.items, []);
  closeFirst(); closeSecond();
});

test("an unconfirmed sign-out keeps both tabs signed in and does not publish invalidation", async () => {
  const bus = tabs();
  const first = new AccountSession(async () => response(owner)), second = new AccountSession(async () => response(owner));
  const closeFirst = first.connect(bus.connect), closeSecond = second.connect(bus.connect);
  await Promise.all([first.refresh(), second.refresh()]);
  const result = await signOut(async () => { throw new AccountFailure("sign_out_unconfirmed"); }, first.clear);
  assert.equal(result.cleared, false);
  assert.equal(first.getSnapshot()?.user?.id, owner);
  assert.equal(second.getSnapshot()?.user?.id, owner);
  assert.deepEqual(bus.messages, []);
  closeFirst(); closeSecond();
});

test("confirmed expiry clears other tabs once, while an old expiry cannot clear a newer login", async () => {
  const bus = tabs();
  let expired = false;
  const request: typeof accountRequest = async () => { if (expired) throw new AccountFailure("sign_in_required"); return response(owner); };
  const first = new AccountSession(request), second = new AccountSession(request);
  const closeFirst = first.connect(bus.connect), closeSecond = second.connect(bus.connect);
  await Promise.all([first.refresh(), second.refresh()]);
  expired = true;
  await assert.rejects(first.refresh(), error => error instanceof AccountFailure && error.code === "sign_in_required");
  assert.equal(second.getSnapshot()?.user, null);
  assert.deepEqual(bus.messages, ["ended"]);
  closeFirst(); closeSecond();

  const pending = deferred<Record<string, unknown>>();
  let calls = 0;
  const returning = new AccountSession(async () => ++calls === 1 ? pending.promise : response(other));
  const old = returning.refresh();
  await returning.refresh();
  pending.reject(new AccountFailure("sign_in_required"));
  await assert.rejects(old, changed);
  assert.equal(returning.getSnapshot()?.user?.id, other);
});

test("new sign-in immediately hides the previous account, rechecks the cookie once and recovers without saving or loading", async () => {
  const bus = tabs();
  const next = deferred<Record<string, unknown>>();
  let calls = 0;
  const first = new AccountSession(async () => response(other));
  const second = new AccountSession(async () => ++calls === 1 ? response(owner) : next.promise);
  const closeFirst = first.connect(bus.connect), closeSecond = second.connect(bus.connect);
  await second.refresh();
  first.changed();
  assert.equal(second.getSnapshot(), null, "old private lists leave before the network answers");
  next.resolve(response(other));
  await settled();
  assert.equal(second.getSnapshot()?.user?.id, other);
  assert.equal(second.getSnapshot()?.items[0]?.name, `Synthetic card for ${other}`);
  assert.deepEqual(bus.messages, ["changed"]);
  assert.equal(calls, 2, "reconciliation must not publish another change or refetch forever");
  closeFirst(); closeSecond();
});

test("resuming a tab fails closed on an unavailable account and permits a later retry", async () => {
  const bus = tabs(), time = clock();
  let failure: string | null = null, calls = 0;
  const session = new AccountSession(async () => {
    calls++;
    if (failure) throw new AccountFailure(failure);
    return response(calls === 1 ? owner : other);
  }, time.timers, () => 0);
  const close = session.connect(bus.connect);
  await session.refresh();
  failure = "connection_failed";
  bus.resume();
  assert.equal(session.getSnapshot()?.user?.id, owner, "the account stays on screen while the check is under way");
  await settled();
  assert.equal(session.getSnapshot(), null, "an outage never restores cached private account data");
  assert.equal(session.getExpected(), false, "sign-in is offered again when the session cannot be checked");
  assert.equal(session.getEnding(), null, "a check that could not be made has not signed anyone out");
  assert.deepEqual(time.pending(), [60000], "the check is tried again without waiting for the next return");
  assert.deepEqual(bus.messages, []);
  failure = null;
  time.fire();
  await settled();
  assert.equal(session.getSnapshot()?.user?.id, other);
  close();
  const before = calls;
  bus.resume();
  assert.equal(calls, before, "closed tabs have no remaining resume listener");
});

test("returning to a tab keeps a signed-in account on screen, joins one check and cancels no request", async t => {
  const bus = tabs(), answer = deferred<Record<string, unknown>>();
  let calls = 0;
  const session = new AccountSession(async () => ++calls === 1 ? response(owner) : answer.promise);
  const close = session.connect(bus.connect);
  await session.refresh();
  const seen: (string | null | undefined)[] = [];
  session.subscribe(() => seen.push(session.getSnapshot()?.user?.id ?? (session.getSnapshot() === null ? null : undefined)));
  // A private request under way when the person comes back, such as a save.
  const body = deferred<Record<string, unknown>>();
  const fetcher = t.mock.method(globalThis, "fetch", async () => ({ ok: true, json: () => body.promise }) as Response);
  const save = accountRequest("", { action: "save" });
  // Focus and visibility both report one return.
  bus.resume(); bus.resume();
  assert.equal(session.getSnapshot()?.user?.id, owner);
  assert.equal(calls, 2, "two signals of one return share one check");
  answer.resolve(response(owner));
  await settled();
  assert.deepEqual(seen.filter(id => id !== owner), [], "the account never leaves the screen for someone still signed in");
  body.resolve({ saved: true });
  assert.deepEqual(await save, { saved: true }, "a request under way is not cancelled by coming back to the tab");
  assert.equal(fetcher.mock.callCount(), 1);
  assert.deepEqual(bus.messages, []);
  close();
});

test("returning to a tab still shows a session that ended, or another account, as soon as the check answers", async () => {
  const bus = tabs();
  let reply: () => Record<string, unknown> = () => response(owner);
  const session = new AccountSession(async () => reply());
  const close = session.connect(bus.connect);
  await session.refresh();
  reply = () => response(other);
  bus.resume();
  await settled();
  assert.equal(session.getSnapshot()?.user?.id, other, "an account that changed while the tab was away replaces the old one");
  assert.equal(session.getSnapshot()?.items[0]?.name, `Synthetic card for ${other}`);
  reply = () => { throw new AccountFailure("sign_in_required"); };
  bus.resume();
  await settled();
  assert.equal(session.getSnapshot()?.user, null, "a refused session signs the tab out");
  assert.equal(session.getEnding(), "ended", "and the screen says so");
  assert.deepEqual(bus.messages, ["ended"]);
  reply = () => response(null);
  bus.resume();
  await settled();
  assert.equal(session.getSnapshot()?.user, null);
  close();

  // Signed out in another window while this tab was suspended and heard nothing.
  const quiet = tabs();
  let signedIn = true;
  const suspended = new AccountSession(async () => response(signedIn ? owner : null));
  const closeSuspended = suspended.connect(quiet.connect);
  await suspended.refresh();
  signedIn = false;
  quiet.resume();
  await settled();
  assert.equal(suspended.getSnapshot()?.user, null);
  assert.equal(suspended.getEnding(), "ended", "a sign-out the tab missed is never hidden");
  closeSuspended();
});

function note(present: boolean) {
  const writes: boolean[] = [];
  return { writes, presence: { read: () => present, write: (next: boolean) => { present = next; writes.push(next); } }, present: () => present };
}

test("a device that last saw an account signed in holds sign-in back only until the first answer", async () => {
  const device = note(true), answer = deferred<Record<string, unknown>>();
  const session = new AccountSession(async () => answer.promise, undefined, undefined, device.presence);
  assert.equal(session.getSnapshot(), null, "the note never stands in for an account");
  assert.equal(session.getExpected(), true);
  const check = session.refresh();
  answer.resolve(response(owner));
  await check;
  assert.equal(session.getExpected(), false);
  assert.equal(device.present(), true);

  // Nobody is signed in any more: the answer removes the note.
  const stale = note(true);
  const signedOut = new AccountSession(async () => response(null), undefined, undefined, stale.presence);
  await signedOut.refresh();
  assert.equal(signedOut.getExpected(), false);
  assert.equal(stale.present(), false, "an answer that nobody is signed in removes the note");

  // The check cannot be made: sign-in is offered, and the note is kept for the next visit.
  const offline = note(true);
  let notified = 0;
  const unreachable = new AccountSession(async () => { throw new AccountFailure("connection_failed"); }, undefined, undefined, offline.presence);
  unreachable.subscribe(() => { notified++; });
  await assert.rejects(unreachable.refresh());
  assert.equal(unreachable.getExpected(), false, "sign-in is never withheld for want of a connection");
  assert.equal(notified, 1, "the page hears that sign-in is offered again");
  assert.equal(offline.present(), true);

  // An account service that is switched off says nothing about the person.
  const off = note(true);
  const disabled = new AccountSession(async () => ({ available: false }), undefined, undefined, off.presence);
  await disabled.refresh();
  assert.equal(disabled.getExpected(), false);
  assert.equal(off.present(), true);
});

test("the note follows sign-in, sign-out and an ended session, and a new device has none", async () => {
  const device = note(false);
  let reply: () => Record<string, unknown> = () => response(owner);
  const session = new AccountSession(async () => reply(), undefined, undefined, device.presence);
  assert.equal(session.getExpected(), false, "a first visit is offered sign-in at once");
  await session.refresh();
  assert.equal(device.present(), true);
  session.signedOut();
  assert.equal(device.present(), false, "Sign Out removes the note");
  await session.refresh();
  assert.equal(device.present(), true);
  reply = () => { throw new AccountFailure("sign_in_required"); };
  await assert.rejects(session.refresh());
  assert.equal(device.present(), false, "an ended session removes the note");

  // Another tab finished a sign-in: this one expects an account while it checks.
  const bus = tabs(), answer = deferred<Record<string, unknown>>();
  const first = new AccountSession(async () => response(owner));
  const second = new AccountSession(async () => answer.promise);
  const closeFirst = first.connect(bus.connect), closeSecond = second.connect(bus.connect);
  first.changed();
  assert.equal(second.getSnapshot(), null);
  assert.equal(second.getExpected(), true, "sign-in is not offered beside a sign-in that just finished");
  answer.resolve(response(owner));
  await settled();
  assert.equal(second.getExpected(), false);
  closeFirst(); closeSecond();
});

test("disconnecting and reconnecting rejects work from the earlier connection", async () => {
  const bus = tabs(), pending = deferred<Record<string, unknown>>();
  let calls = 0, signal: AbortSignal | undefined;
  const session = new AccountSession(async (_path, _body, _endpoint, currentSignal) => {
    signal = currentSignal;
    return ++calls === 1 ? pending.promise : response(other);
  });
  const close = session.connect(bus.connect);
  const stale = session.refresh();
  close();
  assert.equal(signal?.aborted, true);
  const reconnect = session.connect(bus.connect);
  await session.refresh();
  pending.resolve(response(owner));
  await assert.rejects(stale, changed);
  assert.equal(session.getSnapshot()?.user?.id, other);
  reconnect();
});

test("invalidation rejects all private API responses already parsing, including stale success and auth failure", async t => {
  for (const [endpoint, status] of [["/api/account", 200], ["/api/projects", 200], ["/api/matching", 401]] as const) {
    const body = deferred<Record<string, unknown>>(), parsing = deferred<void>();
    let signal: AbortSignal | null | undefined;
    t.mock.method(globalThis, "fetch", async (_url: unknown, options?: RequestInit) => {
      signal = options?.signal;
      const result = new Response(null, { status });
      t.mock.method(result, "json", () => { parsing.resolve(); return body.promise; });
      return result;
    });
    const pending = accountRequest("", undefined, endpoint);
    await parsing.promise;
    new AccountSession().clear();
    assert.equal(signal?.aborted, true);
    body.resolve(status === 200 ? response(owner) : { error: "sign_in_required" });
    await assert.rejects(pending, changed, "no old payload or old 401 reaches its consumer");
    t.mock.restoreAll();
  }
  t.mock.method(globalThis, "fetch", async () => Response.json(response(other)));
  assert.deepEqual(await accountRequest(), response(other), "a fresh request can use the new session");
});

test("a cloud Load still in flight at sign-out cannot replace device words, files or backups", async t => {
  const bytes = new Blob(["Synthetic local file"]);
  const original = revise(newDraft(), { composer: "Synthetic local words",
    attachments: [{ id: crypto.randomUUID(), name: "synthetic.txt", type: "text/plain", bytes: bytes.size, blob: bytes }] });
  const repository = new MemoryDraftRepository(original), controller = new DraftController(repository);
  await controller.initialize();
  const before = controller.getSnapshot();
  const parsing = deferred<void>(), body = deferred<Record<string, unknown>>();
  t.mock.method(globalThis, "fetch", async () => {
    const response = new Response();
    t.mock.method(response, "json", () => { parsing.resolve(); return body.promise; });
    return response;
  });
  const pending = loadPersonalProject(controller, "b3000000-0000-4000-8000-000000000001", owner, new AbortController().signal);
  await parsing.promise;
  new AccountSession().clear();
  body.resolve({ user: { id: owner, email: null }, saved: {} });
  await assert.rejects(pending, changed, "the old account response is rejected before any Load or backup");
  assert.equal(controller.getSnapshot(), before);
  assert.equal(repository.value, original);
  assert.deepEqual(await controller.backups(), []);
  assert.equal(await controller.getSnapshot().draft.attachments[0]!.blob.text(), "Synthetic local file");
});

test("a late cloud Save receipt cannot restore the previous account binding or discard a recoverable device request", async t => {
  const document = parseDocument(JSON.parse(readFileSync(new URL("../../api/src/test-data/account.json", import.meta.url), "utf8")));
  const saved = { id: "b3000000-0000-4000-8000-000000000001", revision: 1, updatedAt: "2026-11-15T00:00:00Z", document };
  const source = loadedDraft(saved, owner);
  const original = revise(source, { composer: "Synthetic unfinished words", confirmed: { ...source.confirmed!, name: "Changed synthetic card" } });
  const repository = new MemoryDraftRepository(original), controller = new DraftController(repository);
  await controller.initialize();
  const parsing = deferred<void>(), body = deferred<Record<string, unknown>>();
  let command: Record<string, unknown> | undefined;
  t.mock.method(globalThis, "fetch", async (_url: unknown, options?: RequestInit) => {
    command = JSON.parse(String(options?.body));
    const response = new Response();
    t.mock.method(response, "json", () => { parsing.resolve(); return body.promise; });
    return response;
  });
  const pending = saveForProject(controller, owner, new AbortController().signal);
  await parsing.promise;
  new AccountSession().clear();
  body.resolve({ saved: { ...saved, revision: 2, document: command!.document } });
  await assert.rejects(pending, changed);
  assert.equal(controller.getSnapshot().draft.composer, "Synthetic unfinished words");
  assert.equal(controller.getSnapshot().draft.account.saved?.revision, 1);
  assert.equal(controller.getSnapshot().draft.account.pending?.requestId, command!.requestId);
  assert.deepEqual(await controller.backups(), []);
});

function clock() {
  const timers = new Map<number, { run: () => void; milliseconds: number }>();
  let next = 0;
  return {
    timers: { set: (run: () => void, milliseconds: number) => { timers.set(++next, { run, milliseconds }); return next; },
      clear: (handle: unknown) => { timers.delete(handle as number); } },
    pending: () => [...timers.values()].map(timer => timer.milliseconds),
    fire: () => { const [first] = [...timers.entries()]; assert.ok(first, "a check is scheduled"); timers.delete(first[0]); first[1].run(); },
  };
}

test("a connected tab checks again when the server asks, so the session renews before it lapses", async () => {
  const bus = tabs(), time = clock();
  let calls = 0;
  const session = new AccountSession(async () => { calls++; return { ...response(owner), renewIn: 3330 }; }, time.timers, () => 5000);
  assert.equal((await session.refresh()).renewIn, 3330);
  assert.deepEqual(time.pending(), [], "a session that is not connected to the page never schedules");
  const close = session.connect(bus.connect);
  await session.refresh();
  assert.deepEqual(time.pending(), [3335000], "the next check comes at the server's moment plus a spread between tabs");
  time.fire();
  await settled();
  assert.equal(calls, 3);
  assert.deepEqual(time.pending(), [3335000], "each successful check schedules exactly one more");
  close();
  assert.deepEqual(time.pending(), [], "closing the page connection cancels the check");
});

test("a scheduled check that finds the session ended signs every tab out; an offline one tries again", async () => {
  const bus = tabs(), time = clock();
  const replies: (() => Record<string, unknown>)[] = [
    () => ({ ...response(owner), renewIn: 600 }),
    () => { throw new AccountFailure("connection_failed"); },
    () => { throw new AccountFailure("sign_in_required"); },
  ];
  const session = new AccountSession(async () => replies.shift()!(), time.timers, () => 0);
  session.connect(bus.connect);
  await session.refresh();
  time.fire();
  await settled();
  assert.equal(session.getSnapshot()?.user?.id, owner, "being offline does not end the session");
  assert.deepEqual(time.pending(), [60000]);
  time.fire();
  await settled();
  assert.equal(session.getSnapshot()?.user, null);
  assert.deepEqual(bus.messages, ["ended"], "other tabs hear that the session ended");
  assert.deepEqual(time.pending(), []);
});

test("signed-out and cleared sessions schedule nothing, and malformed hints are ignored", async () => {
  const bus = tabs(), time = clock();
  let reply: Record<string, unknown> = { ...response(null), renewIn: 600 };
  const session = new AccountSession(async () => reply, time.timers, () => 0);
  session.connect(bus.connect);
  await session.refresh();
  assert.deepEqual(time.pending(), []);
  for (const renewIn of [10, 3601, 1.5, "600", null]) {
    reply = { ...response(owner), renewIn };
    assert.equal((await session.refresh()).renewIn, undefined, String(renewIn));
    assert.deepEqual(time.pending(), []);
  }
  reply = { ...response(owner), renewIn: 600 };
  await session.refresh();
  assert.deepEqual(time.pending(), [600000]);
  session.clear();
  assert.deepEqual(time.pending(), [], "signing out cancels the check");
});
