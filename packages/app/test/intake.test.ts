import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addAnswer,
  confirmDraft,
  DeviceDraftSchema,
  EMPTY_INITIATIVE,
  newDraft,
  revise,
} from "../src/describe/contracts.ts";
import {
  AskSchema,
  AskStepSchema,
  CapitalFormSchema,
  parseExtraction,
  emptyAskStep,
  type AskStep,
} from "../src/intake/contracts.ts";
import {
  activeItems,
  answerStep,
  changeStep,
  commitPending,
  decide,
  formFromAsk,
  keepEditor,
  keepLink,
  question,
  reconcile,
  reviewStep,
} from "../src/intake/state.ts";
import { candidateChunks, chunksFrom, keywordExtraction } from "../src/intake/keywords.ts";
import { cardText, intakeComplete } from "../src/intake/finish.ts";
import { draftText } from "../src/describe/view.ts";
import { MemoryDraftRepository } from "../src/describe/repository.ts";
const build = (step: AskStep) =>
  reconcile(
    step,
    keywordExtraction(
      candidateChunks(
        step.turns.flatMap((turn) => chunksFrom(turn.text, turn.id)),
        step,
      ),
      "needs",
    ),
  );
const seed = () =>
  build(
    answerStep(
      emptyAskStep(),
      "needs",
      "Native seedlings; Tools and volunteers; Financial support for fencing",
    ),
  );
const allKept = (step: AskStep) => {
  for (const item of activeItems(step)) step = decide(step, item.id, "kept");
  return reviewStep(step);
};

