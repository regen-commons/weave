/// <reference lib="dom" />
import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeIndexedDB, installIndexedDB } from "./fake-indexeddb.ts";
import { DraftController } from "../src/describe/controller.ts";
import { newDraft, revise, type DeviceDraft } from "../src/describe/contracts.ts";
import { FieldsProblem, changeSaid, saidText } from "../src/describe/fill.ts";
import { IndexedDraftRepository } from "../src/describe/indexed-repository.ts";
import { MemoryDraftRepository, REPLACED_KEPT, draftPin, replacedPrefix } from "../src/describe/repository.ts";
import { memoryPointer, memoryTabs, sessionPointer } from "../src/describe/tabs.ts";

const words = (text: string, from: DeviceDraft = newDraft()) => revise(from, { composer: text }, true);
/** Lets queued channel messages, reads and writes finish. */
const idle = () => new Promise((resolve) => setTimeout(resolve, 5));

test("a browser holds several drafts: starting an initiative never replaces one, and each tab stays on its own", async t => {
  const fake = fakeIndexedDB();
  installIndexedDB(t, fake);
  const pointer = memoryPointer();
  const controller = new DraftController(new IndexedDraftRepository(), { pointer });
  await controller.initialize();
  const first = controller.change((draft) => words("The seed library", draft));
  await controller.settled();
  // Start an initiative: no backup, no question, and nothing is stored until there is something to store.
  const blank = await controller.startNew();
  assert.notEqual(blank.id, first.id);
  assert.equal(controller.getSnapshot().storage, "none");
  assert.equal(fake.stores.drafts!.size, 1);
  assert.equal(fake.stores.backups!.size, 0);
  const second = controller.change((draft) => words("The river group", draft));
  await controller.settled();
  assert.deepEqual([...fake.stores.drafts!.keys()].sort(), [first.id, second.id].sort());
  assert.equal((fake.stores.drafts!.get(first.id) as DeviceDraft).composer, "The seed library");
  assert.deepEqual(controller.getSnapshot().drafts.map((draft) => draft.composer).sort(), ["The river group", "The seed library"]);
  assert.equal(fake.stores.backups!.size, 0, "several drafts are not backups of each other");
  // The tab's pointer survives a reload, so the tab opens the draft it was on.
  await controller.open(first.id);
  assert.equal(pointer.get(), first.id);
  const reloaded = new DraftController(new IndexedDraftRepository(), { pointer });
  await reloaded.initialize();
  assert.equal(reloaded.getSnapshot().draft.composer, "The seed library");
  // A new tab has no pointer and opens the draft written last.
  const tab = new DraftController(new IndexedDraftRepository());
  await tab.initialize();
  assert.equal(tab.getSnapshot().draft.composer, "The river group");
  // A draft that is gone cannot be opened, and the tab stays where it was.
  await assert.rejects(tab.open(crypto.randomUUID()), /no longer on this device/);
  assert.equal(tab.getSnapshot().draft.composer, "The river group");
});

test("words that could not be stored are never left behind by starting or opening another draft", async () => {
  const stored = words("Stored words");
  const memory = new MemoryDraftRepository(stored);
  let fail = false;
  const controller = new DraftController({
    load: (id) => memory.load(id),
    list: () => memory.list(),
    save: async (draft, expected) => {
      if (fail) throw new Error("Synthetic full disk");
      return memory.save(draft, expected);
    },
  });
  await controller.initialize();
  fail = true;
  controller.change((draft) => words("Words this device could not store", draft));
  await controller.settled();
  assert.equal(controller.getSnapshot().storage, "memory");
  await assert.rejects(controller.startNew(), /not stored on this device yet/);
  await assert.rejects(controller.open(crypto.randomUUID()), /not stored on this device yet/);
  assert.equal(controller.getSnapshot().draft.composer, "Words this device could not store");
  fail = false;
  controller.retry();
  await controller.settled();
  assert.equal(controller.getSnapshot().storage, "saved");
  await controller.startNew();
  assert.equal(memory.drafts.get(stored.id)!.composer, "Words this device could not store");
});

function twoTabs(repository: () => ConstructorParameters<typeof DraftController>[0]) {
  const tabs = memoryTabs();
  const open = () => new DraftController(repository(), { channel: tabs.channel() });
  return { one: open(), two: open() };
}

