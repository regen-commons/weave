// On a phone Home's previews are rows that swipe (DL-090). The layout is the design system's; the
// app's part is that a preview and its loading shapes are the same grid, so nothing jumps when
// the cards arrive.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const source = (path: string) => readFileSync(fileURLToPath(new URL(`../src/${path}`, import.meta.url)), "utf8");
const count = (text: string, part: string) => text.split(part).length - 1;

test("a preview's loading shapes take the preview's own layout", () => {
  const skeleton = source("ui/CardSkeleton.tsx");
  assert.ok(skeleton.includes('<ul className="rc-card-grid" data-preview={preview} aria-hidden="true">'));
  const home = source("pages/Home.tsx");
  assert.ok(home.includes("<CardGridSkeleton kind={kind} preview={preview} />"));
  // Funding closing soon is one row and Recently shared is two, loading or not.
  assert.equal(count(home, 'skeleton("funding", "row")'), 1);
  assert.equal(count(home, '<CardGrid preview="row">'), 1);
  assert.equal(count(home, 'skeleton("initiative", "rows")'), 1);
  assert.equal(count(home, '<CardGrid preview="rows">'), 2);
  // No preview is drawn without its layout, which is what makes it a row on a phone.
  assert.equal(count(home, "<CardGrid>"), 0);
});
