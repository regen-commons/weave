/// <reference lib="dom" />
import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { IndexedDraftRepository } from "../src/describe/indexed-repository.ts";
import { BackupChanged, DraftConflict, MemoryDraftRepository, RemovalNotice, draftPin, type DraftRepository } from "../src/describe/repository.ts";
import { DraftController } from "../src/describe/controller.ts";
import { newDraft, revise, type DeviceDraft } from "../src/describe/contracts.ts";
import {
  attachedFiles, backupDeleteWarning, draftTime, deviceRemovalFailure, discardedMessage, discardWarning, removedBackupMessage,
  backupLine, BACKUPS_SHOWN, listedBackups, restoreWarning,
} from "../src/describe/device-removal.ts";

type Stores = Record<"drafts" | "backups", Map<string, unknown>>;
/**
 * A synthetic IndexedDB: each transaction stages its writes, reads see them, and the whole
 * transaction commits once its requests settle, or aborts and leaves the stores as they were.
 * `failCommit` makes the next commit fail the way a full disk does.
 */
function fakeIndexedDB(seed: Partial<Record<keyof Stores, [string, unknown][]>> = {}) {
  const stores: Stores = { drafts: new Map(seed.drafts ?? []), backups: new Map(seed.backups ?? []) };
  const control = { failCommit: false, commits: 0 };
  const db = {
    objectStoreNames: { contains: () => true },
    transaction(_names: string | string[], _mode?: string) {
      const staged = new Map<string, Map<string, unknown>>();
      const DELETED = Symbol("deleted");
      let pending = 0, finished = false;
      const view = (name: keyof Stores) => {
        const merged = new Map(stores[name]);
        for (const [key, value] of staged.get(name) ?? []) if (value === DELETED) merged.delete(key); else merged.set(key, value);
        return new Map([...merged].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
      };
      const tx = {
        oncomplete: null as (() => void) | null, onerror: null as (() => void) | null, onabort: null as (() => void) | null,
        objectStore(name: keyof Stores) {
          const stage = (key: string, value: unknown) => {
            if (!staged.has(name)) staged.set(name, new Map());
            staged.get(name)!.set(key, value);
          };
          const request = <T,>(read: () => T) => {
            pending++;
            const result = { result: undefined as T | undefined, onsuccess: null as (() => void) | null };
            queueMicrotask(() => {
              if (finished) return;
              result.result = read();
              pending--;
              result.onsuccess?.();
              settle();
            });
            return result;
          };
          return {
            get: (key: string) => request(() => structuredClone(view(name).get(key))),
            put: (value: unknown, key: string) => request(() => { stage(key, structuredClone(value)); return key; }),
            delete: (key: string) => request(() => { stage(key, DELETED); return undefined; }),
            count: () => request(() => view(name).size),
            getAll: () => request(() => [...view(name).values()].map(value => structuredClone(value))),
            getAllKeys: () => request(() => [...view(name).keys()]),
          };
        },
        abort() {
          if (finished) throw new Error("InvalidStateError");
          finished = true; staged.clear();
          queueMicrotask(() => tx.onabort?.());
        },
      };
      const settle = () => queueMicrotask(() => {
        if (pending || finished) return;
        finished = true;
        if (control.failCommit) { control.failCommit = false; tx.onerror?.(); tx.onabort?.(); return; }
        for (const [name, changes] of staged)
          for (const [key, value] of changes)
            if (value === DELETED) stores[name as keyof Stores].delete(key); else stores[name as keyof Stores].set(key, value);
        control.commits++;
        tx.oncomplete?.();
      });
      settle();
      return tx;
    },
  };
  const factory = { open() {
    const request = { result: db, onsuccess: null as (() => void) | null, onupgradeneeded: null as (() => void) | null };
    queueMicrotask(() => request.onsuccess?.());
    return request;
  } };
  return { factory, stores, control, snapshot: () => structuredClone({ drafts: [...stores.drafts], backups: [...stores.backups] }) };
}
function install(t: TestContext, fake: ReturnType<typeof fakeIndexedDB>) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "indexedDB");
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, value: fake.factory });
  t.after(() => { if (previous) Object.defineProperty(globalThis, "indexedDB", previous); else Reflect.deleteProperty(globalThis, "indexedDB"); });
}
function drafts() {
  const file = (name: string) => ({ id: crypto.randomUUID(), name, type: "text/plain", bytes: 4, blob: new Blob(["byte"]) });
  const current = revise(newDraft(), { composer: "Synthetic current words", attachments: [file("current.txt")] });
  const older = (words: string, files = 0) => revise(newDraft(), { composer: words, attachments: Array.from({ length: files }, (_, i) => file(`${i}.txt`)) });
  const backups: [string, DeviceDraft][] = [
    ["2026-11-14T10:00:00.000Z:a0000000-0000-4000-8000-000000000001", older("Synthetic first backup")],
    ["2026-11-15T10:00:00.000Z:a0000000-0000-4000-8000-000000000002", older("Synthetic second backup", 2)],
    ["2026-11-16T10:00:00.000Z:a0000000-0000-4000-8000-000000000003", older("Synthetic third backup")],
  ];
  return { current, backups };
}

