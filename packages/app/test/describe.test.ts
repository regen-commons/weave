import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addAnswer,
  confirmDraft,
  DeviceDraftSchema,
  EMPTY_INITIATIVE,
  modelConstraint,
  newDraft,
  revise,
  reviewedProposal,
  type DeviceDraft,
} from "../src/describe/contracts.ts";
import { DraftController } from "../src/describe/controller.ts";
import { MemoryDraftRepository } from "../src/describe/repository.ts";
import { collectSource, fromSource, keywordSuggestion, readKeywordSource } from "../src/describe/keywords.ts";
import { availableBrowser, browserExtract } from "../src/describe/engines.ts";
import {
  availableSpeech,
  startSpeech,
  type LocalSpeechSession,
  type SpeechConstructor,
} from "../src/describe/speech.ts";
import { memoryConsent } from "../src/describe/speech-consent.ts";
import { editsFromForm, formFrom, parseRecordForm } from "../src/describe/forms.ts";
import { previewFields } from "../src/describe/view.ts";
import { changeSaid, continueDescribe, editFields, fieldsForm, fillFields } from "../src/describe/fill.ts";

const seed = () =>
  addAnswer(
    addAnswer(newDraft(), "We are Orchard learning circle, a group of families caring for soil and water."),
    "Upper valley, Brazil",
  );

