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
import { candidateChunks, chunksFrom, keywordExtraction, suggestKinds } from "../src/intake/keywords.ts";
import { addEntry, keepPending, toggleKind } from "../src/intake/entries.ts";
import { asksWithoutKind, cardText, intakeComplete } from "../src/intake/finish.ts";
import { draftText } from "../src/describe/view.ts";
import { MemoryDraftRepository } from "../src/describe/repository.ts";
import {
  ASK_KINDS,
  cardsNote,
  changeKind,
  continueBoth,
  continueStep,
  entryId,
  kindFocus,
  pencilHint,
  sectionCount,
  suggestedEntry,
} from "../src/intake/ask-page.ts";
import { askExtras } from "../src/intake/presentation.ts";
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
test("quick add keeps the person's words, suggests kinds in pencil and guards the list", () => {
  let step = addEntry(emptyAskStep(), "  Native seedlings and   fencing tools ");
  const entry = step.items[0]!;
  assert.equal(entry.value.title, "Native seedlings and fencing tools");
  assert.equal(entry.value.description, null);
  assert.equal(entry.decision, "pencil");
  assert.equal(entry.sourceKey, null);
  assert.deepEqual(entry.value.capitalForms, ["living", "material"]);
  assert.deepEqual(suggestKinds("Something unusual we cannot classify"), []);
  assert.equal(step.inputVersion, 0);
  assert.throws(() => addEntry(step, "   "), /few words/);
  assert.throws(() => addEntry(step, "native seedlings AND fencing tools"), /already/);
  const long = "Help ".repeat(60).trim();
  step = addEntry(step, long);
  assert.equal(step.items[1]!.value.title.length, 139);
  assert.ok(step.items[1]!.value.title.endsWith("Help"));
  assert.equal(step.items[1]!.value.description, long);
  assert.equal(addEntry(emptyAskStep(), "x".repeat(200)).items[0]!.value.title.length, 140);
  for (const words of ["A truck", "A map", "A workshop"]) step = addEntry(step, words);
  assert.throws(() => addEntry(step, "One more"), /Five/);
  step = decide(step, entry.id, "removed");
  assert.equal(activeItems(addEntry(step, "One more")).length, 5);
});
test("kinds are added and removed one at a time, in a stable order, and money leaves with Financial", () => {
  let step = addEntry(emptyAskStep(), "Something unusual we cannot classify");
  const { id } = step.items[0]!;
  assert.deepEqual(step.items[0]!.value.capitalForms, []);
  step = toggleKind(step, id, "social");
  step = toggleKind(step, id, "living");
  step = toggleKind(step, id, "financial");
  assert.deepEqual(step.items[0]!.value.capitalForms, ["living", "social", "financial"]);
  assert.equal(step.items[0]!.decision, "pencil");
  step = changeStep(step, {
    items: step.items.map((item) => ({
      ...item,
      value: { ...item.value, amount: { min: 10, max: 20, currency: "USD" } },
    })),
  });
  step = toggleKind(step, id, "financial");
  assert.deepEqual(step.items[0]!.value.capitalForms, ["living", "social"]);
  assert.equal(step.items[0]!.value.amount, null);
  step = decide(step, id, "removed");
  assert.throws(() => toggleKind(step, id, "living"), /no longer/);
  assert.throws(() => toggleKind(step, crypto.randomUUID(), "living"), /no longer/);
});
test("Continue keeps every entry in pencil, and an entry with no kind can stay on the device", () => {
  let step = addEntry(addEntry(emptyAskStep(), "Seedlings"), "Something unusual we cannot classify");
  assert.throws(() => reviewStep(step), /pencil/);
  const kept = keepPending(step);
  assert.ok(kept.items.every((item) => item.decision === "kept"));
  assert.deepEqual(kept.items[1]!.value.capitalForms, []);
  assert.equal(reviewStep(kept).reviewedVersion, kept.inputVersion);
  assert.equal(AskSchema.safeParse(kept.items[1]!.value).success, false);
  assert.equal(keepPending(kept), kept);
  step = decide(kept, kept.items[1]!.id, "removed");
  step = decide(step, kept.items[1]!.id, "pencil");
  assert.equal(step.items[1]!.decision, "kept");
  let draft = confirmDraft(
    revise(newDraft(), { proposal: { ...EMPTY_INITIATIVE, name: "Synthetic initiative" }, proposalVersion: 0 }),
  );
  draft = revise(draft, { needs: reviewStep(kept), offers: reviewStep(emptyAskStep()) });
  assert.equal(intakeComplete(draft), true);
  assert.deepEqual(
    asksWithoutKind(draft).map((entry) => [entry.kind, entry.title]),
    [["needs", "Something unusual we cannot classify"]],
  );
});
test("making cards from a conversation never drops or repeats an entry added by hand", () => {
  let step = addEntry(answerStep(emptyAskStep(), "needs", "Seeds; Tools; A meeting room"), "A meeting room");
  step = build(step);
  assert.deepEqual(
    activeItems(step).map((item) => item.value.title),
    ["A meeting room", "Seeds", "Tools"],
  );
  assert.equal(step.items[0]!.sourceKey, null);
  assert.equal(step.items[0]!.decision, "pencil");
  for (const words of ["One", "Two"]) step = addEntry(step, words);
  assert.throws(() => addEntry(step, "Three"), /Five/);
  step = build(changeStep(step, { items: step.items.filter((item) => item.sourceKey === null) }));
  assert.equal(activeItems(step).length, 5);
  assert.equal(activeItems(step).filter((item) => item.sourceKey === null).length, 3);
});

