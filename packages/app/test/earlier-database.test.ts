/// <reference lib="dom" />
// Several drafts live in a new database, and the released build's database is never upgraded
// (DL-114). These tests hold the copy to deleting nothing, to picking up what an older tab writes
// afterwards, and to leaving the released build a database it can still open after a rollback.
// The fake has no version-change or blocked events; a real browser proves those.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test, type TestContext } from "node:test";
import { fakeIndexedDB, installIndexedDB } from "./fake-indexeddb.ts";
import { DraftController } from "../src/describe/controller.ts";
import { DeviceDraftSchema, newDraft, revise, type DeviceDraft } from "../src/describe/contracts.ts";
import { changeSaid, saidText } from "../src/describe/fill.ts";
import { readEarlier, removeFromEarlier } from "../src/describe/earlier-database.ts";
import { IndexedDraftRepository, removalReachesEarlierCopy } from "../src/describe/indexed-repository.ts";
import { removedBackupMessage } from "../src/describe/device-removal.ts";
import { BackupChanged, RemovalNotice, betweenBuildsPrefix, draftPin, replacedPrefix } from "../src/describe/repository.ts";
import { memoryPointer } from "../src/describe/tabs.ts";

type Fake = ReturnType<typeof fakeIndexedDB>;
const words = (text: string, from: DeviceDraft = newDraft()) => revise(from, { composer: text }, true);
const file = (name: string) => ({ id: crypto.randomUUID(), name, type: "text/plain", bytes: 4, blob: new Blob(["byte"]) });
/** A draft written by the released build's own functions: sent answers, a changed answer, a typed link, half-typed words. */
const releasedDraft = () => JSON.parse(readFileSync(new URL("./released-draft.json", import.meta.url), "utf8")) as DeviceDraft;
const BACKUP = "2026-11-10T10:00:00.000Z:a0000000-0000-4000-8000-000000000001";
/** The released build's database as it left it: one draft under `current`, and its backups, at version 2. */
function withReleased(t: TestContext, current: unknown, backups: [string, DeviceDraft][] = []): Fake {
  const fake = fakeIndexedDB({}, 0, { seed: { drafts: [["current", current]], backups }, version: 2 });
  installIndexedDB(t, fake);
  return fake;
}
const tab = (options: { removeEarlierCopy?: boolean } = {}) =>
  new DraftController(new IndexedDraftRepository(options), { pointer: memoryPointer() });
/** What an older tab still on the released build does: it writes its draft under `current` in its own database. */
const olderTabWrites = (fake: Fake, draft: DeviceDraft) => void fake.earlier.stores.drafts!.set("current", structuredClone(draft));
/** A later version of a draft as the released build would stamp it, at a chosen time. */
const at = (draft: DeviceDraft, updatedAt: string, text: string): DeviceDraft =>
  ({ ...draft, revision: draft.revision + 1, inputVersion: draft.inputVersion + 1, updatedAt, composer: text });
/** The released build opening its database: always at version 2. Rejects as a browser would if the version had moved on. */
function releasedBuildOpens(fake: Fake): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = fake.earlier.open(2);
    request.onupgradeneeded = () => reject(new Error("the released build met a database it had to upgrade"));
    request.onsuccess = () => { (request.result as { close(): void }).close(); resolve(); };
    request.onerror = () => reject(new Error("VersionError"));
  });
}
const draftsHere = (fake: Fake) => fake.snapshot().drafts as [string, DeviceDraft][];
const backupsHere = (fake: Fake) => fake.snapshot().backups as [string, DeviceDraft][];

test("the released build's draft and backups come across to a new database, and its own database is left exactly as it was", async t => {
  const released = releasedDraft();
  const older = revise(words("Synthetic earlier backup"), { attachments: [file("notes.txt")] });
  const fake = withReleased(t, released, [[BACKUP, older]]);
  const before = fake.earlier.snapshot();
  const controller = tab();
  await controller.initialize();
  // This build's own database, at its first version.
  assert.equal(fake.control.version, 1);
  assert.deepEqual(draftsHere(fake).map(([key]) => key), [released.id], "the draft under its own ID");
  assert.deepEqual(fake.snapshot().meta.find(([key]) => key === "last"), ["last", released.id]);
  assert.deepEqual(backupsHere(fake).map(([key]) => key), [BACKUP], "the backup under the key it had");
  assert.equal(await backupsHere(fake)[0]![1].attachments[0]!.blob.text(), "byte", "with its file");
  // The released build's database: not upgraded, not changed, and not held open.
  assert.equal(fake.earlier.control.version, 2);
  assert.deepEqual(fake.earlier.snapshot(), before);
  assert.equal(fake.earlier.control.connections, 0, "read and closed at once");
  // The draft opens with everything the released build held.
  const shown = controller.getSnapshot();
  assert.deepEqual([shown.storage, shown.error, shown.draft.id], ["saved", null, released.id]);
  for (const part of ["families restoring an orchard", "river towns", "We also keep bees and teach", "https://example.org/orchard"])
    assert.ok(saidText(shown.draft).includes(part), part);
  // A second start brings nothing across twice.
  const copied = fake.snapshot();
  const again = tab();
  await again.initialize();
  assert.deepEqual(fake.snapshot(), copied);
  assert.equal(again.getSnapshot().draft.id, released.id);
  // An edit is written here only.
  controller.change((draft) => changeSaid(draft, `${saidText(draft)} more`));
  await controller.settled();
  assert.ok(draftsHere(fake)[0]![1].composer.endsWith(" more"));
  assert.deepEqual(fake.earlier.snapshot(), before, "the released build's database never sees this build's edits");
  assert.deepEqual(backupsHere(fake).map(([key]) => key), [BACKUP], "and the first edit of a copied draft makes no backup");
});