test("keyword mode reads text on the device, keeps unknowns empty and never fabricates mapped places or languages", async () => {
  const draft = seed();
  const result = await readKeywordSource(draft);
  assert.equal(result.suggestion.name, "Orchard learning circle");
  assert.deepEqual(result.suggestion.locations, ["Upper valley, Brazil"]);
  assert.deepEqual(result.suggestion.languages, []);
  assert.equal(result.suggestion.stage, null);
  assert.ok(result.suggestion.lenses.includes("place_based"));
  assert.ok(result.words > 0);
  assert.deepEqual(result.suggestion.links, []);
});
test("text attachments are read while unsupported files remain stored and explicitly unread", async () => {
  const text = new Blob(["Research and learning about water."], { type: "text/plain" });
  const opaque = new Blob(["Fictional opaque bytes"], { type: "application/octet-stream" });
  const draft = revise(
    seed(),
    {
      attachments: [
        { id: crypto.randomUUID(), name: "notes.txt", type: text.type, bytes: text.size, blob: text },
        { id: crypto.randomUUID(), name: "notes.bin", type: opaque.type, bytes: opaque.size, blob: opaque },
      ],
    },
    true,
  );
  const result = await readKeywordSource(draft);
  assert.equal(result.unreadFiles, 1);
  assert.ok(result.suggestion.lenses.includes("research"));
  assert.equal(await draft.attachments[1]!.blob.text(), "Fictional opaque bytes");
  assert.throws(() =>
    DeviceDraftSchema.parse({ ...draft, attachments: [{ ...draft.attachments[0], bytes: 1 }] }),
  );
});
test("public fields keep incomplete links in raw form and reject unsafe or excessive links when confirmed", () => {
  const form = { name: "Orchard circle", where: "Global", about: "Shared growing skills", links: "https://" };
  const edits = editsFromForm(form, { links: ["https://example.org"] });
  assert.equal(edits.name, "Orchard circle");
  assert.deepEqual(edits.links, ["https://example.org"]);
  const draft = revise(newDraft(), { form, publicEdits: edits });
  assert.equal(draft.form!.links, "https://");
  assert.throws(() => parseRecordForm(form));
  assert.throws(() => parseRecordForm({ ...form, links: "javascript:alert(1)" }));
  assert.throws(() => parseRecordForm({ ...form, links: "https://name:password@example.org" }));
  const parsed = parseRecordForm({ ...form, links: "https://example.org" });
  assert.equal(parsed.isGlobal, true);
  assert.deepEqual(parsed.locations, []);
});
test("review blocks unconfirmed or stale derived facts and preserves corrections and removals after a rebuild", async () => {
  let draft = seed();
  const { suggestion } = await readKeywordSource(draft);
  draft = revise(draft, {
    proposal: { ...suggestion, stage: "sprout", themes: ["water"], lenses: [], beneficiaries: [] },
    proposalVersion: draft.inputVersion,
  });
  assert.throws(() => confirmDraft(draft), /pencil/);
  draft = revise(draft, { derivedEdits: { stage: "tree" }, kept: ["stage"], removed: ["themes"] });
  assert.equal(reviewedProposal(draft)!.stage, "tree");
  assert.deepEqual(reviewedProposal(draft)!.themes, []);
  draft = confirmDraft(draft);
  assert.equal(draft.confirmed!.stage, "tree");
  draft = revise(draft, { composer: "More about the water work" }, true);
  assert.equal(draft.confirmed, null);
  assert.throws(() => confirmDraft(draft), /changed/);
  assert.deepEqual(previewFields(draft).themes, []);
  draft = revise(draft, {
    proposal: { ...suggestion, stage: "seed", themes: ["water"] },
    proposalVersion: draft.inputVersion,
  });
  assert.equal(reviewedProposal(draft)!.stage, "tree");
  assert.deepEqual(reviewedProposal(draft)!.themes, []);
});
test("explicit link removals cannot be reintroduced through public edits or raw forms", () => {
  let draft = revise(seed(), {
    links: ["https://example.org"],
    publicEdits: { links: ["https://example.org"] },
    form: formFrom({ ...EMPTY_INITIATIVE, links: ["https://example.org"] }),
  });
  draft = revise(draft, { links: [] }, true);
  assert.deepEqual(draft.publicEdits.links, []);
  assert.equal(draft.form!.links, "");
  assert.deepEqual(previewFields(draft).links, []);
});
test("device writes serialize newer input, and a second tab's new initiative is a draft of its own", async () => {
  const repository = new MemoryDraftRepository();
  const first = new DraftController(repository);
  const second = new DraftController(repository);
  await first.initialize();
  await second.initialize();
  first.change((draft) => revise(draft, { composer: "First" }, true));
  first.change((draft) => revise(draft, { composer: "Newest" }, true));
  await first.settled();
  assert.equal((await repository.load())!.composer, "Newest");
  assert.equal(first.getSnapshot().storage, "saved");
  // The second tab opened before anything was stored, so its words start another initiative.
  second.change((draft) => revise(draft, { composer: "Other tab" }, true));
  await second.settled();
  assert.equal(second.getSnapshot().storage, "saved");
  assert.equal(second.getSnapshot().error, null);
  assert.deepEqual((await repository.list()).map((draft) => draft.composer).sort(), ["Newest", "Other tab"]);
  assert.equal(repository.history.length, 0);
});
test("storage failure never claims a save or discards words; retry can recover without overwriting another draft", async () => {
  let fail = true;
  const memory = new MemoryDraftRepository();
  const controller = new DraftController({
    load: () => memory.load(),
    save: async (draft, revision) => {
      if (fail) throw new Error("Quota");
      return memory.save(draft, revision);
    },
  });
  await controller.initialize();
  controller.change((draft) => revise(draft, { composer: "Keep these words" }, true));
  await controller.settled();
  assert.equal(controller.getSnapshot().storage, "memory");
  assert.equal(controller.getSnapshot().draft.composer, "Keep these words");
  fail = false;
  controller.retry();
  await controller.settled();
  assert.equal(controller.getSnapshot().storage, "saved");
  assert.equal((await memory.load())!.composer, "Keep these words");
});
test("browser models never initiate a download and always destroy a session after success, failure or cancellation", async () => {
  let created = 0,
    destroyed = 0,
    prompts = 0;
  const factory = {
    availability: async () => "downloadable",
    create: async () => {
      created++;
      return {
        prompt: async () => JSON.stringify(EMPTY_INITIATIVE),
        destroy: () => {
          destroyed++;
        },
      };
    },
  };
  assert.equal(await availableBrowser(factory), false);
  await assert.rejects(browserExtract("Words", new AbortController().signal, factory));
  assert.equal(created, 0);
  const ready = { ...factory, availability: async () => "available" };
  assert.deepEqual(await browserExtract("Words", new AbortController().signal, ready), EMPTY_INITIATIVE);
  assert.equal(destroyed, 1);
  const invalid = {
    ...ready,
    create: async () => ({
      prompt: async () => {
        prompts++;
        return '{"unexpected":"ignore the schema"}';
      },
      destroy: () => {
        destroyed++;
      },
    }),
  };
  await assert.rejects(browserExtract("Words", new AbortController().signal, invalid));
  assert.equal(prompts, 2);
  assert.equal(destroyed, 2);
  const abort = new AbortController();
  const cancelled = {
    ...ready,
    create: async () => {
      abort.abort();
      return {
        prompt: async () => "{}",
        destroy: () => {
          destroyed++;
        },
      };
    },
  };
  await assert.rejects(browserExtract("Words", abort.signal, cancelled), { name: "AbortError" });
  assert.equal(destroyed, 3);
  const schema = JSON.stringify(modelConstraint());
  assert.ok(!schema.includes("maxLength"));
  assert.ok(schema.includes("additionalProperties"));
});
test("local speech passes langs and processLocally and never starts a remote-only recognizer", async () => {
  let options: unknown;
  let starts = 0;
  let aborts = 0;
  class Speech {
    processLocally = false;
    lang = "";
    continuous = false;
    interimResults = false;
    onresult: LocalSpeechSession["onresult"] = null;
    onerror: LocalSpeechSession["onerror"] = null;
    onend: LocalSpeechSession["onend"] = null;
    static async available(value: unknown) {
      options = value;
      return "available";
    }
    start() {
      assert.equal(this.processLocally, true);
      starts++;
    }
    stop() {}
    abort() {
      aborts++;
    }
  }
  Object.defineProperty(Speech.prototype, "processLocally", { value: false, writable: true });
  const handle = await startSpeech("device", "pt-BR", { result() {}, error() {}, end() {} }, { speech: Speech as SpeechConstructor });
  assert.deepEqual(options, { langs: ["pt-BR"], processLocally: true });
  assert.equal(starts, 1);
  handle.dispose();
  handle.dispose();
  assert.equal(aborts, 1);
  const remote = class extends Speech {};
  Object.defineProperty(remote, "available", { value: async () => "downloadable" });
  assert.equal(await availableSpeech("en-US", remote as SpeechConstructor), false);
  await assert.rejects(
    startSpeech("device", "en-US", { result() {}, error() {}, end() {} }, { speech: remote as SpeechConstructor }),
  );
  // Agreeing to the browser's speech service never turns a device session into a remote one.
  await assert.rejects(
    startSpeech("device", "en-US", { result() {}, error() {}, end() {} }, { speech: remote as SpeechConstructor, consent: memoryConsent(true) }),
  );
  assert.equal(starts, 1);
});
test("assistant records contain metadata and zero cloud words, never source text", () => {
  const run = {
    id: crypto.randomUUID(),
    step: "initiative" as const,
    engine: "keywords" as const,
    model: "Keyword draft",
    at: new Date().toISOString(),
    words: 7,
    cloudWords: 0 as const,
    status: "complete" as const,
    latencyMs: 12,
  };
  const draft = revise(seed(), { runs: [run] });
  assert.ok(!JSON.stringify(draft.runs).includes("Orchard"));
  assert.throws(() => DeviceDraftSchema.parse({ ...draft, runs: [{ ...run, text: "private source" }] }));
  assert.throws(() => DeviceDraftSchema.parse({ ...draft, runs: [{ ...run, cloudWords: 7 }] }));
});

