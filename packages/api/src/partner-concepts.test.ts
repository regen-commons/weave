import assert from "node:assert/strict";
import test from "node:test";
import { expandPartnerText, partnerConcepts, partnerRelatedTerms } from "./partner-concepts.ts";
import { partnerLexicalText } from "./partner-matcher.ts";

test("public index text retrieves different wording and never alters evidence", () => {
  const passage = "Our team practices cartography.";
  const indexed = partnerLexicalText(expandPartnerText(passage));
  assert.ok(indexed.split(" ").includes("mapmaking"));
  assert.ok(indexed.split(" ").includes("cartography"));
  assert.equal(passage, "Our team practices cartography.");
  assert.equal(partnerConcepts("mapping support capital model").size, 0);
  assert.equal(partnerConcepts("cartographyfiction").size, 0);
  assert.deepEqual(partnerRelatedTerms("Mapmaking", passage, "We no longer do GIS mapping"), []);
});

test("phrase normalization handles punctuation, accents and bounded long input", () => {
  assert.deepEqual(partnerRelatedTerms("SOFTWARE TESTING", "Software quality-assurance", ""),
    ["software testing / software quality assurance"]);
  assert.equal(partnerConcepts("quality assurance for furniture").size, 0);
  assert.ok(partnerLexicalText(expandPartnerText(`Cartography ${"word ".repeat(2000)}`)).includes("mapmaking"));
  assert.equal(partnerConcepts(`${"x".repeat(2400)} cartography`).size, 0);
});

test("public search expansion preserves sentence and contrast boundaries", () => {
  for (const text of ["We make art. Conservation of forests.", "We make art; conservation of forests.", "We make art but conservation of forests."])
    assert.equal(expandPartnerText(text).includes("artwork restoration"), false, text);
});