test("deleting one backup by its exact key and pin removes only it; the draft and other backups stay identical", async t => {
  const { current, backups } = drafts();
  const fake = fakeIndexedDB({ drafts: [["current", current]], backups });
  install(t, fake);
  const before = fake.snapshot(), repository = new IndexedDraftRepository();
  const [key, draft] = backups[1]!;
  assert.deepEqual(await repository.deleteBackup(key, draftPin(draft)), { removed: [key], kept: 2 });
  const after = fake.snapshot();
  assert.deepEqual(after.drafts, before.drafts);
  assert.deepEqual(after.backups, before.backups.filter(([stored]) => stored !== key));
  assert.equal((await repository.backups()).length, 2);
});

test("a wrong key, ID, revision or time removes nothing and says the backup changed", async t => {
  const { current, backups } = drafts();
  const fake = fakeIndexedDB({ drafts: [["current", current]], backups });
  install(t, fake);
  const before = fake.snapshot(), repository = new IndexedDraftRepository();
  const [key, draft] = backups[0]!;
  const pin = draftPin(draft);
  for (const [target, expected] of [
    ["2026-11-14T10:00:00.000Z:a0000000-0000-4000-8000-000000000009", pin],
    [backups[2]![0], pin],
    [key, { ...pin, id: crypto.randomUUID() }],
    [key, { ...pin, revision: pin.revision + 1 }],
    [key, { ...pin, updatedAt: "2026-11-14T10:00:00.000Z" }],
  ] as const) {
    await assert.rejects(repository.deleteBackup(target, expected), error => error instanceof BackupChanged);
    assert.deepEqual(fake.snapshot(), before);
  }
  assert.equal(deviceRemovalFailure(new BackupChanged()), "This backup changed or is no longer on this device. Nothing was removed.");
});

test("removing the current draft keeps it as a backup in the same commit, and restoring it brings it back", async t => {
  const { current, backups } = drafts();
  const fake = fakeIndexedDB({ drafts: [["current", current]], backups });
  install(t, fake);
  const before = fake.snapshot(), controller = new DraftController(new IndexedDraftRepository());
  await controller.initialize();
  const commits = fake.control.commits;
  const result = await controller.discardCurrent();
  assert.equal(fake.control.commits, commits + 1, "one transaction");
  assert.deepEqual(result.removed, ["current"]);
  assert.equal(result.kept, 4);
  const after = fake.snapshot();
  assert.deepEqual(after.drafts, [], "the current key is removed, never replaced by a blank draft");
  assert.deepEqual(after.backups.filter(([key]) => key !== result.backup), before.backups);
  assert.deepEqual(fake.stores.backups.get(result.backup), before.drafts[0]![1]);
  assert.equal(controller.getSnapshot().storage, "none");
  assert.equal(controller.getSnapshot().draft.composer, "");
  assert.equal(discardedMessage(result), "Removed this draft from this device and kept it as a backup you can restore. 4 backups kept.");
  const kept = (await controller.backups()).find(item => item.key === result.backup)!;
  await controller.replace(kept.draft);
  assert.equal(controller.getSnapshot().draft.composer, "Synthetic current words");
  assert.equal(controller.getSnapshot().draft.attachments.length, 1);
  assert.equal((await new IndexedDraftRepository().load())?.composer, "Synthetic current words");
});

test("a draft another tab changed is not removed, and this tab shows the existing conflict words", async t => {
  const { current, backups } = drafts();
  const fake = fakeIndexedDB({ drafts: [["current", current]], backups });
  install(t, fake);
  const controller = new DraftController(new IndexedDraftRepository());
  await controller.initialize();
  const elsewhere = revise(current, { composer: "Words typed in another tab" });
  fake.stores.drafts.set("current", elsewhere);
  const before = fake.snapshot();
  await assert.rejects(controller.discardCurrent(), error => error instanceof DraftConflict);
  assert.deepEqual(fake.snapshot(), before);
  assert.equal(controller.getSnapshot().storage, "conflict");
  assert.equal(controller.getSnapshot().error, "Another tab changed this draft. Copy your words before reloading.");
  assert.equal(controller.getSnapshot().draft.composer, "Synthetic current words", "this tab's words stay visible");
});

test("a storage failure during removal reports it honestly and leaves every record in place", async t => {
  const { current, backups } = drafts();
  const fake = fakeIndexedDB({ drafts: [["current", current]], backups });
  install(t, fake);
  const before = fake.snapshot(), controller = new DraftController(new IndexedDraftRepository());
  await controller.initialize();
  fake.control.failCommit = true;
  await assert.rejects(controller.discardCurrent(), error => error instanceof RemovalNotice
    && deviceRemovalFailure(error) === "This device could not remove the draft. Nothing was removed.");
  assert.deepEqual(fake.snapshot(), before);
  assert.equal(controller.getSnapshot().draft.composer, "Synthetic current words", "nothing claims the draft is gone");
  fake.control.failCommit = true;
  const [key, draft] = backups[0]!;
  await assert.rejects(controller.deleteBackup({ key, draft }), error => error instanceof RemovalNotice
    && error.message === "This device could not remove the backup. Nothing was removed.");
  assert.deepEqual(fake.snapshot(), before);
  assert.equal(deviceRemovalFailure(new Error("a technical detail")), "This device could not finish the removal. Nothing was removed.");
});

