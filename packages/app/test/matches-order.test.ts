// Matches leads with what the step is for: funding that fits the card, then partners for it. Saving
// and sharing sits beside them on a wide screen and follows them on a phone, and the card follows.
// Step 1 has one heading, its title (DL-113 and DL-127, 23 November 2026).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const source = (path: string) => readFileSync(fileURLToPath(new URL(`../src/${path}`, import.meta.url)), "utf8");
const at = (text: string, part: string) => {
  const index = text.indexOf(part);
  assert.notEqual(index, -1, part);
  return index;
};

test("Matches puts Funding That Fits and Partners For You first, then Saving And Sharing, then the card", () => {
  const page = source("pages/YourInitiative.tsx");
  const results = page.slice(at(page, "const results = ("), at(page, "const inFlow"));
  assert.ok(at(results, 'id="finish-funding"') < at(results, 'id="finish-partners"'), "funding comes before partners");
  // The results are the layout's first column; Saving And Sharing is its aside; the card is what follows.
  const layout = page.slice(at(page, "<StepLayout"), at(page, "</StepLayout>"));
  assert.match(layout, /more=\{\s*<Section id="finish-card" title="Your Card">/u);
  assert.match(layout, /<InitiativeRecord named=\{false\}/u);
  assert.ok(at(layout, 'id="saving-sharing"') < at(layout, "{results}"), "the aside is written before the first column's content");
  assert.match(layout, /\{results\}\s*<\/StepLayout>|\{results\}\s*$/u);
  // The step layout draws the first column, then the aside, then what follows: on a phone that is
  // results, Saving And Sharing, the card.
  const layouts = source("ui/layouts.tsx");
  assert.match(layouts, /<div className="rc-step-main">\{children\}<\/div>\s*<aside className="rc-step-aside"[^>]*>\{aside\}<\/aside>\s*\{more && <div className="rc-step-main">\{more\}<\/div>\}/u);
  // The funding block stays the funding session's own.
  assert.match(results, /<FirstFunding \/>/u);
});

test("without partner suggestions, the card's page offers Browse All Initiatives beside the line that says why", () => {
  const partners = source("partners/PartnerExperience.tsx");
  assert.match(partners, /compact \? \(\s*(?:\/\/[^\n]*\n\s*)*<StatusLine\s*actions=\{\s*<ButtonLink href=\{pathTo\("initiatives"\)\} variant="secondary" size="sm">\s*Browse All Initiatives\s*<\/ButtonLink>/u);
  assert.match(partners, /\{unlinkedLine\}\s*<\/StatusLine>/u);
});

test("step 1 asks once: no second heading over the box", () => {
  const describe = source("pages/Describe.tsx");
  assert.doesNotMatch(describe, /Say It In Your Own Words/u);
  assert.doesNotMatch(describe, /describe-talk/u);
});
