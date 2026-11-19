// The browser's bar and an installed app's status bar take the page's surface in either theme
// (DL-087): index.html declares one theme-color for each scheme, and a pinned theme overrides the system.
import assert from "node:assert/strict";
import { test } from "node:test";
import tokens from "@regen-commons/design-system/tokens.json" with { type: "json" };
import { SURFACES, themeColorTags } from "../dev/theme-color.ts";
import { SCHEMES, themeColorMedia } from "../src/theme-color.ts";

test("while no theme is pinned, each scheme's colour applies with the system", () => {
  assert.equal(themeColorMedia(null, "light"), "(prefers-color-scheme: light)");
  assert.equal(themeColorMedia(null, "dark"), "(prefers-color-scheme: dark)");
});

test("a pinned theme's colour always applies and the other never does, whatever the system has", () => {
  for (const pinned of SCHEMES)
    for (const scheme of SCHEMES) assert.equal(themeColorMedia(pinned, scheme), pinned === scheme ? "all" : "not all");
});

test("index.html gets one theme-color for each scheme, in that theme's page surface", () => {
  assert.deepEqual(SURFACES, { light: tokens.themes.light.surface, dark: tokens.themes.dark.surface });
  assert.notEqual(SURFACES.light, SURFACES.dark);
  assert.deepEqual(themeColorTags(), [
    {
      tag: "meta",
      attrs: { name: "theme-color", media: "(prefers-color-scheme: light)", content: SURFACES.light, "data-scheme": "light" },
      injectTo: "head",
    },
    {
      tag: "meta",
      attrs: { name: "theme-color", media: "(prefers-color-scheme: dark)", content: SURFACES.dark, "data-scheme": "dark" },
      injectTo: "head",
    },
  ]);
});
