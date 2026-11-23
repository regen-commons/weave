import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { MEASURED, stuckLength } from "../src/ui/header-height.ts";

const templates = readFileSync(fileURLToPath(new URL("../../design-system/css/templates.css", import.meta.url)), "utf8");

test("the stuck header ends at its height less the banner scrolled away above the window", () => {
  assert.equal(stuckLength(105, -40), "65px");
  // Wider text put space under the banner: the bar sits lower, and so does what sticks under it.
  assert.equal(stuckLength(133, -40), "93px");
  assert.equal(stuckLength(65, 0), "65px", "no banner");
  assert.equal(stuckLength(65, Number.NaN), "65px", "a header that does not stick");
  for (const size of [undefined, 0, 30, Number.NaN]) assert.equal(stuckLength(size, -40), undefined, String(size));
});

test("the measure overrides the design system's bar height, which is a control and its padding until measured", () => {
  assert.equal(MEASURED, "--app-header-height");
  assert.ok(templates.includes(":root { --app-header-height: calc(var(--control-height) + 2 * var(--space-2) + var(--border-thin)); }"));
});
