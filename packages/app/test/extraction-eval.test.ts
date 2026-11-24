import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import {
  RECORD_COMMAND,
  evaluate,
  floorOf,
  fold,
  gate,
  loadCorpus,
  loadFloor,
  scoreCase,
  validateCorpus,
  type Described,
  type ExtractionCase,
  type ExtractionCorpus,
  type Readers,
} from "../evaluation/extraction.ts";

// CI scores only the development split. The holdout runs by hand: `eval:extraction -- --split holdout`.
const development = loadCorpus("development");
const scored = development.then((corpus) => evaluate(corpus));

test("development holds the recorded floor for every field, and no case is worse than it was", async () => {
  const corpus = await development;
  const verdict = gate(corpus, await scored, await loadFloor());
  assert.equal(verdict.passed, true, verdict.message);
});

test("the floor was recorded on today's development cases, so a new case is held too", async () => {
  const corpus = await development;
  const floor = (await loadFloor())!;
  assert.equal(floor.corpusHash, createHash("sha256").update(JSON.stringify(corpus.cases)).digest("hex"), `The cases changed: run \`${RECORD_COMMAND}\`.`);
  assert.ok(corpus.cases.length >= 45);
  for (const language of ["en", "pt", "es"]) assert.ok(corpus.cases.some((row) => row.language === language), language);
  for (const step of ["describe", "needs", "offers"])
    for (const mode of ["typed", "spoken"]) assert.ok(corpus.cases.some((row) => row.step === step && row.mode === mode), `${step} ${mode}`);
});

test("the holdout is frozen by hash, valid, and shares no words with development", async () => {
  const [dev, holdout] = await Promise.all([development, loadCorpus("holdout")]);
  assert.ok(holdout.cases.length >= 20);
  const words = new Set(dev.cases.map((row) => fold(row.text)));
  assert.deepEqual(holdout.cases.filter((row) => words.has(fold(row.text))).map((row) => row.id), []);
});

// Scoring and the gate, on fixed outputs: these hold whatever the rules do today.
const describeCase = (text: string, expected: Partial<{ name: string; where: string[]; includes: string[]; excludes: string[] }>): ExtractionCase => ({
  id: "x", split: "development", step: "describe", mode: "typed", language: "en", source: "test", text,
  expected: { name: expected.name ?? "", where: expected.where ?? [], about: { includes: expected.includes ?? ["seed swaps"], excludes: expected.excludes ?? [] } },
});
const cardsCase = (text: string, keys: string[]): ExtractionCase => ({ id: "x", split: "development", step: "needs", mode: "typed", language: "en", source: "test", text, expected: { cards: keys } });
const giving = (describe: Partial<Described>, cards: string[] = []): Readers => ({
  describe: async () => ({ name: "", where: [], about: "", link: "", ...describe }),
  cards: () => cards,
});

test("scoring: a name is right only when it is the initiative's, and each place counts once", async () => {
  const text = "Riverside Seed Library is a volunteer group in Porto Alegre, Brazil. We run seed swaps.";
  const right = await scoreCase(describeCase(text, { name: "riverside seed library", where: ["porto alegre brazil"] }), giving({ name: "Riverside Seed Library", where: ["Porto Alegre, Brazil"], about: text }));
  assert.equal(right.fields.name!.passed, true, "case, accents and commas do not count");
  assert.deepEqual(right.fields.where!.count, { tp: 1, fp: 0, fn: 0 });
  // A name where none was stated is a false positive; a different one is both.
  assert.deepEqual((await scoreCase(describeCase(text, { name: "" }), giving({ name: "Riverside Seed Library" }))).fields.name!.count, { tp: 0, fp: 1, fn: 0 });
  assert.deepEqual((await scoreCase(describeCase(text, { name: "Hillside Seeds" }), giving({ name: "Riverside Seed Library" }))).fields.name!.count, { tp: 0, fp: 1, fn: 1 });
  // The same place twice, spelled two ways, is one right place and one extra.
  const twice = await scoreCase(describeCase(text, { where: ["Porto Alegre, Brazil", "Lisbon, Portugal"] }), giving({ where: ["Porto Alegre, Brazil", "porto alegre brazil"] }));
  assert.deepEqual([twice.fields.where!.passed, twice.fields.where!.count], [false, { tp: 1, fp: 1, fn: 1 }]);
  const about = await scoreCase(describeCase(text, { includes: ["run seed swaps"], excludes: ["volunteer group"] }), giving({ about: text }));
  assert.equal(about.fields.about!.passed, false, "About it held a phrase the label leaves out");
});