test("PDF text extraction disables eval/WASM/font loading and cleans up on success, unread pages and abort", async () => {
  const { readPdfText } = await import("../src/describe/pdf-core.ts");
  let destroy = 0,
    cleanup = 0;
  let options: Record<string, unknown> = {};
  const library = {
    getDocument(value: Record<string, unknown>) {
      options = value;
      return {
        promise: Promise.resolve({
          numPages: 2,
          getPage: async (page: number) => ({
            getTextContent: async () => ({
              items: page === 1 ? [{ str: "Orchard learning circle", hasEOL: true }] : [],
            }),
            cleanup: () => {
              cleanup++;
            },
          }),
        }),
        destroy: async () => {
          destroy++;
        },
      };
    },
  };
  const result = await readPdfText(new Blob(["Synthetic PDF input"]), new AbortController().signal, library);
  assert.equal(result.text, "Orchard learning circle");
  assert.equal(result.pages, 2);
  assert.equal(result.unreadPages, 1);
  assert.equal(cleanup, 2);
  assert.equal(destroy, 1);
  assert.equal(options.isEvalSupported, false);
  assert.equal(options.useWasm, false);
  assert.equal(options.disableFontFace, true);
  assert.equal(options.useWorkerFetch, false);
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(readPdfText(new Blob(), abort.signal, library), { name: "AbortError" });
  assert.equal(destroy, 1);

  let started!: () => void;
  const opening = new Promise<void>((resolve) => {
    started = resolve;
  });
  let cancellationCleanup = false;
  const midFlight = new AbortController();
  const reading = readPdfText(new Blob(["Synthetic cancelled PDF"]), midFlight.signal, {
    getDocument() {
      started();
      return {
        promise: new Promise(() => {}),
        destroy: () => {
          cancellationCleanup = true;
          return new Promise(() => {});
        },
      };
    },
  });
  await opening;
  midFlight.abort();
  await assert.rejects(reading, { name: "AbortError" });
  assert.equal(cancellationCleanup, true, "a stuck parser is released without blocking cancellation");
});

