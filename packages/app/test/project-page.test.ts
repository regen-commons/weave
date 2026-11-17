import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseDocument, parseSaved } from "@weave/api/account-contract";
import { accountDocument, loadedDraft } from "../src/account/document.ts";
import { newDraft, revise, type DeviceDraft } from "../src/describe/contracts.ts";
import {
  draftWithRecord,
  placeOnLink,
  suggestionsOnLink,
  waitingSuggestions,
  withProjectDetails,
  withProjectSuggestions,
} from "../src/initiative/import.ts";
import { cardRoute, chosenEntries, publicCard, publicKey, shareable } from "../src/initiative/status.ts";
import { continueBoth, startsByHand, suggestedEntry, suggestionSource } from "../src/intake/ask-page.ts";
import { addEntry } from "../src/intake/entries.ts";
import { intakeComplete } from "../src/intake/finish.ts";
import { candidateChunks, chunksFrom, keywordExtraction } from "../src/intake/keywords.ts";
import { projectPageAsks, projectSource } from "../src/intake/project-page.ts";
import {
  activeItems,
  answerStep,
  changeStep,
  decide,
  fromProjectPage,
  reconcile,
  reviewStep,
} from "../src/intake/state.ts";
import { SEED_LIBRARY_RECORD, WATER_NOTES_RECORD, type CertifiedRecord } from "../src/social/fixture.ts";
import {
  placeLine,
  publisherFacts,
  publisherLinksLine,
  replacesNameOrDescription,
  sourceOriginLine,
  suggestionLine,
  waitingAction,
  waitingLine,
} from "../src/social/words.ts";

/** A project the way the live adapter passes it: Certified supplied only its name and description. */
const project = (description: string, uri = "at://did:plc:example-garden/org.hypercerts.collection/garden"): CertifiedRecord => ({
  uri,
  name: "Garden ledger",
  locations: [],
  description,
  links: [],
  publishedOn: "2026-11-15",
  group: null,
  role: "owner",
  workspace: false,
  verifiedFields: ["name", "description"],
});
const GARDEN = project(
  "Garden ledger is an app that helps community gardeners document their work. We run monthly composting workshops, open to the public. We are looking for gardeners in new cities. We also need two laptops and irrigation equipment for our demo garden.",
);
/** Four needs and four offers, one more of each than a project page may suggest. */
const BUSY = project(
  "We need seedlings for the spring. We need a water tank. We need fencing for the nursery. We need a bookkeeper. We offer composting classes. We offer seed-saving workshops. We lend tools to neighbours. We share our planting calendar.",
  "at://did:plc:example-garden/org.hypercerts.collection/busy",
);
const titles = (draft: DeviceDraft, kind: "needs" | "offers") => draft[kind].items.map((item) => item.value.title);
const pencil = (draft: DeviceDraft) =>
  [...draft.needs.items, ...draft.offers.items].filter((item) => item.decision === "pencil");
const saved = loadedDraft(
  parseSaved({
    id: "b3000000-0000-4000-8000-000000000001",
    revision: 1,
    updatedAt: "2026-11-05T00:00:00Z",
    document: parseDocument(
      JSON.parse(readFileSync(new URL("../../api/src/test-data/account.json", import.meta.url), "utf8")),
    ),
  }),
  "b1000000-0000-4000-8000-000000000001",
);

test("a project's description becomes needs and offers in its own words, in its order", () => {
  const source = projectSource(GARDEN.uri);
  const found = projectPageAsks(GARDEN.description, source);
  assert.deepEqual(
    found.needs.map((statement) => statement.value.title),
    ["Gardeners in new cities", "Two laptops and irrigation equipment for our demo garden"],
  );
  assert.deepEqual(
    found.offers.map((statement) => statement.value.title),
    [
      "Garden ledger is an app that helps community gardeners document their work",
      "We run monthly composting workshops, open to the public",
    ],
  );
  assert.deepEqual(found.needs[1]!.value.capitalForms, ["material"], "kinds of support are suggested from the words");
  assert.ok([...found.needs, ...found.offers].every((statement) => statement.key.startsWith(`${source}:`)));
  assert.equal(projectSource(GARDEN.uri), source, "one project keeps one source");
  assert.notEqual(projectSource(BUSY.uri), source);
});

