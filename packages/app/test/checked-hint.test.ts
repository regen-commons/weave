// Funding's first paint holds the room for this device's state, a checked card's line or the prompt,
// from a flag the device keeps: nothing of the card, only whether there is one. The draft stays the
// source of truth, so a stale flag is corrected the moment the draft opens.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { CHECKED_HINT_KEY, hasCheckedCard, keepCheckedHint } from "../src/describe/checked-hint.ts";
import { confirmDraft, newDraft, revise, type DeviceDraft } from "../src/describe/contracts.ts";
import { DraftController } from "../src/describe/controller.ts";
import { MemoryDraftRepository, type DraftRepository } from "../src/describe/repository.ts";
import { memoryPointer } from "../src/describe/tabs.ts";
import { describeFixture } from "../src/fixtures.ts";

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");

/** The device's storage, holding what the flag says, and every write made to it. */
function deviceStorage(initial: string | null = null) {
  const writes: (string | null)[] = [];
  let value = initial;
  return {
    get value() {
      return value;
    },
    writes,
    setItem: (key: string, next: string) => {
      assert.equal(key, CHECKED_HINT_KEY);
      value = next;
      writes.push(next);
    },
    removeItem: (key: string) => {
      assert.equal(key, CHECKED_HINT_KEY);
      value = null;
      writes.push(null);
    },
  };
}

/** A controller on this tab's draft, which opens only when `release` is called. */
function lateDraft(saved: DeviceDraft | null) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const memory = new MemoryDraftRepository(saved ?? undefined);
  const slow: DraftRepository = {
    load: async (id) => (await gate, memory.load(id)),
    list: async () => (await gate, memory.list()),
    save: (draft, expected) => memory.save(draft, expected),
  };
  const pointer = memoryPointer();
  if (saved) pointer.set(saved.id);
  const controller = new DraftController(slow, { pointer, earlierWait: 0 });
  return { controller, release, opening: controller.initialize() };
}

const checked = () => confirmDraft(describeFixture("kept"));
const inProgress = () => revise(newDraft(), { composer: "Synthetic words of a card in progress" }, true);

test("a checked card is one kept with words about what it does, the same rule Funding compares by", () => {
  assert.equal(hasCheckedCard(checked()), true);
  assert.equal(hasCheckedCard(inProgress()), false);
  assert.equal(hasCheckedCard(newDraft()), false);
  const source = read("../src/funding/use-catalog.ts");
  assert.match(source, /personalized: hasCheckedCard\(draft\)/u);
});

test("a stale flag for a checked card is taken away when the draft opens without one", async () => {
  for (const saved of [null, inProgress()]) {
    const storage = deviceStorage("1");
    const draft = lateDraft(saved);
    const stop = keepCheckedHint(draft.controller, storage);
    await new Promise((resolve) => setTimeout(resolve, 20));
    // While the draft opens, the flag says what the device last knew, and nothing is written.
    assert.equal(storage.value, "1");
    assert.deepEqual(storage.writes, []);
    draft.release();
    await draft.opening;
    assert.equal(storage.value, null, saved ? "a card in progress" : "no card");
    stop();
  }
});

test("a missing flag is set when the draft opens with a checked card", async () => {
  const storage = deviceStorage(null);
  const draft = lateDraft(checked());
  const stop = keepCheckedHint(draft.controller, storage);
  draft.release();
  await draft.opening;
  assert.equal(storage.value, "1");
  stop();
});

test("the flag follows the draft afterwards, writing only when it changes, and holds nothing of the card", async () => {
  const storage = deviceStorage(null);
  const draft = lateDraft(null);
  const stop = keepCheckedHint(draft.controller, storage);
  draft.release();
  await draft.opening;
  // Words typed into a new card change nothing.
  draft.controller.change((current) => revise(current, { composer: "Synthetic words" }, true));
  draft.controller.change((current) => revise(current, { composer: "Synthetic words, more of them" }, true));
  assert.deepEqual(storage.writes, [null]);
  // Checking the card sets it; changing its words takes the check away, and the flag with it.
  const check = (current: DeviceDraft) => revise(current, { confirmed: checked().confirmed });
  draft.controller.change(check);
  draft.controller.change((current) => revise(current, { composer: "Synthetic words of a card in progress" }, true));
  assert.deepEqual(storage.writes, [null, "1", null]);
  for (const write of storage.writes) assert.ok(write === null || write === "1");
  // Stopped, it writes nothing more.
  stop();
  draft.controller.change(check);
  assert.equal(storage.writes.length, 3);
});

test("storage that cannot be written leaves the draft working and the flag as it was", async () => {
  const draft = lateDraft(checked());
  const closed = {
    setItem: () => {
      throw new Error("storage is closed");
    },
    removeItem: () => {
      throw new Error("storage is closed");
    },
  };
  const stop = keepCheckedHint(draft.controller, closed);
  draft.release();
  await draft.opening;
  assert.equal(hasCheckedCard(draft.controller.getSnapshot().draft), true);
  stop();
});

/** What public/theme-boot.js marks on the page before its body is drawn, for what storage holds. */
function bootMark(stored: (key: string) => string | null): boolean {
  const marks: Record<string, string> = {};
  const root = { dataset: {}, setAttribute: (name: string, value: string) => void (marks[name] = value) };
  vm.runInNewContext(read("../public/theme-boot.js"), {
    document: { documentElement: root, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null },
    location: { pathname: "/funding" },
    localStorage: { getItem: stored },
    setTimeout: () => undefined,
  });
  return "data-checked-card" in marks;
}

test("the page is marked for a checked card before it is drawn, from the flag alone", () => {
  assert.equal(bootMark((key) => (key === CHECKED_HINT_KEY ? "1" : null)), true);
  for (const value of [null, "", "0", "true"]) assert.equal(bootMark((key) => (key === CHECKED_HINT_KEY ? value : null)), false, String(value));
  assert.equal(
    bootMark(() => {
      throw new Error("storage is closed");
    }),
    false,
  );
});

test("until the draft opens, Funding draws both rooms and the mark shows one, in the build's first view too", () => {
  const funding = read("../src/pages/Funding.tsx");
  assert.match(
    funding,
    /\{catalog\.subjectKnown \? \(\s*!catalog\.personalized && prompt\s*\) : \(\s*<>\s*<div data-unless-checked-card="">\{prompt\}<\/div>\s*<div data-if-checked-card="">\{checkedRoom\}<\/div>/u,
  );
  // The checked card's room holds the line's shape unseen, and nothing in it can be reached.
  assert.match(funding, /const checkedRoom = \(\s*<div className="rc-skeleton" data-shape="room" aria-hidden="true">\s*<StatusLine/u);
  // The rule sits in the base layer, under every pattern, so each alternative is a plain wrapper that
  // no pattern gives a display of its own.
  const base = read("../../design-system/css/base.css");
  assert.match(base, /:root\[data-checked-card\] \[data-unless-checked-card\],\s*:root:not\(\[data-checked-card\]\) \[data-if-checked-card\] \{ display: none; \}/u);
  assert.doesNotMatch(funding, /<div[^>]*className=[^>]*data-(?:if|unless)-checked-card/u);
  assert.doesNotMatch(funding, /<div[^>]*data-(?:if|unless)-checked-card[^>]*className=/u);
});