test("two tabs on one draft stay in step: an idle tab shows the other's edit, with no warning and no backup", async t => {
  const start = words("Where both tabs begin");
  const fake = fakeIndexedDB({ drafts: [[start.id, start]], meta: [["last", start.id]] });
  installIndexedDB(t, fake);
  const { one, two } = twoTabs(() => new IndexedDraftRepository());
  await one.initialize();
  await two.initialize();
  one.change((draft) => words("Edited in the first tab", draft));
  await one.settled();
  await idle();
  assert.equal(two.getSnapshot().draft.composer, "Edited in the first tab");
  assert.equal(two.getSnapshot().storage, "saved");
  assert.equal(two.getSnapshot().error, null);
  // The second tab now edits from what it was shown, which is not a conflict either.
  two.change((draft) => words("Edited in the second tab", draft));
  await two.settled();
  await idle();
  assert.equal(one.getSnapshot().draft.composer, "Edited in the second tab");
  assert.equal(fake.stores.drafts!.size, 1);
  assert.equal(fake.stores.backups!.size, 0, "edits that followed each other replaced nothing unseen");
  for (const tab of [one, two]) assert.equal(tab.getSnapshot().error, null);
});

test("two tabs editing at once: the latest edit wins and the replaced version is kept quietly as a backup", async t => {
  const start = words("Where both tabs begin");
  const fake = fakeIndexedDB({ drafts: [[start.id, start]], meta: [["last", start.id]] });
  installIndexedDB(t, fake);
  const { one, two } = twoTabs(() => new IndexedDraftRepository());
  await one.initialize();
  await two.initialize();
  // Both edit before either hears of the other.
  one.change((draft) => words("Typed in the first tab", draft));
  two.change((draft) => words("Typed in the second tab, a moment later", draft));
  await one.settled();
  await two.settled();
  await idle();
  const stored = fake.stores.drafts!.get(start.id) as DeviceDraft;
  assert.equal(stored.composer, "Typed in the second tab, a moment later", "the edit written last is the one kept");
  const kept = [...fake.stores.backups!].filter(([key]) => key.startsWith(replacedPrefix(start.id)));
  assert.equal(kept.length, 1);
  assert.equal((kept[0]![1] as DeviceDraft).composer, "Typed in the first tab", "the replaced words can be restored");
  // Neither tab stops, warns or needs a reload, and both show the same draft.
  for (const tab of [one, two]) {
    assert.equal(tab.getSnapshot().storage, "saved");
    assert.equal(tab.getSnapshot().error, null);
    assert.equal(tab.getSnapshot().draft.composer, "Typed in the second tab, a moment later");
  }
  // Saving goes on working in the tab that lost.
  one.change((draft) => words("The first tab types again", draft));
  await one.settled();
  await idle();
  assert.equal((fake.stores.drafts!.get(start.id) as DeviceDraft).composer, "The first tab types again");
  assert.equal(two.getSnapshot().draft.composer, "The first tab types again");
  // The backup is in the list Settings shows, and restoring it brings the words back.
  const backup = (await one.backups()).find((item) => item.draft.composer === "Typed in the first tab")!;
  await one.replace(backup.draft);
  assert.equal(one.getSnapshot().draft.composer, "Typed in the first tab");
  await idle();
  assert.equal(two.getSnapshot().draft.composer, "Typed in the first tab");
});

test("a tab that missed every message still cannot lose the other tab's words, and replaced versions are capped", async () => {
  const start = words("Start");
  const repository = new MemoryDraftRepository(start);
  // No channel: neither tab ever hears of the other.
  const one = new DraftController(repository), two = new DraftController(repository);
  await one.initialize();
  await two.initialize();
  for (let round = 0; round < 4; round++) {
    one.change((draft) => words(`First tab, round ${round}`, draft));
    await one.settled();
    two.change((draft) => words(`Second tab, round ${round}`, draft));
    await two.settled();
  }
  assert.equal(repository.value!.composer, "Second tab, round 3");
  const replaced = repository.history.filter((item) => item.key.startsWith(replacedPrefix(start.id)));
  assert.equal(replaced.length, REPLACED_KEPT, "the oldest replaced versions make room for newer ones");
  assert.deepEqual(replaced.map((item) => item.draft.composer), ["First tab, round 3", "Second tab, round 2", "First tab, round 2"]);
  for (const tab of [one, two]) assert.equal(tab.getSnapshot().error, null);
  // A backup made on purpose is never dropped by the cap.
  const loaded = revise(repository.value!, { composer: "Opened over the stored draft" });
  await repository.replace(loaded);
  one.change((draft) => words("First tab again", draft));
  await one.settled();
  assert.ok(repository.history.some((item) => item.draft.composer === "Second tab, round 3" && !item.key.startsWith("replaced:")));
});