test("Portuguese and Spanish descriptions are read too", () => {
  const portuguese = projectPageAsks(
    "A Horta do Vale cultiva alimentos com 30 famílias. Oferecemos oficinas de compostagem para escolas. Precisamos de ferramentas e voluntários para os mutirões.",
    "project:pt",
  );
  assert.deepEqual(portuguese.needs.map((statement) => statement.value.title), ["Ferramentas e voluntários para os mutirões"]);
  assert.deepEqual(portuguese.needs[0]!.value.capitalForms, ["material", "social"]);
  assert.deepEqual(portuguese.offers.map((statement) => statement.value.title), ["Oficinas de compostagem para escolas"]);
  const spanish = projectPageAsks("Necesitamos semillas y herramientas. Ofrecemos talleres de huerta.", "project:es");
  assert.deepEqual(spanish.needs.map((statement) => statement.value.title), ["Semillas y herramientas"]);
  assert.deepEqual(spanish.offers.map((statement) => statement.value.title), ["Talleres de huerta"]);
});

test("a list under a heading takes the heading's kind", () => {
  const found = projectPageAsks(
    "We restore springs in the upper valley.\nWhat we need:\n- Fencing for two springs\n- Volunteers for the dry season survey\n\nWhat we offer:\n- A field guide to spring care\n- Training for landowners",
    "project:list",
  );
  assert.deepEqual(found.needs.map((statement) => statement.value.title), [
    "Fencing for two springs",
    "Volunteers for the dry season survey",
  ]);
  assert.deepEqual(found.offers.map((statement) => statement.value.title), [
    "A field guide to spring care",
    "Training for landowners",
  ]);
});

test("a description cut at 600 characters on its way from Certified drops its unfinished last sentence", () => {
  const cut = ("We publish every method we test. ".repeat(17) + "We need a pickup truck to carry seedlings between farms").slice(0, 600);
  assert.equal([...cut].length, 600);
  const found = projectPageAsks(cut, "project:cut");
  assert.deepEqual(found.needs, [], "the cut need could say something the project never said");
  assert.ok(found.offers.every((statement) => statement.value.title === "We publish every method we test"));
  const short = projectPageAsks("We need a pickup truck", "project:short");
  assert.deepEqual(short.needs.map((statement) => statement.value.title), ["A pickup truck"], "a whole description needs no full stop");
});

test("importing a project suggests at most three needs and three offers, in pencil and from its project page", () => {
  const draft = draftWithRecord(newDraft(), BUSY);
  assert.deepEqual(titles(draft, "needs"), ["Seedlings for the spring", "A water tank", "Fencing for the nursery"]);
  assert.deepEqual(titles(draft, "offers"), ["Composting classes", "Seed-saving workshops", "We lend tools to neighbours"]);
  const items = [...draft.needs.items, ...draft.offers.items];
  assert.ok(items.every((item) => item.decision === "pencil" && fromProjectPage(item) && suggestedEntry(item)));
  assert.ok(items.every((item) => suggestionSource(item) === "Suggested from your project page"));
  assert.equal(cardRoute(draft), "needs", "the card opens where the suggestions wait");
  assert.equal(
    waitingLine(waitingSuggestions(draft), false),
    "Your project page suggests 3 needs, 3 offers. Check them to finish your card.",
  );
  assert.equal(waitingLine([{ kind: "offers" }], false), "Your project page suggests 1 offer. Check it to finish your card.");
  assert.equal(waitingLine([], false), "");
  // Nothing is kept or shared until the person keeps it.
  assert.deepEqual(chosenEntries(draft, "all"), []);
  assert.deepEqual(shareable(draft), []);
  assert.deepEqual(JSON.parse(publicKey(draft)).entries, []);
  assert.throws(() => accountDocument(draft), /Check your initiative, needs and offers before saving/);
});

