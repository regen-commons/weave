import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ABOUT_LIMIT, DeviceDraftSchema, EMPTY_INITIATIVE, addAnswer, newDraft, revise, type DeviceDraft, type Initiative } from "../src/describe/contracts.ts";
import {
  FieldsProblem,
  SAID_LIMIT,
  boxNote,
  changeSaid,
  clip,
  continueDescribe,
  detailChips,
  editFields,
  fieldsForm,
  fillFields,
  fillSummary,
  linkIn,
  mainLink,
  nearLimit,
  otherLinks,
  readFields,
  readingNote,
  saidText,
  toggleDetail,
  withMainLink,
} from "../src/describe/fill.ts";
import { collectSource, fromSource, keywordSuggestion } from "../src/describe/keywords.ts";
import { ledgerRows, structureWords, type StructureEngine } from "../src/describe/structure.ts";
import { previewFields } from "../src/describe/view.ts";
import { loadedDraft, accountDocument } from "../src/account/document.ts";
import { cardRoute } from "../src/initiative/status.ts";

const SAID =
  "We are the Riverside seed library. We are based in Lower Valley, Brazil. We run seed swaps and growing workshops for families. We are getting going. See https://example.org/seeds.";
const build: NonNullable<DeviceDraft["lastBuild"]> = { engine: "keywords", unreadFiles: 0, sourceCharacters: SAID.length, files: [], fallback: false };
const said = (text = SAID) => changeSaid(newDraft(), text);
const suggest = (draft = said()) => keywordSuggestion({ ...draft, turns: [] }, saidText(draft));

test("a fill puts the words into the four fields in place, marks each one, and suggests details in pencil", () => {
  const draft = said();
  const { draft: filled, fields, details, missing } = fillFields(draft, suggest(draft), build);
  const form = fieldsForm(filled);
  assert.equal(form.name, "Riverside seed library", "no article, and a capital to start");
  assert.equal(form.where, "Lower Valley, Brazil");
  assert.ok(form.about.startsWith("We are the Riverside seed library."));
  assert.equal(form.links, "https://example.org/seeds", "only a link the person gave");
  assert.deepEqual(fields, ["name", "where", "about", "links"]);
  assert.deepEqual(filled.filled, ["name", "where", "about", "links"]);
  assert.equal(filled.mode, "fields");
  assert.equal(filled.confirmed, null);
  // The box keeps the words, so they can be changed and read again.
  assert.equal(saidText(filled), SAID);
  // Details are on offer and none is kept until tapped.
  const chips = detailChips(filled);
  assert.equal(details, chips.length);
  assert.ok(chips.length >= 3);
  assert.ok(chips.every((chip) => !chip.kept));
  assert.deepEqual(chips.filter((chip) => chip.key === "stage").map((chip) => chip.label), ["Getting going"]);
  assert.ok(chips.some((chip) => chip.key === "lenses" && chip.label === "Learning and education"));
  assert.ok(chips.some((chip) => chip.key === "beneficiaries" && chip.value === "families"));
  // The preview card shows the fields and no detail nobody kept.
  assert.equal(previewFields(filled).name, "Riverside seed library");
  assert.equal(previewFields(filled).stage, null);
  // The line names the fields it filled, and asks for nothing when the name and the place are there.
  assert.deepEqual(missing, []);
  assert.equal(fillSummary({ fields, missing }), "Filled Name, Where you work, About it and Website or main link. Check and change anything.");
});

test("a fill says which fields it filled, and asks by name for a name or a place the words did not give (DL-127)", () => {
  const draft = changeSaid(newDraft(), "Families share what they learn about the orchard and its water.");
  const result = fillFields(draft, suggest(draft), build);
  assert.deepEqual(result.fields, ["about"]);
  assert.deepEqual(result.missing, ["name", "where"]);
  assert.equal(fillSummary(result), "Filled About it. Add a name and where you work below.");
  assert.equal(fillSummary({ fields: ["name", "about"], missing: ["where"] }), "Filled Name and About it. Add where you work below.");
  assert.equal(fillSummary({ fields: ["name"], missing: [] }), "Filled Name. Check and change anything.");
  assert.equal(fillSummary({ fields: [], missing: ["name"] }), "Nothing new to fill in. Add a name below.");
  // A field the person typed counts as given, so it is not asked for again.
  const typed = fillFields(editFields(draft, { name: "Orchard circle", where: "Upper Valley", about: "", links: "" }), suggest(draft), build);
  assert.deepEqual(typed.missing, []);
  // While it reads, the page says what it is reading.
  assert.equal(readingNote(true, 0), "Reading your words on this device.");
  assert.equal(readingNote(true, 2), "Reading your words and your files on this device.");
  assert.equal(readingNote(false, 1), "Reading your file on this device.");
});