test("the real adapter keeps at most three replaced versions and never writes over a draft it cannot read", async t => {
  const start = words("Start");
  const fake = fakeIndexedDB({ drafts: [[start.id, start]], meta: [["last", start.id]] });
  installIndexedDB(t, fake);
  const repository = new IndexedDraftRepository();
  let latest = start;
  for (let round = 0; round < 5; round++) {
    // Each write names a version it never read, as a tab that missed the others would.
    latest = words(`Round ${round}`, latest);
    await repository.save(latest, { ...draftPin(start), revision: -1 });
  }
  const replaced = [...fake.stores.backups!.keys()].filter((key) => key.startsWith(replacedPrefix(start.id)));
  assert.equal(replaced.length, REPLACED_KEPT);
  assert.deepEqual(
    replaced.map((key) => (fake.stores.backups!.get(key) as DeviceDraft).composer).sort(),
    ["Round 1", "Round 2", "Round 3"],
  );
  // A write that follows the version it read replaces it without a backup.
  const next = words("Follows what it read", latest);
  await repository.save(next, draftPin(latest));
  assert.equal([...fake.stores.backups!.keys()].length, REPLACED_KEPT);
  // What this version cannot read is left alone, and the write says it failed.
  const strange = { id: start.id, shape: "from a later version" };
  fake.stores.drafts!.set(start.id, strange);
  await assert.rejects(repository.save(words("Would destroy it", next), draftPin(next)), /could not be stored/);
  assert.equal(fake.stores.drafts!.get(start.id), strange);
});

test("removing a draft in one tab clears it from the other tab's screen and list, and keeps it as a backup", async t => {
  const start = words("A draft open in two tabs");
  const other = words("Another initiative");
  const fake = fakeIndexedDB({ drafts: [[start.id, start], [other.id, other]], meta: [["last", start.id]] });
  installIndexedDB(t, fake);
  const { one, two } = twoTabs(() => new IndexedDraftRepository());
  await one.initialize();
  await two.initialize();
  assert.equal(two.getSnapshot().drafts.length, 2);
  const removal = await one.discardCurrent();
  await idle();
  assert.deepEqual([...fake.stores.drafts!.keys()], [other.id], "only the removed draft is gone");
  assert.equal((fake.stores.backups!.get(removal.backup) as DeviceDraft).composer, "A draft open in two tabs");
  assert.equal(two.getSnapshot().draft.composer, "");
  assert.equal(two.getSnapshot().storage, "none");
  assert.deepEqual(two.getSnapshot().drafts.map((draft) => draft.id), [other.id]);
  assert.equal(two.getSnapshot().error, null);
});

test("the tab pointer reads only a draft ID and works where session storage is blocked", () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key) } as unknown as Storage;
  const pointer = sessionPointer(() => storage);
  assert.equal(pointer.get(), null);
  const id = crypto.randomUUID();
  pointer.set(id);
  assert.equal(values.get("weave-open-draft"), id);
  assert.equal(sessionPointer(() => storage).get(), id, "a reload reads it back");
  values.set("weave-open-draft", "<script>");
  assert.equal(sessionPointer(() => storage).get(), null, "anything that is not an ID is ignored");
  pointer.set(null);
  assert.equal(values.has("weave-open-draft"), false);
  const blocked = sessionPointer(() => { throw new Error("SecurityError"); });
  blocked.set(id);
  assert.equal(blocked.get(), id, "the pointer stays in the tab's memory");
});

/** A repository whose reads wait until released, so a test can act while storage is still answering. */
function slowReads(memory: MemoryDraftRepository) {
  let open = true, release: () => void = () => {};
  let gate: Promise<void> = Promise.resolve();
  let failSaves = 0;
  const repository: ConstructorParameters<typeof DraftController>[0] = {
    load: async (id) => { if (!open) await gate; return memory.load(id); },
    list: () => memory.list(),
    save: async (draft, expected) => { if (failSaves > 0) { failSaves--; throw new Error("Synthetic full disk"); } return memory.save(draft, expected); },
  };
  return {
    repository,
    hold() { open = false; gate = new Promise((resolve) => { release = resolve; }); },
    release() { open = true; release(); },
    failNextSave() { failSaves = 1; },
  };
}

