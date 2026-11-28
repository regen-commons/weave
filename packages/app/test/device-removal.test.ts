/// <reference lib="dom" />
import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeIndexedDB, installIndexedDB } from "./fake-indexeddb.ts";
import { IndexedDraftRepository } from "../src/describe/indexed-repository.ts";
import { BackupChanged, DraftChanged, MemoryDraftRepository, RemovalNotice, draftPin, type DraftRepository } from "../src/describe/repository.ts";
import { DraftController } from "../src/describe/controller.ts";
import { newDraft, revise, type DeviceDraft } from "../src/describe/contracts.ts";
import {
  attachedFiles, backupDeleteWarning, draftTime, deviceRemovalFailure, discardedMessage, discardWarning, removedBackupMessage,
  backupLine, BACKUPS_SHOWN, listedBackups, restoreWarning, backUpDraft, backUpWarning, NOT_BACKED_UP,
} from "../src/describe/device-removal.ts";

/** This build's database holding one draft under its own ID, which is also the one written last. */
const seeded = (current: DeviceDraft, backups: [string, DeviceDraft][]) =>
  fakeIndexedDB({ drafts: [[current.id, current]], backups, meta: [["last", current.id]] });
const install = installIndexedDB;
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
  const fake = seeded(current, backups);
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
  const fake = seeded(current, backups);
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
  const fake = seeded(current, backups);
  install(t, fake);
  const before = fake.snapshot(), controller = new DraftController(new IndexedDraftRepository());
  await controller.initialize();
  const commits = fake.control.commits;
  const result = await controller.discardCurrent();
  assert.equal(fake.control.commits, commits + 1, "one transaction");
  assert.deepEqual(result.removed, [current.id]);
  assert.equal(result.kept, 4);
  const after = fake.snapshot();
  assert.deepEqual(after.drafts, [], "the draft's key is removed, never replaced by a blank draft");
  assert.deepEqual(after.meta, [], "nothing names the removed draft as the one to open");
  assert.deepEqual(after.backups.filter(([key]) => key !== result.backup), before.backups);
  assert.deepEqual(fake.stores.backups!.get(result.backup), before.drafts[0]![1]);
  assert.equal(controller.getSnapshot().storage, "none");
  assert.equal(controller.getSnapshot().draft.composer, "");
  assert.equal(discardedMessage(result), "Removed this draft from this device and kept it as a backup you can restore. 4 backups kept.");
  const kept = (await controller.backups()).find(item => item.key === result.backup)!;
  await controller.replace(kept.draft);
  assert.equal(controller.getSnapshot().draft.composer, "Synthetic current words");
  assert.equal(controller.getSnapshot().draft.attachments.length, 1);
  assert.equal((await new IndexedDraftRepository().load())?.composer, "Synthetic current words");
});

test("a draft another tab changed is not removed, and this tab shows that tab's version without a warning", async t => {
  const { current, backups } = drafts();
  const fake = seeded(current, backups);
  install(t, fake);
  const controller = new DraftController(new IndexedDraftRepository());
  await controller.initialize();
  const elsewhere = revise(current, { composer: "Words typed in another tab" });
  fake.stores.drafts!.set(current.id, elsewhere);
  const before = fake.snapshot();
  await assert.rejects(controller.discardCurrent(), error => error instanceof DraftChanged);
  assert.deepEqual(fake.snapshot(), before);
  assert.equal(deviceRemovalFailure(new DraftChanged()), "This draft changed on this device since it was shown. Nothing was removed.");
  assert.equal(controller.getSnapshot().storage, "saved");
  assert.equal(controller.getSnapshot().error, null);
  assert.equal(controller.getSnapshot().draft.composer, "Words typed in another tab", "the tab shows what the device holds");
});

test("a storage failure during removal reports it honestly and leaves every record in place", async t => {
  const { current, backups } = drafts();
  const fake = seeded(current, backups);
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
    save: async () => { throw new Error("Synthetic storage failure"); }, discard: async () => { throw new Error("unreachable"); } };
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
  await assert.rejects(repository.discard({ ...draftPin(current), updatedAt: "2020-01-01T00:00:00.000Z" }), DraftChanged);
  assert.equal(repository.value, current);
  const result = await repository.discard(draftPin(current));
  assert.equal(repository.value, null);
  assert.deepEqual(await repository.list(), []);
  assert.equal(repository.history[0]?.draft, current);
  assert.deepEqual(result.removed, [current.id]);
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
  assert.match(restoreWarning(withFiles), /^This opens the backup untitled draft, last changed .+, with its 2 attached files\. A draft it replaces is kept as a backup first\.$/u);
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

// DL-155, step 4: nothing saves privately now, so a draft's mark of a save an earlier build sent may never be
// answered. Removing the draft is not refused for it, and the private saves themselves are gone (step 7, D49).
test("a draft still marked as waiting for an earlier private save's answer can be removed or moved to the backups", async () => {
  const owner = "b1000000-0000-4000-8000-000000000001";
  const pending = { id: crypto.randomUUID(), owner, revision: 3, contentKey: "{}", requestId: crypto.randomUUID() };
  const marked = revise(newDraft(), { composer: "Edited words", account: { saved: null, pending } });
  const controller = new DraftController(new MemoryDraftRepository(marked));
  await controller.initialize();
  await controller.discardCurrent();
  assert.notEqual(controller.getSnapshot().draft.id, marked.id);
  assert.equal(controller.getSnapshot().draft.account.pending, null, "the draft that followed waits for nothing");
  const other = revise(newDraft(), { composer: "Waiting for a save", account: { saved: null, pending } });
  const stranded = new DraftController(new MemoryDraftRepository(newDraft(), [other]));
  await stranded.initialize();
  assert.equal(await backUpDraft(stranded, other.id), true, "the mark of an unanswered save does not keep a draft here");
  assert.equal(await backUpDraft(stranded, crypto.randomUUID()), false, "a draft another tab removed meanwhile is not moved");
  assert.match(NOT_BACKED_UP, /Nothing was removed\./u);
  assert.equal(backUpWarning(other),
    "This moves untitled draft from Your Initiatives to the device backups in Settings, where you can restore it or delete it for good. It is not saved anywhere else.");
});
