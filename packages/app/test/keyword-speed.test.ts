// The keyword rules finish quickly whatever the words are. They run on the box, which holds up to
// 2,000,000 characters, or on every file's text, in a worker that only stops when the person
// presses Stop. A rule that backtracks over a long run of spaces, line ends or prose would keep
// the fill going for minutes or hours. Each case here took from seconds to over an hour before
// the rules were bounded on 19 November 2026.
import assert from "node:assert/strict";
import { test } from "node:test";
import { newDraft, revise } from "../src/describe/contracts.ts";
import { fieldsForm, fillFields } from "../src/describe/fill.ts";
import { collectSource, fromSource, keywordSuggestion } from "../src/describe/keywords.ts";
import { statedName } from "../src/describe/names.ts";
import { statedWhere } from "../src/describe/places.ts";

/** Well under a second, with room for a slow machine. */
const LIMIT_MS = 500;
const PROSE = "We grow food in Awka with families from Lagos and share seeds in schools across the valley. ";
const prose = (size: number) => PROSE.repeat(Math.ceil(size / PROSE.length)).slice(0, size);
const spaces = " ".repeat(20_000);
function quick<T>(label: string, run: () => T): T {
  const started = performance.now();
  const result = run();
  const took = performance.now() - started;
  assert.ok(took < LIMIT_MS, `${label} took ${Math.round(took)} ms`);
  return result;
}

test("the name rules finish quickly on 20,000 spaces, on 20,000 characters of line ends, and on 2,000,000 of prose", () => {
  quick("at, then spaces", () => statedName(`at${spaces}x`));
  quick("a word, spaces, a word", () => statedName(`Garden${spaces}x`));
  quick("we are, spaces, words, a carriage return", () => statedName(`We are${spaces}${"x".repeat(20_000)}\r`));
  quick("lines ending in carriage returns", () => statedName("Riverbend Seed Library is a\r".repeat(720)));
  quick("lines ending in newlines", () => statedName("Riverbend\n".repeat(2_000)));
  quick("prose", () => statedName(prose(2_000_000)));
  // And they still read a name at the start.
  assert.equal(quick("a name, then prose", () => statedName(`Riverbend Seed Library is a volunteer group in Porto Alegre. ${prose(2_000_000)}`)), "Riverbend Seed Library");
});

test("the place rules make one bounded pass, on 20,000 spaces, on line ends, and on 2,000,000 characters of prose", () => {
  quick("spaces before in", () => statedWhere(`We are a garden${spaces}in Awka.`));
  quick("line ends", () => statedWhere("We are a garden in Awka\r\n".repeat(800), ""));
  quick("prose, 200,000", () => statedWhere(prose(200_000), "Riverbend"));
  quick("prose, 2,000,000", () => statedWhere(prose(2_000_000), "Riverbend"));
  assert.deepEqual(
    quick("a place, then prose", () => statedWhere(`We are a seed library in Porto Alegre, Brazil. ${prose(2_000_000)}`, "")),
    { locations: ["Porto Alegre, Brazil"], isGlobal: false },
  );
});

test("the whole keyword fill of a full box finishes quickly", async () => {
  const said = `Riverbend Seed Library is a volunteer group in Porto Alegre, Brazil. ${prose(1_999_000)}`;
  // Typing stops at 20,000 characters; a box this full comes from earlier answers of the released build.
  const draft = revise(newDraft(), { composer: said }, true);
  const source = await collectSource(draft);
  const { suggestion } = quick("the suggestion", () => fromSource(draft, source));
  quick("the suggestion on its own", () => keywordSuggestion(draft, said));
  const form = fieldsForm(quick("the fill", () => fillFields(draft, suggestion, { engine: "keywords", unreadFiles: 0, sourceCharacters: said.length, files: [], fallback: false })).draft);
  assert.equal(form.name, "Riverbend Seed Library");
  assert.equal(form.where, "Porto Alegre, Brazil");
});