test("a first-time visitor ends with this build's empty database and no earlier database at all", async t => {
  const fake = fakeIndexedDB({}, 0);
  installIndexedDB(t, fake);
  const controller = tab();
  await controller.initialize();
  assert.equal(fake.earlier.exists(), false, "looking for the released build's database did not create it");
  assert.equal(fake.earlier.control.connections, 0);
  assert.equal(fake.control.version, 1);
  assert.deepEqual(fake.snapshot(), { drafts: [], backups: [], meta: [] });
  assert.deepEqual([controller.getSnapshot().storage, controller.getSnapshot().error], ["none", null]);
  // And every later look leaves it that way.
  await controller.lookAgain();
  controller.change((draft) => words("A first initiative", draft));
  await controller.settled();
  assert.equal(fake.earlier.exists(), false);
  assert.equal(draftsHere(fake).length, 1);
});

test("a copy that cannot be written changes neither database, and the next look completes it", async t => {
  const released = releasedDraft();
  const fake = fakeIndexedDB({}, 1, { seed: { drafts: [["current", released]], backups: [[BACKUP, words("Synthetic earlier backup")]] }, version: 2 });
  installIndexedDB(t, fake);
  const before = fake.earlier.snapshot();
  fake.control.failCommit = true;
  const controller = tab();
  await controller.initialize();
  assert.deepEqual(fake.snapshot(), { drafts: [], backups: [], meta: [] }, "all of it or none");
  assert.deepEqual(fake.earlier.snapshot(), before);
  assert.equal(controller.getSnapshot().error, null, "this build's own storage works, so nothing is reported as lost");
  await controller.lookAgain();
  assert.deepEqual(draftsHere(fake).map(([key]) => key), [released.id]);
  assert.deepEqual(controller.getSnapshot().drafts.map((draft) => draft.id), [released.id], "the list shows it");
  assert.deepEqual(backupsHere(fake).map(([key]) => key), [BACKUP]);
  assert.deepEqual(fake.earlier.snapshot(), before);
});

test("a draft the released build left in a shape this build cannot read stays exactly where it is", async t => {
  const unreadable = { id: "not-a-draft", composer: "Synthetic words in a shape this build cannot read" };
  const fake = withReleased(t, unreadable);
  const before = fake.earlier.snapshot();
  const controller = tab();
  await controller.initialize();
  assert.deepEqual(fake.earlier.snapshot(), before, "never moved, changed or deleted");
  assert.deepEqual(fake.snapshot().drafts, []);
  assert.equal(controller.getSnapshot().storage, "none");
  controller.change((draft) => words("A new initiative", draft));
  await controller.settled();
  assert.equal(draftsHere(fake).length, 1);
  assert.deepEqual(fake.earlier.snapshot(), before);
});

test("an older tab that keeps writing after the copy: its words become the draft here, with no backup, while this build has not changed it", async t => {
  const start = words("Synthetic words before the update");
  const fake = withReleased(t, start);
  const controller = tab();
  await controller.initialize();
  assert.equal(controller.getSnapshot().draft.composer, "Synthetic words before the update");
  // The older tab types on. It cannot tell this build, so this build looks.
  const typed = at(start, "2099-01-01T00:00:00.000Z", "Synthetic words typed in the older tab after the copy");
  olderTabWrites(fake, typed);
  await controller.lookAgain();
  assert.equal(controller.getSnapshot().draft.composer, "Synthetic words typed in the older tab after the copy", "shown in the open tab");
  assert.equal(draftsHere(fake)[0]![1].composer, "Synthetic words typed in the older tab after the copy");
  assert.deepEqual(backupsHere(fake), [], "nothing of this build's was replaced, so nothing is backed up");
  // Looking again with nothing new written is a no-op.
  const settled = fake.snapshot();
  await controller.lookAgain();
  assert.deepEqual(fake.snapshot(), settled);
  // And it keeps following the older tab, quietly, for as long as only that tab writes.
  olderTabWrites(fake, at(typed, "2099-01-01T00:00:05.000Z", "Synthetic words, a second time"));
  await controller.lookAgain();
  assert.equal(controller.getSnapshot().draft.composer, "Synthetic words, a second time");
  assert.deepEqual(backupsHere(fake), []);
});

test("changed in both builds: the later edit wins by its time, and the other version is always kept as a device backup", async t => {
  for (const olderTabIsLater of [true, false]) {
    const start = words("Synthetic words before the update");
    const fake = withReleased(t, start);
    const controller = tab();
    await controller.initialize();
    controller.change((draft) => words("Synthetic words typed in this build", draft));
    await controller.settled();
    const mine = controller.getSnapshot().draft;
    // The released build stamps `updatedAt` on every change with the same clock this build uses.
    const theirs = at(start, olderTabIsLater ? "2099-01-01T00:00:00.000Z" : "2000-01-01T00:00:00.000Z", "Synthetic words typed in the older tab");
    olderTabWrites(fake, theirs);
    await controller.lookAgain();
    const [winner, loser] = olderTabIsLater ? [theirs, mine] : [mine, theirs];
    assert.equal(draftsHere(fake)[0]![1].composer, winner.composer, `older tab later: ${olderTabIsLater}`);
    assert.equal(controller.getSnapshot().draft.composer, winner.composer, "the open tab shows the winner");
    const kept = backupsHere(fake);
    assert.equal(kept.length, 1);
    assert.ok(kept[0]![0].startsWith(betweenBuildsPrefix(start.id)), "kept under its own kind of key, which no cap drops, for Settings to restore");
    assert.equal(kept[0]![1].composer, loser.composer, "the other version, words and all");
    // The same older version is not taken, or backed up, a second time.
    await controller.lookAgain();
    assert.equal(backupsHere(fake).length, 1);
  }
});

