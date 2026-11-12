import assert from "node:assert/strict";
import { test } from "node:test";
import {
  confirmDraft,
  keepPendingDetails,
  newDraft,
  pendingDetails,
  revise,
  type DeviceDraft,
  type Initiative,
} from "../src/describe/contracts.ts";
import { checkForm, checkView, keepCard, keepProblem, publicDetails, typedCard } from "../src/describe/check.ts";
import { detailText, hasDetail } from "../src/describe/details.ts";
import { editsFromForm } from "../src/describe/forms.ts";
import { builtCard, continueWithFields } from "../src/describe/screen.ts";

const proposal: Initiative = {
  name: "Orchard learning circle",
  locations: ["Upper valley, Brazil"],
  isGlobal: false,
  description: "Families restore an old orchard.",
  links: [],
  stage: "sprout",
  lenses: ["place_based"],
  themes: ["soil", "water"],
  beneficiaries: [],
  languages: [],
  confidence: 0.6,
};
const built = () => revise(newDraft(), { proposal, proposalVersion: 0 });

test("only pencil details with a value owe a decision, and one Keep card settles them all", () => {
  const draft = built();
  assert.deepEqual(pendingDetails(draft), ["stage", "lenses", "themes"]);
  assert.throws(() => confirmDraft(draft), /pencil/);
  const kept = keepPendingDetails(draft);
  assert.deepEqual(pendingDetails(kept), []);
  assert.deepEqual([...kept.kept].sort(), ["lenses", "stage", "themes"]);
  assert.deepEqual(kept.derivedEdits, { stage: "sprout", lenses: ["place_based"], themes: ["soil", "water"] });
  assert.equal(confirmDraft(kept).confirmed?.stage, "sprout");
  assert.equal(keepPendingDetails(kept), kept, "nothing pending leaves the draft untouched");
});

test("a removed detail stays removed through Keep card, and a corrected one keeps the correction", () => {
  const draft = revise(built(), { removed: ["themes"], derivedEdits: { stage: "tree" }, kept: ["stage"] });
  assert.deepEqual(pendingDetails(draft), ["lenses"]);
  const kept = keepPendingDetails(draft);
  assert.deepEqual(kept.removed, ["themes"]);
  const confirmed = confirmDraft(kept).confirmed!;
  assert.equal(confirmed.stage, "tree");
  assert.deepEqual(confirmed.themes, []);
  assert.deepEqual(confirmed.lenses, ["place_based"]);
});

test("details read as people see them, and empty ones say so", () => {
  assert.equal(detailText("stage", proposal), "Getting going");
  assert.equal(detailText("lenses", proposal), "Place-based");
  assert.equal(detailText("themes", proposal), "soil, water");
  assert.equal(detailText("beneficiaries", proposal), "Not stated");
  assert.equal(detailText("languages", { ...proposal, languages: ["pt", "en"] }), "Portuguese, English");
  assert.equal(hasDetail("beneficiaries", proposal), false);
  assert.equal(hasDetail("stage", proposal), true);
});

type Build = NonNullable<DeviceDraft["lastBuild"]>;
const keywordBuild: Build = { engine: "keywords", unreadFiles: 0, sourceCharacters: 80, files: [], fallback: false };
const manualBuild: Build = { ...keywordBuild, engine: "manual" };
const FORM = { name: "Orchard circle", where: "Upper valley", about: "Families share growing skills.", links: "" };
/** The four fields typed on the describe step, which counts as new words. */
const typed = (form = FORM, from = newDraft()) =>
  revise(from, { form, publicEdits: editsFromForm(form, from.publicEdits) }, true);
/** A card built from a conversation. */
const talked = () => builtCard(newDraft(), proposal, 0, keywordBuild);

test("the check card page shows a current card, and sends the person back when there is none to check", () => {
  assert.equal(checkView(newDraft()), "describe");
  assert.equal(checkForm(newDraft()), null);

  const card = talked();
  assert.equal(checkView(card), "card");
  assert.equal(typedCard(card), false);
  assert.deepEqual(checkForm(card), {
    name: "Orchard learning circle",
    where: "Upper valley, Brazil",
    about: "Families restore an old orchard.",
    links: "",
  });
  // Words changed after the build, so the card on the page would be out of date.
  assert.equal(checkView(revise(card, { composer: "One more thing" }, true)), "rebuild");

  // A typed card is never out of date: the fields are its words.
  const once = continueWithFields(typed());
  assert.equal(typedCard(once), true);
  const retyped = typed({ ...FORM, name: "Orchard circle two" }, once);
  assert.equal(retyped.confirmed, null);
  assert.notEqual(retyped.proposalVersion, retyped.inputVersion);
  assert.equal(checkView(retyped), "card");
  assert.deepEqual(checkForm(retyped), { ...FORM, name: "Orchard circle two" });
});

