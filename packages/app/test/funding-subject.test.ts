import assert from "node:assert/strict";
import { test } from "node:test";
import { confirmDraft, newDraft, revise, type DeviceDraft } from "../src/describe/contracts.ts";
import { describeFixture } from "../src/fixtures.ts";
import { choiceLabel, fundingSubject, subjectLine } from "../src/funding/subject.ts";
import { deviceDrafts } from "../src/initiative/list.ts";

const checked = (name: string): DeviceDraft => {
  const seed = confirmDraft(describeFixture("kept"));
  return revise({ ...seed, id: crypto.randomUUID() }, { confirmed: { ...seed.confirmed!, name } });
};
const words = (text: string): DeviceDraft => revise(newDraft(), { composer: text }, true);
const sentence = (line: ReturnType<typeof subjectLine>) => line && `${line.before}${line.name}${line.after}`;

test("Funding says which initiative its fit is for, and offers the others only when there are others", () => {
  const orchard = checked("Orchard commons");
  const alone = fundingSubject(orchard, deviceDrafts(orchard, []));
  assert.deepEqual(alone.current, { id: orchard.id, name: "Orchard commons", checked: true });
  assert.deepEqual(alone.choices, [], "one initiative leaves nothing to change to");
  assert.equal(sentence(subjectLine(alone)), "Showing what fits Orchard commons.");

  const seeds = checked("Seed library"), crew = words("We clean the river every month");
  const several = fundingSubject(orchard, deviceDrafts(orchard, [orchard, seeds, crew]));
  assert.equal(several.current?.id, orchard.id);
  assert.deepEqual(several.choices.map((option) => option.id).sort(), [orchard.id, seeds.id, crew.id].sort());
  assert.equal(sentence(subjectLine(several)), "Showing what fits Orchard commons.");
  const unchecked = several.choices.find((option) => option.id === crew.id)!;
  assert.equal(unchecked.checked, false);
  assert.equal(choiceLabel(unchecked), `${unchecked.name}, not checked yet`, "a card that cannot be ranked says so before it is picked");
  assert.equal(choiceLabel(several.choices.find((option) => option.id === seeds.id)!), "Seed library");
});

test("an initiative that is not checked yet is named only where there is another to change to", () => {
  const crew = words("We clean the river every month");
  const alone = fundingSubject(crew, deviceDrafts(crew, []));
  assert.equal(alone.current?.checked, false);
  assert.equal(subjectLine(alone), null, "the page's own prompt already asks for this one to be finished");
  const seeds = checked("Seed library");
  const line = subjectLine(fundingSubject(crew, deviceDrafts(crew, [seeds])));
  assert.equal(line?.name, alone.current?.name);
  assert.equal(line?.after, " is not checked yet, so funding is not ranked for it.");
});

test("an empty tab or another account's card is never named, and the person's own initiatives are still offered", () => {
  const blank = newDraft();
  assert.deepEqual(fundingSubject(blank, deviceDrafts(blank, [])), { current: null, choices: [] });
  assert.equal(subjectLine(fundingSubject(blank, deviceDrafts(blank, []))), null);
  const theirs = checked("Another account's card"), mine = checked("Seed library");
  // The tab is on a card that is set aside for this account (DL-055), so the list leaves it out.
  const subject = fundingSubject(theirs, deviceDrafts(theirs, [mine], (draft) => draft.id === theirs.id));
  assert.equal(subject.current, null);
  assert.deepEqual(subject.choices.map((option) => option.name), ["Seed library"]);
  assert.equal(sentence(subjectLine(subject)), "Choose an initiative to see what fits it.");
});