test("times that cannot settle it leave this build's version as the draft and still keep the older tab's as a backup", async t => {
  const start = words("Synthetic words before the update");
  const fake = withReleased(t, start);
  const controller = tab();
  await controller.initialize();
  controller.change((draft) => words("Synthetic words typed in this build", draft));
  await controller.settled();
  const mine = controller.getSnapshot().draft;
  // The same instant on both, as when a clock was set back between the two edits.
  olderTabWrites(fake, at(start, mine.updatedAt, "Synthetic words typed in the older tab"));
  await controller.lookAgain();
  assert.equal(draftsHere(fake)[0]![1].composer, "Synthetic words typed in this build");
  assert.deepEqual(backupsHere(fake).map(([, draft]) => draft.composer), ["Synthetic words typed in the older tab"]);
});

test("an edit waiting in this tab when the older tab's version arrives wins, and that version is kept as a backup", async t => {
  const start = words("Synthetic words before the update");
  const fake = withReleased(t, start);
  const controller = tab(), other = tab();
  await controller.initialize();
  await other.initialize();
  olderTabWrites(fake, at(start, "2099-01-01T00:00:00.000Z", "Synthetic words typed in the older tab"));
  // Another tab of this build looks first, so the older tab's version is the stored one.
  await other.lookAgain();
  controller.change((draft) => words("Synthetic words typed here meanwhile", draft));
  await controller.settled();
  assert.equal(draftsHere(fake)[0]![1].composer, "Synthetic words typed here meanwhile");
  assert.deepEqual(backupsHere(fake).map(([, draft]) => draft.composer), ["Synthetic words typed in the older tab"]);
});

test("a draft removed here stays removed while the older tab is idle, and comes back when that tab writes again", async t => {
  const start = words("Synthetic words before the update");
  const fake = withReleased(t, start);
  const controller = tab();
  await controller.initialize();
  await controller.discardCurrent();
  assert.deepEqual(draftsHere(fake), []);
  await controller.lookAgain();
  assert.deepEqual(draftsHere(fake), [], "the copy does not undo a removal");
  // The older tab still shows the draft and the person types in it: those words must not vanish.
  olderTabWrites(fake, at(start, "2099-01-01T00:00:00.000Z", "Synthetic words typed in the older tab after the removal"));
  await controller.lookAgain();
  assert.deepEqual(draftsHere(fake).map(([, draft]) => draft.composer), ["Synthetic words typed in the older tab after the removal"]);
  assert.deepEqual(controller.getSnapshot().drafts.map((draft) => draft.id), [start.id], "it is in the list again");
});

test("a rollback finds the released build's database as that build last wrote it, and returning finds this build's as it was", async t => {
  const released = releasedDraft();
  const fake = withReleased(t, released, [[BACKUP, words("Synthetic earlier backup")]]);
  const before = fake.earlier.snapshot();
  const controller = tab();
  await controller.initialize();
  controller.change((draft) => changeSaid(draft, `${saidText(draft)} Edited in this build.`));
  await controller.settled();
  const second = await controller.startNew();
  controller.change((draft) => words("A second initiative, started in this build", draft));
  await controller.settled();
  // Rollback: the released build opens its database at version 2, with no upgrade and no error.
  await releasedBuildOpens(fake);
  assert.deepEqual(fake.earlier.snapshot(), before, "its draft and backups exactly as it last wrote them");
  assert.equal(fake.earlier.control.version, 2);
  // What a rollback does not show: everything written only here.
  const theirs = JSON.stringify(fake.earlier.snapshot());
  assert.equal(theirs.includes("Edited in this build."), false);
  assert.equal(theirs.includes("A second initiative"), false);
  // Rolling forward again: this build's database is as it was left.
  const forward = tab();
  await forward.initialize();
  assert.deepEqual(forward.getSnapshot().drafts.map((draft) => draft.id).sort(), [released.id, second.id].sort());
  assert.ok(draftsHere(fake).find(([key]) => key === released.id)![1].composer.endsWith("Edited in this build."));
});

test("a backup deleted here is not brought back, and the removal reaches the released build's copy", async t => {
  const start = words("Synthetic words before the update");
  const older = words("Synthetic earlier backup");
  const fake = withReleased(t, start, [[BACKUP, older]]);
  const controller = tab();
  await controller.initialize();
  assert.equal(removalReachesEarlierCopy(), true, "the user's decision of 19 November 2026");
  const [backup] = await controller.backups();
  await controller.deleteBackup(backup!);
  assert.deepEqual(backupsHere(fake), []);
  assert.deepEqual(fake.earlier.snapshot().backups, [], "gone from the released build's database too");
  assert.deepEqual(fake.earlier.snapshot().drafts.map(([key]) => key), ["current"], "its draft, which is still an initiative here, is untouched");
  assert.equal(fake.earlier.control.connections, 0);
  await controller.lookAgain();
  assert.deepEqual(backupsHere(fake), [], "and it is not copied back");
  await releasedBuildOpens(fake);
});

test("removing a copied draft for good removes it from the released build's database once nothing of it is kept here", async t => {
  const start = words("Synthetic words before the update");
  const fake = withReleased(t, start);
  const controller = tab();
  await controller.initialize();
  // Removing the draft keeps it as a backup, so nothing is removed for good yet.
  await controller.discardCurrent();
  assert.deepEqual(fake.earlier.snapshot().drafts.map(([key]) => key), ["current"], "a removal that can be undone leaves the released copy");
  const [kept] = await controller.backups();
  await controller.deleteBackup(kept!);
  assert.deepEqual(fake.snapshot().backups, []);
  assert.deepEqual(fake.earlier.snapshot().drafts, [], "the last copy on the device is gone, as the person asked");
  await controller.lookAgain();
  assert.deepEqual(fake.snapshot().drafts, [], "and a rollback or a later look does not bring it back");
  await releasedBuildOpens(fake);
});

