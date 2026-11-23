// Change Initiative on Funding takes effect as it is made, and arrow keys make one choice per press.
// The page opens one initiative at a time, and the last choice reached is the one it ends on.
import assert from "node:assert/strict";
import { test } from "node:test";
import { lastChoiceWins, type ChoiceSettled } from "../src/funding/change.ts";

/** An opening that finishes when the test says so, as a draft store does. */
function store() {
  const opened: string[] = [];
  const waiting: Array<{ id: string; finish(): void; fail(error: Error): void }> = [];
  let running = 0, most = 0;
  const open = (id: string) => new Promise<void>((resolve, reject) => {
    running += 1;
    most = Math.max(most, running);
    const done = () => { running -= 1; };
    waiting.push({
      id,
      finish: () => { done(); opened.push(id); resolve(); },
      fail: (error) => { done(); reject(error); },
    });
  });
  return { open, opened, waiting, most: () => most };
}
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

test("arrowing Down three times through Change Initiative ends on the fourth initiative, one opening at a time", async () => {
  const drafts = store();
  const settled: ChoiceSettled[] = [];
  const choose = lastChoiceWins(drafts.open, (result) => settled.push(result));
  // Enter opens the menu on the first; each Down is a choice of the next one.
  choose("second");
  choose("third");
  choose("fourth");
  await tick();
  assert.deepEqual(drafts.waiting.map((item) => item.id), ["second"], "a choice made while one opens waits for it");
  drafts.waiting[0]!.finish();
  await tick();
  assert.deepEqual(drafts.waiting.map((item) => item.id), ["second", "fourth"], "only the last choice waiting is opened next");
  assert.deepEqual(settled, [], "nothing is settled while a later choice is still to open");
  drafts.waiting[1]!.finish();
  await tick();
  assert.deepEqual(drafts.opened, ["second", "fourth"]);
  assert.equal(drafts.most(), 1, "two openings never run at once");
  assert.deepEqual(settled, [{ id: "fourth", problem: null }]);
});

test("a choice that fails is reported only when it is the last one", async () => {
  const drafts = store();
  const settled: ChoiceSettled[] = [];
  const choose = lastChoiceWins(drafts.open, (result) => settled.push(result));
  choose("second");
  choose("third");
  await tick();
  drafts.waiting[0]!.fail(new Error("The tab's latest words are not stored yet."));
  await tick();
  assert.equal(settled.length, 0, "a later choice replaces an earlier refusal");
  drafts.waiting[1]!.fail(new Error("That initiative is no longer on this device."));
  await tick();
  assert.equal(settled.length, 1);
  assert.equal(settled[0]!.id, "third");
  assert.equal((settled[0]!.problem as Error).message, "That initiative is no longer on this device.");
  // The menu works again after a refusal.
  choose("second");
  await tick();
  drafts.waiting[2]!.finish();
  await tick();
  assert.deepEqual(settled.at(-1), { id: "second", problem: null });
});

test("one choice opens once and settles", async () => {
  const drafts = store();
  const settled: ChoiceSettled[] = [];
  const choose = lastChoiceWins(drafts.open, (result) => settled.push(result));
  choose("second");
  await tick();
  drafts.waiting[0]!.finish();
  await tick();
  assert.deepEqual(drafts.opened, ["second"]);
  assert.deepEqual(settled, [{ id: "second", problem: null }]);
});

test("Funding's menu marks the last choice while it opens, and every choice goes through lastChoiceWins", async () => {
  const { readFileSync } = await import("node:fs");
  const funding = readFileSync(new URL("../src/pages/Funding.tsx", import.meta.url), "utf8");
  assert.match(funding, /value=\{browsing \? NO_INITIATIVE : \(chosen \?\? subject\.current\?\.id\)\}\s+onChange=\{choose\}/u);
  assert.match(funding, /const \[compareWith\] = useState\(\(\) =>\s+lastChoiceWins\(/u);
  assert.doesNotMatch(funding, /if \(changing\) return/u, "a choice made while another opens is never dropped");
});
