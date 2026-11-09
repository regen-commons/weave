// The app renders the design system's classes and owns no visual CSS (DL-015).
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { CAPITALS } from "../src/capitals.ts";
import { ICON_NAMES } from "../src/ui/icons.ts";

const APP = fileURLToPath(new URL("../", import.meta.url));
const SYSTEM = fileURLToPath(new URL("../../design-system/", import.meta.url));

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
}

const source = files(join(APP, "src"));
const markup = [...source.filter((path) => path.endsWith(".tsx")), join(APP, "index.html")];
const read = (path: string) => readFileSync(path, "utf8");
const relativeName = (path: string) => path.slice(APP.length);

test("the app has no CSS of its own", () => {
  assert.deepEqual(source.filter((path) => /\.(css|scss|sass|less)$/.test(path)).map(relativeName), []);
});

test("every rc- class the app uses exists in the design system's CSS", () => {
  const css = files(join(SYSTEM, "css")).filter((path) => path.endsWith(".css")).map(read).join("\n").replace(/\/\*[\s\S]*?\*\//g, "");
  const defined = new Set([...css.matchAll(/\.(rc-[a-z0-9-]+)/g)].map((match) => match[1]));
  for (const path of markup) {
    for (const match of read(path).matchAll(/className="([^"]+)"/g)) {
      for (const name of match[1]!.split(/\s+/)) {
        assert.ok(!name.startsWith("rc-") || defined.has(name), `${relativeName(path)} uses ${name}, which the design system does not define`);
        assert.ok(name.startsWith("rc-"), `${relativeName(path)} uses ${name}; use a design-system class`);
      }
    }
  }
});

test("markup uses no inline styles or raw values", () => {
  for (const path of markup) {
    const text = read(path);
    assert.doesNotMatch(text, /\bstyle=/, `${relativeName(path)} sets an inline style`);
    assert.doesNotMatch(text, /#[0-9a-fA-F]{3,8}\b(?!["'`]?[\w-]*\s*[:{])/, `${relativeName(path)} has a hex colour`);
    assert.doesNotMatch(text, /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/, `${relativeName(path)} has a raw colour`);
    assert.doesNotMatch(text, /\b\d+(?:\.\d+)?px\b/, `${relativeName(path)} has a raw pixel value`);
  }
});

test("forms of capital and icons match what the design system defines", () => {
  const css = files(join(SYSTEM, "css")).filter((path) => path.endsWith(".css")).map(read).join("\n");
  const voice = read(join(SYSTEM, "brand/VOICE.md"));
  for (const capital of CAPITALS) {
    assert.ok(css.includes(`[data-capital="${capital.key}"]`), `the design system has no colour for ${capital.key}`);
    assert.ok(voice.includes(`| ${capital.label} |`), `VOICE.md has no plain name "${capital.label}"`);
    assert.ok(voice.includes(`| ${capital.title} |`), `VOICE.md has no framework title "${capital.title}"`);
  }
  const sprite = new Set([...read(join(SYSTEM, "brand/icons.svg")).matchAll(/<symbol id="([^"]+)"/g)].map((match) => match[1]));
  const used = markup.flatMap((path) => [...read(path).matchAll(/icons\.svg#([\w-]+)/g)].map((match) => match[1]));
  for (const name of [...ICON_NAMES, ...used]) assert.ok(sprite.has(name), `brand/icons.svg has no icon "${name}"`);
});

test("copy follows the voice rules: no em dashes, arrows or middle dots", () => {
  for (const path of [...source, join(APP, "index.html")]) {
    assert.doesNotMatch(read(path), /[—→·]/, `${relativeName(path)} breaks the voice rules`);
  }
});
