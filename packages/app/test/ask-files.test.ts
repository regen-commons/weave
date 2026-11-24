// Files are added on the describe step only (24 November 2026). The add files eval found that no
// file of any type makes a need or offer card, so Needs and Offers no longer offer to add one.
// Files a draft already holds on those steps still show there, can be removed there, and go out in
// the device export with every other file (test/data.test.ts).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { attachedFiles } from "../src/describe/device-removal.ts";
import { newDraft, revise } from "../src/describe/contracts.ts";

const read = (path: string) => readFileSync(fileURLToPath(new URL(`../src/${path}`, import.meta.url)), "utf8");

test("Needs and Offers offer no way to add a file", () => {
  const step = read("pages/AskStep.tsx");
  assert.doesNotMatch(step, /Add Files/u);
  assert.doesNotMatch(step, /type="file"/u);
  assert.doesNotMatch(step, /addStepFiles/u);
});

test("files a draft already holds on Needs and Offers still show there and can be removed", () => {
  const step = read("pages/AskStep.tsx");
  const list = step.match(/<AttachmentList[\s\S]*?\/>/u)?.[0] ?? "";
  assert.match(list, /files=\{step\.attachments\}/u);
  assert.match(list, /onRemoveFile=/u);
  // With no Add Files after the list, the focus goes to the step's heading once the last file goes.
  assert.match(list, /afterLast=\{title\}/u);
  assert.match(step, /<h2 [^>]*tabIndex=\{-1\} ref=\{title\}>/u);
});

test("the describe step still offers Add Files", () => {
  const describe = read("pages/Describe.tsx");
  assert.match(describe, /Add Files/u);
  assert.match(describe, /type="file"/u);
});

test("a file kept on a needs or offers step is still one of the draft's files", () => {
  const source = newDraft();
  const file = { id: crypto.randomUUID(), name: "plan.md", type: "text/markdown", bytes: 4, blob: new Blob(["plan"]) };
  const draft = revise(source, { needs: { ...source.needs, attachments: [file] }, offers: { ...source.offers, attachments: [file] } }, true);
  assert.equal(attachedFiles(draft), 2);
});
