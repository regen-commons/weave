import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { catalogEntries, parseBundle } from "../src/funding/catalog.ts";
import { evaluateCatalog } from "../src/funding/engine.ts";
import { fundingFit } from "../src/funding/fit.ts";
import { keptAskWords, projectFrom } from "../src/funding/profile.ts";
import { fundingFits, fundingFitsLine } from "../src/funding/select.ts";
import { confirmDraft, EMPTY_INITIATIVE, newDraft, revise, type DeviceDraft } from "../src/describe/contracts.ts";
import { EMPTY_ASK, type AskItem } from "../src/intake/contracts.ts";

const read = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../../../dist/data/${name}.json`, import.meta.url), "utf8"));
const bundle = parseBundle(read("funders"), read("eligibility-rules"), read("program-conditions"));
const entries = catalogEntries(bundle);
const now = new Date("2026-11-23T12:00:00Z");

/** A card typed on the describe step and kept, with no themes, as every card has since DL-127. */
const card = (name: string, description: string) =>
  confirmDraft(revise(newDraft(), { proposal: { ...EMPTY_INITIATIVE, name, description, themes: [] }, proposalVersion: 0 }));
// Invented words, in the shape of the walkthrough's Portuguese and Spanish cards.
const portuguese = card(
  "Horta da Vila",
  "Uma cozinha comunitária que cultiva uma horta com a escola do bairro. As crianças plantam, as famílias cozinham juntas e oferecemos oficinas de alimentação saudável.",
);
const spanish = card(
  "Radio del Mar",
  "Una radio comunitaria hecha por pescadoras artesanales. Grabamos programas sobre el mar y el cuidado de la costa, y capacitamos a mujeres jóvenes en periodismo.",
);
const levels = (draft: DeviceDraft, tags?: string[]) => {
  const project = projectFrom(draft)!;
  const results = evaluateCatalog(bundle, tags ? { ...project, tags } : project, now);
  return { project, results, line: fundingFitsLine(fundingFits(entries, results, now, Number.POSITIVE_INFINITY)) };
};

test("a Portuguese or Spanish card shares topics with the catalog, where it shared none (DL-142)", () => {
  for (const [draft, topics] of [
    [portuguese, ["cooking", "food", "school", "neighborhood", "children", "families", "healthy"]],
    [spanish, ["ocean", "care", "coastal", "training", "women", "youth", "journalism", "fishers"]],
  ] as const) {
    // Before: the rubric read only the words as typed, and the catalog is in English.
    const before = levels(draft, []);
    const fit = (result: (typeof before.results)[number]) => fundingFit(result.thematicFit.score);
    assert.ok(!before.results.some((result) => fit(result) === "strong" || fit(result) === "good"));
    assert.ok(before.results.filter((result) => fit(result) === "possible").length <= 1);

    const after = levels(draft);
    assert.deepEqual([...after.project.tags].sort(), [...topics].sort(), "the card's themes are the catalog topics its words name");
    const well = after.results.filter((result) => ["strong", "good"].includes(fundingFit(result.thematicFit.score) ?? ""));
    assert.ok(well.length >= 2, `${draft.confirmed!.name} now has funds that may fit it well`);
    for (const result of well) assert.ok(result.thematicFit.evidenceTerms.some((term) => topics.includes(term as never)));
    assert.match(after.line, /^\d+ funds? may fit this card well\. (Each|It) needs a check with the funder\.$/u);
    assert.doesNotMatch(after.line, /eligib/iu, "a fit is never an eligibility decision");
  }
});

test("an English card is ranked exactly as before: nothing is added to its words", () => {
  const english = card(
    "Seed Commons Valley",
    "We run regenerative agriculture and agroecology training for smallholder farmers, covering soil health, seed saving and food sovereignty.",
  );
  assert.deepEqual(projectFrom(english)!.tags, []);
});

const item = (title: string, decision: AskItem["decision"], over: Partial<AskItem["value"]> = {}): AskItem => ({
  id: crypto.randomUUID(),
  sourceKey: null,
  fingerprint: title,
  decision,
  decisionBeforeRemove: null,
  value: { ...EMPTY_ASK, title, capitalForms: ["financial"], exchangeTerms: ["open"], ...over },
});

test("the words of kept needs and offers add topics; a suggestion in pencil adds none", () => {
  const draft = portuguese;
  const asks = keptAskWords({
    needs: { ...draft.needs, items: [item("Uma bomba de água", "kept", { purpose: "Regar a horta" }), item("Sementes de floresta", "pencil")] },
    offers: { ...draft.offers, items: [item("Oficinas para mulheres", "kept", { audience: "Mulheres do bairro" })] },
  });
  assert.deepEqual(asks, ["Uma bomba de água", "Regar a horta", "Oficinas para mulheres", "Mulheres do bairro"]);
  const tags = projectFrom({ ...draft, asks })!.tags;
  assert.ok(tags.includes("water") && tags.includes("women"));
  assert.ok(!tags.includes("forest"), "the pencil suggestion is not on the card");
});

test("Funding ranks again when a kept need or offer changes, not while its box is typed in", () => {
  const hook = readFileSync(new URL("../src/funding/use-catalog.ts", import.meta.url), "utf8");
  assert.match(hook, /const subjectKey = JSON\.stringify\(\{[^;]*?asks: keptAskWords\(draft\),\s*\}\);/u);
  assert.match(hook, /projectFrom\(\{ \.\.\.DeviceDraftSchema\.pick\(\{ id: true, confirmed: true, funding: true \}\)\.parse\(card\), asks \}\)/u);
});
