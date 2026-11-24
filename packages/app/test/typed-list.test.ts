// A typed list on the Needs or Offers step makes a card for each item, and a pasted description of
// the initiative makes cards only from its sentences that say what it needs or could offer (24
// November 2026). Every rule only splits or leaves words out; nothing is reworded. Every name and
// sentence here is invented for these rules.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readCards } from "../evaluation/extraction.ts";
import { chunksFrom } from "../src/intake/keywords.ts";

const needs = (text: string, mode: "typed" | "spoken" = "typed") => readCards(text, "needs", mode);
/** How many cards the words made before typed lists were read, from the split the step always made. */
const readCardsBefore = (text: string) => chunksFrom(text, "before").length;
const offers = (text: string, mode: "typed" | "spoken" = "typed") => readCards(text, "offers", mode);

test("a typed list makes a card for each item, at its commas and its last and", () => {
  assert.deepEqual(needs("Compost bins, a wheelbarrow and help with pruning"), ["Compost bins", "A wheelbarrow", "Help with pruning"]);
  assert.deepEqual(needs("gloves and a ladder"), ["Gloves", "A ladder"]);
  assert.deepEqual(needs("We need rain barrels, a shed for tools, and someone to keep the accounts."), [
    "Rain barrels",
    "A shed for tools",
    "Someone to keep the accounts",
  ]);
  assert.deepEqual(offers("We can lend ladders, run a repair cafe on Sundays and share our recipe book."), [
    "Lend ladders",
    "Run a repair cafe on Sundays",
    "Share our recipe book",
  ]);
  assert.deepEqual(needs("Precisamos de mudas, um trator e alguém para cuidar das contas."), [
    "Mudas",
    "Um trator",
    "Alguém para cuidar das contas",
  ]);
  assert.deepEqual(needs("necesitamos semillas y también palas y alguien que lleve las cuentas", "spoken"), [
    "Necesitamos semillas",
    "Palas",
    "Alguien que lleve las cuentas",
  ]);
});

test("one item said with commas or with and stays one card", () => {
  for (const [text, card] of [
    // A sentence that is no list keeps its words as they were, full stop and all.
    ["We need a van, ideally electric.", "A van, ideally electric."],
    ["We need seedlings, which we plant in spring.", "Seedlings, which we plant in spring."],
    ["We need someone to drive and fix our truck.", "Someone to drive and fix our truck."],
    ["We need tools, such as spades and rakes.", "Tools, such as spades and rakes."],
  ] as const)
    assert.deepEqual(needs(text), [card], text);
  // A short list inside one item goes on with it: "digital skills, Web3 and climate" is one workshop topic list.
  assert.deepEqual(offers("We can offer desks with power, workshops on digital skills, Web3 and climate, and our hub plans."), [
    "Desks with power",
    "Workshops on digital skills, Web3 and climate",
    "Our hub plans",
  ]);
});

test("words that could be one item stay one card: half a thing is worse than two in one (a review's cases)", () => {
  for (const text of [
    "Volunteers in Awka, Enugu and Lagos",
    "A space for meetings, workshops and storage",
    "We need people to plant, water and weed",
    "Cooking oil, salt and pepper for the community kitchen",
    "A big, dry, secure shed",
    "A shed with a roof and a door that locks",
    "A teacher for a day and a half",
    "Help to write a grant and a budget",
    "Kitchen equipment (pots, pans and knives)",
    "Equipment, such as a drill, saw and sander, and training to use it",
    "Necesitamos herramientas, sal y pimienta",
    "Thanks, and good luck!",
  ])
    assert.equal(needs(text).length, readCardsBefore(text), text);
  // "And so on" makes no card of its own.
  assert.deepEqual(needs("Seeds, tools, compost, etc."), ["Seeds", "Tools", "Compost"]);
  assert.deepEqual(needs("Funding, tools and more!"), ["Funding", "Tools and more!"]);
  // Words that describe a thing go with it.
  assert.deepEqual(needs("A cold room, solar powered, and a generator"), ["A cold room, solar powered", "A generator"]);
});