test("Continue keeps the suggestions the person leaves, and only kept ones can leave the device", () => {
  const linked = draftWithRecord(newDraft(), GARDEN);
  const removedId = linked.offers.items[0]!.id;
  const checked = { ...linked, offers: decide(linked.offers, removedId, "removed") };
  const result = continueBoth({ needs: checked.needs, offers: checked.offers });
  assert.ok(result.ok);
  const kept = revise(checked, result.steps);
  assert.equal(intakeComplete(kept), true);
  assert.deepEqual(
    chosenEntries(kept, "all").map((entry) => entry.title),
    ["Gardeners in new cities", "Two laptops and irrigation equipment for our demo garden", "We run monthly composting workshops, open to the public"],
  );
  assert.deepEqual(
    shareable(kept).map((entry) => entry.title),
    ["Two laptops and irrigation equipment for our demo garden", "We run monthly composting workshops, open to the public"],
    "sharing still needs a kind of support",
  );
  assert.deepEqual(waitingSuggestions(kept), [], "a kept suggestion is the person's entry, with no project label");
  assert.equal(suggestionSource(kept.needs.items[0]!), "Suggested from your project page");
  assert.equal(suggestedEntry(kept.needs.items[0]!), false);
  assert.deepEqual(accountDocument(kept).offers.map((entry) => entry.value.title), [
    "We run monthly composting workshops, open to the public",
  ]);
});

test("a checked card stays checked: the suggestions wait beside it and nothing leaves until they are kept", () => {
  const record = project("We need a nursery manager. We offer seed-saving classes.");
  assert.equal(intakeComplete(saved), true);
  const linked = draftWithRecord(saved, record);
  assert.equal(intakeComplete(linked), true, "nothing the person checked has to be checked again");
  assert.equal(cardRoute(linked), "your-initiative");
  assert.deepEqual(waitingSuggestions(linked), [
    { kind: "needs", title: "A nursery manager" },
    { kind: "offers", title: "Seed-saving classes" },
  ]);
  assert.equal(
    waitingLine(waitingSuggestions(linked), true),
    "Your project page suggests 1 need, 1 offer. They are not on your card until you keep them.",
  );
  assert.equal(waitingLine([{ kind: "needs" }], true), "Your project page suggests 1 need. It is not on your card until you keep it.");
  assert.equal(waitingAction(waitingSuggestions(linked)), "Check the suggestions");
  assert.equal(waitingAction([{ kind: "needs" }]), "Check the suggestion");
  // Saving and sharing carry on with the kept entries only.
  assert.deepEqual(accountDocument(linked).needs, accountDocument(saved).needs);
  assert.deepEqual(accountDocument(linked).offers, accountDocument(saved).offers);
  assert.equal(publicKey(linked, "all"), publicKey(withProjectDetails(saved, record), "all"));
  // A pencil card from the person's own words still has to be checked first.
  const talked = { ...linked, needs: addEntry(linked.needs, "Land") };
  assert.throws(() => reviewStep(talked.needs), /every card in pencil/);
  // Continue on Needs and offers keeps the suggestions left there.
  const result = continueBoth({ needs: linked.needs, offers: linked.offers });
  assert.ok(result.ok);
  assert.deepEqual(
    chosenEntries(revise(linked, result.steps), "all").map((entry) => entry.title),
    ["Seedlings and tools", "A nursery manager", "Water mapping workshop", "Seed-saving classes"],
  );
});

