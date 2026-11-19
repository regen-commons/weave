// On a phone, Enter in a one-line field goes on to the next field of its form (DL-096). A hardware
// keyboard keeps Enter for sending the form, and a word still being composed keeps it for itself.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { fieldAfter, isLineField, isPlainEnter, type EnterPress, type FormControl } from "../src/ui/next-field.ts";

const press = (change: Partial<EnterPress> = {}): EnterPress => ({
  key: "Enter", shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, isComposing: false, keyCode: 13, ...change,
});
const control = (tagName: string, type?: string, disabled = false): FormControl => ({ tagName, type, disabled });

test("only Enter by itself moves on, and never while a word is being composed", () => {
  assert.equal(isPlainEnter(press()), true);
  assert.equal(isPlainEnter(press({ key: "a" })), false);
  for (const held of ["shiftKey", "ctrlKey", "metaKey", "altKey"] as const) assert.equal(isPlainEnter(press({ [held]: true })), false, held);
  // An input method takes Enter to accept its suggestion. Safari says so only through the key code.
  assert.equal(isPlainEnter(press({ isComposing: true })), false);
  assert.equal(isPlainEnter(press({ keyCode: 229 })), false);
});

test("Enter moves on from a one-line field a person types in, and from nothing else", () => {
  for (const type of [undefined, "text", "url", "email", "tel", "search", "number"]) assert.equal(isLineField(control("INPUT", type)), true, String(type));
  for (const type of ["checkbox", "radio", "submit", "button", "hidden", "file", "range"]) assert.equal(isLineField(control("INPUT", type)), false, type);
  // Enter in a textarea is a new line.
  assert.equal(isLineField(control("TEXTAREA", "textarea")), false);
  assert.equal(isLineField(control("SELECT", "select-one")), false);
});

test("the focus goes to the next field that is filled in, past buttons and anything hidden or off", () => {
  const name = control("INPUT", "text");
  const hidden = control("INPUT", "hidden");
  const off = control("INPUT", "text", true);
  const add = control("BUTTON", "button");
  const where = control("INPUT", "text");
  const about = control("TEXTAREA", "textarea");
  const send = control("BUTTON", "submit");
  const form = [name, hidden, off, add, where, about, send];
  assert.equal(fieldAfter(form, name), where);
  assert.equal(fieldAfter(form, where), about, "a textarea takes the focus, though Enter in it is a new line");
  // The last field has nowhere to go on to, so Enter sends the form as it always did.
  assert.equal(fieldAfter(form, about), null);
  assert.equal(fieldAfter([name, send], name), null);
  assert.equal(fieldAfter(form, control("INPUT", "text")), null, "a field that is not in the form");
  // A checkbox and a select are fields too.
  const pick = control("SELECT", "select-one");
  const tick = control("INPUT", "checkbox");
  assert.equal(fieldAfter([name, tick, pick], name), tick);
});

test("a field promises Next only in a form that moves the focus on, and only on a phone's own keyboard", () => {
  const source = (path: string) => readFileSync(fileURLToPath(new URL(`../src/${path}`, import.meta.url)), "utf8");
  // The four fields are drawn in one form, and Suggest a fund has its own three.
  for (const file of ["pages/Describe.tsx", "funding/SuggestFund.tsx"])
    assert.match(source(file), /<form className="rc-form"[^>]*onKeyDown=\{moveOnEnter\}>/u, `${file} moves the focus on`);
  const fields = source("ui/RecordFields.tsx");
  assert.equal(fields.split('enterKeyHint="next"').length - 1, 2, "Name and Where, the two one-line fields");
  assert.equal(source("funding/SuggestFund.tsx").split('enterKeyHint="next"').length - 1, 2, "the fund's name and its link");
  // No other file promises it.
  for (const file of ["pages/Describe.tsx", "pages/AskStep.tsx", "pages/Home.tsx", "ui/FilterBar.tsx"])
    assert.doesNotMatch(source(file), /enterKeyHint="next"/u, file);
  const behaviour = source("ui/next-field.ts");
  assert.ok(behaviour.includes('window.matchMedia("(pointer: coarse)").matches'), "a keyboard on the desk still sends the form");
  assert.ok(behaviour.includes("if (!next) return;"), "the last field sends the form");
});