test("Keep card confirms the four fields as they read and every pencil detail in one tap", () => {
  const card = talked();
  const kept = keepCard(card);
  assert.equal(kept.confirmed?.name, "Orchard learning circle");
  assert.equal(kept.confirmed?.stage, "sprout");
  assert.deepEqual(kept.confirmed?.themes, ["soil", "water"]);
  assert.deepEqual(pendingDetails(kept), []);

  // A change typed on the check card is what gets kept.
  const form = { ...checkForm(card)!, name: "Orchard circle", where: "Global" };
  const edited = revise(card, { form, publicEdits: editsFromForm(form, card.publicEdits), confirmed: null });
  const changed = keepCard(edited).confirmed!;
  assert.equal(changed.name, "Orchard circle");
  assert.equal(changed.isGlobal, true);
  assert.deepEqual(changed.locations, []);

  // A typed card whose fields changed again is brought up to date and kept.
  const again = keepCard(typed({ ...FORM, name: "Orchard circle two" }, continueWithFields(typed())));
  assert.equal(again.confirmed?.name, "Orchard circle two");
  assert.equal(again.proposalVersion, again.inputVersion);
});

test("a card whose four details come from a Certified project is kept without reading the fields", () => {
  const linked = revise(newDraft(), {
    proposal,
    proposalVersion: 0,
    lastBuild: manualBuild,
    form: { name: "Typed over", where: "", about: "", links: "not a link" },
  });
  const kept = keepCard(linked, true);
  assert.equal(kept.confirmed?.name, "Orchard learning circle");
  assert.equal(kept.confirmed?.description, "Families restore an old orchard.");
  assert.equal(kept.confirmed?.stage, "sprout", "the details Weave keeps for matching are kept with it");
  assert.deepEqual(kept.publicEdits, linked.publicEdits);
  assert.throws(() => keepCard(linked), /six complete http or https links/, "the editable card would read them");
});

test("Keep card refuses in plain words and leaves the card unconfirmed", () => {
  const card = talked();
  assert.throws(() => keepCard(newDraft()), /^Error: Describe your initiative first\.$/);
  assert.throws(
    () => keepCard(revise(card, { form: { ...checkForm(card)!, name: " " }, confirmed: null })),
    /^Error: Add a name for your initiative\.$/,
  );
  assert.throws(() => keepCard(revise(card, { composer: "One more thing" }, true)), /^Error: Your words changed\./);
  const open = revise(card, { reviewEdits: { themes: { value: "soil", lenses: [], wasKept: false } } });
  assert.throws(() => keepCard(open), /^Error: Keep or cancel open detail changes/);

  // A schema failure never reaches the page as raw validation output.
  const nameless = revise(newDraft(), { proposal: { ...proposal, name: "" }, proposalVersion: 0, lastBuild: manualBuild });
  let failure: unknown;
  try {
    keepCard(nameless, true);
  } catch (error) {
    failure = error;
  }
  assert.ok(failure instanceof Error && failure.message.startsWith("["));
  assert.equal(keepProblem(failure), "Your card needs a name before it can be kept.");
  assert.equal(keepProblem(new Error("Your words changed.")), "Your words changed.");
  assert.equal(keepProblem("not an error"), "Your card needs a name before it can be kept.");
});

test("the read-only card lists the four public details the card holds", () => {
  const linked = revise(newDraft(), {
    proposal,
    proposalVersion: 0,
    lastBuild: manualBuild,
    links: ["https://example.org/orchard"],
  });
  const kept = keepCard(linked, true);
  assert.deepEqual(publicDetails(kept.confirmed!), {
    name: "Orchard learning circle",
    locations: ["Upper valley, Brazil"],
    description: "Families restore an old orchard.",
    links: ["https://example.org/orchard"],
  });
  assert.deepEqual(publicDetails({ ...proposal, isGlobal: true, locations: [] }).locations, ["Global"]);
});