test("a problem that stops Continue names the field it is about, so the page can say it there (DL-127)", () => {
  const field = (form: Parameters<typeof readFields>[0]) => {
    try {
      readFields(form);
    } catch (error) {
      return error instanceof FieldsProblem ? error.field : "not a fields problem";
    }
    return "no problem";
  };
  const good = { name: "Orchard circle", where: "Upper Valley", about: "We share an orchard.", links: "" };
  assert.equal(field(good), "no problem");
  assert.equal(field({ ...good, name: " " }), "name");
  assert.equal(field({ ...good, about: "a".repeat(401) }), "about");
  assert.equal(field({ ...good, where: Array.from({ length: 9 }, (_, index) => `Place ${index}`).join("; ") }), "where");
  assert.equal(field({ ...good, links: "example" }), "links");
  // A problem with the box is about no field.
  assert.equal(new FieldsProblem("The box is full.").field, undefined);
});

test("a fill never writes over a field the person typed or changed, and refills only what it filled before", () => {
  let draft = editFields(newDraft(), { name: "Seed keepers of the valley", where: "", about: "", links: "" });
  draft = changeSaid(draft, SAID);
  let result = fillFields(draft, suggest(draft), build);
  assert.equal(fieldsForm(result.draft).name, "Seed keepers of the valley", "typed first, so it stays");
  assert.deepEqual(result.fields, ["where", "about", "links"]);
  // The person corrects a filled field: it is theirs now.
  draft = editFields(result.draft, { ...fieldsForm(result.draft), where: "Lower valley only" });
  assert.deepEqual(draft.filled, ["about", "links"]);
  // They talk again with new words. The untouched fill is refreshed, the corrected field is not.
  draft = changeSaid(draft, "We are the Riverside seed library. We are based in Upper Valley, Brazil. We lend tools.");
  result = fillFields(draft, suggest(draft), build);
  const form = fieldsForm(result.draft);
  assert.equal(form.name, "Seed keepers of the valley");
  assert.equal(form.where, "Lower valley only");
  assert.ok(form.about.includes("lend tools"));
  assert.equal(form.links, "https://example.org/seeds", "no new link was said, so the earlier one stays");
  assert.deepEqual(result.fields, ["about"]);
  assert.equal(fillSummary(result), "Filled About it. Check and change anything.");
  // Words that propose nothing change nothing, and say so.
  const empty = fillFields(result.draft, { ...EMPTY_INITIATIVE }, build, "");
  assert.deepEqual(fieldsForm(empty.draft), form);
  assert.equal(fillSummary({ fields: [] }), "Nothing new to fill in. You can type in the fields.");
});

test("About it is cut to 400 characters at a sentence, and a link is read only when it is complete", () => {
  const long = `${"A full sentence about the work we do together. ".repeat(12)}`;
  const cut = clip(long, ABOUT_LIMIT);
  assert.ok(cut.length <= ABOUT_LIMIT);
  assert.ok(cut.endsWith("."), "ends at the end of a sentence");
  assert.ok(clip("word ".repeat(200), 50).length <= 50);
  assert.equal(clip("  short   words ", 50), "short words");
  const draft = said(long);
  const { draft: filled } = fillFields(draft, suggest(draft), build);
  assert.ok(fieldsForm(filled).about.length <= ABOUT_LIMIT);
  assert.ok(filled.proposal!.description.length <= ABOUT_LIMIT, "nothing longer is kept on offer");
  assert.equal(linkIn("Find us at https://example.org/a, or call."), "https://example.org/a");
  assert.equal(linkIn("our site is example.org"), "", "a guess is never made into a link");
  assert.equal(linkIn("see https://user:secret@example.org/x and https://example.org/y."), "https://example.org/y");
  assert.equal(nearLimit(100, ABOUT_LIMIT), "");
  assert.equal(nearLimit(320, ABOUT_LIMIT), "320 of 400");
  assert.equal(nearLimit(410, ABOUT_LIMIT), "410 of 400");
});