test("Start An Initiative pressed before storage has answered still starts a new one", async () => {
  const stored = words("An initiative already on this device");
  const memory = new MemoryDraftRepository(stored);
  const slow = slowReads(memory);
  const pointer = memoryPointer();
  const controller = new DraftController(slow.repository, { pointer });
  slow.hold();
  const loading = controller.initialize();
  const starting = controller.startNew();
  slow.release();
  await loading;
  const blank = await starting;
  assert.equal(controller.getSnapshot().draft.id, blank.id, "the tab is on the new initiative");
  assert.equal(controller.getSnapshot().draft.composer, "");
  assert.equal(pointer.get(), blank.id);
  assert.equal(memory.drafts.get(stored.id)!.composer, "An initiative already on this device", "the other one is untouched");
});

test("Start An Initiative after a failed first read keeps the failure on screen, and Try Again stores the new words", async t => {
  const stored = words("Synthetic words stored before the failure");
  const repository = new MemoryDraftRepository(stored);
  const load = repository.load.bind(repository);
  let failing = true;
  t.mock.method(repository, "load", async (...args: Parameters<typeof load>) => {
    if (failing) throw new Error("blocked");
    return load(...args);
  });
  const controller = new DraftController(repository, { pointer: memoryPointer() });
  await controller.initialize();
  assert.equal(controller.getSnapshot().storage, "memory");
  assert.match(controller.getSnapshot().error ?? "", /could not be read/);
  // Starting a new initiative does not make the failure go away.
  const started = await controller.startNew();
  assert.equal(controller.getSnapshot().draft.id, started.id);
  assert.equal(controller.getSnapshot().storage, "memory", "it is not reported as a clean, empty draft");
  assert.match(controller.getSnapshot().error ?? "", /could not be read/, "the notice, with Try Again and the text copy, stays");
  // Words typed now are in this tab only, and the page still says so.
  controller.change((draft) => words("Synthetic words typed after the failure", draft));
  await controller.settled();
  assert.equal(controller.getSnapshot().storage, "memory");
  assert.ok(controller.getSnapshot().error, "words in memory are never shown without the failure");
  assert.equal(repository.drafts.size, 1, "nothing was written while storage could not be read");
  // Try Again reads storage, then stores the new words as a draft of their own beside the old one.
  failing = false;
  controller.retry();
  await idle();
  await controller.settled();
  assert.equal(controller.getSnapshot().error, null);
  assert.equal(controller.getSnapshot().storage, "saved");
  assert.equal(repository.drafts.get(started.id)?.composer, "Synthetic words typed after the failure");
  assert.equal(repository.drafts.get(stored.id)?.composer, "Synthetic words stored before the failure");
});

test("words typed while storage is still being read raise no failure", async () => {
  const slow = slowReads(new MemoryDraftRepository());
  const controller = new DraftController(slow.repository, { pointer: memoryPointer() });
  slow.hold();
  const loading = controller.initialize();
  controller.change((draft) => words("Synthetic words typed early", draft));
  assert.equal(controller.getSnapshot().error, null, "a slow read is not a failed one");
  slow.release();
  await loading;
  await controller.settled();
  assert.deepEqual([controller.getSnapshot().storage, controller.getSnapshot().error], ["saved", null]);
});

test("a change to the box that is refused leaves the tab's draft, and what is stored, exactly as they were", async () => {
  // What the page relies on when it catches the refusal and shows its sentence.
  const memory = new MemoryDraftRepository(revise(newDraft(), { turns: [
    { id: crypto.randomUUID(), prompt: "First", text: "a".repeat(15000), via: "typed" },
    { id: crypto.randomUUID(), prompt: "Second", text: "b".repeat(15000), via: "typed" },
  ] }, true));
  const controller = new DraftController(memory, { pointer: memoryPointer() });
  await controller.initialize();
  const before = controller.getSnapshot();
  assert.throws(() => controller.change((draft) => changeSaid(draft, `${saidText(draft)} and more`)), FieldsProblem);
  assert.equal(controller.getSnapshot(), before, "nothing is published: no unsaved state and no notice");
  await controller.settled();
  assert.equal(memory.value!.turns.length, 2);
  // The same box, one character shorter, is stored.
  controller.change((draft) => changeSaid(draft, saidText(draft).slice(0, -1)));
  await controller.settled();
  assert.deepEqual([controller.getSnapshot().storage, memory.value!.composer.length], ["saved", 30001]);
});

