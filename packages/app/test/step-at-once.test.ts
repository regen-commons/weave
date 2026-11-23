// The steps of describing an initiative are drawn at once, before this device's draft has opened:
// what to say is on screen without waiting for storage, and the box and fields take input only
// once the draft is open, so nothing typed lands in a blank card and the draft fills them in place.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { DraftController } from "../src/describe/controller.ts";
import { newDraft, revise, type DeviceDraft } from "../src/describe/contracts.ts";
import { MemoryDraftRepository } from "../src/describe/repository.ts";
import { memoryPointer } from "../src/describe/tabs.ts";
import type { DraftRepository } from "../src/describe/repository.ts";

const source = (path: string) => readFileSync(fileURLToPath(new URL(`../src/${path}`, import.meta.url)), "utf8");

/** A repository whose reads wait until the test lets them go, as a slow phone's storage does. */
function late(repository: DraftRepository) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  return {
    release,
    repository: {
      ...repository,
      load: async (id?: string | null) => {
        await gate;
        return repository.load(id);
      },
      list: repository.list && (async () => {
        await gate;
        return repository.list!();
      }),
      save: (draft: DeviceDraft, expected: Parameters<DraftRepository["save"]>[1]) => repository.save(draft, expected),
    } as DraftRepository,
  };
}

test("a draft that opens late: the step shows a blank card that takes no input, then the saved words fill it", async () => {
  const saved = revise(newDraft(), { composer: "Synthetic words saved earlier on this device" }, true);
  const memory = new MemoryDraftRepository(saved);
  const slow = late(memory);
  const pointer = memoryPointer();
  pointer.set(saved.id);
  const controller = new DraftController(slow.repository, { pointer, earlierWait: 0 });
  const opening = controller.initialize();
  await new Promise((resolve) => setTimeout(resolve, 20));
  // What the page draws while storage is read: a blank card, and the controls are held (not ready).
  assert.equal(controller.getSnapshot().ready, false);
  assert.equal(controller.getSnapshot().draft.composer, "");
  slow.release();
  await opening;
  // Once it opens, the saved words are the tab's, in place, and nothing blank was written over them.
  assert.equal(controller.getSnapshot().ready, true);
  assert.equal(controller.getSnapshot().draft.id, saved.id);
  assert.equal(controller.getSnapshot().draft.composer, "Synthetic words saved earlier on this device");
  await controller.settled();
  assert.equal(memory.drafts.get(saved.id)?.composer, "Synthetic words saved earlier on this device", "what is stored is untouched");
  assert.equal(memory.drafts.size, 1, "and no blank card was stored beside it");
});

test("each step is drawn without waiting for the draft, and takes input only once it is open", () => {
  const describe = source("pages/Describe.tsx");
  const ask = source("pages/AskStep.tsx");
  for (const [name, page] of [["Describe", describe], ["AskStep", ask]] as const) {
    assert.doesNotMatch(page, /DraftSkeleton/u, `${name} draws the step, not a placeholder, while the draft opens`);
    assert.doesNotMatch(page, /!ready \? \(/u, `${name} does not swap its step in once the draft is ready`);
    assert.match(page, /disabled=\{!ready \|\| /u, `${name}'s Continue waits for the draft`);
  }
  // The controls are inert until the draft is open: the box and its files, and the fields, on step 1;
  // the list, on needs and on offers. The words that say what to do are not, so they read at once.
  assert.equal(describe.split("inert={!ready || undefined}").length - 1, 2);
  assert.match(describe, /<div className="rc-stack" inert=\{!ready \|\| undefined\}>\s*<TalkItOut/u);
  assert.match(describe, /<form[^>]*inert=\{!ready \|\| undefined\}/u);
  assert.match(ask, /<section className="rc-panel" aria-labelledby=\{part\("title"\)\} inert=\{!ready \|\| undefined\}>/u);
});

test("starting a new card draws step 1 at once, blank, and never the tab's earlier draft", () => {
  const start = source("pages/StartNew.tsx");
  assert.match(start, /if \(!problem\) return <Describe starting \/>;/u);
  assert.doesNotMatch(start, /DraftSkeleton/u);
  const describe = source("pages/Describe.tsx");
  assert.match(describe, /const draft = starting \? blank : live\.draft;/u);
  assert.match(describe, /const ready = live\.ready && !starting;/u);
});