test("scoring: another way of writing the name is as right, and a link counts only where the case names one", async () => {
  const text = "Tech and Sun builds solar hubs and runs seed swaps. See https://www.greengoods.app/ for more.";
  const base = describeCase(text, { name: "Tech and Sun" });
  const as = (extra: object): ExtractionCase => ({ ...base, expected: { ...(base.expected as object), ...extra } as ExtractionCase["expected"] });
  assert.equal((await scoreCase(as({ nameAlternatives: ["Tech & Sun"] }), giving({ name: "Tech & Sun" }))).fields.name!.passed, true);
  assert.equal((await scoreCase(base, giving({ name: "Tech & Sun" }))).fields.name!.passed, false, "only a listed alternative counts");
  // The protocol, "www." and a trailing slash do not count; a link where the case names none is a false positive.
  assert.deepEqual((await scoreCase(as({ link: "greengoods.app" }), giving({ link: "https://www.greengoods.app/" }))).fields.link!.count, { tp: 1, fp: 0, fn: 0 });
  assert.deepEqual((await scoreCase(as({ link: "" }), giving({ link: "https://greengoods.app" }))).fields.link!.count, { tp: 0, fp: 1, fn: 0 });
  assert.deepEqual((await scoreCase(as({ link: "greengoods.app" }), giving({}))).fields.link!.count, { tp: 0, fp: 0, fn: 1 });
  assert.equal((await scoreCase(base, giving({ link: "https://greengoods.app" }))).fields.link, undefined, "not scored where the case names no link");
});

test("scoring: two items in one card match neither, and a key is a whole word", async () => {
  const score = async (text: string, keys: string[], cards: string[]) => (await scoreCase(cardsCase(text, keys), giving({}, cards))).fields.cards!;
  assert.deepEqual((await score("seedlings and a water pump", ["seedlings", "water pump"], ["Seedlings and a water pump"])).count, { tp: 0, fp: 1, fn: 2 });
  assert.deepEqual((await score("seedlings and a water pump", ["seedlings", "water pump"], ["Seedlings", "A water pump"])).count, { tp: 2, fp: 0, fn: 0 });
  assert.deepEqual((await score("vanilla cuttings and a van", ["van"], ["Vanilla cuttings"])).count, { tp: 0, fp: 1, fn: 1 });
  assert.equal((await score("tools", ["tools"], [])).passed, false);
  assert.deepEqual((await score("no needs", [], [])).count, { tp: 0, fp: 0, fn: 0 });
});