test("tapped details are kept, a second tap lets go, one stage replaces another, and none is needed to continue", () => {
  const start = said();
  let draft = fillFields(start, suggest(start), build).draft;
  const chip = (label: string) => detailChips(draft).find((item) => item.label === label)!;
  draft = toggleDetail(draft, chip("Getting going"));
  draft = toggleDetail(draft, chip("Learning and education"));
  assert.deepEqual(detailChips(draft).filter((item) => item.kept).map((item) => item.label), ["Getting going", "Learning and education"]);
  assert.equal(previewFields(draft).stage, "sprout");
  draft = toggleDetail(draft, chip("Learning and education"));
  assert.deepEqual(detailChips(draft).filter((item) => item.kept).map((item) => item.label), ["Getting going"]);
  assert.ok(chip("Learning and education"), "let go, it is a suggestion again");
  draft = toggleDetail(draft, { key: "stage", value: "tree" });
  assert.deepEqual(detailChips(draft).filter((item) => item.key === "stage" && item.kept).map((item) => item.label), ["Long established"]);
  // Continue keeps what was tapped and nothing else, with nothing left to check.
  const card = continueDescribe(draft);
  assert.equal(card.confirmed!.stage, "tree");
  assert.deepEqual(card.confirmed!.lenses, []);
  assert.deepEqual(card.confirmed!.beneficiaries, []);
  assert.equal(card.confirmed!.name, "Riverside seed library");
  assert.equal(cardRoute(card), "needs", "one Continue goes straight to needs and offers");
  // The suggestions left in pencil are still on offer when the person comes back.
  assert.ok(detailChips(card).some((item) => item.label === "Learning and education" && !item.kept));
  // With no detail tapped at all, Continue still works.
  const plain = continueDescribe(fillFields(start, suggest(start), build).draft);
  assert.equal(plain.confirmed!.stage, null);
  assert.deepEqual(plain.confirmed!.themes, []);
});

test("typing alone makes a card: the four fields, one Continue, and plain words when something is missing", () => {
  assert.throws(() => continueDescribe(newDraft()), (error) => error instanceof FieldsProblem && /Add a name/.test(error.message));
  const typed = editFields(newDraft(), { name: "Orchard circle", where: "Global", about: "We share orchard skills.", links: "" });
  const card = continueDescribe(typed);
  assert.equal(card.confirmed!.name, "Orchard circle");
  assert.equal(card.confirmed!.isGlobal, true);
  assert.equal(card.lastBuild!.engine, "manual");
  assert.equal(cardRoute(card), "needs");
  const tooLong = editFields(newDraft(), { name: "Orchard circle", where: "", about: "a".repeat(ABOUT_LIMIT + 1), links: "" });
  assert.throws(() => continueDescribe(tooLong), /400 characters/);
  const badLink = editFields(newDraft(), { name: "Orchard circle", where: "", about: "", links: "example" });
  assert.throws(() => continueDescribe(badLink), /complete http or https link/);
  // Changing a field after Continue asks for Continue again, and the route says so.
  const edited = editFields(card, { ...fieldsForm(card), name: "Orchard learning circle" });
  assert.equal(edited.confirmed, null);
  assert.equal(cardRoute(edited), "initiative");
});