test("unfinished answer, review and link edits survive device serialization and block premature confirmation", async () => {
  const original = seed();
  const id = original.turns[0]!.id;
  const draft = revise(original, {
    answerEdits: { [id]: "An unfinished changed answer" },
    pendingLink: "https://",
    reviewEdits: { themes: { value: "Unfinished; theme", lenses: [], wasKept: false } },
    proposal: { ...EMPTY_INITIATIVE, name: "Orchard" },
    proposalVersion: original.inputVersion,
  });
  const repository = new MemoryDraftRepository();
  await repository.save(draft, null);
  const loaded = (await repository.load())!;
  assert.equal(loaded.answerEdits[id], "An unfinished changed answer");
  assert.equal(loaded.pendingLink, "https://");
  assert.equal(loaded.reviewEdits.themes!.value, "Unfinished; theme");
  assert.throws(() => confirmDraft(loaded), /open detail/);
});
test("a blocked first load cannot overwrite an existing draft: words typed meanwhile become a draft of their own", async () => {
  const saved = seed();
  let fail = true;
  const written: string[] = [];
  const controller = new DraftController({
    load: async () => {
      if (fail) throw new Error("Blocked storage");
      return saved;
    },
    save: async (draft) => {
      written.push(draft.id);
    },
  });
  await controller.initialize();
  const typed = controller.change((draft) => revise(draft, { composer: "Words in this tab" }, true));
  assert.equal(controller.getSnapshot().storage, "memory");
  fail = false;
  controller.retry();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(controller.getSnapshot().storage, "saved");
  assert.equal(controller.getSnapshot().error, null);
  assert.equal(controller.getSnapshot().draft.composer, "Words in this tab");
  assert.notEqual(typed.id, saved.id);
  assert.deepEqual(written, [typed.id], "only the tab's own draft is written; the stored one is never touched");
});
test("unapproved cloud and downloaded-model adapters cannot send or download data", async () => {
  const { cloudAssistant } = await import("../src/describe/cloud.ts");
  const { downloadedModels } = await import("../src/describe/engines.ts");
  assert.equal(cloudAssistant.available, false);
  await assert.rejects(cloudAssistant.extract({ description: "Public synthetic test words" }), /D35/);
  assert.deepEqual(await downloadedModels.availability(), { state: "unavailable" });
  await assert.rejects(
    downloadedModels.download(new AbortController().signal, () => {}),
    /D32/,
  );
});