test("the gate names the rate that fell and every case that got worse, even one that already failed", async () => {
  const corpus: ExtractionCorpus = {
    version: 1, dataset: "example", authoring: "test",
    cases: [describeCase("We run seed swaps in Lagos and Accra.", { where: ["Lagos", "Accra"] }), { ...cardsCase("tools and seeds", ["tools", "seeds"]), id: "y" }],
  };
  const before = await evaluate(corpus, giving({ where: ["Lagos"], about: "We run seed swaps." }, ["Tools", "Seeds"]));
  const floor = floorOf(corpus, before, "2026-11-23");
  assert.equal(gate(corpus, before, floor).passed, true);
  // The place case failed before and fails now, but finds nothing; the cards case breaks.
  const after = await evaluate(corpus, giving({ where: [], about: "We run seed swaps." }, ["Tools and seeds"]));
  const verdict = gate(corpus, after, floor);
  assert.equal(verdict.passed, false);
  assert.match(verdict.message, /where recall fell from 0\.500 to 0\.000\./u);
  assert.match(verdict.message, /cards precision fell from 1\.000 to 0\.000\./u);
  assert.ok(verdict.message.includes('  x where (typed, en): wanted "Lagos; Accra"; got nothing.'), verdict.message);
  assert.ok(verdict.message.includes('  y cards (typed, en): wanted "tools", "seeds"; got "Tools and seeds".'), verdict.message);
  assert.ok(verdict.message.includes(RECORD_COMMAND));
  // A field that passes now and did not before is named, so the floor can be raised.
  const better = await evaluate(corpus, giving({ where: ["Lagos", "Accra"], about: "We run seed swaps." }, ["Tools", "Seeds"]));
  assert.deepEqual(gate(corpus, better, floor).improved, ["x where"]);
  assert.equal(gate(corpus, before, null).passed, false);
});

test("the validator rejects a label no rule could meet, duplicate words and a case in the wrong split", async () => {
  const corpus = await development;
  const reject = (change: (data: ExtractionCorpus) => void, message: string | RegExp) => {
    const data = structuredClone(corpus);
    change(data);
    assert.throws(() => validateCorpus(data, "development"), { message });
  };
  const needs = (data: ExtractionCorpus) => data.cases.find((row) => row.id === "n-01")!.expected as { cards: string[] };
  reject((data) => data.cases.push({ ...structuredClone(data.cases[0]!), id: "copy" }), /^duplicate_text/u);
  reject((data) => { data.cases[0]!.split = "holdout"; }, "invalid_extraction_case");
  reject((data) => { needs(data).cards = ["a pony"]; }, /^phrase_not_in_text/u);
  reject((data) => { needs(data).cards = ["a", "b", "c", "d", "e"]; }, "invalid_extraction_expected");
  // "tree seedlings" sits inside "fruit tree seedlings", so a card could never hold one without the other.
  reject((data) => { needs(data).cards = ["fruit tree seedlings", "tree seedlings"]; }, /^overlapping_keys/u);
  // A file case says what its file is, and a Word file is not a PDF.
  reject((data) => { data.cases.find((row) => row.id === "f-09-d")!.format = "pdf"; }, /^invalid_extraction_file/u);
  reject((data) => { delete data.cases.find((row) => row.id === "f-01-d")!.file; }, /^invalid_extraction_file/u);
});

// Files a person adds: each case's document exists, its gold is in the document's own words, and the reader
// reads what the page reads. A Word file and a PDF with no text layer are kept and not read, so they score as misses.
test("every file case's gold is in its document, and the reader reads the files the page reads", async () => {
  const corpus = await development;
  const { readFile } = await import("node:fs/promises");
  const { existsSync } = await import("node:fs");
  const { collectSource } = await import("../src/describe/keywords.ts");
  const { attachmentOf, nodePdfReader } = await import("../evaluation/extraction.ts");
  const folder = new URL("../evaluation/files/", import.meta.url);
  // A PDF or Word file is made from Markdown of the same name, beside it or in sources/.
  const words = async (file: string) => {
    const stem = file.replace(/\.[a-z]+$/u, "");
    const beside = new URL(`${stem}.md`, folder), source = new URL(`sources/${stem}.md`, folder);
    return readFile(/\.(md|txt)$/u.test(file) ? new URL(file, folder) : existsSync(beside) ? beside : source, "utf8");
  };
  const files = corpus.cases.filter((row) => row.mode === "file");
  assert.ok(files.length >= 30 && new Set(files.map((row) => row.format)).size === 5, "Markdown, text, PDF, a scanned PDF and Word");
  for (const row of files) {
    const text = await words(row.file!);
    const expected = row.expected as { name?: string; where?: string[]; about?: { includes: string[]; excludes: string[] }; cards?: string[] };
    const phrases = [...(expected.about?.includes ?? []), ...(expected.about?.excludes ?? []), ...(expected.where ?? []), ...(expected.cards ?? [])];
    for (const phrase of [...phrases, ...(expected.name ? [expected.name] : [])])
      assert.ok(` ${fold(text)} `.includes(` ${fold(phrase)} `), `${row.id}: "${phrase}" is not in ${row.file}`);
  }
  const status = async (file: string) => (await collectSource({ turns: [], composer: "", attachments: [await attachmentOf(file)] }, nodePdfReader)).files[0]!.status;
  assert.deepEqual(
    await Promise.all(["en-one-pager.md", "en-grant-excerpt.txt", "pt-grant-application.pdf", "pt-project-brief.docx", "en-scanned-proposal.pdf"].map(status)),
    ["read", "read", "read", "unread", "unread"],
  );
});