test("unstored or unsettled words are never removed", async () => {
  const repository = new MemoryDraftRepository(null), controller = new DraftController(repository);
  await controller.initialize();
  await assert.rejects(controller.discardCurrent(), error => error instanceof RemovalNotice, "nothing is stored yet");
  const failing: DraftRepository = { load: async () => revise(newDraft(), { composer: "Stored words" }),
    save: async () => { throw new Error("Synthetic storage failure"); }, discardCurrent: async () => { throw new Error("unreachable"); } };
  const stuck = new DraftController(failing);
  await stuck.initialize();
  stuck.change(draft => revise(draft, { composer: "Unstored words" }));
  await stuck.settled();
  await assert.rejects(stuck.discardCurrent(), error => error instanceof RemovalNotice);
  assert.equal(stuck.getSnapshot().draft.composer, "Unstored words");
});

test("the memory repository follows the same exact-match rules", async () => {
  const { current, backups } = drafts();
  const repository = new MemoryDraftRepository(current);
  repository.history = backups.map(([key, draft]) => ({ key, draft }));
  const [key, draft] = backups[2]!;
  await assert.rejects(repository.deleteBackup(key, { ...draftPin(draft), revision: 99 }), BackupChanged);
  assert.equal(repository.history.length, 3);
  assert.deepEqual(await repository.deleteBackup(key, draftPin(draft)), { removed: [key], kept: 2 });
  await assert.rejects(repository.discardCurrent({ ...draftPin(current), updatedAt: "2020-01-01T00:00:00.000Z" }), DraftConflict);
  assert.equal(repository.value, current);
  const result = await repository.discardCurrent(draftPin(current));
  assert.equal(repository.value, null);
  assert.equal(repository.history[0]?.draft, current);
  assert.deepEqual(result.removed, ["current"]);
  assert.equal(result.kept, 3);
});

test("the backups list is newest first, shows a few and offers the rest, and each row says when and what", () => {
  const { backups } = drafts();
  const rows = backups.map(([key, draft], index) => ({
    key, draft: { ...draft, updatedAt: `2026-11-${String(10 + index).padStart(2, "0")}T09:00:00.000Z` },
  }));
  const more = Array.from({ length: 7 }, (_, index) => ({
    key: `extra-${index}`, draft: { ...rows[0]!.draft, updatedAt: `2026-10-${String(10 + index).padStart(2, "0")}T09:00:00.000Z` },
  }));
  const all = [...more, ...rows];
  const shown = listedBackups(all, false);
  assert.equal(shown.length, BACKUPS_SHOWN, "a long history never fills the page");
  assert.equal(shown[0]?.key, rows.at(-1)!.key, "newest first");
  const every = listedBackups(all, true);
  assert.equal(every.length, all.length);
  assert.deepEqual(every.map((row) => row.draft.updatedAt), [...every.map((row) => row.draft.updatedAt)].sort().reverse());
  assert.equal(all[0]?.key, "extra-0", "the list given is not reordered");
  const withFiles = backups[1]![1];
  assert.match(backupLine(withFiles), /^Last changed \d{1,2} [A-Z][a-z]+ \d{4} at \d{2}:\d{2}, 2 attached files$/u);
  assert.doesNotMatch(backupLine(backups[0]![1]), /attached/u);
  assert.match(restoreWarning(withFiles), /^This opens the backup untitled draft, last changed .+, with its 2 attached files\. The draft on this device now is kept as a backup first\.$/u);
});

test("confirmations name the backup, its shown time and its files; result lines count what stayed", () => {
  const { current, backups } = drafts();
  const withFiles = backups[1]![1];
  assert.equal(attachedFiles(withFiles), 2);
  assert.match(backupDeleteWarning(withFiles), /^This deletes the backup untitled draft, last changed \d{1,2} [A-Z][a-z]+ \d{4} at \d{2}:\d{2}, from this browser with its 2 attached files\. It cannot be undone\.$/u);
  assert.ok(backupDeleteWarning(withFiles).includes(draftTime(withFiles)), "the time shown is the draft's own time");
  assert.doesNotMatch(backupDeleteWarning(backups[0]![1]), /attached/u);
  assert.match(discardWarning(current), /with its 1 attached file, so you can restore it below/u);
  assert.equal(removedBackupMessage({ removed: ["k"], kept: 18 }), "Removed 1 backup. 18 backups kept.");
  assert.equal(removedBackupMessage({ removed: ["k"], kept: 1 }), "Removed 1 backup. 1 backup kept.");
  assert.equal(removedBackupMessage({ removed: ["k"], kept: 0 }), "Removed 1 backup. No backups kept.");
});