test("deleting one backup of an initiative that is still here leaves the released build's draft alone", async t => {
  const start = words("Synthetic words before the update");
  const fake = withReleased(t, start);
  const controller = tab();
  await controller.initialize();
  // Loading a version over the draft keeps the replaced one as a backup of the same initiative.
  await controller.replace(revise(start, { composer: "Synthetic restored version" }, true));
  const [kept] = await controller.backups();
  assert.equal(kept!.draft.id, start.id);
  await controller.deleteBackup(kept!);
  assert.deepEqual(fake.earlier.snapshot().drafts.map(([key]) => key), ["current"]);
  assert.equal(draftsHere(fake).length, 1);
});

test("with the other answer, no removal here ever changes the released build's database", async t => {
  const start = words("Synthetic words before the update");
  const fake = withReleased(t, start, [[BACKUP, words("Synthetic earlier backup")]]);
  const before = fake.earlier.snapshot();
  const controller = tab({ removeEarlierCopy: false });
  await controller.initialize();
  for (const backup of await controller.backups()) await controller.deleteBackup(backup);
  await controller.discardCurrent();
  for (const backup of await controller.backups()) await controller.deleteBackup(backup);
  assert.deepEqual([fake.snapshot().drafts, fake.snapshot().backups], [[], []], "everything is removed here");
  assert.deepEqual(fake.earlier.snapshot(), before, "and nothing there");
  // The backup still is not copied back, because its key was seen.
  await controller.lookAgain();
  assert.deepEqual([fake.snapshot().drafts, fake.snapshot().backups], [[], []]);
});

test("a removal that cannot reach the released build's copy removes nothing and can be tried again", async t => {
  const start = words("Synthetic words before the update");
  const fake = withReleased(t, start, [[BACKUP, words("Synthetic earlier backup")]]);
  // The removal itself fails, after the look has read the older storage.
  let failNext = false;
  const repository = new IndexedDraftRepository({ earlier: { read: readEarlier, remove: (removal, signal) => {
    if (failNext) { failNext = false; fake.earlier.control.failCommit = true; }
    return removeFromEarlier(removal, signal);
  } } });
  await repository.bringAcross();
  const before = { here: fake.snapshot(), there: fake.earlier.snapshot() };
  const [backup] = await repository.backups();
  failNext = true;
  await assert.rejects(
    repository.deleteBackup(backup!.key, draftPin(backup!.draft)),
    (error) => error instanceof RemovalNotice && /could not be removed\. Nothing was removed/u.test(error.message),
  );
  assert.deepEqual({ here: fake.snapshot(), there: fake.earlier.snapshot() }, before);
  // The pin is still checked before anything is touched in either database.
  await assert.rejects(repository.deleteBackup(backup!.key, { ...draftPin(backup!.draft), revision: 99 }), BackupChanged);
  assert.deepEqual({ here: fake.snapshot(), there: fake.earlier.snapshot() }, before);
  await repository.deleteBackup(backup!.key, draftPin(backup!.draft));
  assert.deepEqual([fake.snapshot().backups, fake.earlier.snapshot().backups], [[], []]);
});

test("a machine that ran this branch before its release: every draft in the version 3 database comes across, and the last one opens", async t => {
  const a = words("Synthetic draft A"), b = words("Synthetic draft B");
  const fake = fakeIndexedDB({}, 0, { seed: { drafts: [[a.id, a], [b.id, b]], backups: [], meta: [["last", b.id]] }, version: 3 });
  installIndexedDB(t, fake);
  const before = fake.earlier.snapshot();
  const controller = tab();
  await controller.initialize();
  assert.deepEqual(draftsHere(fake).map(([key]) => key).sort(), [a.id, b.id].sort());
  assert.equal(controller.getSnapshot().draft.id, b.id);
  assert.deepEqual(fake.earlier.snapshot(), before);
  assert.equal(fake.earlier.control.version, 3, "it is read as it is, at whatever version it has");
});

test("the released build's first database, with no backups store, comes across too", async t => {
  const start = words("Synthetic words from the first version");
  const fake = fakeIndexedDB({}, 0, { seed: { drafts: [["current", start]] }, version: 1 });
  installIndexedDB(t, fake);
  const controller = tab();
  await controller.initialize();
  assert.equal(controller.getSnapshot().draft.composer, "Synthetic words from the first version");
  assert.equal(fake.earlier.control.version, 1);
  assert.equal(DeviceDraftSchema.safeParse(draftsHere(fake)[0]![1]).success, true);
});

test("deleting a backup looks again first: words an older tab typed since the copy come across, and its newer draft is not deleted", async t => {
  // The reviewer's state: copied at one revision and removed here; an older tab in another
  // window types two more revisions; no look has run since.
  const start = words("Synthetic words before the update");
  const fake = withReleased(t, start);
  const controller = tab();
  await controller.initialize();
  await controller.discardCurrent();
  const typed = at(at(start, "2099-01-01T00:00:00.000Z", "one more"), "2099-01-01T00:00:05.000Z", "Synthetic words the older tab typed that this build never copied");
  olderTabWrites(fake, typed);
  const [kept] = await controller.backups();
  const result = await controller.deleteBackup(kept!);
  // The backup the person asked to delete is gone.
  assert.deepEqual(backupsHere(fake), []);
  // The older tab's draft is exactly as it wrote it, so that tab goes on storing.
  assert.deepEqual(fake.earlier.snapshot().drafts, [["current", typed]]);
  // And its words are here, in the list, with the page saying so.
  assert.deepEqual(draftsHere(fake).map(([, draft]) => draft.composer), ["Synthetic words the older tab typed that this build never copied"]);
  assert.deepEqual(result.older, { drafts: [start.id], backups: 0, waiting: false });
  assert.deepEqual(controller.getSnapshot().drafts.map((draft) => draft.id), [start.id]);
  assert.match(removedBackupMessage(result), /older tab/u);
  assert.doesNotMatch(removedBackupMessage({ removed: [kept!.key], kept: 0 }), /older tab/u);
});

