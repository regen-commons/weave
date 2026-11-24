// The prompt to describe an initiative (Funding, Partners) reads at once: its words do not wait for
// this device's draft to open. Its action does, holding its room, so nobody can press the wrong one.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { DraftController } from "../src/describe/controller.ts";
import { newDraft, revise } from "../src/describe/contracts.ts";
import { MemoryDraftRepository, type DraftRepository } from "../src/describe/repository.ts";
import { describeDoor, describePromptTitle } from "../src/describe/start-new.ts";
import { memoryPointer } from "../src/describe/tabs.ts";
import { hasDraft } from "../src/describe/view.ts";
import { cardRoute } from "../src/initiative/status.ts";

const source = (path: string) => readFileSync(fileURLToPath(new URL(`../src/${path}`, import.meta.url)), "utf8");

/** What the prompt shows for the tab's draft, as DescribePrompt and useDescribeDoor work it out. */
function prompt(controller: DraftController) {
  const { draft, ready } = controller.getSnapshot();
  const started = hasDraft(draft);
  // The door waits for the draft (DescribeDoor holds its button until `ready`).
  return { title: describePromptTitle(ready, started), actionWaits: !ready, door: describeDoor(started, started ? cardRoute(draft) : "initiative") };
}

test("with a card in progress and a draft that opens late, the words read at once and the action waits for the draft", async () => {
  const saved = revise(newDraft(), { composer: "Synthetic words of a card in progress" }, true);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const memory = new MemoryDraftRepository(saved);
  const slow: DraftRepository = {
    load: async (id) => (await gate, memory.load(id)),
    list: async () => (await gate, memory.list()),
    save: (draft, expected) => memory.save(draft, expected),
  };
  const pointer = memoryPointer();
  pointer.set(saved.id);
  const controller = new DraftController(slow, { pointer, earlierWait: 0 });
  const opening = controller.initialize();
  await new Promise((resolve) => setTimeout(resolve, 20));
  // While the draft opens: the words for someone without a card, and the action held unseen. The
  // door it holds would start a new card, which is wrong for this person, so it cannot be pressed.
  const waiting = prompt(controller);
  assert.equal(waiting.title, "Describe Your Initiative To See What Fits");
  assert.equal(waiting.actionWaits, true);
  release();
  await opening;
  // Once it opens: the title asks to finish this card, and the action continues it.
  const open = prompt(controller);
  assert.equal(open.title, "Finish Describing Your Initiative To See What Fits");
  assert.equal(open.actionWaits, false);
  assert.deepEqual(open.door, { href: "/start/initiative", label: "Continue Your Initiative" });
});

test("without a card the prompt is the same before and after the draft opens, apart from its action", async () => {
  const controller = new DraftController(new MemoryDraftRepository(), { pointer: memoryPointer(), earlierWait: 0 });
  const before = prompt(controller);
  await controller.initialize();
  const after = prompt(controller);
  assert.equal(before.title, after.title);
  assert.deepEqual([before.actionWaits, after.actionWaits], [true, false]);
  assert.deepEqual(after.door, { href: "/start/new", label: "Describe Your Initiative" });
});

test("the door holds its room until the draft opens, everywhere it is offered, and Funding draws the prompt at once", () => {
  const door = source("ui/DescribePrompt.tsx");
  assert.match(door, /return door\.ready \? \(\s*button\s*\) : \(\s*<span className="rc-skeleton" data-shape="room" aria-hidden="true">\s*\{button\}/u);
  assert.match(door, /<DescribeDoor variant="primary" \/>/u, "the prompt's own door");
  // Every other page that offers the door uses the one that waits, and none builds its own.
  for (const [file, variant] of [["pages/ListPage.tsx", "primary"], ["pages/Opportunity.tsx", "primary"], ["partners/PublicProjectRecord.tsx", "secondary"]] as const) {
    const page = source(file);
    assert.match(page, new RegExp(`<DescribeDoor variant="${variant}" />`, "u"), file);
    assert.doesNotMatch(page, /useDescribeDoor|door\.href|door\.label/u, file);
  }
  const funding = source("pages/Funding.tsx");
  assert.match(funding, /\{workspaceId === null && \(!catalog\.subjectKnown \|\| !catalog\.personalized\) && \(\s*<div data-unless-checked-card=\{catalog\.subjectKnown \? undefined : ""\}>\{prompt\}<\/div>/u);
  assert.doesNotMatch(funding, /data-shape="room"[^>]*>\s*\{prompt\}/u);
});