test("linking the same project again suggests nothing new, and a removed suggestion stays removed", () => {
  const first = draftWithRecord(newDraft(), GARDEN);
  // The live import links twice: once on the new card and once when the project is chosen.
  assert.deepEqual(draftWithRecord(first, GARDEN).needs.items, first.needs.items);
  const removed = { ...first, needs: decide(first.needs, first.needs.items[0]!.id, "removed") };
  const again = draftWithRecord(removed, GARDEN);
  assert.deepEqual(again.needs.items, removed.needs.items);
  assert.equal(activeItems(again.needs).length, 1);

  // Words the person removed by hand are not brought back from a project page either.
  const typed = addEntry(newDraft().needs, "Gardeners in new cities");
  const byHand = revise(newDraft(), { needs: decide(typed, typed.items[0]!.id, "removed") });
  assert.deepEqual(titles(draftWithRecord(byHand, GARDEN), "needs"), [
    "Gardeners in new cities",
    "Two laptops and irrigation equipment for our demo garden",
  ]);
  assert.equal(draftWithRecord(byHand, GARDEN).needs.items[0]!.decision, "removed");
});

test("suggestions never replace or repeat the card's entries and stay within five", () => {
  const record = project(
    "We need seedlings and tools. We need a nursery manager. We offer a water mapping workshop. We offer seed-saving classes.",
  );
  const linked = draftWithRecord(saved, record);
  assert.deepEqual(linked.needs.items[0], saved.needs.items[0], "the saved need is untouched");
  assert.deepEqual(linked.offers.items[0], saved.offers.items[0], "the saved offer is untouched");
  assert.deepEqual(titles(linked, "needs"), ["Seedlings and tools", "A nursery manager"]);
  assert.deepEqual(titles(linked, "offers"), ["Water mapping workshop", "Seed-saving classes"]);

  let four = newDraft().needs;
  for (const words of ["Land", "Seeds", "Money", "Mentors"]) four = addEntry(four, words);
  const nearlyFull = draftWithRecord(revise(newDraft(), { needs: four }), BUSY);
  assert.deepEqual(titles(nearlyFull, "needs"), ["Land", "Seeds", "Money", "Mentors", "Seedlings for the spring"]);
  const full = draftWithRecord(revise(newDraft(), { needs: addEntry(four, "Water") }), BUSY);
  assert.equal(activeItems(full.needs).length, 5);
  assert.ok(full.needs.items.every((item) => !fromProjectPage(item)));
  assert.equal(full.offers.items.length, 3, "the other list still gets its suggestions");
});

test("making cards from the person's words keeps the suggestions from the project page", () => {
  const linked = draftWithRecord(newDraft(), GARDEN);
  const talked = answerStep(linked.needs, "needs", "Gardeners in new cities\nA tool library\nLand for a second garden");
  const chunks = candidateChunks(talked.turns.flatMap((turn) => chunksFrom(turn.text, turn.id)), talked);
  assert.deepEqual(
    chunks.map((chunk) => chunk.text),
    ["A tool library", "Land for a second garden"],
    "words that repeat a suggestion do not become a second card",
  );
  const rebuilt = reconcile(talked, keywordExtraction(chunks, "needs"));
  assert.deepEqual(rebuilt.items.slice(0, 2), linked.needs.items, "the project page's suggestions stay where they were");
  assert.deepEqual(rebuilt.items.slice(2).map((item) => item.value.title), ["A tool library", "Land for a second garden"]);
  const again = reconcile(rebuilt, keywordExtraction(chunks, "needs"));
  assert.deepEqual(again.items.slice(0, 2), linked.needs.items, "making cards again keeps them too");
  assert.equal(activeItems(again).length, 4);
});

test("a description that asks and offers nothing, or that Certified did not supply, suggests nothing", () => {
  const card = newDraft();
  assert.equal(withProjectSuggestions(card, WATER_NOTES_RECORD), card, "no change, not even a new revision");
  assert.equal(withProjectSuggestions(card, project("")), card);
  assert.equal(withProjectSuggestions(card, { ...GARDEN, verifiedFields: ["name"] }), card);
  const { uri: _uri, ...withoutAddress } = GARDEN;
  assert.equal(withProjectSuggestions(card, withoutAddress), card, "without its address a project cannot be read once");
});