test("opening a draft after a failed first read keeps the failure on screen, and a second failed try says so again", async t => {
  const a = words("Synthetic draft A"), b = words("Synthetic draft B");
  const repository = new MemoryDraftRepository(a, [b]);
  const load = repository.load.bind(repository);
  let failing = true;
  t.mock.method(repository, "load", async (...args: Parameters<typeof load>) => {
    // Only the first read fails: storage answers by the time the person presses a draft.
    if (failing) { failing = false; throw new Error("blocked"); }
    return load(...args);
  });
  const controller = new DraftController(repository, { pointer: memoryPointer() });
  await controller.initialize();
  assert.match(controller.getSnapshot().error ?? "", /could not be read/);
  const before = controller.getSnapshot();
  await assert.rejects(controller.open(b.id), /could not be read/);
  assert.equal(controller.getSnapshot(), before, "the tab is not put on a draft it cannot store, and the notice stays");
  // Try Again fails again: the failure is still said, not cleared.
  failing = true;
  controller.retry();
  await idle();
  assert.equal(controller.getSnapshot().storage, "memory");
  assert.match(controller.getSnapshot().error ?? "", /could not be read/);
  // Once storage reads, the draft opens and stores.
  controller.retry();
  await idle();
  assert.equal(controller.getSnapshot().error, null);
  await controller.open(b.id);
  assert.deepEqual([controller.getSnapshot().draft.id, controller.getSnapshot().storage, controller.getSnapshot().error], [b.id, "saved", null]);
});

test("a new initiative survives a reload before its first word, and never falls back to another draft", async () => {
  const stored = words("An initiative already on this device");
  const memory = new MemoryDraftRepository(stored);
  const pointer = memoryPointer();
  const controller = new DraftController(memory, { pointer });
  await controller.initialize();
  const blank = await controller.startNew();
  assert.equal(memory.drafts.has(blank.id), false, "nothing is stored until there is something to store");
  // The page reloads. The tab's pointer names a draft that was never stored.
  const reloaded = new DraftController(memory, { pointer });
  await reloaded.initialize();
  assert.equal(reloaded.getSnapshot().draft.id, blank.id, "still the new initiative");
  assert.equal(reloaded.getSnapshot().draft.composer, "");
  assert.equal(reloaded.getSnapshot().storage, "none");
  reloaded.change((draft) => words("First words of the new initiative", draft));
  await reloaded.settled();
  assert.equal(memory.drafts.get(blank.id)!.composer, "First words of the new initiative");
  assert.equal(memory.drafts.get(stored.id)!.composer, "An initiative already on this device");
});

test("words that arrive while another draft is opening stay with the draft on screen, stored or reported", async () => {
  for (const failing of [false, true]) {
    const a = words("Draft A"), b = words("Draft B");
    const memory = new MemoryDraftRepository(a, [b]);
    const slow = slowReads(memory);
    const controller = new DraftController(slow.repository);
    await controller.initialize();
    slow.hold();
    const opening = controller.open(b.id);
    await idle();
    if (failing) slow.failNextSave();
    // Something asynchronous finishes on draft A: dictation, a file read, a fill.
    controller.change((draft) => words("Draft A, with words that arrived during the open", draft));
    slow.release();
    await assert.rejects(opening, /still being stored/, "the tab does not leave the draft those words belong to");
    await controller.settled();
    const shown = controller.getSnapshot();
    assert.equal(shown.draft.id, a.id);
    assert.equal(shown.draft.composer, "Draft A, with words that arrived during the open");
    if (failing) {
      assert.equal(shown.storage, "memory", "a failed write is never shown as saved");
      assert.ok(shown.error);
      assert.equal(memory.drafts.get(a.id)!.composer, "Draft A");
    } else {
      assert.equal(shown.storage, "saved");
      assert.equal(memory.drafts.get(a.id)!.composer, "Draft A, with words that arrived during the open");
    }
    assert.equal(memory.drafts.get(b.id), b, "the other draft is not rewritten");
    assert.equal(memory.history.length, 0, "and no copy of it is filed as a replaced version");
    // Once the words are stored the other draft opens.
    if (failing) { controller.retry(); await controller.settled(); }
    await controller.open(b.id);
    assert.equal(controller.getSnapshot().draft.composer, "Draft B");
  }
});