test("the needs and offers page counts its lists and says what dashed means", () => {
  const empty = emptyAskStep();
  assert.equal(sectionCount(empty), "0 of 5");
  assert.equal(pencilHint(empty), "");
  assert.equal(pencilHint(addEntry(empty, "Something unusual we cannot classify")), "");
  const quick = addEntry(empty, "Seedlings");
  assert.equal(sectionCount(quick), "1 of 5");
  assert.equal(suggestedEntry(quick.items[0]!), false);
  assert.equal(pencilHint(quick), "Dashed kinds are suggestions. Remove any that are wrong.");
  assert.equal(pencilHint(keepPending(quick)), "");
  const made = seed();
  assert.equal(suggestedEntry(made.items[0]!), true);
  assert.equal(pencilHint(made), "Dashed cards and kinds are suggestions. Remove any that are wrong.");
  assert.equal(sectionCount(decide(made, made.items[0]!.id, "removed")), `${made.items.length - 1} of 5`);
  assert.equal(entryId("x", "details"), "ask-x-details");
});

test("the page says when words still wait for cards", () => {
  assert.equal(
    cardsNote(answerStep(emptyAskStep(), "needs", "Native seedlings")),
    "Make cards from your words, then continue.",
  );
  const made = seed();
  assert.equal(cardsNote(made), "");
  const stale = commitPending(changeStep(made, { composer: "New words" }, true), "needs");
  assert.equal(cardsNote(stale), "Your words changed. Make cards again, then continue.");
  assert.equal(cardsNote(changeStep(stale, { mode: "manual" })), "");
});

test("continue keeps every pencil entry in both lists, or changes neither", () => {
  const needs = addEntry(seed(), "A fence for the tree nursery");
  const offers = addEntry(emptyAskStep(), "A workshop on mapping water");
  const done = continueBoth({ needs, offers });
  if (!done.ok) throw new Error("Both lists should continue");
  for (const kind of ASK_KINDS) {
    assert.ok(done.steps[kind].items.every((item) => item.decision === "kept"));
    assert.equal(done.steps[kind].reviewedVersion, done.steps[kind].inputVersion);
  }
  assert.equal(continueBoth({ needs: emptyAskStep(), offers: emptyAskStep() }).ok, true);
  assert.deepEqual(continueBoth({ needs, offers }, { needs: "", offers: "Tools" }), {
    ok: false,
    blocked: { offers: { where: "add", message: "Add what you typed or clear it, then continue." } },
  });
  const blocker = (step: AskStep) => {
    const result = continueStep(step);
    if (result.ok) throw new Error("This list should be blocked");
    return result.blocker;
  };
  assert.deepEqual(blocker(changeStep(needs, { editor: { id: null, form: formFromAsk() } })), {
    where: "editor",
    message: "Keep or cancel the details you have open, then continue.",
  });
  assert.deepEqual(blocker(changeStep(needs, { composer: "More words" }, true)), {
    where: "talk",
    message: "Make cards from your answer or clear it, then continue.",
  });
  assert.deepEqual(blocker(changeStep(changeStep(needs, { mode: "manual" }), { composer: "Notes" }, true)), {
    where: "talk",
    message: "Keep your notes or clear them, then continue.",
  });
  assert.deepEqual(blocker(changeStep(needs, { pendingLink: "https://example.org" }, true)), {
    where: "talk",
    message: "Add the link or clear it, then continue.",
  });
  assert.deepEqual(blocker(commitPending(changeStep(needs, { composer: "New words" }, true), "needs")), {
    where: "talk",
    message: "Your words changed. Make cards again, then continue.",
  });
});

test("changing a kind keeps a suggested card, so making cards again does not undo it", () => {
  const made = seed();
  const card = made.items[0]!;
  const kind = CapitalFormSchema.options.find((option) => !card.value.capitalForms.includes(option))!;
  const changed = changeKind(made, card.id, kind);
  const kept = changed.items.find((item) => item.id === card.id)!;
  assert.equal(kept.decision, "kept");
  assert.ok(kept.value.capitalForms.includes(kind));
  assert.deepEqual(
    build(changed).items.find((item) => item.id === card.id)?.value.capitalForms,
    kept.value.capitalForms,
  );
  const quick = addEntry(emptyAskStep(), "Seedlings");
  assert.equal(changeKind(quick, quick.items[0]!.id, "financial").items[0]!.decision, "pencil");
});

test("focus stays in its row after a kind is added or removed", () => {
  assert.equal(kindFocus("x", ["living", "social"], "living"), "ask-x-kind-social-remove");
  assert.equal(kindFocus("x", ["living", "social"], "social"), "ask-x-kind-living-remove");
  assert.equal(kindFocus("x", ["living"], "living"), "ask-x-kinds");
  assert.equal(kindFocus("x", ["living"], "material"), "ask-x-kind-intellectual-add");
  assert.equal(kindFocus("x", ["living"], "spiritual"), "ask-x-kind-cultural-add");
  assert.equal(
    kindFocus(
      "x",
      CapitalFormSchema.options.filter((option) => option !== "spiritual"),
      "spiritual",
    ),
    "ask-x-kind-spiritual-remove",
  );
});

test("a card shows only the details a person added", () => {
  const value = addEntry(emptyAskStep(), "Seedlings").items[0]!.value;
  assert.equal(askExtras(value, "needs"), "");
  assert.equal(
    askExtras(
      {
        ...value,
        amount: { min: 500, max: 500, currency: "USD" },
        placeScope: "region",
        exchangeTerms: ["gift", "paid"],
        status: "met",
      },
      "needs",
    ),
    "USD 500, Our region, Gift or Paid, Met",
  );
  assert.equal(askExtras({ ...value, urgency: "now", capacity: "Two days a month" }, "needs"), "Now");
  assert.equal(askExtras({ ...value, urgency: "now", capacity: "Two days a month" }, "offers"), "Two days a month");
});