test("legacy Describe drafts gain independent empty steps without losing words, files or identity", () => {
  const draft = addAnswer(newDraft(), "A synthetic initiative");
  const { needs: _needs, offers: _offers, ...legacy } = draft;
  const restored = DeviceDraftSchema.parse(legacy);
  assert.equal(restored.id, draft.id);
  assert.deepEqual(restored.turns, draft.turns);
  assert.deepEqual(restored.needs, emptyAskStep());
  assert.notEqual(restored.needs, restored.offers);
  const changed = revise(restored, { needs: answerStep(restored.needs, "needs", "Tools") });
  assert.equal(changed.offers.turns.length, 0);
  assert.equal(changed.inputVersion, draft.inputVersion);
});
test("all eight kinds can apply together and keyword mode never invents a kind or currency", () => {
  const text =
    "Living, material, intellectual, experiential, social, financial, cultural and spiritual support";
  const result = keywordExtraction(chunksFrom(text, crypto.randomUUID()), "needs");
  assert.deepEqual(new Set(result.items[0]!.value.capitalForms), new Set(CapitalFormSchema.options));
  assert.ok(AskSchema.safeParse(result.items[0]!.value).success);
  const unknown = keywordExtraction(
    chunksFrom("Something unusual we cannot classify", crypto.randomUUID()),
    "offers",
  ).items[0]!.value;
  assert.deepEqual(unknown.capitalForms, []);
  assert.equal(unknown.amount, null);
  assert.equal(unknown.urgency, null);
  assert.equal(AskSchema.safeParse(unknown).success, false);
});
test("overflow keeps only five cards in source order and preserved words can supply the next card after removal", () => {
  let step = build(
    answerStep(emptyAskStep(), "needs", "Seeds; Tools; Data; Skills; Partners; Cultural stories; Care"),
  );
  assert.equal(activeItems(step).length, 5);
  assert.equal(step.heard, 7);
  assert.equal(step.omitted, 2);
  assert.deepEqual(
    activeItems(step).map((item) => item.value.title),
    ["Seeds", "Tools", "Data", "Skills", "Partners"],
  );
  step = decide(step, step.items[0]!.id, "removed");
  step = build(step);
  assert.equal(activeItems(step).length, 5);
  assert.ok(activeItems(step).some((item) => item.value.title === "Cultural stories"));
  assert.ok(!activeItems(step).some((item) => item.value.title === "Seeds"));
  assert.throws(
    () => decide(step, step.items.find((item) => item.decision === "removed")!.id, "pencil"),
    /Five/,
  );
  assert.ok(step.turns[0]!.text.endsWith("Care"));
});
test("kept corrections and removed source chunks survive edits and repeated extraction", () => {
  let step = seed();
  const keptId = step.items[0]!.id;
  const removedId = step.items[1]!.id;
  step = changeStep(step, {
    editor: {
      id: keptId,
      form: {
        ...formFromAsk(step.items[0]!.value),
        title: "Seedlings confirmed by us",
        capitalForms: ["living", "material"],
      },
    },
  });
  step = keepEditor(step, "needs");
  step = decide(step, removedId, "removed");
  step = changeStep(
    step,
    {
      turns: step.turns.map((turn) => ({
        ...turn,
        text: "Different words about seedlings; Other tools and volunteers; More financial support",
      })),
    },
    true,
  );
  step = build(step);
  assert.equal(step.items.find((item) => item.id === keptId)!.value.title, "Seedlings confirmed by us");
  assert.deepEqual(step.items.find((item) => item.id === keptId)!.value.capitalForms, ["living", "material"]);
  assert.equal(step.items.find((item) => item.id === removedId)!.decision, "removed");
  assert.equal(activeItems(step).length, 2);
  step = decide(step, removedId, "pencil");
  assert.equal(step.items.find((item) => item.id === removedId)!.decision, "pencil");
  step = decide(step, keptId, "removed");
  step = decide(step, keptId, "pencil");
  assert.equal(
    step.items.find((item) => item.id === keptId)!.decision,
    "kept",
    "Undo restores the previous kept decision",
  );
  step = build(step);
  assert.equal(step.items.find((item) => item.id === keptId)!.value.title, "Seedlings confirmed by us");
});
test("manual entry validates amounts, all kinds and exclusive open terms while preserving incomplete raw values", () => {
  let step = changeStep(emptyAskStep(), {
    mode: "manual",
    editor: {
      id: null,
      form: {
        ...formFromAsk(),
        title: "Tools",
        capitalForms: ["material", "financial"],
        amountMin: "12,",
        currency: "BR",
      },
    },
  });
  assert.throws(() => keepEditor(step, "needs"));
  assert.equal(step.editor!.form.amountMin, "12,");
  step = changeStep(step, {
    editor: {
      id: null,
      form: {
        ...step.editor!.form,
        amountMin: "1200.50",
        amountMax: "1500",
        currency: "brl",
        exchangeTerms: ["gift", "exchange"],
      },
    },
  });
  step = keepEditor(step, "needs");
  assert.deepEqual(step.items[0]!.value.amount, { min: 1200.5, max: 1500, currency: "BRL" });
  assert.equal(step.items[0]!.decision, "kept");
  assert.equal(reviewStep(step).reviewedVersion, 0);
  assert.throws(() => AskSchema.parse({ ...step.items[0]!.value, exchangeTerms: ["gift", "open"] }));
  assert.throws(() => AskSchema.parse({ ...step.items[0]!.value, capitalForms: ["material"] }));
  assert.throws(() =>
    AskSchema.parse({ ...step.items[0]!.value, amount: { min: 20, max: 10, currency: "USD" } }),
  );
});
test("manual entry and undo enforce the same five-card rule; invalid mutations leave the step intact", () => {
  let step = allKept(build(answerStep(emptyAskStep(), "needs", "Seeds; Tools; Data; Skills; Partners")));
  const original = step;
  step = changeStep(step, {
    editor: { id: null, form: { ...formFromAsk(), title: "One more", capitalForms: ["social"] } },
  });
  assert.throws(() => keepEditor(step, "needs"), /Five/);
  assert.equal(activeItems(original).length, 5);
  assert.throws(() =>
    AskStepSchema.parse({
      ...original,
      items: [...original.items, { ...original.items[0], id: crypto.randomUUID() }],
    }),
  );
});
test("unfinished answer/link/editor input survives storage and text recovery without silently committing other fields", async () => {
  let step = seed();
  const id = step.turns[0]!.id;
  step = changeStep(
    step,
    {
      composer: "Unfinished answer",
      pendingLink: "https://example.org",
      answerEdits: { [id]: "Unfinished changed words" },
      editor: {
        id: step.items[0]!.id,
        form: { ...formFromAsk(step.items[0]!.value), description: "Unfinished card correction" },
      },
    },
    true,
  );
  const linked = keepLink(step);
  assert.equal(linked.composer, "Unfinished answer");
  assert.equal(linked.answerEdits[id], "Unfinished changed words");
  const repository = new MemoryDraftRepository();
  const draft = revise(newDraft(), { needs: linked });
  await repository.save(draft, null);
  const restored = (await repository.load())!;
  assert.equal(restored.needs.editor!.form.description, "Unfinished card correction");
  assert.ok(draftText(restored).includes("Unfinished answer"));
  assert.ok(draftText(restored).includes("Unfinished card correction"));
  assert.throws(() => reviewStep(restored.needs), /unfinished/);
  assert.throws(() => commitPending({ ...step, pendingLink: "javascript:alert(1)" }, "needs"));
});
test("continuing rejects pencil, stale or open edits; an empty step and manually completed cards can continue", () => {
  const step = seed();
  assert.throws(() => reviewStep(step), /pencil/);
  const done = allKept(step);
  assert.equal(done.reviewedVersion, done.inputVersion);
  const edited = changeStep(done, { composer: "New words" }, true);
  assert.equal(edited.reviewedVersion, null);
  const committed = commitPending(edited, "needs");
  assert.throws(() => reviewStep(committed), /changed/);
  assert.equal(reviewStep(emptyAskStep()).reviewedVersion, 0);
  const manual = changeStep(committed, { mode: "manual" });
  assert.equal(reviewStep(manual).reviewedVersion, manual.inputVersion);
});
test("money gets one nudge and no question asks for an extra initiative field", () => {
  const step = build(answerStep(emptyAskStep(), "needs", "Financial support for tools"));
  assert.match(question(step, "needs"), /^Money is/);
  const answered = answerStep(step, "needs", "A partner for learning");
  assert.equal(answered.moneyNudgeSeen, true);
  assert.equal(question(answered, "needs"), "Anything else you need?");
});
test("Finish requires all three checked steps and copies only kept card data", () => {
  let draft = newDraft();
  draft = confirmDraft(
    revise(draft, { proposal: { ...EMPTY_INITIATIVE, name: "Orchard circle" }, proposalVersion: 0 }),
  );
  let needs = seed();
  needs = decide(needs, needs.items[1]!.id, "removed");
  needs = allKept(needs);
  draft = revise(draft, { needs, offers: reviewStep(emptyAskStep()) });
  assert.equal(intakeComplete(draft), true);
  const text = cardText(draft);
  assert.ok(text.includes("Native seedlings"));
  assert.ok(!text.includes("Tools and volunteers"));
  assert.ok(text.includes("Not shared"));
  const changed = revise(draft, { offers: changeStep(draft.offers, { pendingLink: "https://" }, true) });
  assert.equal(intakeComplete(changed), false);
  assert.throws(() => cardText(changed));
  assert.equal(intakeComplete(revise(draft, { composer: "Changed initiative words" }, true)), false);
});

