// A phone's navigation (DL-086): the tab bar is fixed with room kept for it, the app bar holds no
// Settings gear, and the You tab offers the theme and Settings in every state of its page.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { THEME_CHOICES, type Theme } from "../src/theme.ts";

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
const source = (path: string) => read(`../src/${path}`);
const css = (file: string) => read(`../../design-system/css/${file}`).replace(/\/\*[\s\S]*?\*\//gu, "");
/** The declarations of every rule that has exactly this selector. */
function declarations(sheet: string, selector: string): string {
  const rules = sheet.split("}").filter((part) => part.slice(0, part.indexOf("{")).trim() === selector);
  assert.notEqual(rules.length, 0, `${selector} has a rule`);
  return rules.map((part) => part.slice(part.indexOf("{") + 1)).join("\n");
}

test("the theme choice offers each theme once, the system's first", () => {
  const every: readonly Theme[] = ["system", "light", "dark"];
  assert.deepEqual(THEME_CHOICES.map((choice) => choice.value), every);
  assert.deepEqual(THEME_CHOICES.map((choice) => choice.label), ["System", "Light", "Dark"]);
});

test("the tab bar is fixed to the bottom of the window, clear of the home indicator, and the page keeps room for it", () => {
  const bar = declarations(css("organisms.css"), ".rc-bottom-nav");
  assert.match(bar, /position: fixed;/u);
  assert.match(bar, /inset-block-end: 0;/u);
  assert.match(bar, /padding-block-end: env\(safe-area-inset-bottom\);/u);
  const templates = css("templates.css");
  assert.match(templates, /\.rc-page \{ --bottom-nav-height: /u);
  assert.match(
    templates,
    /\.rc-page:has\(> \.rc-bottom-nav\) \{ padding-block-end: calc\(var\(--bottom-nav-height\) \+ env\(safe-area-inset-bottom\)\); \}/u,
  );
  // The insets are zero unless the page draws to the screen's edges.
  assert.match(read("../index.html"), /<meta name="viewport" content="[^"]*viewport-fit=cover[^"]*">/u);
});

test("a phone's app bar has no Settings gear, and Sign in stays at its far end", () => {
  const header = source("ui/AppHeader.tsx");
  assert.doesNotMatch(header, /pathTo\("settings"\)/u);
  assert.doesNotMatch(header, /name="settings"/u);
  assert.match(header, /<SignInButton\b/u);
});

test("the You tab offers the theme and Settings on a phone in each state of its page", () => {
  const page = source("pages/YourInitiatives.tsx");
  // Nothing on the device, a card on the device, and signed in.
  assert.equal(page.match(/<PhoneSettings \/>/gu)?.length, 3);
  const section = page.slice(page.indexOf("function PhoneSettings"), page.indexOf("export function YourInitiatives"));
  assert.match(section, /until="wide"/u);
  assert.match(section, /<ThemeChoice \/>/u);
  assert.match(section, /href=\{pathTo\("settings"\)\}/u);
  // A wide screen keeps its own link, which a phone's section stands in for.
  assert.match(page, /href=\{pathTo\("settings"\)\} variant="quiet" from="wide"/u);
});

test("on a phone a section's title takes a row and its action the next", () => {
  assert.match(
    css("molecules.css"),
    /@container \(width < 37\.5rem\) \{\s*\.rc-section-head \{ display: grid; justify-items: start; \}\s*\}/u,
  );
});

test("the footer marks the one list a phone's tab bar repeats, and its fifth page keeps a door on a phone (DL-093)", () => {
  const footer = source("ui/Footer.tsx");
  assert.match(footer, /<section data-repeats="tabs">\s*<h2 className="rc-footer-title">Weave<\/h2>/u);
  assert.equal(footer.split("data-repeats").length - 1, 1, "Data & Privacy and Regen Commons are not marked");
  // The tab bar has no tab for starting an initiative. Home's first door starts one.
  assert.match(source("pages/Home.tsx"), /<ButtonLink href=\{pathTo\("new-initiative"\)\} variant="primary" size="lg">\s*Start An Initiative/u);
});

test("a tab is not dragged away like a link (DL-095)", () => {
  assert.match(source("ui/BottomNav.tsx"), /<Link[^>]*draggable=\{false\}/su);
});