test("a sentence that still asks or gives something is never left out of a pasted description", () => {
  for (const [text, card] of [
    ["We need seedlings. We're also looking for a tractor.", "A tractor."],
    ["We need tools. Our greatest need is a borehole.", "Our greatest need is a borehole."],
    ["We need a website. People who can teach coding would help too.", "People who can teach coding would help too."],
    ["We need seeds. Our garden has no fence yet, so goats get in.", "Our garden has no fence yet, so goats get in."],
    ["We need volunteers. A sign so people can find us would help.", "A sign so people can find us would help."],
  ] as const)
    assert.ok(needs(text).includes(card), `${text} -> ${needs(text).join(" | ")}`);
  for (const [text, card] of [
    ["We can offer land. Our kitchen is also available for events.", "Our kitchen is also available for events."],
    ["We can share seeds. Our hall is free on weekends.", "Our hall is free on weekends."],
    ["We can offer workshops. Maria Silva teaches grafting on Saturdays.", "Maria Silva teaches grafting on Saturdays."],
  ] as const)
    assert.ok(offers(text).includes(card), `${text} -> ${offers(text).join(" | ")}`);
});

test("a second review's cases: lists inside an item, descriptors, lowercase, bullets and courtesy", () => {
  assert.deepEqual(needs("Volunteers from Lagos, Abuja, Kano and a truck"), ["Volunteers from Lagos, Abuja, Kano", "A truck"]);
  assert.deepEqual(needs("A pump, 50 metres deep, and a tank"), ["A pump, 50 metres deep", "A tank"]);
  assert.deepEqual(needs("A water tank, volunteers, and a truck."), ["A water tank", "Volunteers", "A truck"]);
  assert.deepEqual(needs("We need a tractor, tools, seeds and a pump."), ["A tractor", "Tools", "Seeds", "A pump"]);
  assert.equal(offers("We can offer translation into Yoruba, Igbo, and Hausa, and design help.").length, 1);
  // Sentences typed without capitals are still sentences.
  assert.deepEqual(needs("seeds. tools. a pump."), ["Seeds.", "Tools.", "A pump."]);
  // A bullet is already one of the person's own items.
  assert.deepEqual(needs("- seeds, compost and a rake\n- a shed\n- help with fundraising"), ["Seeds, compost and a rake", "A shed", "Help with fundraising"]);
  // "Hello" and "Thank you" make no card, so they cannot crowd a need out of the four.
  assert.deepEqual(
    needs("Hello! Thanks for reading. We are Casa Verde, a community kitchen. We need a new stove, cooking volunteers and a fridge. Thank you!"),
    ["A new stove", "Cooking volunteers", "A fridge"],
  );
  assert.ok(needs("We need a tractor. Volunteers for the harvest would be great.").includes("Volunteers for the harvest would be great."));
  assert.ok(offers("We can lend tools. We would love to share our seed bank with schools.").some((card) => /seed bank/u.test(card)));
  assert.equal(needs("we need funding and also members to join the board", "spoken").length, 2);
});

test("a pasted description makes cards only from what this step asks for", () => {
  const description = [
    "Riverbend Seed Library lends seeds to gardeners across the valley, from heirloom beans to wildflowers.",
    "Members return seeds at the end of the season, and volunteers sort them every Thursday.",
    "We work with three schools, and our first branch is in the old post office.",
    "We need a seed freezer, shelving for the jars, and a volunteer coordinator.",
    "We can offer seed-saving workshops, our planting calendar, and a spare greenhouse.",
    "Find us at riverbend.example.org.",
  ].join(" ");
  assert.deepEqual(needs(description), ["A seed freezer", "Shelving for the jars", "A volunteer coordinator"]);
  assert.deepEqual(offers(description), ["Seed-saving workshops", "Our planting calendar", "A spare greenhouse"]);
});

test("words that say nothing this step asks for are split as before", () => {
  // No sentence says "we need", so nothing is left out, and a description is not split at its commas.
  assert.deepEqual(needs("We are a seed library in the valley, with three schools, two farms and a cafe."), [
    "We are a seed library in the valley, with three schools, two farms and a cafe.",
  ]);
  // Without a step, as an initiative's page reads its words, the box is split as it always was.
  assert.deepEqual(
    chunksFrom("Compost bins, a wheelbarrow and help with pruning", "source").map((chunk) => chunk.text),
    ["Compost bins", "a wheelbarrow and help with pruning"],
  );
});

test("a thing said to be had stays one offer with what it can be lent for", () => {
  assert.deepEqual(offers("we have a trailer we can lend on weekends and we also share our oven for bake days", "spoken"), [
    "We have a trailer we can lend on weekends",
    "Our oven for bake days",
  ]);
});
