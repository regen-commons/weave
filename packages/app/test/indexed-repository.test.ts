/// <reference lib="dom" />
import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import { test } from "node:test";
import { IndexedDraftRepository } from "../src/describe/indexed-repository.ts";
import { newDraft, revise, type DeviceDraft } from "../src/describe/contracts.ts";
import { AccountFailure } from "../src/account/client.ts";

/** A controllable transaction tests the real IndexedDB adapter's abort and commit callbacks. No browser runs here. */
function database(original: DeviceDraft) {
  const opened = Promise.withResolvers<void>();
  let stored = original, backups: DeviceDraft[] = [], staged: DeviceDraft | null = null, stagedBackup: DeviceDraft | null = null;
  let finished = false, aborts = 0;
  const request = { result: original, onsuccess: null as (() => void) | null };
  const tx = {
    oncomplete: null as (() => void) | null,
    onerror: null as (() => void) | null,
    onabort: null as (() => void) | null,
    objectStore(name: string) {
      return { get: () => request, put(value: DeviceDraft) { if (name === "drafts") staged = value; else if (name === "backups") stagedBackup = value; } };
    },
    abort() {
      if (finished) throw new Error("TransactionInactiveError");
      aborts++; finished = true; staged = null; stagedBackup = null;
      queueMicrotask(() => tx.onabort?.());
    },
  };
  const db = { transaction() { opened.resolve(); return tx; } };
  const factory = { open() {
    const request = { result: db, onsuccess: null as (() => void) | null };
    queueMicrotask(() => request.onsuccess?.());
    return request;
  } };
  return { factory, opened: opened.promise, read: () => request.onsuccess?.(), staged: () => staged,
    snapshot: () => ({ stored, backups, aborts }),
    commit() {
      assert.equal(finished, false);
      if (staged) stored = staged;
      if (stagedBackup) backups = [stagedBackup, ...backups];
      finished = true; tx.oncomplete?.();
    },
    fail() { finished = true; tx.onerror?.(); },
  };
}

test("the real IndexedDB adapter cancels both staged draft and backup writes before commit and removes the listener", async t => {
  const original = revise(newDraft(), { composer: "Synthetic current device words" });
  const replacement = revise(original, { composer: "Synthetic loaded cloud words" });
  const db = database(original);
  const previous = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: db.factory });
  t.after(() => { if (previous) Object.defineProperty(globalThis, "indexedDB", previous); else Reflect.deleteProperty(globalThis, "indexedDB"); });
  const cancellation = new AbortController();
  const pending = new IndexedDraftRepository().replace(replacement, cancellation.signal);
  await db.opened;
  db.read();
  assert.equal(db.staged()?.composer, "Synthetic loaded cloud words");
  assert.equal(db.snapshot().stored, original, "queued puts are not committed data");
  cancellation.abort(new AccountFailure("account_changed"));
  await assert.rejects(pending, error => error instanceof AccountFailure && error.code === "account_changed");
  assert.deepEqual(db.snapshot(), { stored: original, backups: [], aborts: 1 });
  assert.equal(getEventListeners(cancellation.signal, "abort").length, 0);
});

test("completed and failed IndexedDB transactions remove their abort listeners, and sign-out never undoes a commit", async t => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
  t.after(() => { if (previous) Object.defineProperty(globalThis, "indexedDB", previous); else Reflect.deleteProperty(globalThis, "indexedDB"); });
  for (const outcome of ["commit", "fail"] as const) {
    const original = revise(newDraft(), { composer: "Synthetic current words" });
    const replacement = revise(original, { composer: "Synthetic loaded words" });
    const db = database(original), cancellation = new AbortController();
    Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: db.factory });
    const pending = new IndexedDraftRepository().replace(replacement, cancellation.signal);
    await db.opened;
    db.read(); db[outcome]();
    if (outcome === "commit") await pending;
    else await assert.rejects(pending, /could not be stored/);
    assert.equal(getEventListeners(cancellation.signal, "abort").length, 0);
    cancellation.abort();
    const snapshot = db.snapshot();
    assert.equal(snapshot.aborts, 0);
    assert.equal(snapshot.stored.composer, outcome === "commit" ? replacement.composer : original.composer);
    assert.equal(snapshot.backups.length, outcome === "commit" ? 1 : 0);
  }
});
