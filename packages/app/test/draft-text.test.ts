// The copy of a person's words that a storage problem offers (DraftNotice) is for a person to read
// and paste somewhere else, so it reads as the app's own labels do, and never as a program's data.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { newDraft, revise } from "../src/describe/contracts.ts";
import { draftText, fundingText } from "../src/describe/view.ts";
import { emptyAskStep } from "../src/intake/contracts.ts";
import { addEntry } from "../src/intake/entries.ts";
import { changeStep, formFromAsk } from "../src/intake/state.ts";
import { emptyFundingDetails, emptyFundingForm } from "../src/funding/contracts.ts";

const source = (path: string) => readFileSync(fileURLToPath(new URL(`../src/${path}`, import.meta.url)), "utf8");

test("funding details copy as labeled lines, with names for countries and nothing for an empty field", () => {
  const funding = {
    ...emptyFundingDetails(),
    form: { ...emptyFundingForm(), workCountries: "KE, UG", applicantType: "nonprofit" as const, goalMin: "10000", currency: "USD" },
    programAnswers: { "headwater::learning::registered": { answer: "yes" as const, sourceCheckedOn: "2026-11-01" } },
  };
  const text = fundingText(funding);
  assert.equal(
    text,
    [
      "Funding details",
      "Where you work: Kenya, Uganda",
      "Who is applying: Nonprofit",
      "Amount you are looking for: from 10000 USD",
      "",
      "Answers to funding requirements",
      "headwater, learning, registered: Yes, for the requirement as checked on 2026-11-01",
    ].join("\n"),
  );
  // Nothing filled in, nothing written.
  assert.equal(fundingText(emptyFundingDetails()), "");
  assert.doesNotMatch(draftText(newDraft()), /Funding|[{}]/u);
});

test("funding details still open in their dialog are copied exactly as typed, even where no country is known", () => {
  const editor = { ...emptyFundingForm(), workCountries: "Kenia, the valley", usWorkStates: "CA" };
  const text = fundingText({ ...emptyFundingDetails(), editor });
  assert.equal(text, ["Unfinished funding details", "Where you work: Kenia, the valley", "States where you work: CA"].join("\n"));
});

test("needs and offers copy as the card says them, and an unfinished card as its dialog labels it", () => {
  let needs = addEntry(emptyAskStep(), "Seedlings for the valley");
  needs = changeStep(needs, {
    editor: { id: null, form: { ...formFromAsk(), title: "A water pump", amountMax: "800", currency: "USD", purpose: "Dry season" } },
  });
  const text = draftText(revise(newDraft(), { needs }));
  assert.match(text, /Card to check\nSeedlings for the valley\nLiving\nAnywhere\nOpen to anything/u);
  assert.match(text, /Unfinished card\nWhat you need: A water pump\nAmount up to: 800\nCurrency: USD\nWhat you would do with it: Dry season\nWhere: Anywhere\nTerms you would accept: Open to anything\nStatus: Open/u);
  // The description is left out when it only repeats the title, as the card leaves it out.
  assert.equal(text.match(/Seedlings for the valley/gu)?.length, 1);
  assert.doesNotMatch(text, /[{}]|"capitalForms"|"decision"/u);
});

test("every label in the copy is the one its dialog shows, so the two cannot drift apart", () => {
  const funding = source("ui/FundingProfile.tsx");
  for (const label of [
    "Where you work",
    "Where the people you serve live",
    "Where you are based",
    "Where you are registered",
    "Who is applying",
    "Amount you are looking for",
    "States where you work",
    "States where the people you serve live",
  ])
    assert.ok(funding.includes(label), `Details For Funding labels a field "${label}"`);
  const editor = source("ui/AskEditor.tsx");
  for (const label of ["What you need", "What you can offer", "In a line", "Kinds of support", "Amount from", "Amount up to", "Currency", "When it is available", "What you would do with it", "How much, how often", "Who it is for", "Timeframe", "Where", "Terms you would accept", "Status"])
    assert.ok(editor.includes(label), `the need and offer dialog labels a field "${label}"`);
});
