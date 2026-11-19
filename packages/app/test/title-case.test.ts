// Buttons and headings use title case, with a capital on every word (DL-105, VOICE.md). This reads
// the app's own markup and fails on a button or a heading with a word that starts small, so new
// copy meets the rule without anyone remembering it.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { DATA_POLICY } from "../src/data/privacy.ts";
import { ROUTES } from "../src/routes.ts";

const SRC = fileURLToPath(new URL("../src/", import.meta.url));

/**
 * The steps for starting an initiative are being rebuilt in another branch, which converts them
 * itself. Take a name off this list as its file arrives in title case.
 */
const HELD = [
  "pages/Describe.tsx",
  "pages/CheckCard.tsx",
  "pages/AskStep.tsx",
  "pages/YourInitiatives.tsx",
  "pages/YourInitiative.tsx",
  "describe/",
  "intake/",
  "initiative/",
];

/** Elements whose words are a button's label or a heading. */
const HOLDS_COPY = /^(?:button|ButtonLink|SignInButton|Heading|h[1-4]|Title|Group)$/u;
/** Components whose `title` is drawn as a heading. */
const TITLED = /^(?:Section|SettingsSection|Dialog|TaskDialog|DetailSheet)$/u;
/** A heading set as a message reports something, and stays a sentence (VOICE.md). */
const MESSAGE = /rc-(?:notice|empty)-title/u;
/** Words inside these are a person's own, or data: a record's name, a need's title. */
const OWN_WORDS = /rc-(?:record|ask)-title/u;

export type Copy = { line: number; words: string; where: string };

/** The first word that starts with a small letter, or nothing when every word has its capital. */
export function smallWord(words: string): string | undefined {
  return words
    .replace(/\$\{[^}]*\}/gu, "X")
    .replace(/&\w+;/gu, "&")
    .split(/[\s/-]+/u)
    .map((word) => word.replace(/^[^\p{L}\p{N}]+/u, ""))
    .find((word) => /^\p{Ll}/u.test(word));
}

/** Where a string that starts at `at` ends, quotes included. */
function stringEnd(text: string, at: number): number {
  const quote = text[at];
  for (let i = at + 1; i < text.length; i++) {
    if (text[i] === "\\") i++;
    else if (text[i] === quote) return i + 1;
  }
  return text.length;
}

/** Where the braces that open at `at` close. */
function braceEnd(text: string, at: number): number {
  let depth = 0;
  for (let i = at; i < text.length; i++) {
    const char = text[i]!;
    if (char === '"' || char === "'" || char === "`") i = stringEnd(text, i) - 1;
    else if (char === "{") depth++;
    else if (char === "}" && --depth === 0) return i + 1;
  }
  return text.length;
}

type Tag = { name: string; attributes: string; end: number; closed: boolean };

/** Reads an opening tag at `at`, where its attributes may hold arrows and comparisons. */
function openTag(text: string, at: number): Tag | null {
  const name = /^<([A-Za-z][\w.]*)/u.exec(text.slice(at, at + 60))?.[1];
  if (!name) return null;
  let i = at + 1 + name.length;
  for (; i < text.length; i++) {
    const char = text[i]!;
    if (char === '"' || char === "'") i = stringEnd(text, i) - 1;
    else if (char === "{") i = braceEnd(text, i) - 1;
    else if (char === ">") break;
  }
  return { name, attributes: text.slice(at + 1 + name.length, i), end: i + 1, closed: text[i - 1] === "/" };
}

/** The strings an expression can put on screen: the ones it chooses between, not the ones it compares with. */
function chosenStrings(expression: string): string[] {
  const found: string[] = [];
  // A string inside square brackets is a key that looks something up, not words for the screen.
  let square = 0;
  for (let i = 0; i < expression.length; i++) {
    const char = expression[i]!;
    if (char === "[") square++;
    else if (char === "]") square--;
    else if (char === "<" && /[A-Za-z]/u.test(expression[i + 1] ?? "")) {
      const tag = openTag(expression, i);
      if (tag) i = tag.end - 1;
    } else if (char === '"' || char === "'" || char === "`") {
      const end = stringEnd(expression, i);
      const before = expression.slice(0, i).trimEnd().at(-1) ?? "{";
      if (square === 0 && "?:{&|".includes(before)) found.push(expression.slice(i + 1, end - 1));
      i = end - 1;
    }
  }
  return found;
}

