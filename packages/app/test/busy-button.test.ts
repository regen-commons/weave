import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { busyProps } from "../src/account/busy.ts";

const read = (file: string) => readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");

test("the button being pressed keeps the focus, and only a button nobody pressed is disabled (A-14)", () => {
  // Carrying its own press: focusable, announced as busy and unavailable, never natively disabled.
  assert.deepEqual(busyProps(true), { "data-busy": "keep", "aria-busy": true, "aria-disabled": true, disabled: false });
  assert.equal(busyProps(true, true).disabled, false, "not even when the page reports the same work back as a block");
  // At rest it carries no state at all.
  assert.deepEqual(busyProps(false), { "data-busy": "keep", "aria-busy": undefined, "aria-disabled": undefined, disabled: false });
  // Blocked for any other reason, another button's work included: disabled as before, with no focus to lose.
  assert.deepEqual(busyProps(false, true), { "data-busy": "keep", "aria-busy": undefined, "aria-disabled": undefined, disabled: true });
});

test("no account button that starts work is disabled by its own press", () => {
  // A pressed button written as disabled={busy} loses the focus to the page's body, inside an open dialog too.
  const dialog = read("account/DeleteSavedCard.tsx");
  assert.doesNotMatch(dialog, /disabled=\{busy\}/u);
  assert.equal(dialog.split("{...busyProps(busy)}").length - 1, 2, "Delete From Your Account and Reload Saved Cards");
  assert.match(dialog, /aria-disabled=\{busy \|\| undefined\} data-confirm-cancel/u, "Cancel can hold the focus a failed delete gives it");
  // An aria-disabled button still takes presses, so every handler declines one while busy.
  assert.match(dialog, /async function confirm\(\) \{\s*if \(!chosen \|\| busy\) return;/u);
  assert.match(dialog, /async function reload\(\) \{\s*if \(busy\) return;/u);
  assert.match(dialog, /onClick=\{\(\) => \{ if \(busy\) return; returnTo\.current/u);

  const section = read("account/AccountSection.tsx");
  assert.doesNotMatch(section, /void run\((?!action\))/u, "work starts through start(), which names the pressed button");
  assert.match(section, /function start\(name: string, action: \(\) => Promise<void>\) \{\s*if \(busy\) return;/u);
  for (const name of ["check", "sign-in", "save", "begin", "more", "refresh", "load"]) {
    assert.match(section, new RegExp(`\\{\\.\\.\\.pressed\\("${name}"`, "u"), name);
    assert.match(section, new RegExp(`start\\("${name}", `, "u"), name);
    assert.match(section, new RegExp(`\\{spinner\\("${name}"\\)\\}`, "u"), name);
  }
  // A field the person may be typing in is read-only while the form is sent, never disabled.
  assert.match(section, /readOnly=\{busy\} disabled=\{!ready\}/u);

  const signOut = read("account/SignOutAction.tsx");
  assert.match(signOut, /aria-disabled=\{busy \|\| undefined\}\s*disabled=\{disabled && !busy\}/u);
  assert.match(signOut, /async function signOut\(\) \{\s*if \(busy\) return;/u);
  assert.match(read("account/PrivateSaveAction.tsx"), /\{\.\.\.busyProps\(busy, /u);
  assert.match(read("pages/Settings.tsx"), /\{\.\.\.busyProps\(busy, !example\.state\.identity\)\}/u);
});