const FORM = {
  name: "Orchard circle",
  where: "Upper valley; Lower valley",
  about: "Families share growing skills.",
  links: "https://example.org",
};
/** A draft as the four fields leave it: raw text in the form, parsed values in the public edits. */
const typed = (form = FORM, from = newDraft()) =>
  revise(from, { form, publicEdits: editsFromForm(form, from.publicEdits) }, true);
const keywordBuild: NonNullable<DeviceDraft["lastBuild"]> = {
  engine: "keywords",
  unreadFiles: 0,
  sourceCharacters: 80,
  files: [],
  fallback: false,
};

test("keyword rules suggest learning and education from school and workshop words, in English and Portuguese", () => {
  const lenses = (text: string) => keywordSuggestion(newDraft(), text).lenses;
  assert.ok(lenses("We run a school garden and teaching workshops.").includes("learning"));
  assert.ok(lenses("Uma escola de agroecologia com oficinas para jovens.").includes("learning"));
  assert.ok(!lenses("We restore the river with families.").includes("learning"));
});
test("lenses come from whole words in any script, so água is place-based and relatório is not a river", () => {
  const lenses = (text: string) => keywordSuggestion(newDraft(), text).lenses;
  assert.deepEqual(lenses("Cuidamos da água da chuva."), ["place_based"]);
  assert.deepEqual(lenses("Água limpa para beber."), ["place_based"]);
  assert.deepEqual(lenses("O relatório necessário para o edital."), [], "rio is a whole word");
});
test("Portuguese words for territory, community, land and art reach their lenses", () => {
  const lenses = (text: string) => keywordSuggestion(newDraft(), text).lenses;
  for (const text of ["Cuidamos do território.", "Um trabalho comunitário.", "Pela reforma agrária.", "Regularização fundiária."])
    assert.deepEqual(lenses(text), ["place_based"], text);
  assert.deepEqual(lenses("Um projeto artístico."), ["art_culture"]);
});

/** A draft holding one synthetic PDF, and a reader that returns its text as PDF.js would. */
const withPdf = (text: string, from = newDraft()) => {
  const blob = new Blob(["Synthetic PDF bytes"], { type: "application/pdf" });
  const draft = revise(
    from,
    { attachments: [{ id: crypto.randomUUID(), name: "garden.pdf", type: blob.type, bytes: blob.size, blob }] },
    true,
  );
  const reader = async () => ({ text, pages: 1, unreadPages: 0 });
  return { draft, reader };
};
/** Build my card from a draft with a PDF, as the describe step does with the keyword reader. */
const buildFromPdf = async (text: string, from?: DeviceDraft) => {
  const { draft, reader } = withPdf(text, from);
  const result = fromSource(draft, await collectSource(draft, reader));
  return { result, built: fillFields(draft, result.suggestion, keywordBuild).draft };
};
const pdfWhere = async (text: string) => (await buildFromPdf(text)).result.suggestion.locations;
/** The person changes Where in the four fields, as the page does. */
const correct = (draft: DeviceDraft, where: string) => editFields(draft, { ...fieldsForm(draft), where });
const GARDEN = "Synthetic Garden\nSynthetic Garden is a community garden based in Awka. Families grow food together.";

