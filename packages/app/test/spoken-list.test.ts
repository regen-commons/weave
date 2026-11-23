import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyAskStep } from "../src/intake/contracts.ts";
import { chunksFrom, keywordExtraction } from "../src/intake/keywords.ts";
import { cardTitle, spokenLines, spokenList } from "../src/intake/spoken.ts";
import { answerStep, reconcile } from "../src/intake/state.ts";

/** The cards a recording makes: its lines, read by the same rules as typed words. */
function cards(said: string, kind: "needs" | "offers" = "needs"): string[] {
  const step = answerStep(emptyAskStep(), kind, spokenList(said), "voice");
  const turn = step.turns[0]!;
  return reconcile(step, keywordExtraction(chunksFrom(turn.text, turn.id), kind)).items.map((item) => item.value.title);
}

test("a list of needs said in one go becomes a card for each, as a recognizer without punctuation writes it", () => {
  assert.deepEqual(cards("we need seedlings and a meeting room and also some funding for fencing"), [
    "Seedlings",
    "A meeting room",
    "Some funding for fencing",
  ]);
  // Saying the need again, with or without "also", starts the next one.
  assert.deepEqual(cards("we need tools we also need volunteers and we need funding"), ["Tools", "Volunteers", "Funding"]);
  assert.deepEqual(cards("we'd like a second-hand truck and we're looking for a fiscal host"), [
    "A second-hand truck",
    "A fiscal host",
  ]);
  // Counting aloud, after announcing how many: the announcement is not a need.
  assert.deepEqual(cards("so we need three things first seedlings second a meeting room and third money for fencing"), [
    "Seedlings",
    "A meeting room",
    "Money for fencing",
  ]);
  // Sounds of thinking go, and one before "a" was a pause between two needs.
  assert.deepEqual(cards("um we need native seedlings uh a water pump and someone to help with the accounts"), [
    "Native seedlings",
    "A water pump",
    "Someone to help with the accounts",
  ]);
  // A recognizer that writes commas splits the same way.
  assert.deepEqual(cards("We need seedlings, a meeting room, and funding for fencing."), [
    "Seedlings",
    "A meeting room",
    "Funding for fencing.",
  ]);
  assert.deepEqual(cards("precisamos de mudas e também precisamos de uma estufa"), ["Mudas", "Uma estufa"]);
});

test("one thing said with 'and' inside it stays one card", () => {
  for (const said of [
    "we need tools and volunteers for community planting",
    "we need land and water rights",
    "we need first aid kits for the volunteers",
    "we need a van because we have no transport",
    "we need tools because we need to plant before the rains",
  ])
    assert.equal(spokenLines(said).length, 1, said);
});

test("a list of offers keeps the verb that says what kind of offer it is", () => {
  assert.deepEqual(cards("I can teach composting and I can lend a tiller plus we offer seeds", "offers"), [
    "Teach composting",
    "Lend a tiller",
    "Seeds",
  ]);
  assert.deepEqual(cards("we can offer a workshop on water mapping we can also lend tools and we have a seed library", "offers"), [
    "A workshop on water mapping",
    "Lend tools",
    "We have a seed library",
  ]);
  // An offer said while listing needs is left for the offers list, as typed words are.
  assert.deepEqual(cards("we need seedlings and we can offer a workshop"), ["Seedlings"]);
});

test("only line breaks are added, and every other word is the person's", () => {
  const said = "um we need native seedlings uh a water pump";
  assert.equal(spokenList(said), "we need native seedlings\na water pump");
  // Words already on their own lines or sentences stay as they were.
  assert.deepEqual(spokenLines("Seedlings.\nA meeting room"), ["Seedlings.", "A meeting room"]);
  // Nothing but "we need" and sounds of thinking is nothing to add.
  for (const empty of ["", "   ", "um uh", "we need um", "so we need three things"])
    assert.deepEqual(spokenLines(empty), [], JSON.stringify(empty));
});

test("a card's title leaves out what the list's heading already says, and never leaves nothing", () => {
  assert.equal(cardTitle("we need seedlings"), "Seedlings");
  assert.equal(cardTitle("And we also need a van"), "A van");
  assert.equal(cardTitle("We can also share seeds"), "Seeds");
  assert.equal(cardTitle("I can lend a tiller"), "Lend a tiller");
  assert.equal(cardTitle("We need"), "We need");
  assert.equal(cardTitle("seedlings for the valley"), "Seedlings for the valley");
});

test("the spoken rules stay fast on any box the page allows", () => {
  // CPU time on this thread, as keyword-speed.test.ts counts it, so waiting for a busy machine's
  // core does not count. The first rules took 8.9 seconds on a box of commas; each case is now a few
  // milliseconds.
  for (const unit of [" ", ", ", "and ", "and a ", "we need ", "first second ", "uh a ", "because we need ", ", and ", "we'd "]) {
    const box = unit.repeat(Math.ceil(20000 / unit.length)).slice(0, 20000);
    const before = process.threadCpuUsage();
    for (const line of spokenLines(box).slice(0, 10)) cardTitle(line);
    const { user, system } = process.threadCpuUsage(before);
    const took = (user + system) / 1000;
    assert.ok(took < 500, `${JSON.stringify(unit)} took ${Math.round(took)} ms`);
  }
});
