import assert from "node:assert/strict";
import { test } from "node:test";
import { confirmDraft, newDraft, revise, type DeviceDraft } from "../src/describe/contracts.ts";
import { describeFixture } from "../src/fixtures.ts";
import { choiceLabel, fundingSubject, NO_INITIATIVE, subjectLine, subjectOptions } from "../src/funding/subject.ts";
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

test("Change Initiative offers No initiative while a checked one is compared, even when it is the only one (DL-129)", () => {
  const orchard = checked("Orchard commons");
  const alone = fundingSubject(orchard, deviceDrafts(orchard, []));
  assert.deepEqual(subjectOptions(alone), [
    { value: orchard.id, label: "Orchard commons" },
    { value: NO_INITIATIVE, label: "No initiative" },
  ]);
  const seeds = checked("Seed library");
  const several = fundingSubject(orchard, deviceDrafts(orchard, [orchard, seeds]));
  assert.equal(subjectOptions(several).at(-1)?.value, NO_INITIATIVE);
  assert.equal(subjectOptions(several).length, 3);
  assert.equal(
    sentence(subjectLine(alone, true)),
    "No initiative chosen, so fit is not shown or sorted on.",
    "browsing says plainly that fit is left out",
  );
  assert.equal(sentence(subjectLine(alone, false)), "Showing what fits Orchard commons.");
});

test("No initiative is not offered where nothing is compared anyway", () => {
  const blank = newDraft();
  assert.deepEqual(subjectOptions(fundingSubject(blank, deviceDrafts(blank, []))), [], "a visitor gets the prompt, not a menu");
  const crew = words("We clean the river every month");
  assert.deepEqual(subjectOptions(fundingSubject(crew, deviceDrafts(crew, []))), []);
  const seeds = checked("Seed library");
  const unchecked = subjectOptions(fundingSubject(crew, deviceDrafts(crew, [seeds])));
  assert.ok(unchecked.length === 2 && unchecked.every((option) => option.value !== NO_INITIATIVE));
  assert.equal(subjectLine(fundingSubject(blank, deviceDrafts(blank, [])), true), null, "browsing with nothing to compare adds no line");
});