// The eval reads words and files with the page's own readers (keywordExtract, extractAsks). Those need the page's
// worker for a PDF, so a PDF goes through the eval's copy of their steps with PDF.js's Node build. The copy must
// give what the page's readers give on everything else, or a PDF case would measure rules the page does not run.
test("the eval's PDF path gives what the page's own readers give, on every case without a PDF", async () => {
  const corpus = await development;
  const { askStepOf, attachmentOf, nodeCards, nodeKeywords, readCards, readDescribe, readStepCards } = await import("../evaluation/extraction.ts");
  const { reconcile } = await import("../src/intake/state.ts");
  let fileCards = 0;
  for (const row of corpus.cases) {
    if (row.format === "pdf" || row.format === "pdf-image") continue;
    const files = row.file ? [await attachmentOf(row.file)] : [];
    if (row.step === "describe") {
      assert.deepEqual(await readDescribe(row.text, files, nodeKeywords), await readDescribe(row.text, files), row.id);
      continue;
    }
    const step = askStepOf(row.text, row.step, row.mode, files);
    const page = await readStepCards(row.text, row.step, row.mode, files);
    // The words-only reader that typed-list.test.ts reads gives the same cards too.
    if (row.mode !== "file") assert.deepEqual(readCards(row.text, row.step, row.mode), page, `${row.id} words only`);
    assert.deepEqual(reconcile(step, await nodeCards(step, row.step)).items.map((item) => item.value.title), page, row.id);
    if (row.file && !row.text) fileCards += page.length;
  }
  // A file alone makes cards on the needs and offers steps, so a reader that dropped files would show here.
  assert.ok(fileCards > 0, "no card came from a file");
});

test("a file read when the floor was recorded that is not read now fails the gate, even where it asked for no cards", async () => {
  const corpus: ExtractionCorpus = {
    version: 1, dataset: "example", authoring: "test",
    cases: [{ id: "f", split: "development", step: "needs", mode: "file", language: "en", source: "test", text: "", file: "green-goods-readme.md", format: "md", expected: { cards: [] } }],
  };
  // Before: the file was read and its lines became four wrong cards. After: nothing is read, so no card is wrong.
  const before = await evaluate(corpus, giving({}, ["# Green Goods", "badge", "badge", "summary"]));
  assert.equal(before.rows[0]!.file!.status, "read");
  const floor = floorOf(corpus, before, "2026-11-23");
  const after = await evaluate(corpus, giving({}, []));
  after.rows[0]!.file!.status = "unread";
  const verdict = gate(corpus, after, floor);
  assert.equal(verdict.passed, false);
  assert.ok(verdict.message.includes("  f file (md, en): green-goods-readme.md was read when the floor was recorded and is unread now."), verdict.message);
});

test("each file format gets its own rates, and a file the app cannot read counts against recall, not as a skip", async () => {
  const result = await scored;
  for (const format of ["md", "txt", "pdf", "pdf-image", "docx"]) assert.ok(result.byFormat[format], format);
  // Nothing comes out of a Word file today, so every field it should fill is a miss.
  assert.equal(result.byFormat.docx!.about.recall, 0);
  assert.equal(result.byFormat.docx!.cards.cases, 2);
});