test("a place the PDF states explicitly is proposed for Where, and its words are kept", async () => {
  const { result, built } = await buildFromPdf(GARDEN);
  assert.ok(result.text.includes("based in Awka"), "the source words are kept");
  assert.deepEqual(result.suggestion.locations, ["Awka"], "no country or region is added");
  assert.equal(result.suggestion.isGlobal, false);
  assert.equal(fieldsForm(built)!.where, "Awka", "the check card shows the proposal for review");
  assert.equal(built.confirmed, null, "a proposal counts only once the person keeps the card");
  assert.deepEqual(continueDescribe(built).confirmed!.locations, ["Awka"]);
});

test("a place is kept as written, with a country or region only when the words state one", async () => {
  assert.deepEqual(await pdfWhere("Our garden is located in Awka, Nigeria."), ["Awka, Nigeria"]);
  assert.deepEqual(await pdfWhere("We're based in Awka, Anambra State."), ["Awka, Anambra State"]);
  assert.deepEqual(await pdfWhere("Our community garden is in the town of Awka."), ["Awka"]);
  assert.deepEqual(await pdfWhere("Our project is located in Rio de Janeiro."), ["Rio de Janeiro"]);
  assert.deepEqual(await pdfWhere("We are a network of farmers based in Awka."), ["Awka"]);
  assert.deepEqual(await pdfWhere("Today, we are based in Awka."), ["Awka"]);
  assert.deepEqual(await pdfWhere("Founded in Enugu, Nigeria in 2010, we are now based in Awka."), ["Awka"]);
  assert.deepEqual(await pdfWhere("Synthetic Garden\nLocation: Awka, Anambra State\nFamilies grow food."), [
    "Awka, Anambra State",
  ]);
  assert.deepEqual(await pdfWhere("Based in Awka's main market."), ["Awka"], "a possessive is not part of the name");
  assert.deepEqual(await pdfWhere("We are based in Awka On Saturdays"), ["Awka"], "a capitalised joining word ends the name");
  // Plainer words count when the initiative says what it is and where (19 November 2026).
  assert.deepEqual(await pdfWhere("Our garden is in Awka."), ["Awka"]);
  assert.deepEqual(await pdfWhere("We are a school garden in Nairobi where children grow vegetables."), ["Nairobi"]);
  assert.deepEqual(await pdfWhere("In Awka, we grow food with families."), ["Awka"]);
  assert.deepEqual(
    await pdfWhere("We are based in Awka. Our garden is located in Awka, Nigeria."),
    ["Awka, Nigeria"],
    "the same place stated twice is one place",
  );
  const global = (await buildFromPdf("Synthetic Garden\nWhere: Global")).result.suggestion;
  assert.deepEqual([global.locations, global.isGlobal], [[], true]);
});

test("words with no stated place leave Where empty for the person to fill", async () => {
  for (const text of [
    "Families grow food together.",
    "We started in March 2024 and teach in English.",
    "Workshops run in the area near the school.",
    "Growing Food in Schools",
    "We grow food with families in Awka, Anambra State.",
    "We were in Awka until 2019.",
  ])
    assert.deepEqual(await pdfWhere(text), [], text);
  const { built } = await buildFromPdf("Synthetic Garden\nFamilies grow food together.");
  assert.equal(fieldsForm(built)!.where, "", "nothing pretends a place was found");
  assert.deepEqual(continueDescribe(correct(built, "Awka")).confirmed!.locations, ["Awka"], "the person can add it");
});

test("work in and operate in name a sector, a language or a department, never a place", async () => {
  for (const text of [
    "We work in Education.",
    "We work in WASH programmes.",
    "We are working in Partnership with schools.",
    "We work in Early Childhood Development.",
    "The team works in Kiswahili.",
    "We work in Yoruba with families.",
    "He works in Finance at Shell.",
    "We operate in Awka.",
  ])
    assert.deepEqual(await pdfWhere(text), [], text);
});

