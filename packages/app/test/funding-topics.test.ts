import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { catalogEntries, parseBundle } from "../src/funding/catalog.ts";
import { evaluateCatalog, rubricProject } from "../src/funding/engine.ts";
import { fundingFit } from "../src/funding/fit.ts";
import { fundingKey, keptAskWords, projectFrom, projectFromKey } from "../src/funding/profile.ts";
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
const english = card(
  "Seed Commons Valley",
  "We run regenerative agriculture and agroecology training for smallholder farmers, covering soil health, seed saving and food sovereignty.",
);

test("a Portuguese or Spanish card is ranked on the catalog topics its words name (DL-142)", () => {
  for (const [draft, topics] of [
    [portuguese, ["cooking", "food", "school", "neighborhood", "children", "families", "healthy"]],
    [spanish, ["ocean", "care", "coastal", "training", "women", "youth", "journalism", "fishers"]],
  ] as const) {
    const project = projectFrom(draft)!;
    // The card itself is unchanged: it holds the person's words and no themes.
    assert.deepEqual(project.tags, []);
    assert.deepEqual([...rubricProject(project).tags].sort(), [...topics].sort(), "the matcher gives the rubric the topics its words name");
    const results = evaluateCatalog(bundle, project, now);
    const well = results.filter((result) => ["strong", "good"].includes(fundingFit(result.thematicFit.score) ?? ""));
    assert.ok(well.length > 0, `${draft.confirmed!.name} has funds that may fit it well`);
    for (const result of well) assert.ok(result.thematicFit.evidenceTerms.some((term) => (topics as readonly string[]).includes(term)));
    const line = fundingFitsLine(fundingFits(entries, results, now, Number.POSITIVE_INFINITY));
    assert.match(line, /^\d+ funds? may fit this card well\. (Each|It) needs a check with the funder\.$/u);
    assert.doesNotMatch(line, /eligib/iu, "a fit is never an eligibility decision");
  }
});

test("an English card with no kept needs or offers reaches the rubric exactly as before", () => {
  const project = projectFrom(english)!;
  const { asks: _asks, ...before } = project;
  assert.deepEqual(rubricProject(project), before);
});

const item = (title: string, decision: AskItem["decision"], over: Partial<AskItem["value"]> = {}): AskItem => ({
  id: crypto.randomUUID(),
  sourceKey: null,
  fingerprint: title,
  decision,
  decisionBeforeRemove: null,
  value: { ...EMPTY_ASK, title, capitalForms: ["financial"], exchangeTerms: ["open"], ...over },
});
const withAsks = (draft: DeviceDraft, needs: AskItem[], offers: AskItem[] = []): DeviceDraft => ({
  ...draft,
  needs: { ...draft.needs, items: needs },
  offers: { ...draft.offers, items: offers },
});

test("the words of kept needs and offers add topics; a suggestion in pencil adds none", () => {
  const draft = withAsks(
    portuguese,
    [item("Uma bomba de água", "kept", { purpose: "Regar a horta" }), item("Sementes de floresta", "pencil")],
    [item("Oficinas para mulheres", "kept", { audience: "Mulheres do bairro" })],
  );
  const asks = keptAskWords(draft);
  assert.deepEqual(asks, ["Uma bomba de água", "Regar a horta", "Oficinas para mulheres", "Mulheres do bairro"]);
  const tags = rubricProject(projectFrom({ ...draft, asks })!).tags;
  assert.ok(tags.includes("water") && tags.includes("women"));
  assert.ok(!tags.includes("forest"), "the pencil suggestion is not on the card");
  // An English card's kept need adds the topics it names, which then weigh as themes do.
  const need = rubricProject(projectFrom({ ...english, asks: ["Water tanks for the farm"] })!).tags;
  assert.deepEqual(need, ["water"]);
});

test("Funding ranks again when a kept need, offer or detail changes, and not while one is typed", () => {
  const draft = withAsks(portuguese, [item("Uma bomba de água", "kept")]);
  const key = fundingKey(draft);
  // Typing in a box or in the details dialog leaves the key alone.
  assert.equal(fundingKey({ ...draft, needs: { ...draft.needs, composer: "Mais sementes" } }), key);
  assert.equal(fundingKey({ ...draft, funding: { ...draft.funding, editor: draft.funding.form } }), key);
  // A suggestion in pencil is not on the card either.
  assert.equal(fundingKey(withAsks(draft, [...draft.needs.items, item("Sementes", "pencil")])), key);
  // A kept change ranks again.
  assert.notEqual(fundingKey(withAsks(draft, [...draft.needs.items, item("Sementes", "kept")])), key);
  assert.notEqual(fundingKey({ ...draft, funding: { ...draft.funding, form: { ...draft.funding.form, workCountries: "BR" } } }), key);
  // The key gives back the project the draft gives.
  assert.deepEqual(projectFromKey(key), projectFrom({ ...draft, asks: keptAskWords(draft) }));
});