test("the released build's draft is removed only at the version this build has seen", async t => {
  const start = words("Synthetic words before the update");
  const fake = withReleased(t, at(start, "2099-01-01T00:00:00.000Z", "Synthetic newer words"));
  const seen = { revision: start.revision, updatedAt: start.updatedAt };
  // A version this build never saw is left alone, and the caller is told.
  assert.deepEqual(await removeFromEarlier({ backupKey: BACKUP, draft: { id: start.id, seen } }), { newer: true });
  assert.equal(fake.earlier.snapshot().drafts.length, 1);
  // One it never saw at all is not its to delete either.
  assert.deepEqual(await removeFromEarlier({ backupKey: BACKUP, draft: { id: start.id, seen: undefined } }), { newer: true });
  assert.equal(fake.earlier.snapshot().drafts.length, 1);
  const now = (await readEarlier())!.drafts[0]!;
  assert.deepEqual(await removeFromEarlier({ backupKey: BACKUP, draft: { id: start.id, seen: { revision: now.revision, updatedAt: now.updatedAt } } }), { newer: false });
  assert.deepEqual(fake.earlier.snapshot().drafts, []);
});

test("the released build's draft stays while anything of the initiative may still be kept here: an unreadable backup, or the card under another ID", async t => {
  const owner = "b1000000-0000-4000-8000-000000000001", card = "b3000000-0000-4000-8000-000000000009";
  for (const kept of ["unreadable backup", "card under another ID"] as const) {
    const start = revise(words("Synthetic words before the update"), { account: { saved: { id: card, owner, revision: 1, contentKey: "{}" }, pending: null } });
    const fake = withReleased(t, start);
    const repository = new IndexedDraftRepository();
    await repository.bringAcross();
    const { backup } = await repository.discard(draftPin((await repository.load(start.id))!));
    if (kept === "unreadable backup") fake.stores.backups!.set("2026-11-01T00:00:00.000Z:unreadable", { not: "a draft" });
    else await repository.save(revise({ ...words("The account's version of the same card"), id: card }, { account: start.account }), null);
    await repository.deleteBackup(backup, draftPin(start));
    assert.deepEqual(fake.earlier.snapshot().drafts.map(([key]) => key), ["current"], kept);
    assert.equal(fake.snapshot().backups.some(([key]) => key === backup), false, "the backup itself is deleted");
  }
});

test("a look that cannot read the released build's database stops the deletion, with nothing removed", async t => {
  const start = words("Synthetic words before the update");
  const fake = withReleased(t, start, [[BACKUP, words("Synthetic earlier backup")]]);
  let failing = false;
  const repository = new IndexedDraftRepository({ earlier: { read: async () => { if (failing) throw new Error("blocked"); return readEarlier(); }, remove: removeFromEarlier } });
  await repository.bringAcross();
  const before = { here: fake.snapshot(), there: fake.earlier.snapshot() };
  failing = true;
  const [backup] = await repository.backups();
  await assert.rejects(repository.deleteBackup(backup!.key, draftPin(backup!.draft)), (error) => error instanceof RemovalNotice && /this backup was not removed/u.test(error.message));
  assert.deepEqual({ here: fake.snapshot(), there: fake.earlier.snapshot() }, before);
});

test("round after round between an older tab and this build, every version the other build replaced is still a backup", async t => {
  const start = words("Synthetic words before the update");
  const fake = withReleased(t, start);
  const controller = tab();
  await controller.initialize();
  let theirs = start;
  const mine: string[] = [];
  // The older tab never takes this build's edits, so each round this build's version loses to
  // the older tab's later one. Those words exist nowhere else.
  for (let round = 1; round <= 6; round++) {
    mine.push(`Synthetic words typed in this build, round ${round}`);
    controller.change((draft) => words(mine.at(-1)!, draft));
    await controller.settled();
    theirs = at(theirs, `2099-01-01T00:00:0${round}.000Z`, `Synthetic words typed in the older tab, round ${round}`);
    olderTabWrites(fake, theirs);
    await controller.lookAgain();
  }
  const kept = backupsHere(fake).map(([, draft]) => draft.composer);
  assert.deepEqual(kept.sort(), [...mine].sort(), "all six, none dropped by a cap");
  assert.equal(draftsHere(fake)[0]![1].composer, "Synthetic words typed in the older tab, round 6");
  // Two tabs of this build typing in turn still keep only the last three replaced versions.
  const other = tab();
  await other.initialize();
  for (let turn = 1; turn <= 5; turn++) {
    for (const [name, typist] of [["first", controller], ["second", other]] as const) {
      typist.change((draft) => words(`Synthetic turn ${turn} in the ${name} tab`, draft));
      await typist.settled();
    }
  }
  const after = backupsHere(fake);
  assert.equal(after.filter(([key]) => key.startsWith(replacedPrefix(start.id))).length, 3, "the cap still holds for this build's own tabs");
  for (const text of mine) assert.ok(after.some(([, draft]) => draft.composer === text), `still kept: ${text}`);
});