test("a saved card with several links and 800 characters stays readable and saveable through the one-link field", () => {
  const links = ["https://example.org/one", "https://example.org/two", "https://example.org/three"];
  const document = {
    version: 1 as const,
    initiative: { name: "Earlier card", description: "e".repeat(800), locations: ["Upper valley"], isGlobal: false, links,
      stage: "sprout", lenses: ["learning"], themes: ["soil"], beneficiaries: ["families"], languages: ["pt"] },
    needs: [], offers: [],
    funding: { form: { workCountries: "", benefitCountries: "", applicantBaseCountry: "", registrationCountry: "", applicantType: "unknown",
      fundingInstruments: [], goalMin: "", goalMax: "", currency: "", usWorkStates: "", usBenefitStates: "" }, programAnswers: {} },
  };
  const owner = "b1000000-0000-4000-8000-000000000001";
  const loaded = loadedDraft({ id: "b3000000-0000-4000-8000-000000000001", revision: 2, updatedAt: "2026-11-05T00:00:00Z", document }, owner);
  const form = fieldsForm(loaded);
  assert.equal(mainLink(form), links[0], "the field shows the first link");
  assert.deepEqual(otherLinks(form), links.slice(1), "the others stay with the card");
  // Every detail the card was saved with shows as kept.
  assert.deepEqual(detailChips(loaded).map((chip) => [chip.label, chip.kept]), [
    ["Getting going", true], ["Learning and education", true], ["Soil", true], ["Families", true], ["Portuguese", true],
  ]);
  // Unchanged, it continues and saves exactly as it was: 800 characters and all three links.
  const same = continueDescribe(loaded);
  assert.deepEqual(accountDocument(same).initiative, document.initiative);
  // Changing only the name keeps the long About it and every link.
  const renamed = continueDescribe(editFields(loaded, { ...form, name: "Earlier card, renamed" }));
  assert.equal(renamed.confirmed!.description.length, 800);
  assert.deepEqual(renamed.confirmed!.links, links);
  // Changing the one field replaces the first link and keeps the rest.
  const relinked = continueDescribe(editFields(loaded, { ...form, links: withMainLink(form, "https://example.org/new") }));
  assert.deepEqual(relinked.confirmed!.links, ["https://example.org/new", ...links.slice(1)]);
  // Clearing it removes only that link.
  const cleared = continueDescribe(editFields(loaded, { ...form, links: withMainLink(form, "") }));
  assert.deepEqual(cleared.confirmed!.links, links.slice(1));
  // New words in About it follow the new limit.
  assert.throws(() => continueDescribe(editFields(loaded, { ...form, about: "n".repeat(500) })), /400 characters/);
});

test("a draft from the earlier guided conversation opens in the box with every answer, and loses none", () => {
  // As the earlier version stored it: conversation mode, one turn for each answer.
  let legacy = addAnswer({ ...newDraft(), mode: "conversation" }, "We are Orchard learning circle, families restoring an orchard.");
  legacy = addAnswer(legacy, "Upper valley, Brazil");
  assert.equal(legacy.turns.length, 2);
  assert.deepEqual(fieldsForm(legacy), { name: "", where: "", about: "", links: "" }, "nothing is put in a field before the person asks");
  assert.equal(saidText(legacy), "We are Orchard learning circle, families restoring an orchard.\n\nUpper valley, Brazil");
  // A stored draft without the new field still loads.
  const { filled: _filled, mark: _mark, ...stored } = legacy;
  assert.deepEqual(DeviceDraftSchema.parse(structuredClone(stored)).filled, []);
  // Changing the box keeps the answers as its text, once.
  const changed = changeSaid(legacy, `${saidText(legacy)} We also keep bees.`);
  assert.deepEqual(changed.turns, []);
  assert.ok(changed.composer.includes("Upper valley, Brazil"));
  assert.ok(changed.composer.endsWith("We also keep bees."));
  const filled = fillFields(changed, suggest(changed), build).draft;
  assert.equal(fieldsForm(filled).name, "Orchard learning circle");
});

/**
 * A draft written by the released build's own functions (commit 6498779), as it sat in the
 * browser: two sent answers, a change typed into the second, a link typed and not yet added, and
 * half-typed words in the composer, which that build stored on every keystroke. It has no `mark`
 * and no `filled`.
 */
export const releasedDraft = (): unknown => JSON.parse(readFileSync(new URL("./released-draft.json", import.meta.url), "utf8"));

test("a draft the released build stored opens with every answer, its changed answer, its typed link and its half-typed words, and typing loses none", () => {
  const stored = releasedDraft() as Record<string, unknown>;
  assert.equal("mark" in stored, false);
  assert.equal("filled" in stored, false);
  const draft = DeviceDraftSchema.parse(stored);
  assert.equal(draft.turns.length, 2);
  assert.equal(draft.composer, "We also keep bees and teach");
  const box = saidText(draft);
  assert.equal(
    box,
    [
      "We are Orchard learning circle, families restoring an orchard.",
      "Upper Valley and the river towns, Brazil",
      "We also keep bees and teach",
      "https://example.org/orchard",
    ].join("\n\n"),
    "the answers as last changed, then the half-typed words, then the link",
  );
  // The first keystroke moves everything into the box's own text, once.
  const typed = changeSaid(draft, `${box}!`);
  assert.deepEqual([typed.turns, typed.answerEdits, typed.pendingLink], [[], {}, ""]);
  assert.equal(saidText(typed), `${box}!`, "nothing is shown twice and nothing is gone");
  for (const part of ["families restoring an orchard", "river towns", "keep bees", "https://example.org/orchard"])
    assert.ok(typed.composer.includes(part), part);
  // Talk It Out adds to what the box shows, so it keeps them as well.
  const talked = changeSaid(draft, [saidText(draft), "Students join us."].join(" "));
  assert.ok(talked.composer.startsWith("We are Orchard learning circle"));
  assert.ok(talked.composer.endsWith("Students join us."));
});