/** Every button label and heading a file writes out in its markup. */
export function copyIn(text: string): Copy[] {
  const found: Copy[] = [];
  const lineAt = (index: number) => text.slice(0, index).split("\n").length;
  const keep = (at: number, words: string, where: string) => {
    const trimmed = words.replace(/\s+/gu, " ").trim();
    if (/\p{L}/u.test(trimmed)) found.push({ line: lineAt(at), words: trimmed, where });
  };
  for (let at = text.indexOf("<"); at !== -1; at = text.indexOf("<", at + 1)) {
    const tag = openTag(text, at);
    if (!tag) continue;
    if (TITLED.test(tag.name)) {
      const title = /\btitle=(?:"([^"]*)"|\{)/u.exec(tag.attributes);
      if (title?.[1] !== undefined) keep(at, title[1], `<${tag.name} title>`);
      else if (title) {
        const from = title.index + title[0].length - 1;
        for (const words of chosenStrings(tag.attributes.slice(from, braceEnd(tag.attributes, from)))) keep(at, words, `<${tag.name} title>`);
      }
    }
    const drawnAsButton = /^(?:Link|a)$/u.test(tag.name) && /className="[^"]*\brc-button\b/u.test(tag.attributes);
    if (!(HOLDS_COPY.test(tag.name) || drawnAsButton) || tag.closed) continue;
    if (MESSAGE.test(tag.attributes) || OWN_WORDS.test(tag.attributes)) continue;
    const close = text.indexOf(`</${tag.name}>`, tag.end);
    if (close === -1) continue;
    const inside = text.slice(tag.end, close);
    const where = `<${tag.name}>`;
    let words = "";
    for (let i = 0; i < inside.length; i++) {
      const char = inside[i]!;
      if (char === "{") {
        const end = braceEnd(inside, i);
        for (const chosen of chosenStrings(inside.slice(i, end))) keep(tag.end + i, chosen, where);
        // Whatever the braces hold stands in the label as one word.
        words += " X ";
        i = end - 1;
      } else if (char === "<") {
        const child = openTag(inside, i);
        if (!child) {
          // A closing tag, or a fragment's.
          i = inside.indexOf(">", i);
          if (i === -1) break;
          continue;
        }
        // Words for assistive technology only are a sentence, not part of the label.
        const hidden = /rc-visually-hidden/u.test(child.attributes) ? inside.indexOf(`</${child.name}>`, child.end) : -1;
        i = (hidden === -1 ? child.end : hidden) - 1;
      } else words += char;
    }
    if (words.replace(/\bX\b/gu, "").trim()) keep(at, words.replace(/^(?:\s*X\s)+|(?:\sX\s*)+$/gu, ""), where);
  }
  return found;
}

const markup = readdirSync(SRC, { withFileTypes: true, recursive: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".tsx"))
  .map((entry) => join(entry.parentPath, entry.name).slice(SRC.length))
  .sort();

test("the reader finds a button's label and a heading's words, and leaves the rest", () => {
  const found = copyIn(`
    <Section id="a" title="Three steps" action={<ButtonLink href="/x" variant="quiet">See all funding</ButtonLink>}>
      <button type="button" onClick={() => count > 2 && go("somewhere else")} disabled={state === "busy"}>
        <Icon name="arrow-left" />
        {busy ? "Signing out" : "Sign Out"}
        <span className="rc-visually-hidden"> (opens in a new tab)</span>
      </button>
      <h2 className="rc-notice-title">The list did not load</h2>
      <h3 className="rc-record-title">{record.name}</h3>
      <Link className="rc-button" data-variant="primary" href="/start">Start an initiative</Link>
      <p>Words in a paragraph are a sentence.</p>
      <TaskDialog title={kind === "need" ? "Add a need" : "Add An Offer"} open={open} />
      <Heading level={2} size="section">{count} Partners for you</Heading>
    </Section>`).map(({ words }) => words);
  assert.deepEqual(found, ["Three steps", "See all funding", "Signing out", "Sign Out", "Start an initiative", "Add a need", "Add An Offer", "Partners for you"]);
});

test("a word that starts small is found, and names, numbers and a person's own words are not", () => {
  assert.equal(smallWord("Start An Initiative"), undefined);
  assert.equal(smallWord("Start an Initiative"), "an");
  assert.equal(smallWord("Sign-in With Certified"), "in");
  assert.equal(smallWord("Delete Your Account?"), undefined);
  assert.equal(smallWord("Restore ${name}"), undefined);
  assert.equal(smallWord("3 Needs, 2 Offers"), undefined);
  assert.equal(smallWord("Review What You’ll Share"), undefined);
  assert.equal(smallWord("Data & Privacy"), undefined);
  assert.equal(smallWord("(opens in a new tab)"), "opens");
});

test("every button and every heading in the app's markup is in title case (DL-105)", () => {
  const small: string[] = [];
  for (const file of markup) {
    if (HELD.some((held) => file === held || (held.endsWith("/") && file.startsWith(held)))) continue;
    for (const copy of copyIn(readFileSync(join(SRC, file), "utf8"))) {
      const word = smallWord(copy.words);
      if (word) small.push(`${file}:${copy.line} ${copy.where} "${copy.words}": "${word}" starts small`);
    }
  }
  assert.deepEqual(small, []);
});

test("every file held out of the rule still exists, so the list shrinks and never rots", () => {
  for (const held of HELD) assert.ok(existsSync(join(SRC, held)), `${held} is gone: take it off the list`);
});

test("a page's title, which is its heading and its tab's title, is in title case", () => {
  for (const route of ROUTES) assert.equal(smallWord(route.title), undefined, `${route.name}: "${route.title}"`);
});

test("the data policy's parts are headed in title case", () => {
  for (const section of DATA_POLICY) assert.equal(smallWord(section.title), undefined, section.title);
});