test("a tab holding an older read of the released database never writes it over a newer version another tab brought across", async t => {
  const start = words("Synthetic words before the update");
  const fake = withReleased(t, start);
  const fresh = new IndexedDraftRepository();
  await fresh.bringAcross();
  const eleven = at(start, "2099-01-01T00:00:00.000Z", "Synthetic revision eleven"), twelve = at(eleven, "2099-01-01T00:00:05.000Z", "Synthetic revision twelve");
  // This tab read the released database when it held revision eleven, and was slow to write.
  const stale = new IndexedDraftRepository({ earlier: { read: async () => ({ drafts: [eleven], last: eleven.id, backups: [] }), remove: removeFromEarlier } });
  olderTabWrites(fake, twelve);
  assert.deepEqual(await fresh.bringAcross(), [start.id]);
  assert.deepEqual(await stale.bringAcross(), [], "the older read changes nothing");
  assert.equal(draftsHere(fake)[0]![1].composer, "Synthetic revision twelve");
  assert.deepEqual(backupsHere(fake), []);
  // And the newer version is not then taken for a change to copy again.
  assert.deepEqual(await fresh.bringAcross(), []);
});

test("a released database that does not answer never holds up this build's own storage, and its draft is shown when it does", async t => {
  for (const typedMeanwhile of [false, true]) {
    const start = words("Synthetic words before the update");
    const fake = withReleased(t, start);
    const answer = Promise.withResolvers<void>();
    const repository = new IndexedDraftRepository({ earlier: { read: async () => { await answer.promise; return readEarlier(); }, remove: removeFromEarlier } });
    const controller = new DraftController(repository, { pointer: memoryPointer(), earlierWait: 5 });
    await controller.initialize();
    // The first read is over: this build stores, and says nothing is wrong, with the older database still silent.
    assert.deepEqual([controller.getSnapshot().ready, controller.getSnapshot().storage, controller.getSnapshot().error], [true, "none", null]);
    if (typedMeanwhile) {
      controller.change((draft) => words("Synthetic words typed while the older database was silent", draft));
      await controller.settled();
      assert.equal(controller.getSnapshot().storage, "saved", "typed words are stored, not left in memory");
    }
    answer.resolve();
    await new Promise((resolve) => setTimeout(resolve, 20));
    const shown = controller.getSnapshot();
    assert.ok(shown.drafts.some((draft) => draft.id === start.id), "the older draft is in the list once its database answers");
    if (typedMeanwhile) {
      assert.equal(shown.draft.composer, "Synthetic words typed while the older database was silent", "the tab stays on what the person typed");
      assert.equal(draftsHere(fake).length, 2);
    } else assert.equal(shown.draft.id, start.id, "an untouched tab opens it, as it would have at the start");
  }
});

test("a released database that never answers leaves this build working", async t => {
  const fake = fakeIndexedDB({}, 0);
  installIndexedDB(t, fake);
  const repository = new IndexedDraftRepository({ earlier: { read: () => new Promise(() => {}), remove: removeFromEarlier } });
  const controller = new DraftController(repository, { pointer: memoryPointer(), earlierWait: 5 });
  await controller.initialize();
  controller.change((draft) => words("Synthetic words", draft));
  await controller.settled();
  assert.deepEqual([controller.getSnapshot().storage, controller.getSnapshot().error], ["saved", null]);
});

const silent = <T,>() => new Promise<T>(() => {});

test("every wait on the released database is bounded: a look gives up, and a deletion says what it did not do and lets go", async t => {
  const start = words("Synthetic words before the update");
  const fake = withReleased(t, start, [[BACKUP, words("Synthetic earlier backup")]]);
  await new IndexedDraftRepository().bringAcross();
  const before = { here: fake.snapshot(), there: fake.earlier.snapshot() };
  const [backup] = await new IndexedDraftRepository().backups();
  // The released database stops answering a read.
  const deafToReads = new IndexedDraftRepository({ earlierWait: 10, earlier: { read: () => silent(), remove: removeFromEarlier } });
  await assert.rejects(deafToReads.bringAcross(), /did not answer/u, "a look gives up instead of hanging");
  await assert.rejects(
    deafToReads.deleteBackup(backup!.key, draftPin(backup!.draft)),
    (error) => error instanceof RemovalNotice && /could not check/u.test(error.message) && /this backup was not removed/u.test(error.message),
  );
  assert.deepEqual({ here: fake.snapshot(), there: fake.earlier.snapshot() }, before);
  // The controller's look carries on without it, and says nothing.
  const controller = new DraftController(deafToReads, { pointer: memoryPointer(), earlierWait: 5 });
  await controller.initialize();
  await controller.lookAgain();
  assert.equal(controller.getSnapshot().error, null);
  // It stops answering the removal itself. Whether it removed its copy is not known, so the
  // message does not say that nothing was removed. This build's backup is still here to try again.
  const deafToRemoval = new IndexedDraftRepository({ earlierWait: 10, earlier: { read: readEarlier, remove: () => silent() } });
  await assert.rejects(
    deafToRemoval.deleteBackup(backup!.key, draftPin(backup!.draft)),
    (error) => error instanceof RemovalNotice && /is still here/u.test(error.message) && /may or may not have been removed/u.test(error.message) && !/Nothing was removed/u.test(error.message),
  );
  assert.deepEqual(fake.snapshot().backups.map(([key]) => key), [BACKUP]);
});

