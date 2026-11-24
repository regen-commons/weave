// A change to a checked card's first step leaves its needs and offers checked, and one Continue
// brings the person back to the card and its matches (DL-113, 23 November 2026).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { parseDocument, parseSaved } from "@weave/api/account-contract";
import { loadedDraft } from "../src/account/document.ts";
import { revise } from "../src/describe/contracts.ts";
import { continueDescribe, editFields, fieldsForm } from "../src/describe/fill.ts";
import { afterInitiative, cardRoute, onlyInitiativeWaits } from "../src/initiative/status.ts";
import { addEntry } from "../src/intake/entries.ts";
import { intakeComplete } from "../src/intake/finish.ts";

const source = (path: string) => readFileSync(fileURLToPath(new URL(`../src/${path}`, import.meta.url)), "utf8");
const saved = parseSaved({
  id: "b3000000-0000-4000-8000-000000000001",
  revision: 1,
  updatedAt: "2026-11-05T00:00:00Z",
  document: parseDocument(JSON.parse(readFileSync(new URL("../../api/src/test-data/account.json", import.meta.url), "utf8"))),
});
const complete = loadedDraft(saved, "b1000000-0000-4000-8000-000000000001");

test("a change on the first step un-checks only that step: needs and offers stay checked", () => {
  assert.ok(intakeComplete(complete), "the example card starts checked");
  for (const change of [{ name: "Orchard learning circle" }, { where: "Upper Valley; Lower Valley" }, { about: "Families restore an orchard." }, { links: "orchardcircle.example.org" }]) {
    const edited = editFields(complete, { ...fieldsForm(complete), ...change });
    assert.equal(cardRoute(edited), "initiative", JSON.stringify(change));
    assert.equal(onlyInitiativeWaits(edited), true, "its needs and offers are still checked");
    assert.deepEqual([edited.needs, edited.offers], [complete.needs, complete.offers], "the lists are as they were");
  }
});

test("Continue on the first step goes back to the card when its lists are checked, and on to needs otherwise", () => {
  const edited = editFields(complete, { ...fieldsForm(complete), name: "Orchard learning circle" });
  const back = continueDescribe(edited);
  // One Continue, not three: the card is checked again and its page shows the matches.
  assert.equal(afterInitiative(back), "your-initiative");
  assert.ok(intakeComplete(back));
  assert.equal(back.confirmed!.name, "Orchard learning circle");
  // A list changed since its check still waits, so the steps go on in order.
  const needsChanged = revise(edited, { needs: addEntry(edited.needs, "Seedlings for the orchard") });
  assert.equal(onlyInitiativeWaits(needsChanged), false);
  assert.equal(afterInitiative(continueDescribe(needsChanged)), "needs");
  // A card on its first pass goes to needs, as it always has.
  const first = editFields(revise(complete, { needs: { ...complete.needs, reviewedVersion: null } }), fieldsForm(complete));
  assert.equal(afterInitiative(continueDescribe(first)), "needs");
});

test("the first step's Continue follows afterInitiative, and the card's page says when only that step waits", () => {
  const describe = source("pages/Describe.tsx");
  assert.match(describe, /card = controller\.change\(continueDescribe\)/u);
  assert.match(describe, /navigate\(fixtureHref\(pathTo\(afterInitiative\(card\)\)/u);
  assert.doesNotMatch(describe, /navigate\(fixtureHref\(pathTo\("needs"\)/u);
  assert.match(source("pages/YourInitiative.tsx"), /onlyInitiativeWaits\(draft\)\s*\?\s*"Your initiative changed\. Check it once more to see your matches\./u);
});