test("comma-separated asks preserve numeric punctuation and explicit offers never become needs", () => {
  const chunks = chunksFrom(
    "We need seedlings, someone who can map the water, and fencing for R$ 60,000",
    crypto.randomUUID(),
  );
  assert.equal(chunks.length, 3);
  assert.ok(chunks[2]!.text.includes("60,000"));
  const mixed = chunksFrom("We offer tools; We need seedlings; A workshop", crypto.randomUUID());
  assert.deepEqual(
    keywordExtraction(mixed, "needs").items.map((item) => item.value.title),
    ["We need seedlings", "A workshop"],
  );
  assert.deepEqual(
    keywordExtraction(mixed, "offers").items.map((item) => item.value.title),
    ["We offer tools", "A workshop"],
  );
});
test("model extraction rejects invented or repeated sources and excessive counts", () => {
  const chunks = chunksFrom("Tools; Seedlings", crypto.randomUUID());
  const result = keywordExtraction(chunks, "needs");
  assert.deepEqual(parseExtraction(result, chunks), result);
  assert.throws(
    () =>
      parseExtraction(
        {
          ...result,
          items: result.items.map((item, index) => (index ? item : { ...item, sourceKey: "invented" })),
        },
        chunks,
      ),
    /source/,
  );
  assert.throws(
    () => parseExtraction({ ...result, items: [result.items[0], result.items[0]] }, chunks),
    /source/,
  );
  assert.throws(() => parseExtraction({ ...result, heard: 99 }, chunks), /limit/);
  assert.throws(() => parseExtraction({ items: [], heard: 1 }, chunks), /limit/);
});
