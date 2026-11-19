// "Start An Initiative" always starts a new card (the user's feedback of 18 November: "Starting a
// new initiative should just create one"). Every control that says it starts or describes an
// initiative goes to one address, /start/new, which starts a card once and then shows step 1.
// A control that goes on with the card in progress says "Continue".
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { DraftController } from "../src/describe/controller.ts";
import { newDraft, revise, type DeviceDraft } from "../src/describe/contracts.ts";
import { MemoryDraftRepository } from "../src/describe/repository.ts";
import { memoryPointer } from "../src/describe/tabs.ts";
import { hasDraft } from "../src/describe/view.ts";
import { beginNewInitiative, describeDoor } from "../src/describe/start-new.ts";
import { matchRoute, pathTo, ROUTES } from "../src/routes.ts";

const words = (text: string, from: DeviceDraft = newDraft()) => revise(from, { composer: text }, true);
const source = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");

test("starting with an unsaved draft on the device opens a new, empty card, and the earlier one stays listed", async () => {
  const earlier = words("Riverbend Seed Library is a volunteer group in Porto Alegre, Brazil.");
  const repository = new MemoryDraftRepository(earlier);
  // A tab that opens Weave with no draft of its own, as a click on Home's button does after a visit.
  const controller = new DraftController(repository, { pointer: memoryPointer() });
  await controller.initialize();
  assert.equal(controller.getSnapshot().draft.id, earlier.id, "the tab first shows the draft written last");
  const started = await beginNewInitiative(controller);
  const shown = controller.getSnapshot();
  assert.equal(shown.draft.id, started.id);
  assert.notEqual(started.id, earlier.id, "a new card, not the earlier one reopened");
  assert.equal(hasDraft(shown.draft), false, "step 1 is blank");
  assert.deepEqual(shown.drafts.map((draft) => draft.id), [earlier.id], "the earlier draft is still in Your Initiatives");
  assert.equal(repository.drafts.get(earlier.id)?.composer, earlier.composer, "and nothing of it changed");
  assert.equal(repository.drafts.has(started.id), false, "the new card is stored at its first word, not before");
});

test("loading the start address again does not make a second card", async () => {
  const earlier = words("Riverbend Seed Library");
  const repository = new MemoryDraftRepository(earlier);
  const pointer = memoryPointer();
  const first = await beginNewInitiative(new DraftController(repository, { pointer }));
  // The same tab loads /start/new again: a reload, Back, or a second press before step 1 showed.
  const again = new DraftController(repository, { pointer });
  const second = await beginNewInitiative(again);
  assert.equal(second.id, first.id, "the blank card the tab is on is the new card");
  assert.deepEqual([...repository.drafts.keys()], [earlier.id], "still one stored draft");
  // Once words are typed in it, starting again makes another card and keeps both.
  again.change((draft) => words("Hilltop Learning Garden", draft));
  await again.settled();
  const third = await beginNewInitiative(again);
  assert.notEqual(third.id, first.id);
  assert.deepEqual([...repository.drafts.keys()].sort(), [earlier.id, first.id].sort());
});

test("starting before storage has been read still starts a new card, not the draft read later", async () => {
  // The start page's effect runs before the provider's, so the first read may not have begun.
  const earlier = words("Riverbend Seed Library");
  const controller = new DraftController(new MemoryDraftRepository(earlier), { pointer: memoryPointer() });
  const started = await beginNewInitiative(controller);
  await controller.initialize();
  assert.equal(controller.getSnapshot().draft.id, started.id);
  assert.equal(hasDraft(controller.getSnapshot().draft), false);
});

test("a door says Continue when it goes to the card in progress, and starts a new card otherwise", () => {
  assert.deepEqual(describeDoor(false, "initiative"), { href: pathTo("new-initiative"), label: "Describe Your Initiative" });
  assert.deepEqual(describeDoor(true, "needs"), { href: pathTo("needs"), label: "Continue Your Initiative" });
  assert.equal(describeDoor(true, "initiative").href, pathTo("initiative"));
  assert.match(describeDoor(true, "initiative").label, /^Continue/u);
});

test("the start address is a step of its own, and every start control goes to it", () => {
  const route = matchRoute("/start/new");
  assert.equal(route?.name, "new-initiative");
  assert.equal(ROUTES.find((item) => item.name === "new-initiative")?.form, true, "a focused step, with no tab bar");
  // Home's hero and its empty state, and the footer.
  const home = source("pages/Home.tsx");
  assert.equal(home.match(/<ButtonLink href=\{pathTo\("new-initiative"\)\}[^>]*>\s*Start An Initiative\s*<\/ButtonLink>/gu)?.length, 2);
  assert.match(source("ui/Footer.tsx"), /\{ name: "new-initiative", label: "Start An Initiative" \}/u);
  // No control that says it starts or describes an initiative goes to the card in progress.
  for (const file of ["pages/Home.tsx", "pages/Settings.tsx", "pages/Opportunity.tsx", "pages/ListPage.tsx", "pages/YourInitiative.tsx", "ui/DescribePrompt.tsx", "ui/Footer.tsx", "pages/NotFound.tsx"]) {
    const text = source(file);
    assert.doesNotMatch(text, /href=\{pathTo\("initiative"\)\}[^>]*>\s*(?:Start An Initiative|Describe Your Initiative)/u, file);
  }
  // The page starts the card once and replaces its own address, so a reload shows step 1.
  const page = source("pages/StartNew.tsx");
  assert.match(page, /await beginNewInitiative\(controller\)/u);
  // In place and without a page transition, which would wait for a frame a background tab does not draw.
  assert.match(page, /navigate\(fixtureHref\(pathTo\("initiative"\), routeSearch\(\), true\), true, true\)/u);
});
