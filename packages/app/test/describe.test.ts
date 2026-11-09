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
} from "../src/describe/contracts.ts";
import { DraftController } from "../src/describe/controller.ts";
import { DraftConflict, MemoryDraftRepository } from "../src/describe/repository.ts";
import { readKeywordSource } from "../src/describe/keywords.ts";
import { availableBrowser, browserExtract } from "../src/describe/engines.ts";
import {
  availableSpeech,
  startSpeech,
  type LocalSpeechSession,
  type SpeechConstructor,
} from "../src/describe/speech.ts";
import { editsFromForm, formFrom, parseRecordForm } from "../src/describe/forms.ts";
import { previewFields } from "../src/describe/view.ts";

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