test("a deletion that finds an older tab's words says where they went: in the list, or kept as a backup", async t => {
  const start = words("Synthetic words before the update");
  const fake = withReleased(t, start, [[BACKUP, words("Synthetic earlier backup")]]);
  const controller = tab();
  await controller.initialize();
  // This build's edit is the later one. The older tab's unseen edit loses, and is kept as a backup.
  controller.change((draft) => words("Synthetic words typed in this build", draft));
  await controller.settled();
  olderTabWrites(fake, at(start, "2000-01-01T00:00:00.000Z", "Synthetic words the older tab typed that this build never saw"));
  const backup = (await controller.backups()).find((item) => item.key === BACKUP)!;
  const result = await controller.deleteBackup(backup);
  assert.deepEqual(result.older, { drafts: [], backups: 1, waiting: false });
  assert.deepEqual(backupsHere(fake).map(([, draft]) => draft.composer), ["Synthetic words the older tab typed that this build never saw"]);
  assert.match(removedBackupMessage(result), /An older tab on this device held words this build had not seen\. They are kept as a device backup\./u);
  assert.doesNotMatch(removedBackupMessage(result), /Your Initiatives/u, "nothing came back to the list, so it does not say so");
  // Nothing found: nothing said.
  assert.equal(removedBackupMessage({ removed: [BACKUP], kept: 1 }), "Removed 1 backup. 1 backup kept.");
});

test("words an older tab types between the look and the removal are left there and brought across, or said to be waiting", async t => {
  for (const secondLook of ["works", "fails"] as const) {
    const start = words("Synthetic words before the update");
    const fake = withReleased(t, start);
    let reads = 0;
    const typed = at(start, "2099-01-01T00:00:00.000Z", "Synthetic words typed between the look and the removal");
    const repository = new IndexedDraftRepository({ earlier: {
      read: async () => { if (++reads > 2 && secondLook === "fails") throw new Error("blocked"); return readEarlier(); },
      // The older tab types after this build has looked, and before it removes.
      remove: async (removal) => { olderTabWrites(fake, typed); return removeFromEarlier(removal); },
    } });
    await repository.bringAcross();
    const { backup } = await repository.discard(draftPin((await repository.load(start.id))!));
    const result = await repository.deleteBackup(backup, draftPin(start));
    assert.deepEqual(fake.earlier.snapshot().drafts, [["current", typed]], "the older tab's draft is exactly as it wrote it");
    assert.equal(fake.snapshot().backups.some(([key]) => key === backup), false, "the backup the person asked to delete is gone either way");
    if (secondLook === "works") {
      assert.deepEqual(result.older, { drafts: [start.id], backups: 0, waiting: false });
      assert.equal(draftsHere(fake)[0]![1].composer, "Synthetic words typed between the look and the removal");
      assert.match(removedBackupMessage(result), /they are in Your Initiatives now/u);
    } else {
      // The words are not here yet, and not lost: they are where the older tab stored them.
      assert.deepEqual(result.older, { drafts: [], backups: 0, waiting: true });
      assert.deepEqual(draftsHere(fake), []);
      assert.match(removedBackupMessage(result), /could not be read just now/u);
      assert.doesNotMatch(removedBackupMessage(result), /are in Your Initiatives now/u);
    }
  }
});

test("a save's receipt counts as a difference: whichever version is later stays, and the other is kept as a backup", async t => {
  // 19 November review: a version that differs only in its card binding must never be dropped.
  const owner = "b1000000-0000-4000-8000-000000000001";
  const start = words("Synthetic words before the update");
  const fake = withReleased(t, start);
  const controller = tab();
  await controller.initialize();
  // A save's receipt changes the draft here without a word typed.
  await controller.amend(start.id, (draft) => revise(draft, { account: { saved: { id: start.id, owner, revision: 1, contentKey: "{}" }, pending: null } }));
  // The older tab writes the same words later, with no receipt: it never saw the save.
  olderTabWrites(fake, { ...at(start, "2099-01-01T00:00:00.000Z", start.composer), inputVersion: start.inputVersion });
  await controller.lookAgain();
  const kept = backupsHere(fake);
  assert.equal(kept.length, 1, "the version with the receipt is not dropped");
  assert.equal(kept[0]![1].account.saved?.owner, owner);
  await controller.lookAgain();
  assert.equal(backupsHere(fake).length, 1, "and it is kept once");
});

