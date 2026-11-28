// Every dialog closes on a press outside and on Escape (DL-082). The behaviour is the design
// system's; this drives it with a stand-in for the dialog element, as a browser without `closedby`.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { connectSheet } from "@regen-commons/design-system/sheet";

const BOX = { left: 300, right: 900, top: 100, bottom: 600, width: 600, height: 500 };
class FakeDialog extends EventTarget {
  open = true;
  dataset: Record<string, string> = {};
  attributes: Record<string, string> = {};
  style = { setProperty() {}, removeProperty() {} };
  getAnimations() { return []; }
  getBoundingClientRect() { return BOX; }
  setAttribute(name: string, value: string) { this.attributes[name] = value; }
  querySelector() { return null; }
  close() { this.open = false; this.dispatchEvent(new Event("close")); }
}
function press(dialog: FakeDialog, type: "pointerdown" | "click", x: number, y: number) {
  dialog.dispatchEvent(Object.assign(new Event(type), { clientX: x, clientY: y, isPrimary: true, button: 0 }));
}
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));
function connect(lightDismiss: boolean) {
  // A browser that does not know `closedby`, so the behaviour's own press handling runs.
  (globalThis as { HTMLDialogElement?: unknown }).HTMLDialogElement = class {};
  const dialog = new FakeDialog();
  const sheet = connectSheet(dialog as unknown as HTMLDialogElement, { lightDismiss });
  return { dialog, sheet };
}

test("a press outside the dialog's box closes it", async () => {
  const { dialog, sheet } = connect(true);
  press(dialog, "pointerdown", 40, 40);
  press(dialog, "click", 40, 40);
  await settled();
  assert.equal(dialog.open, false);
  sheet.dispose();
});

test("a press inside, or one that only ends outside, closes nothing", async () => {
  const { dialog, sheet } = connect(true);
  press(dialog, "pointerdown", 500, 300);
  press(dialog, "click", 500, 300);
  await settled();
  assert.equal(dialog.open, true, "a press on the dialog itself");
  // Text selected from inside the dialog to outside it ends with a click outside.
  press(dialog, "pointerdown", 500, 300);
  press(dialog, "click", 40, 40);
  await settled();
  assert.equal(dialog.open, true, "a drag that began inside");
  sheet.dispose();
});

test("Escape closes it, and a dialog that asks for no light dismiss stays open under a press outside", async () => {
  const escaped = connect(true);
  escaped.dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
  await settled();
  assert.equal(escaped.dialog.open, false);
  const kept = connect(false);
  press(kept.dialog, "pointerdown", 40, 40);
  press(kept.dialog, "click", 40, 40);
  await settled();
  assert.equal(kept.dialog.open, true);
  for (const { sheet } of [escaped, kept]) sheet.dispose();
});

test("a browser that knows `closedby` is asked to close on any press outside", () => {
  (globalThis as { HTMLDialogElement?: unknown }).HTMLDialogElement = class { get closedBy() { return ""; } };
  const dialog = new FakeDialog();
  const sheet = connectSheet(dialog as unknown as HTMLDialogElement, { lightDismiss: true });
  assert.equal(dialog.attributes.closedby, "any");
  sheet.dispose();
});

test("the app asks for it on every dialog, a task included, and a task under way can still refuse", () => {
  const read = (path: string) => readFileSync(fileURLToPath(new URL(`../src/${path}`, import.meta.url)), "utf8");
  const dialog = read("ui/Dialog.tsx");
  assert.match(dialog, /connectSheet\(element, \{ lightDismiss: true \}\)/u);
  assert.doesNotMatch(dialog, /presentation !== "task"/u, "no presentation is left out");
  assert.match(dialog, /blockClose/u, "work under way keeps its dialog open");
  // Every dialog in the app is this one, so none can opt out.
  assert.doesNotMatch(read("ui/TaskDialog.tsx"), /<dialog\b/u);
  assert.match(read("ui/TaskDialog.tsx"), /keepFocusOnPage/u, "focus comes back to the page when its invoker is gone");
});

test("a question that replaces or withdraws something is asked in a dialog, not in a notice that pushes the page down (DL-085)", async () => {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const source = (path: string) => readFileSync(fileURLToPath(new URL(`../src/${path}`, import.meta.url)), "utf8");
  for (const file of ["account/AccountSection.tsx", "pages/YourInitiatives.tsx"]) {
    assert.doesNotMatch(source(file), /aria-label="Confirm/u, `${file} asks in a notice`);
    assert.match(source(file), /<TaskDialog\b/u, file);
  }
  assert.match(source("account/AccountSection.tsx"), /Load This Saved Card\?/u);
  // Starting an initiative replaces nothing, so it asks nothing (DL-112).
  for (const file of ["account/AccountSection.tsx", "pages/YourInitiatives.tsx"])
    assert.doesNotMatch(source(file), /Start a new initiative\?|Back up (this card )?and start new/iu, file);
  // Sharing for matching ended in DL-155 step 5, so there is no share left to withdraw and nothing to ask.
  assert.doesNotMatch(source("partners/PartnerExperience.tsx"), /Withdraw From Matching/u);
});
