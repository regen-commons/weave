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
import { DraftConflict, MemoryDraftRepository } from "../src/describe/repository.ts";
import { keywordSuggestion, readKeywordSource } from "../src/describe/keywords.ts";
import { availableBrowser, browserExtract } from "../src/describe/engines.ts";
import {
  availableSpeech,
  startSpeech,
  type LocalSpeechSession,
  type SpeechConstructor,
} from "../src/describe/speech.ts";
import { editsFromForm, formFrom, parseRecordForm } from "../src/describe/forms.ts";
import { previewFields } from "../src/describe/view.ts";
import {
  afterFields,
  builtCard,
  continueWithFields,
  describeView,
  fieldsForm,
  fieldsLead,
  hasConversation,
  talkItThrough,
} from "../src/describe/screen.ts";

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
test("device writes serialize newer input and reject a second tab's stale revision", async () => {
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
  second.change((draft) => revise(draft, { composer: "Other tab" }, true));
  await second.settled();
  assert.equal(second.getSnapshot().storage, "conflict");
  assert.equal(second.getSnapshot().draft.composer, "Other tab");
  assert.equal((await repository.load())!.composer, "Newest");
  await assert.rejects(repository.save(newDraft(), null), DraftConflict);
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
  const handle = await startSpeech(
    "pt-BR",
    { result() {}, error() {}, end() {} },
    Speech as SpeechConstructor,
  );
  assert.deepEqual(options, { langs: ["pt-BR"], processLocally: true });
  assert.equal(starts, 1);
  handle.dispose();
  handle.dispose();
  assert.equal(aborts, 1);
  const remote = class extends Speech {};
  Object.defineProperty(remote, "available", { value: async () => "downloadable" });
  assert.equal(await availableSpeech("en-US", remote as SpeechConstructor), false);
  await assert.rejects(
    startSpeech("en-US", { result() {}, error() {}, end() {} }, remote as SpeechConstructor),
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

test("late model output is rejected after an input edit or cancellation, while metadata writes preserve the input version", async () => {
  const { assertBuildCurrent } = await import("../src/describe/contracts.ts");
  const draft = seed();
  const version = draft.inputVersion;
  const signal = new AbortController();
  assert.doesNotThrow(() =>
    assertBuildCurrent(revise(draft, { assistantPromptDismissed: true }), version, signal.signal),
  );
  assert.throws(
    () => assertBuildCurrent(revise(draft, { composer: "Newer words" }, true), version, signal.signal),
    { name: "AbortError" },
  );
  signal.abort();
  assert.throws(() => assertBuildCurrent(draft, version, signal.signal), { name: "AbortError" });
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
test("a blocked first load cannot overwrite an existing draft while new words remain recoverable", async () => {
  const saved = seed();
  let fail = true,
    writes = 0;
  const controller = new DraftController({
    load: async () => {
      if (fail) throw new Error("Blocked storage");
      return saved;
    },
    save: async () => {
      writes++;
    },
  });
  await controller.initialize();
  controller.change((draft) => revise(draft, { composer: "Words in this tab" }, true));
  assert.equal(controller.getSnapshot().storage, "memory");
  fail = false;
  controller.retry();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(controller.getSnapshot().storage, "conflict");
  assert.equal(controller.getSnapshot().draft.composer, "Words in this tab");
  assert.equal(writes, 0);
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

test("a new initiative is invited to speak first, and only one action is filled", () => {
  const fresh = newDraft();
  assert.deepEqual(fieldsLead(fresh, true), { voice: true, primary: "speak" });
  assert.deepEqual(fieldsLead(fresh, false), { voice: false, primary: "continue" }, "no local speech");
  assert.deepEqual(
    fieldsLead(typed(), true),
    { voice: true, primary: "continue" },
    "the invitation stays while typing, and Continue takes over",
  );
  assert.deepEqual(
    fieldsLead(typed({ ...FORM, name: " ", where: "", about: "", links: "" }), true),
    { voice: true, primary: "speak" },
    "blank fields are not typing",
  );
  const kept = continueWithFields(typed());
  assert.ok(kept.proposal, "the typed card exists");
  assert.deepEqual(fieldsLead(kept, true), { voice: false, primary: "continue" }, "an initiative with a card");
});

test("describe opens on the four fields, and on the conversation only when chosen or already used", () => {
  const fresh = newDraft();
  assert.equal(fresh.mode, "conversation", "the stored default mode is unchanged");
  assert.equal(describeView(fresh, null), "fields");
  assert.equal(describeView(fresh, "conversation"), "conversation", "chosen in this visit");
  assert.equal(describeView(typed(), null), "fields");
  assert.equal(hasConversation(typed()), false);

  const talked = seed();
  assert.equal(describeView(talked, null), "conversation");
  assert.equal(describeView(talked, "fields"), "fields");
  assert.equal(describeView(revise(talked, { mode: "fields" }), null), "fields", "a switch to the fields is kept");
  assert.equal(describeView(revise(fresh, { composer: "Half an answer" }, true), null), "conversation");
  assert.equal(describeView(revise(fresh, { pendingLink: "https://" }, true), null), "conversation");

  const card = { ...EMPTY_INITIATIVE, name: "Orchard circle" };
  const fromFiles = revise(fresh, { proposal: card, proposalVersion: 0, lastBuild: keywordBuild });
  assert.equal(describeView(fromFiles, null), "conversation", "a card the app built belongs to the conversation");
  assert.equal(describeView(continueWithFields(typed()), null), "fields", "a typed card does not");
});

test("Continue confirms exactly the four typed fields and goes on to needs and offers", () => {
  const draft = typed();
  assert.deepEqual(fieldsForm(draft), FORM);
  const next = continueWithFields(draft);
  assert.equal(afterFields(next), "needs");
  assert.deepEqual(next.confirmed, {
    ...EMPTY_INITIATIVE,
    name: "Orchard circle",
    locations: ["Upper valley", "Lower valley"],
    description: "Families share growing skills.",
    links: ["https://example.org"],
    confidence: 1,
  });
  assert.equal(next.proposalVersion, next.inputVersion);
  assert.equal(next.lastBuild?.engine, "manual");
  assert.equal(next.mode, "fields");
  assert.equal(next.assistant, draft.assistant, "typing the fields does not switch the assistant off");
  assert.deepEqual(fieldsForm(next), FORM, "the fields read the same when the person comes back");
  assert.equal(afterFields(continueWithFields(next)), "needs", "Continue again changes nothing they did not type");
});

test("Continue refuses a missing name, too many places and unsafe links in plain words, and stores nothing", async () => {
  assert.throws(() => continueWithFields(newDraft()), /^Error: Add a name for your initiative\.$/);
  assert.throws(() => continueWithFields(typed({ ...FORM, name: "  " })), /Add a name/);
  const nine = Array.from({ length: 9 }, (_, index) => `Place ${index + 1}`).join("; ");
  assert.throws(() => continueWithFields(typed({ ...FORM, where: nine })), /^Error: Use up to eight places/);
  assert.throws(() => continueWithFields(typed({ ...FORM, where: "x".repeat(121) })), /120 characters/);
  for (const links of ["https://", "javascript:alert(1)", "https://name:password@example.org"])
    assert.throws(() => continueWithFields(typed({ ...FORM, links })), /^Error: Use up to six complete http or https links\.$/);
  const seven = Array.from({ length: 7 }, (_, index) => `https://example.org/${index}`).join("\n");
  assert.throws(() => continueWithFields(typed({ ...FORM, links: seven })), /six complete/);

  const controller = new DraftController(new MemoryDraftRepository());
  await controller.initialize();
  const before = controller.change((draft) => typed({ ...FORM, links: "https://" }, draft));
  assert.throws(() => controller.change(continueWithFields), /six complete/);
  assert.equal(controller.getSnapshot().draft, before);
  assert.equal(afterFields(before), "check-card", "an unconfirmed draft never skips ahead");
});

test("details the app drew from a conversation are never confirmed from the four fields unseen", () => {
  const talked = seed();
  const built = revise(talked, {
    proposal: { ...EMPTY_INITIATIVE, name: "Orchard learning circle", lenses: ["place_based"], themes: ["soil"] },
    proposalVersion: talked.inputVersion,
    lastBuild: keywordBuild,
  });
  const toFields = (draft: typeof built) => typed(FORM, revise(draft, { mode: "fields", assistant: "none" }));

  // Suggestions still in pencil are dropped, not confirmed.
  const dropped = continueWithFields(toFields(built));
  assert.equal(afterFields(dropped), "needs");
  assert.equal(dropped.confirmed?.name, "Orchard circle");
  assert.deepEqual(dropped.confirmed?.lenses, []);
  assert.deepEqual(dropped.confirmed?.themes, []);

  // A detail the person kept earlier is not on this screen, so the check card shows it before it counts.
  const kept = continueWithFields(
    toFields(revise(built, { kept: ["lenses"], derivedEdits: { lenses: ["place_based"] } })),
  );
  assert.equal(kept.confirmed, null);
  assert.equal(afterFields(kept), "check-card");
  assert.deepEqual(reviewedProposal(kept)?.lenses, ["place_based"]);
  assert.equal(reviewedProposal(kept)?.name, "Orchard circle");
  assert.deepEqual(confirmDraft(kept).confirmed?.lenses, ["place_based"], "the check card can confirm it");

  // A removed detail stays removed and owes nothing.
  const removed = continueWithFields(
    toFields(revise(built, { removed: ["lenses"], derivedEdits: { lenses: ["place_based"] } })),
  );
  assert.equal(afterFields(removed), "needs");
  assert.deepEqual(removed.confirmed?.lenses, []);

  // An open detail editor is unfinished work for the check card.
  const editing = continueWithFields(
    typed(FORM, revise(newDraft(), { reviewEdits: { themes: { value: "soil", lenses: [], wasKept: false } } })),
  );
  assert.equal(editing.confirmed, null);
  assert.equal(afterFields(editing), "check-card");
});

test("Talk it through keeps what was typed, lets the conversation fill blank fields, and a build clears the raw field text", () => {
  const named = typed({ name: "Orchard circle", where: "", about: " ", links: "" });
  assert.equal(named.publicEdits.description, " ", "typing one field stores the others as blank");
  const talked = talkItThrough(named);
  assert.equal(talked.mode, "conversation");
  assert.equal(talked.inputVersion, named.inputVersion, "opening the conversation changes no words");
  assert.deepEqual(talked.publicEdits, { name: "Orchard circle", links: [] });
  assert.deepEqual(talked.form, named.form, "the raw field text is still there if they switch back");

  const proposal = {
    ...EMPTY_INITIATIVE,
    name: "Orchard learning circle",
    description: "Families care for soil and water.",
    locations: ["Upper valley, Brazil"],
  };
  const built = builtCard(talked, proposal, talked.inputVersion, keywordBuild);
  assert.equal(built.form, null, "the check card reads the built card, not the old field text");
  assert.equal(built.confirmed, null);
  assert.equal(built.proposalVersion, built.inputVersion);
  const card = reviewedProposal(built)!;
  assert.equal(card.name, "Orchard circle", "what the person typed wins");
  assert.equal(card.description, "Families care for soil and water.", "a blank field is filled from their words");
  assert.deepEqual(card.locations, ["Upper valley, Brazil"]);
  assert.equal(describeView(built, null), "conversation");

  // Without the pruning, the blank fields would have blanked the built card.
  const unpruned = reviewedProposal(builtCard(named, proposal, named.inputVersion, keywordBuild))!;
  assert.equal(unpruned.description, " ");
  assert.deepEqual(unpruned.locations, []);

  // Everything typed stays: places, the description and links.
  const full = talkItThrough(typed());
  assert.deepEqual(full.publicEdits, {
    name: "Orchard circle",
    description: "Families share growing skills.",
    locations: ["Upper valley", "Lower valley"],
    isGlobal: false,
    links: ["https://example.org"],
  });
  assert.deepEqual(full.links, ["https://example.org"]);
  const global = talkItThrough(typed({ ...FORM, where: "Global" }));
  assert.equal(global.publicEdits.isGlobal, true);
  assert.deepEqual(global.publicEdits.locations, []);

  // A chosen browser assistant is kept. "Use the four fields" stores none, which goes back to keywords.
  assert.equal(talked.assistant, "keywords");
  assert.equal(talkItThrough(revise(named, { assistant: "browser" })).assistant, "browser");
  assert.equal(talkItThrough(revise(named, { assistant: "none" })).assistant, "keywords");
});
test("keyword rules suggest learning and education from school and workshop words, in English and Portuguese", () => {
  const lenses = (text: string) => keywordSuggestion(newDraft(), text).lenses;
  assert.ok(lenses("We run a school garden and teaching workshops.").includes("learning"));
  assert.ok(lenses("Uma escola de agroecologia com oficinas para jovens.").includes("learning"));
  assert.ok(!lenses("We restore the river with families.").includes("learning"));
});
