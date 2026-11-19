import assert from "node:assert/strict";
import { test } from "node:test";
import { shownTheme, switchedTheme } from "../src/theme.ts";

test("the theme on screen is the pinned one, or the system's while none is pinned", () => {
  assert.equal(shownTheme("system", false), "light");
  assert.equal(shownTheme("system", true), "dark");
  assert.equal(shownTheme("light", true), "light");
  assert.equal(shownTheme("dark", false), "dark");
});

test("the header's switch changes to the other theme, and follows the system again when the two agree (DL-079)", () => {
  // On a light system: light to dark pins dark, and back goes to following the system.
  assert.equal(switchedTheme("system", false), "dark");
  assert.equal(switchedTheme("dark", false), "system");
  // On a dark system the same, the other way round.
  assert.equal(switchedTheme("system", true), "light");
  assert.equal(switchedTheme("light", true), "system");
  // A pin that already matches the system is a pin in name only; the switch still changes what is on screen.
  assert.equal(switchedTheme("light", false), "dark");
  assert.equal(switchedTheme("dark", true), "light");
  for (const theme of ["system", "light", "dark"] as const)
    for (const systemDark of [false, true]) {
      const next = switchedTheme(theme, systemDark);
      assert.notEqual(shownTheme(next, systemDark), shownTheme(theme, systemDark), `${theme} always changes`);
    }
});