test("a place that belongs to someone else or to the past is not the initiative's Where", async () => {
  for (const text of [
    "Founded in Enugu, Nigeria in 2010, we now support farmers across the north.",
    "Our founder Ada grew up in Kano, Nigeria.",
    "Ada Obi studied in London, UK.",
    "Funded by the Ford Foundation in New York, USA.",
    "Our coordinator, Chidi, is based in Lagos. The garden is in Awka.",
    "Our partner Green Earth Foundation is based in Berlin.",
    "Green Earth, our partner organisation, is based in Berlin.",
    "Ada, who founded our garden, is based in Kano.",
    "We were based in Lagos.",
  ])
    assert.deepEqual(await pdfWhere(text), [], text);
});

test("cut-off names, addresses, titles, undecided labels and labelled lists are not places", async () => {
  for (const text of [
    "We are based in St. Louis.",
    "We are located in St. Mary's Parish.",
    "We are based in Plot 12, Zik Avenue, Awka.",
    "We are based in Dr Okafor's farm.",
    "Location: TBD",
    "Location: St. Louis",
    "Places: 30 participants",
    "Local: 5 volunteers",
    "Where: Online",
    "Where: Lagos; Abuja; Kano",
    "Location: Awka and Onitsha",
  ])
    assert.deepEqual(await pdfWhere(text), [], text);
});

test("two different places or a list stay unassigned, with every source word kept", async () => {
  for (const text of [
    "We are based in Awka. A second garden is located in Onitsha.",
    "Our coordinator, Chidi, is based in Onitsha. We are based in Awka.",
    "We are based in Awka and Onitsha.",
    "We are based in Awka, Onitsha and Nnewi.",
    "Our garden is located in Awka or Onitsha.",
    "Location: Awka\nLocation: Onitsha",
  ]) {
    const { result, built } = await buildFromPdf(text);
    assert.deepEqual(result.suggestion.locations, [], text);
    assert.ok(result.text.includes("Awka") && result.text.includes("Onitsha"), "the source words are kept");
    assert.equal(fieldsForm(built)!.where, "");
  }
  // These words give no name either, so the person writes one as well.
  const { built } = await buildFromPdf("We are based in Awka and Onitsha.");
  assert.equal(fieldsForm(built)!.name, "", "no name is made out of a sentence");
  const corrected = editFields(built, { ...fieldsForm(built), name: "Synthetic Garden", where: "Awka; Onitsha" });
  assert.deepEqual(continueDescribe(corrected).confirmed!.locations, ["Awka", "Onitsha"]);
});

test("words in the box propose a stated place by the same rule, and nothing is on the card before a fill", async () => {
  const typing = changeSaid(newDraft(), "We are based in Aw");
  assert.deepEqual(previewFields(typing).locations, [], "words in the box are not on the card");
  const said = changeSaid(newDraft(), "We are Synthetic Garden, a community garden based in Awka.");
  const { suggestion } = await readKeywordSource(said);
  assert.deepEqual(suggestion.locations, ["Awka"]);
  assert.deepEqual(previewFields(said).locations, [], "the card beside the fields waits for the fill");
  assert.deepEqual(previewFields(fillFields(said, suggestion, keywordBuild).draft).locations, ["Awka"]);
  // A draft from the earlier guided conversation keeps its Where answer over a file.
  const answered = addAnswer(addAnswer(newDraft(), "We are Synthetic Garden, a community garden based in Awka."), "Upper valley, Brazil");
  assert.deepEqual((await readKeywordSource(answered)).suggestion.locations, ["Upper valley, Brazil"]);
  const { result } = await buildFromPdf(GARDEN, seed());
  assert.deepEqual(result.suggestion.locations, ["Upper valley, Brazil"], "a file never replaces the answer");
});