test("a stored draft the tab is not on can be changed by its ID, and one that is gone or declined is left alone", async () => {
  const here = words("The draft this tab is on"), away = words("A draft the tab has left");
  const memory = new MemoryDraftRepository(here, [away]);
  const tabs = memoryTabs();
  const controller = new DraftController(memory, { channel: tabs.channel() });
  const other = new DraftController(memory, { channel: tabs.channel(), pointer: { get: () => away.id, set() {} } });
  await controller.initialize();
  await other.initialize();
  assert.equal(await controller.amend(away.id, (draft) => words("Changed by its ID", draft)), true);
  assert.equal(memory.drafts.get(away.id)!.composer, "Changed by its ID");
  assert.equal(controller.getSnapshot().draft.composer, "The draft this tab is on", "the tab does not move");
  assert.equal(controller.getSnapshot().drafts.find((draft) => draft.id === away.id)?.composer, "Changed by its ID");
  assert.equal(memory.history.length, 0, "it followed the version it read, so nothing was replaced");
  await idle();
  assert.equal(other.getSnapshot().draft.composer, "Changed by its ID", "a tab that is on it shows the change");
  assert.equal(await controller.amend(away.id, () => null), false, "declined");
  assert.equal(await controller.amend(crypto.randomUUID(), (draft) => words("x", draft)), false, "gone");
  // The tab's own draft goes through the ordinary change, with its write.
  assert.equal(await controller.amend(here.id, (draft) => words("Changed in place", draft)), true);
  assert.equal(controller.getSnapshot().draft.composer, "Changed in place");
  assert.equal(memory.drafts.get(here.id)!.composer, "Changed in place");
});

test("a working copy the account's version replaced under another ID goes to the backups, and the list keeps one draft for the card", async t => {
  const owner = "b1000000-0000-4000-8000-000000000001";
  const bound = (draft: DeviceDraft, pending = false) => revise(draft, { account: {
    saved: { id: "b3000000-0000-4000-8000-000000000009", owner, revision: 1, contentKey: "{}" },
    pending: pending ? { id: "b3000000-0000-4000-8000-000000000009", owner, revision: 1, contentKey: "{}", requestId: crypto.randomUUID() } : null,
  } });
  const copy = bound(words("Synthetic working copy under its own ID"));
  const loaded = revise({ ...words("Synthetic newer version from the account"), id: "b3000000-0000-4000-8000-000000000009" }, {});
  const fake = fakeIndexedDB();
  installIndexedDB(t, fake);
  const tabs = memoryTabs();
  const controller = new DraftController(new IndexedDraftRepository(), { pointer: memoryPointer(), channel: tabs.channel() });
  await controller.initialize();
  controller.change(() => copy);
  await controller.settled();
  const other = new DraftController(new IndexedDraftRepository(), { pointer: memoryPointer(), channel: tabs.channel() });
  await other.initialize();
  // The account's version opens under the card's ID: a second draft, with the copy still beside it.
  await controller.replace(loaded);
  assert.deepEqual(controller.getSnapshot().drafts.map((draft) => draft.id).sort(), [copy.id, loaded.id].sort());
  assert.equal(await controller.retire(loaded.id), false, "never the draft the tab is on");
  assert.equal(await controller.retire(copy.id), true);
  await idle();
  assert.deepEqual(fake.snapshot().drafts.map(([key]) => key), [loaded.id], "one draft for the card");
  assert.deepEqual(controller.getSnapshot().drafts.map((draft) => draft.id), [loaded.id]);
  assert.deepEqual(other.getSnapshot().drafts.map((draft) => draft.id), [loaded.id], "the other tab's list follows");
  const kept = await controller.backups();
  assert.equal(kept.some((backup) => backup.draft.composer === "Synthetic working copy under its own ID"), true, "the copy is a device backup, words and all");
  assert.equal(await controller.retire(copy.id), false, "gone already");
  // A copy still marked as waiting for a private save is moved too: nothing can answer that save now
  // (DL-155, step 4), so the mark would otherwise keep it here for good.
  const waiting = bound(words("Synthetic copy waiting for a save"), true);
  await controller.replace(waiting);
  await controller.replace(loaded);
  assert.equal(await controller.retire(waiting.id), true);
  assert.equal(fake.snapshot().drafts.some(([key]) => key === waiting.id), false);
});