test("when the project page cannot be read, the link goes ahead without suggestions", () => {
  const card = withProjectDetails(newDraft(), GARDEN);
  const linked = withProjectSuggestions(card, GARDEN, () => {
    throw new Error("The reader failed.");
  });
  assert.equal(linked, card);
  assert.equal(linked.confirmed?.name, "Garden ledger");
  assert.deepEqual(pencil(linked), []);
});

test("the link review says what linking will suggest, before the tap and without changing the card", () => {
  const card = newDraft();
  const preview = suggestionsOnLink(card, SEED_LIBRARY_RECORD);
  assert.deepEqual(preview, [
    { kind: "needs", title: "Seed-cleaning tools and volunteers for the autumn exchange" },
    { kind: "offers", title: "A shared seed library with a seasonal exchange and a growing guide for the valley's schools" },
    { kind: "offers", title: "We lend seeds to any family that asks and run a seed-saving workshop each spring" },
  ]);
  assert.equal(suggestionLine(preview), "The project page also suggests 1 need, 2 offers for you to check.");
  assert.deepEqual(waitingSuggestions(card), []);
  assert.deepEqual(waitingSuggestions(draftWithRecord(card, SEED_LIBRARY_RECORD)), preview);
  assert.equal(suggestionLine([]), "");
});

test("opening a team workspace links nothing, so it suggests nothing", () => {
  const opened = withProjectDetails(saved, SEED_LIBRARY_RECORD);
  assert.deepEqual(opened.needs.items, saved.needs.items);
  assert.deepEqual(opened.offers.items, saved.offers.items);
});

test("a list on a card made without the assistant starts by hand beside project suggestions", () => {
  const linked = draftWithRecord(newDraft(), GARDEN);
  assert.equal(linked.assistant, "none");
  assert.equal(startsByHand(linked.needs, linked.assistant), true);
  assert.equal(startsByHand(linked.needs, "keywords"), false);
  assert.equal(startsByHand(addEntry(linked.needs, "Land"), "none"), false, "an entry of their own keeps the list as it is");
  assert.equal(startsByHand(answerStep(linked.needs, "needs", "Land"), "none"), false);
  assert.equal(startsByHand(changeStep(linked.needs, { mode: "manual" }), "none"), false, "already by hand");
});

/** The same project when Certified also named its place, with links on the group's Certified profile. */
const PLACED: CertifiedRecord = {
  ...GARDEN,
  group: "Garden growers",
  locations: ["Riverside allotments, Upper valley"],
  verifiedFields: ["name", "description", "locations"],
  publisherLinks: ["https://growers.example.org/"],
};

test("linking a project puts its source place in an empty Where and keeps its publisher's links off the card", () => {
  const fresh = draftWithRecord(newDraft(), PLACED);
  assert.deepEqual(publicCard(fresh), {
    name: "Garden ledger",
    locations: ["Riverside allotments, Upper valley"],
    description: PLACED.description,
    links: [],
  });
  assert.equal(fresh.form?.where, "Riverside allotments, Upper valley", "the card's Where field shows it");
  assert.equal(fresh.account.saved, null, "linking keeps the card on this device only");
  assert.equal(placeOnLink(newDraft(), PLACED), "filled");

  const bare = revise(saved, { confirmed: { ...saved.confirmed!, locations: [], links: [] } });
  const linked = draftWithRecord(bare, PLACED);
  assert.deepEqual(linked.confirmed?.locations, ["Riverside allotments, Upper valley"]);
  assert.deepEqual(linked.confirmed?.links, [], "an empty links field stays empty");
  assert.equal(intakeComplete(linked), true, "a checked card stays checked");
});