test("a Where read from the person's words stays in pencil until they change it", async () => {
  const { built } = await buildFromPdf(GARDEN);
  assert.ok(built.filled.includes("where"));
  const renamed = editFields(built, { ...fieldsForm(built), name: "Garden" });
  assert.ok(renamed.filled.includes("where"), "changing another field leaves Where in pencil");
  assert.ok(!renamed.filled.includes("name"));
  assert.ok(!correct(built, "Awka, Anambra State").filled.includes("where"), "a Where the person changed is theirs");
  const placeless = (await buildFromPdf("Synthetic Garden\nFamilies grow food.")).built;
  assert.ok(!placeless.filled.includes("where"), "no place, nothing filled");
  assert.equal(fieldsForm(placeless).where, "");
});

test("a Where the person typed or changed is never replaced by a place from a PDF", async () => {
  const typedWhere = editFields(newDraft(), { name: "", where: "Upper valley", about: "", links: "" });
  const { result, built } = await buildFromPdf(GARDEN, typedWhere);
  assert.deepEqual(result.suggestion.locations, ["Awka"], "the file still proposes its place");
  assert.equal(fieldsForm(built).where, "Upper valley", "the typed Where wins");

  const corrected = correct((await buildFromPdf(GARDEN)).built, "Awka, Anambra State");
  const more = changeSaid(corrected, "We also keep bees.");
  const rebuilt = fillFields(more, keywordSuggestion(more, GARDEN), keywordBuild).draft;
  assert.equal(fieldsForm(rebuilt).where, "Awka, Anambra State", "filling again keeps the correction");
  assert.deepEqual(continueDescribe(rebuilt).confirmed!.locations, ["Awka, Anambra State"]);
});

test("a place proposed from a PDF and its manual correction survive a reload of the device draft", async () => {
  const repository = new MemoryDraftRepository();
  const controller = new DraftController(repository);
  await controller.initialize();
  const { built } = await buildFromPdf(GARDEN);
  controller.change(() => revise(built, {}));
  await controller.settled();
  /** A new tab reads a structured clone of the stored draft, as IndexedDB returns it. */
  const reload = async () => {
    const stored = DeviceDraftSchema.parse(structuredClone(await repository.load()));
    const tab = new DraftController(new MemoryDraftRepository(stored));
    await tab.initialize();
    return tab.getSnapshot().draft;
  };
  const proposed = await reload();
  assert.equal(fieldsForm(proposed)!.where, "Awka", "the proposal is still there after a reload");
  assert.equal(proposed.confirmed, null, "and still waits for review");
  assert.equal(await proposed.attachments[0]!.blob.text(), "Synthetic PDF bytes", "the original file is kept");

  controller.change((draft) => correct(draft, "Awka, Anambra State"));
  await controller.settled();
  const reloaded = await reload();
  assert.equal(reloaded.form!.where, "Awka, Anambra State");
  assert.deepEqual(reviewedProposal(reloaded)!.locations, ["Awka, Anambra State"]);
  assert.deepEqual(reloaded.proposal!.locations, ["Awka"], "the document's proposal stays apart from the correction");
  assert.deepEqual(continueDescribe(reloaded).confirmed!.locations, ["Awka, Anambra State"]);
});

test("a draft stored before places were read from files loads unchanged until the card is built again", async () => {
  const { built } = await buildFromPdf(GARDEN);
  // As the earlier version stored a built card: a proposal, and nothing typed into the fields.
  const stored: Record<string, unknown> = {
    ...built,
    mode: "conversation",
    proposal: { ...built.proposal!, locations: [] },
    form: null,
    publicEdits: {},
  };
  delete stored.filled;
  for (const key of ["needs", "offers", "funding", "partnerLeads", "account"]) delete stored[key];
  const loaded = DeviceDraftSchema.parse(structuredClone(stored));
  assert.deepEqual(reviewedProposal(loaded)!.locations, [], "loading never fills Where on its own");
  assert.equal(fieldsForm(loaded)!.where, "");
  assert.equal(loaded.attachments.length, 1);
  assert.deepEqual(keywordSuggestion(loaded, GARDEN).locations, ["Awka"], "building again proposes the place");
});
