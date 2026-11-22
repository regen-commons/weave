// A field tells a phone's keyboard what it holds (DL-088): names start each word with a capital,
// links get the address keys, and Enter is labelled for what it does (Next since DL-096).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const source = (path: string) => readFileSync(fileURLToPath(new URL(`../src/${path}`, import.meta.url)), "utf8");
/** The opening tag of the field whose id is written this way in the component. */
function field(file: string, id: string): string {
  const text = source(file);
  const at = text.indexOf(id);
  assert.notEqual(at, -1, `${file} has the field ${id}`);
  const start = Math.max(text.lastIndexOf("<input", at), text.lastIndexOf("<textarea", at));
  assert.notEqual(start, -1, `${id} in ${file} is on a field`);
  return text.slice(start, text.indexOf("/>", at) + 2);
}
const has = (tag: string, attribute: string) => tag.split(/\s+/u).includes(attribute);

test("a search field labels Enter as Search, on Home as on a list", () => {
  assert.ok(has(field("pages/Home.tsx", 'id="home-search"'), 'enterKeyHint="search"'));
  assert.ok(has(field("ui/FilterBar.tsx", "id={`${id}-search`}"), 'enterKeyHint="search"'));
});

test("a name starts each word with a capital, and an initiative's name is offered as an organisation's", () => {
  const initiativeNames = [field("ui/RecordFields.tsx", "id={`${id}-name`}"), field("partners/TeamEntries.tsx", 'id="team-title"')];
  for (const name of initiativeNames) {
    assert.ok(has(name, 'autoCapitalize="words"'));
    assert.ok(has(name, 'autoComplete="organization"'));
  }
  assert.ok(has(field("ui/RecordFields.tsx", "id={`${id}-where`}"), 'autoCapitalize="words"'));
  assert.ok(has(field("funding/SuggestFund.tsx", "id={`${id}-name`}"), 'autoCapitalize="words"'));
});

test("the link field gets the address keys, with capitals, corrections and spelling marks off", () => {
  const links = field("ui/RecordFields.tsx", "id={`${id}-link`}");
  for (const attribute of ['type="url"', 'inputMode="url"', 'autoCapitalize="none"', 'autoCorrect="off"', "spellCheck={false}"])
    assert.ok(has(links, attribute), `the link field has ${attribute}`);
  // Sentences are what a description wants, so About keeps the keyboard's own behaviour.
  assert.doesNotMatch(field("ui/RecordFields.tsx", "id={`${id}-about`}"), /autoCapitalize|inputMode|spellCheck/u);
});

test("the last one-line field of the describe step labels Enter as Done", () => {
  // The link is the form's last field since the suggested details left the page (DL-127), and
  // Enter there sends the form.
  assert.ok(has(field("ui/RecordFields.tsx", "id={`${id}-link`}"), 'enterKeyHint="done"'));
  assert.doesNotMatch(source("pages/Describe.tsx"), /rc-chip|detailChips/u, "no chips follow the link");
});

test("a one-line field with a field after it labels Enter as Next, and a field Enter writes in does not (DL-096)", () => {
  // The form these sit in moves the focus on, which next-field.test.ts holds it to.
  for (const id of ["id={`${id}-name`}", "id={`${id}-where`}"]) assert.ok(has(field("ui/RecordFields.tsx", id), 'enterKeyHint="next"'), id);
  assert.doesNotMatch(field("ui/RecordFields.tsx", "id={`${id}-about`}"), /enterKeyHint/u, "Enter in About it is a new line");
  for (const id of ["id={`${id}-name`}", "id={`${id}-link`}"]) assert.ok(has(field("funding/SuggestFund.tsx", id), 'enterKeyHint="next"'), id);
});