test("a place or links the person already gave the card stay theirs when a project is linked", () => {
  const linked = draftWithRecord(saved, PLACED);
  assert.equal(placeOnLink(saved, PLACED), "kept");
  assert.deepEqual(linked.confirmed?.locations, ["Upper valley"], "the checked card's own Where stays");
  assert.equal(linked.confirmed?.name, "Garden ledger", "the name still comes from Certified, as the review says");
  const same = { ...publicCard(saved), name: PLACED.name, description: PLACED.description };
  assert.equal(replacesNameOrDescription(same, PLACED), false, "a different Where alone is not called a replacement");
  assert.equal(replacesNameOrDescription(publicCard(saved), PLACED), true);

  const everywhere = revise(saved, { confirmed: { ...saved.confirmed!, locations: [], isGlobal: true } });
  assert.equal(placeOnLink(everywhere, PLACED), "kept");
  assert.deepEqual(publicCard(draftWithRecord(everywhere, PLACED)).locations, ["Global"]);

  const typed = revise(newDraft(), {
    mode: "fields",
    publicEdits: { name: "Our garden", locations: ["Lower valley"], isGlobal: false },
    links: ["https://ours.example.org/"],
  });
  const kept = withProjectDetails(typed, PLACED);
  assert.deepEqual(publicCard(kept).locations, ["Lower valley"], "fields typed before checking stay too");
  assert.deepEqual(publicCard(kept).links, ["https://ours.example.org/"]);
  assert.deepEqual(kept.publicEdits.locations, ["Lower valley"]);

  // A provider that supplies a project's own links still fills only an empty links field.
  const ownLinks: CertifiedRecord = { ...GARDEN, links: ["https://garden.example.org/"], verifiedFields: ["name", "links"] };
  assert.deepEqual(publicCard(withProjectDetails(newDraft(), ownLinks)).links, ["https://garden.example.org/"]);
  assert.deepEqual(publicCard(withProjectDetails(typed, ownLinks)).links, ["https://ours.example.org/"]);
});

test("a project without a place, or with one Weave could not read, leaves Where empty and says why", () => {
  const none = draftWithRecord(newDraft(), GARDEN);
  assert.deepEqual(publicCard(none).locations, []);
  assert.equal(placeOnLink(newDraft(), GARDEN), "none");
  const unread: CertifiedRecord = { ...GARDEN, unreadFields: ["locations"] };
  const card = draftWithRecord(newDraft(), unread);
  assert.deepEqual(publicCard(card).locations, [], "no country or coordinates are guessed");
  assert.equal(card.form?.where, "");
  assert.equal(placeOnLink(newDraft(), unread), "unread");
});

test("the review and the notice say what happens to the place and to the publisher's links", () => {
  assert.equal(placeLine("none"), "");
  assert.equal(placeLine("filled"), "Its place goes in Where, which is empty on your card.");
  assert.equal(placeLine("filled", true), "Where now shows its place from Certified.");
  assert.equal(placeLine("kept"), "Your card keeps its own Where.");
  assert.equal(placeLine("kept", true), "Your card kept its own Where.");
  assert.equal(placeLine("unread"), "Certified lists a place for it that Weave could not read, so Where stays as it is on your card.");
  assert.equal(placeLine("unread", true), "Certified lists a place for it that Weave could not read, so Where stayed as it was.");

  assert.deepEqual(publisherFacts(GARDEN), []);
  assert.equal(publisherLinksLine(GARDEN), "");
  assert.deepEqual(publisherFacts(PLACED), [
    { term: "Links on the group's Certified profile", value: "https://growers.example.org/" },
  ]);
  assert.deepEqual(publisherFacts({ ...PLACED, group: null })[0]?.term, "Links on your Certified profile");
  assert.equal(
    publisherLinksLine(PLACED),
    "Links on the group's Certified profile stay off your card. Add any that belong to this initiative under Links.",
  );
  assert.equal(
    publisherLinksLine({ ...PLACED, group: null }, true),
    "Links on your Certified profile were not added to your card: https://growers.example.org/. Add any that belong to this initiative under Links.",
  );
  assert.equal(sourceOriginLine(GARDEN), "The name and description come from Certified. Other details stay as they are on your card.");
  assert.equal(
    sourceOriginLine(PLACED),
    "The name and description come from Certified, and so does its place when your card has no Where. Other details stay as they are on your card.",
  );
});