test("words typed while the first read is still waiting keep the tab on them when the older database answers", async t => {
  const start = words("Synthetic words before the update");
  const fake = withReleased(t, start);
  const answer = Promise.withResolvers<void>();
  const repository = new IndexedDraftRepository({ earlier: { read: async () => { await answer.promise; return readEarlier(); }, remove: removeFromEarlier } });
  const controller = new DraftController(repository, { pointer: memoryPointer(), earlierWait: 5 });
  const loading = controller.initialize();
  // Typed before the first read has finished waiting.
  controller.change((draft) => words("Synthetic words typed during the wait", draft));
  await loading;
  await controller.settled();
  // Another tab of this build then writes a draft of its own, so it is the one written last.
  const elsewhere = words("Synthetic words from another tab of this build");
  await new IndexedDraftRepository().save(elsewhere, null);
  answer.resolve();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(controller.getSnapshot().draft.composer, "Synthetic words typed during the wait", "the late answer does not move the tab to another draft");
  assert.equal(draftsHere(fake).length, 3);
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** The released draft as that build stores it: no `mark`, keys in its own order. */
const releasedShape = () => releasedDraft() as unknown as Record<string, unknown> & DeviceDraft;

test("a version the released build wrote with the same words makes no backup, in the exact shape that build stores", async t => {
  const released = releasedShape();
  assert.equal("mark" in released, false);
  const fake = withReleased(t, released);
  const controller = tab();
  await controller.initialize();
  // This build stores the same words again under new bookkeeping, as loading the same card does.
  controller.change((draft) => revise(draft, {}, true));
  await controller.settled();
  // The older tab does the same: the same words, a later revision and time, and still no mark.
  olderTabWrites(fake, { ...released, revision: released.revision + 1, updatedAt: "2099-01-01T00:00:00.000Z" } as DeviceDraft);
  await controller.lookAgain();
  assert.deepEqual(backupsHere(fake), [], "nothing differs, so nothing is kept twice");
});

test("a version that differs only in its card binding is never dropped: the later one wins and the other is kept", async t => {
  const owner = "b1000000-0000-4000-8000-000000000001", card = "b3000000-0000-4000-8000-000000000009";
  const released = releasedShape();
  const fake = withReleased(t, { ...released, account: { saved: { id: card, owner, revision: 1, contentKey: "{}" }, pending: null } });
  const controller = tab();
  await controller.initialize();
  controller.change((draft) => revise(draft, {}, true));
  await controller.settled();
  // The older tab deleted the saved card: the same words, no binding, and the card's ID retired.
  olderTabWrites(fake, { ...released, revision: released.revision + 2, updatedAt: "2099-01-01T00:00:00.000Z", account: { saved: null, pending: null, retired: [card] } } as DeviceDraft);
  await controller.lookAgain();
  const stored = draftsHere(fake)[0]![1];
  assert.equal(stored.account.saved, null, "the next Save does not target the deleted card");
  assert.deepEqual(stored.account.retired, [card]);
  const kept = backupsHere(fake);
  assert.equal(kept.length, 1);
  assert.ok(kept[0]![0].startsWith(betweenBuildsPrefix(released.id)));
  assert.equal(kept[0]![1].account.saved?.id, card, "this build's version, with its binding, is kept");
});

test("a deletion has one bound in all, and once it fires the message says only what is certain", async t => {
  const start = words("Synthetic words before the update");
  const fake = withReleased(t, start, [[BACKUP, words("Synthetic earlier backup")]]);
  await new IndexedDraftRepository().bringAcross();
  const [backup] = await new IndexedDraftRepository().backups();
  // A slow look that uses most of the bound, then a removal that does not answer in time.
  const repository = new IndexedDraftRepository({ earlierWait: 200, earlier: {
    read: async () => { await sleep(150); return readEarlier(); },
    remove: async (removal, signal) => { await sleep(120); return removeFromEarlier(removal, signal); },
  } });
  const started = performance.now();
  await assert.rejects(
    repository.deleteBackup(backup!.key, draftPin(backup!.draft)),
    (error) => error instanceof RemovalNotice && /may or may not have been removed/u.test(error.message) && /is still here/u.test(error.message),
  );
  assert.ok(performance.now() - started < 300, "one bound for the whole deletion, not one for each step");
  // The late removal is called off, so nothing contradicts what was said.
  await sleep(150);
  assert.deepEqual(fake.earlier.snapshot().backups.map(([key]) => key), [BACKUP], "the earlier copy is still there");
  assert.deepEqual(fake.snapshot().backups.map(([key]) => key), [BACKUP], "and so is this one");
});

test("words a deletion brought across are shown even when the deletion then fails", async t => {
  const start = words("Synthetic words before the update");
  const fake = withReleased(t, start, [[BACKUP, words("Synthetic earlier backup")]]);
  const repository = new IndexedDraftRepository({ earlier: { read: readEarlier, remove: async () => { throw new Error("blocked"); } } });
  const controller = new DraftController(repository, { pointer: memoryPointer() });
  await controller.initialize();
  olderTabWrites(fake, at(start, "2099-01-01T00:00:00.000Z", "Synthetic words the older tab typed"));
  const backup = (await controller.backups()).find((item) => item.key === BACKUP)!;
  await assert.rejects(controller.deleteBackup(backup), RemovalNotice);
  assert.equal(controller.getSnapshot().draft.composer, "Synthetic words the older tab typed", "the open tab shows them");
});

test("a tab still showing the old version that writes over the older tab's words keeps them as a between-builds backup", async t => {
  const start = words("Synthetic words before the update");
  const fake = withReleased(t, start);
  const showing = tab(), looking = tab();
  await showing.initialize();
  await looking.initialize();
  olderTabWrites(fake, at(start, "2099-01-01T00:00:00.000Z", "Synthetic words the older tab typed"));
  // Another tab of this build brings them across; this one is not told and still shows the old words.
  await looking.lookAgain();
  showing.change((draft) => words("Synthetic words typed in the tab that was not told", draft));
  await showing.settled();
  const kept = backupsHere(fake);
  assert.equal(kept.length, 1);
  assert.ok(kept[0]![0].startsWith(betweenBuildsPrefix(start.id)), `kept outside the cap, not as ${kept[0]![0].slice(0, 9)}`);
  assert.equal(kept[0]![1].composer, "Synthetic words the older tab typed");
});

test("after the earlier copy is gone, a failure here says so and does not say that nothing was removed", async t => {
  for (const failure of ["the last write fails", "the backup changed meanwhile"] as const) {
    const start = words("Synthetic words before the update");
    const fake = withReleased(t, start, [[BACKUP, words("Synthetic earlier backup")]]);
    await new IndexedDraftRepository().bringAcross();
    const [backup] = await new IndexedDraftRepository().backups();
    const repository = new IndexedDraftRepository({ earlier: { read: readEarlier, remove: async (removal, signal) => {
      const done = await removeFromEarlier(removal, signal);
      if (failure === "the last write fails") fake.control.failCommit = true;
      else fake.stores.backups!.set(BACKUP, words("Synthetic backup changed meanwhile"));
      return done;
    } } });
    await assert.rejects(repository.deleteBackup(backup!.key, draftPin(backup!.draft)), (error) => {
      assert.ok(error instanceof RemovalNotice, failure);
      assert.doesNotMatch(error.message, /Nothing was removed/u, failure);
      assert.match(error.message, /copy in the earlier storage on this device was removed/u, failure);
      return true;
    });
    assert.deepEqual(fake.earlier.snapshot().backups, [], "its copy there is gone, as the message says");
  }
});
