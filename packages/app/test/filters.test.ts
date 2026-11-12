import assert from "node:assert/strict";
import { test } from "node:test";
import { activeChoices, narrowing, pickedValue, pressOption, withoutChoice, type Facet } from "../src/filters.ts";

const region: Facet = {
  key: "region",
  label: "Region",
  kind: "many",
  options: [
    { value: "africa", label: "Africa" },
    { value: "asia", label: "Asia" },
  ],
  chosen: ["asia"],
};
const closing: Facet = {
  key: "closing",
  label: "Closing",
  kind: "one",
  options: [
    { value: "", label: "Any date" },
    { value: "30", label: "Within 30 days" },
  ],
  chosen: [],
};
const lookIn: Facet = {
  key: "supportIn",
  label: "Look in",
  kind: "one",
  options: [
    { value: "either", label: "Needs or offers" },
    { value: "needs", label: "Needs" },
  ],
  chosen: ["needs"],
};

test("a filter that takes several values adds and takes off the one pressed", () => {
  assert.deepEqual(pressOption(region, "africa"), ["asia", "africa"]);
  assert.deepEqual(pressOption(region, "asia"), []);
});

test("a filter that takes one value holds it alone, and its first option means no filter", () => {
  assert.equal(pickedValue(closing), "", "nothing chosen shows the first option as picked");
  assert.deepEqual(pressOption(closing, "30"), ["30"]);
  assert.deepEqual(pressOption({ ...closing, chosen: ["30"] }, ""), []);
  assert.equal(pickedValue({ ...closing, chosen: ["30"] }), "30");
  assert.deepEqual(pressOption(lookIn, "either"), [], "the first option need not be an empty value");
});

test("a narrower question counts only once the question it narrows has an answer", () => {
  const support: Facet = { ...region, key: "support", label: "Support", chosen: [], scope: lookIn };
  assert.equal(narrowing(support), 0, "where to look means nothing with no kind of support to look for");
  assert.deepEqual(activeChoices([support]), []);
  const answered = { ...support, chosen: ["asia"] };
  assert.equal(narrowing(answered), 2);
  assert.deepEqual(
    activeChoices([answered]).map((choice) => [choice.facet.key, choice.label]),
    [
      ["support", "Asia"],
      ["supportIn", "Look in: Needs"],
    ],
  );
});

test("every choice in force can be named and taken off on its own", () => {
  const facets = [{ ...closing, chosen: ["30"] }, { ...region, chosen: ["asia", "africa"] }];
  const choices = activeChoices(facets);
  assert.deepEqual(
    choices.map((choice) => choice.label),
    ["Closing: Within 30 days", "Asia", "Africa"],
    "one value of a single choice carries its filter's name; a plain value speaks for itself",
  );
  assert.deepEqual(withoutChoice(choices[1]!), ["africa"]);
  assert.deepEqual(withoutChoice(choices[0]!), []);
});

test("a value the list no longer offers still shows, so it can be taken off", () => {
  const [choice] = activeChoices([{ ...region, chosen: ["Oceania"] }]);
  assert.equal(choice?.label, "Oceania");
  assert.deepEqual(withoutChoice(choice!), []);
});