test("earlier answers longer than the box can be shortened a character at a time, and only adding to them is refused", () => {
  let legacy = addAnswer({ ...newDraft(), mode: "conversation" }, "a".repeat(15000));
  legacy = addAnswer(legacy, "b".repeat(15000));
  const box = saidText(legacy);
  assert.equal(box.length, 30002);
  // One backspace: still far over what the box takes, and accepted, because it is shorter.
  const shorter = changeSaid(legacy, box.slice(0, -1));
  assert.equal(saidText(shorter), box.slice(0, -1), "the box holds exactly what was left");
  assert.deepEqual([shorter.turns, shorter.composer.length], [[], 30001]);
  assert.equal(DeviceDraftSchema.safeParse(shorter).success, true, "and the draft can be stored");
  // Trimming goes on from there, one press after another, and a correction of the same length is taken too.
  const again = changeSaid(shorter, saidText(shorter).slice(1));
  assert.equal(saidText(again).length, 30000);
  assert.equal(saidText(changeSaid(again, `c${saidText(again).slice(1)}`)).length, 30000);
  // Adding is refused while it is over the limit, and nothing is removed.
  for (const draft of [legacy, shorter])
    assert.throws(() => changeSaid(draft, `${saidText(draft)}c`), (error) => error instanceof FieldsProblem && /Nothing has been removed/.test(error.message));
  assert.equal(legacy.turns.length, 2);
  // The page says why typing adds nothing, and stops saying it once the words fit.
  assert.match(boxNote(box), /shorten/u);
  assert.equal(boxNote(box.slice(0, SAID_LIMIT)), "");
  assert.equal(saidText(changeSaid(legacy, box.slice(0, SAID_LIMIT))).length, SAID_LIMIT);
});

test("half-typed words and a typed link that pass the limit together can still be trimmed", () => {
  // The released build let the box and the link field each fill up, so the two can add up to more.
  const full = revise(newDraft(), { composer: "w".repeat(20000), pendingLink: `https://example.org/${"p".repeat(2000)}` }, true);
  const box = saidText(full);
  assert.ok(box.length > SAID_LIMIT);
  assert.equal(saidText(changeSaid(full, box.slice(0, -1))), box.slice(0, -1));
});

test("filling the fields never fails on length: the rules read over-long earlier answers as the worker does", async () => {
  let legacy = addAnswer({ ...newDraft(), mode: "conversation" }, `We are Orchard learning circle. We are based in Upper Valley, Brazil. ${"We restore orchards. ".repeat(700)}`);
  legacy = addAnswer(legacy, "We share skills in soil and water care. ".repeat(400));
  assert.ok(saidText(legacy).length > SAID_LIMIT);
  const result = await structureWords(legacy, new AbortController().signal, {
    // What `keyword-worker.ts` does with the draft it is sent: validate it, then read it.
    keywords: async (source) => {
      const draft = DeviceDraftSchema.parse(source);
      return fromSource(draft, await collectSource(draft));
    },
  });
  assert.equal(result.suggestion.name, "Orchard learning circle");
  assert.deepEqual(result.suggestion.locations, ["Upper Valley, Brazil"]);
  const filled = fillFields(legacy, result.suggestion, result.lastBuild).draft;
  assert.equal(fieldsForm(filled).name, "Orchard learning circle");
  assert.equal(saidText(filled).length, saidText(legacy).length, "and the words in the box are all still there");
});

test("the box returns typed words exactly, with the spaces and line ends still being typed", () => {
  const typing = changeSaid(newDraft(), "We grow seeds. \n");
  assert.equal(saidText(typing), "We grow seeds. \n");
});

test("structuring stays on the device: keyword rules first, an engine may improve them, and a failure keeps the keyword card", async () => {
  const draft = said();
  const signal = new AbortController().signal;
  const keywords = async (source: typeof draft) => {
    assert.equal(source.composer, SAID);
    assert.deepEqual(source.turns, []);
    return { text: SAID, unreadFiles: 0, files: [], words: 27, suggestion: keywordSuggestion(source, SAID) };
  };
  let clock = 0;
  const now = () => (clock += 5);
  const plain = await structureWords(draft, signal, { keywords, now });
  assert.equal(plain.lastBuild.engine, "keywords");
  assert.equal(plain.lastBuild.fallback, false);
  assert.deepEqual(plain.attempts.map((attempt) => [attempt.engine, attempt.status]), [["keywords", "complete"]]);
  const better: Initiative = { ...plain.suggestion, name: "Riverside Seed Library", themes: ["seeds"], locations: ["Somewhere the model guessed"] };
  const engine = (refine: StructureEngine["refine"]): StructureEngine => ({ engine: "browser", model: "Browser-managed model", refine });
  const refined = await structureWords(draft, signal, { keywords, now, engines: [engine(async (text) => { assert.equal(text, SAID); return better; })] });
  assert.equal(refined.suggestion.name, "Riverside Seed Library");
  assert.deepEqual(refined.suggestion.locations, plain.suggestion.locations, "a place comes only from the person's words");
  assert.equal(refined.lastBuild.engine, "browser");
  const failed = await structureWords(draft, signal, { keywords, now, engines: [engine(async () => { throw new Error("model unavailable"); })] });
  assert.deepEqual(failed.suggestion, plain.suggestion);
  assert.equal(failed.lastBuild.engine, "keywords");
  assert.equal(failed.lastBuild.fallback, true);
  assert.deepEqual(failed.attempts.map((attempt) => [attempt.engine, attempt.status]), [["keywords", "complete"], ["browser", "failed"]]);
  // The ledger records every attempt with zero cloud words.
  const rows = ledgerRows("initiative", failed.attempts, failed.words);
  assert.deepEqual(rows.map((row) => [row.engine, row.status, row.words, row.cloudWords]), [["keywords", "complete", 27, 0], ["browser", "failed", 27, 0]]);
  // Stopping stops: nothing is returned after a cancel.
  const stop = new AbortController();
  await assert.rejects(structureWords(draft, stop.signal, { keywords, now, engines: [engine(async () => { stop.abort(); return better; })] }));
});

test("the one link field keeps its own slot: clearing it leaves it empty, and typing never changes a link kept from an earlier save", () => {
  const start = { name: "Earlier card", where: "", about: "", links: "https://example.org/one\nhttps://example.org/two\nhttps://example.org/three" };
  const kept = ["https://example.org/two", "https://example.org/three"];
  // Select all and delete: the field is empty, and the next link is not pulled into it.
  let form = { ...start, links: withMainLink(start, "") };
  assert.equal(mainLink(form), "", "an empty field stays empty");
  assert.deepEqual(otherLinks(form), kept);
  // Typing a new address one key at a time writes only the field's own link.
  for (const typed of ["h", "ht", "https://new.example.org"]) {
    form = { ...form, links: withMainLink(form, typed) };
    assert.equal(mainLink(form), typed);
    assert.deepEqual(otherLinks(form), kept, `the kept links are untouched after "${typed}"`);
  }
  assert.deepEqual(continueDescribe(editFields(newDraft(), form)).confirmed!.links, ["https://new.example.org", ...kept]);
  // Holding backspace empties the field and stops there: the kept links cannot be erased from it.
  for (let presses = 0; presses < 60; presses++) form = { ...form, links: withMainLink(form, mainLink(form).slice(0, -1)) };
  assert.equal(mainLink(form), "");
  assert.deepEqual(otherLinks(form), kept);
  assert.deepEqual(continueDescribe(editFields(newDraft(), form)).confirmed!.links, kept, "an empty field adds no link");
  // With nothing kept, the field is just its own text.
  const single = { ...start, links: "https://example.org/one" };
  assert.equal(withMainLink(single, ""), "");
  assert.equal(withMainLink(single, " https://example.org/changed "), "https://example.org/changed");
  // Links an earlier version stored on one line still split into the field's own and the rest.
  const oneLine = { ...start, links: "https://example.org/one https://example.org/two" };
  assert.equal(mainLink(oneLine), "https://example.org/one");
  assert.deepEqual(otherLinks(oneLine), ["https://example.org/two"]);
});
