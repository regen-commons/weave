import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseDocument, parseSaved } from "@weave/api/account-contract";
import { loadedDraft } from "../src/account/document.ts";
import { confirmDraft, newDraft, pendingDetails, revise } from "../src/describe/contracts.ts";
import { draftFromRecord, draftWithRecord } from "../src/initiative/import.ts";
import {
  cardName,
  cardRoute,
  cardStatus,
  chosenEntries,
  entryCount,
  openSteps,
  publicCard,
  publicKey,
  shareable,
} from "../src/initiative/status.ts";
import { addEntry, keepPending } from "../src/intake/entries.ts";
import { intakeComplete } from "../src/intake/finish.ts";
import { reviewStep } from "../src/intake/state.ts";
import {
  createSocialFixture,
  ORCHARD_RECORD,
  SEED_LIBRARY_RECORD,
  WATER_NOTES_RECORD,
} from "../src/social/fixture.ts";

const owner = "b1000000-0000-4000-8000-000000000001";
const saved = parseSaved({
  id: "b3000000-0000-4000-8000-000000000001",
  revision: 1,
  updatedAt: "2026-11-05T00:00:00Z",
  document: parseDocument(
    JSON.parse(readFileSync(new URL("../../api/src/test-data/account.json", import.meta.url), "utf8")),
  ),
});
const complete = loadedDraft(saved, owner);
const renamed = revise(complete, { confirmed: { ...complete.confirmed!, name: "Orchard circle, renamed" } });
const everyEntry = chosenEntries(complete, "all").map((entry) => entry.id);
const PRIVATE_NOTE = "Only you can see it. Files and conversations stay on this device.";

test("with the live account, the line says where the card is kept and the one saving step open now", () => {
  assert.deepEqual(cardStatus(newDraft(), "saved", null, "signed-out"), {
    state: "none",
    line: "",
    unsaved: false,
    save: null,
    sharing: null,
    publishing: null,
  });
  const draft = revise(newDraft(), { composer: "a few words" });
  assert.equal(cardStatus(draft, "saved", null, "signed-out").line, "On this device only.");
  assert.equal(cardStatus(draft, "saving", null, "signed-out").line, "Saving on this device.");
  assert.equal(cardStatus(draft, "memory", null, "signed-out").line, "Not saved on this device.");
  assert.equal(cardStatus(draft, "conflict", null, "signed-out").state, "conflict");
  assert.equal(cardStatus(draft, "saved", null, "none").save, null, "an unchecked card has nothing to save yet");

  const signedOut = cardStatus(complete, "saved", null, "signed-out");
  assert.equal(signedOut.state, "device");
  assert.deepEqual(signedOut.save, { needs: "sign-in", label: "Sign in to save", note: "" });
  assert.deepEqual([signedOut.sharing, signedOut.publishing], [null, null], "no row for a service that is not built");

  const signedIn = cardStatus(complete, "saved", null, "none");
  assert.equal(signedIn.state, "device", "signing in alone saves nothing");
  assert.deepEqual(signedIn.save, { needs: "save", label: "Save privately", note: PRIVATE_NOTE });

  const current = cardStatus(complete, "saved", null, "current");
  assert.deepEqual(
    [current.state, current.line, current.unsaved, current.save],
    ["saved", "Saved privately in Weave. Only you can see it.", false, null],
  );
  const changed = cardStatus(complete, "saved", null, "changed");
  assert.deepEqual(
    [changed.state, changed.line, changed.unsaved, changed.save?.label],
    ["saved", "Changed on this device since you saved.", true, "Save changes"],
  );
});

test("a need with no kind of support stays on the card, and the live account says what saving needs first", async () => {
  const needs = reviewStep(keepPending(addEntry(complete.needs, "Something unusual we cannot classify")));
  const bare = revise(complete, { needs });
  assert.equal(intakeComplete(bare), true, "a kept entry needs no kind of support on the device");
  assert.equal(
    cardStatus(bare, "saved", null, "none").save?.note,
    'Add a kind of support to "Something unusual we cannot classify" first. Saving needs one on every need and offer.',
  );
  const example = createSocialFixture("draft", "2026-11-04");
  await example.signIn();
  assert.equal(
    cardStatus(bare, "saved", example.snapshot(), "signed-out").save?.note,
    PRIVATE_NOTE,
    "the target allows a private save with no kind of support",
  );
  assert.equal(chosenEntries(bare, "all").length, 3);
  assert.deepEqual(
    shareable(bare).map((entry) => entry.title),
    chosenEntries(complete, "all").map((entry) => entry.title),
    "sharing or publishing leaves out an entry with no kind of support",
  );
});

test("signing in, saving privately and changing the card are three separate states", async () => {
  const example = createSocialFixture("draft", "2026-11-04");
  const visitor = cardStatus(complete, "saved", example.snapshot(), "signed-out");
  assert.equal(visitor.state, "device");
  assert.equal(visitor.save?.needs, "sign-in");
  assert.deepEqual(visitor.sharing, {
    state: "locked",
    line: "Sharing for matching needs a Certified project.",
    waits: "project",
  });
  assert.equal(visitor.publishing, null, "nothing to say about publishing before a project is linked");

  await example.signIn();
  const signedIn = cardStatus(complete, "saved", example.snapshot(), "signed-out");
  assert.equal(signedIn.state, "device", "signing in alone saves nothing");
  assert.deepEqual(signedIn.save, { needs: "save", label: "Save privately", note: PRIVATE_NOTE });

  await example.save(cardName(complete), "private", publicKey(complete));
  const kept = cardStatus(complete, "saved", example.snapshot(), "signed-out");
  assert.deepEqual(
    [kept.state, kept.line, kept.unsaved, kept.save],
    ["saved", "Saved privately in Weave. Only you can see it.", false, null],
  );
  const edited = cardStatus(renamed, "saved", example.snapshot(), "signed-out");
  assert.deepEqual(
    [edited.line, edited.unsaved, edited.save?.label, edited.save?.note],
    ["Changed on this device since you saved.", true, "Save changes", PRIVATE_NOTE],
  );

  const seeded = createSocialFixture("private", "2026-11-04");
  assert.equal(
    cardStatus(renamed, "saved", seeded.snapshot(), "signed-out").unsaved,
    false,
    "a seeded save has no version to compare",
  );
});

test("a linked project decides where a save goes and what sharing and publishing wait on", async () => {
  const team = createSocialFixture("private", "2026-11-04");
  await team.linkProject(ORCHARD_RECORD.uri);
  const open = cardStatus(complete, "saved", team.snapshot(), "signed-out");
  assert.deepEqual(
    [open.state, open.line, open.save],
    ["saved", "Saved in the Upper valley growers workspace. Teammates with access can see it.", null],
  );
  assert.deepEqual(open.sharing, {
    state: "off",
    line: "Not shared. Only your team sees your needs and offers.",
    waits: null,
  });
  assert.deepEqual(open.publishing, { state: "off", line: "Not published.", waits: null });
  const editedInTeam = cardStatus(renamed, "saved", createSocialFixture("workspace", "2026-11-04").snapshot(), "signed-out");
  assert.equal(editedInTeam.unsaved, false, "a seeded workspace has no version to compare");

  const waiting = createSocialFixture("private", "2026-11-04");
  await waiting.linkProject(SEED_LIBRARY_RECORD.uri);
  const absent = cardStatus(complete, "saved", waiting.snapshot(), "signed-out");
  assert.equal(absent.line, "Saved privately in Weave. Only you can see it.", "work carries on privately");
  assert.equal(absent.save, null);
  assert.deepEqual(absent.sharing, { state: "locked", line: "Waits for the team workspace.", waits: "workspace" });
  assert.deepEqual(absent.publishing, {
    state: "locked",
    line: "Only a group admin or owner can publish on Certified.",
    waits: "authority",
  });
  await waiting.requestWorkspace();
  assert.equal(cardStatus(complete, "saved", waiting.snapshot(), "signed-out").sharing?.waits, "workspace");
  await waiting.checkAgain();
  const approved = cardStatus(complete, "saved", waiting.snapshot(), "signed-out");
  assert.deepEqual(approved.save, {
    needs: "save",
    label: "Save to team workspace",
    note: "Teammates with access to the Valley seed keepers workspace can see it. Files and conversations stay on this device.",
  });
  assert.equal(approved.line, "Saved privately in Weave. Only you can see it.", "approval moves nothing by itself");
  assert.deepEqual(approved.sharing, { state: "locked", line: "Save to the team workspace first.", waits: "save" });
  await waiting.save(cardName(complete), "workspace", publicKey(complete));
  const moved = cardStatus(complete, "saved", waiting.snapshot(), "signed-out");
  assert.equal(moved.line, "Saved in the Valley seed keepers workspace. Teammates with access can see it.");
  assert.equal(moved.save, null);
  assert.equal(moved.sharing?.state, "off");
  assert.equal(moved.publishing?.waits, "authority", "a group member still cannot publish");
  assert.equal(
    cardStatus(renamed, "saved", waiting.snapshot(), "signed-out").line,
    "Changed on this device since you saved. Your team still sees the earlier version.",
  );

  const solo = createSocialFixture("private", "2026-11-04");
  await solo.linkProject(WATER_NOTES_RECORD.uri);
  const personal = cardStatus(complete, "saved", solo.snapshot(), "signed-out");
  assert.equal(personal.line, "Saved privately in Weave. Only you can see it.");
  assert.equal(personal.save, null);
  assert.deepEqual(personal.sharing, {
    state: "off",
    line: "Not shared. Only you see your needs and offers.",
    waits: null,
  });
  assert.deepEqual(personal.publishing, { state: "off", line: "Not published.", waits: null });
});

test("only open steps get a row, one step leads, and one line says what opens the rest", async () => {
  const steps = (fixture: ReturnType<typeof createSocialFixture>, draft = complete) => {
    const state = fixture.snapshot();
    const project = state.identity ? state.project : null;
    return openSteps(cardStatus(draft, "saved", state, "signed-out"), project?.workspace ?? null);
  };
  const person = createSocialFixture("draft", "2026-11-04");
  assert.deepEqual(steps(person), {
    lead: "save",
    sharing: null,
    publishing: null,
    later: "Sharing for matching opens once you save and link a Certified project.",
  });
  await person.signIn();
  assert.equal(steps(person).lead, "save", "signing in leaves saving as the next step");
  await person.save(cardName(complete), "private", publicKey(complete));
  assert.deepEqual(steps(person), {
    lead: "project",
    sharing: { state: "locked", line: "Sharing for matching needs a Certified project.", waits: "project" },
    publishing: null,
    later: "",
  });
  assert.equal(steps(person, renamed).lead, "save", "a changed card is saved before anything else");

  const team = createSocialFixture("private", "2026-11-04");
  await team.linkProject(ORCHARD_RECORD.uri);
  const open = steps(team);
  assert.deepEqual(
    [open.lead, open.sharing?.state, open.publishing?.state, open.later],
    ["share", "off", "off", ""],
  );

  const waiting = createSocialFixture("private", "2026-11-04");
  await waiting.linkProject(SEED_LIBRARY_RECORD.uri);
  assert.deepEqual(steps(waiting), {
    lead: "workspace",
    sharing: null,
    publishing: null,
    later:
      "Sharing for matching opens once the team workspace is set up. Only a group admin or owner can publish on Certified.",
  });
  await waiting.requestWorkspace();
  assert.equal(steps(waiting).lead, "workspace", "asking does not open the workspace");
  await waiting.checkAgain();
  assert.deepEqual(steps(waiting), {
    lead: "save",
    sharing: null,
    publishing: null,
    later: "Sharing for matching opens once you save. Only a group admin or owner can publish on Certified.",
  });
  await waiting.save(cardName(complete), "workspace", publicKey(complete));
  const member = steps(waiting);
  assert.deepEqual(
    [member.lead, member.sharing?.state, member.publishing, member.later],
    ["share", "off", null, "Only a group admin or owner can publish on Certified."],
  );

  const shared = createSocialFixture("workspace", "2026-11-04");
  const need = chosenEntries(complete, "all").find((entry) => entry.kind === "needs")!;
  await shared.share([need.id], publicKey(complete, [need.id]));
  const out = steps(shared);
  assert.deepEqual([out.lead, out.sharing?.state], [null, "on"], "nothing waits once the entries are shared");
});

test("sharing for matching and publishing each say what is out, who can see it, and when it changed since", async () => {
  const example = createSocialFixture("workspace", "2026-11-04");
  const need = chosenEntries(complete, "all").find((entry) => entry.kind === "needs")!;
  await example.share([need.id], publicKey(complete, [need.id]));
  const shared = cardStatus(complete, "saved", example.snapshot(), "signed-out");
  assert.equal(shared.state, "shared");
  assert.deepEqual(shared.sharing, {
    state: "on",
    line: "1 need shared with people signed in until closed or withdrawn.",
    waits: null,
  });
  assert.equal(shared.publishing?.state, "off", "sharing for matching does not publish");
  assert.deepEqual(cardStatus(renamed, "saved", example.snapshot(), "signed-out").sharing, {
    state: "changed",
    line: "Changed since you shared. The earlier version is out of matching, and your changes stay private until you share again.",
    waits: null,
  });

  await example.publish(everyEntry, publicKey(complete, everyEntry));
  const published = cardStatus(complete, "saved", example.snapshot(), "signed-out");
  assert.equal(published.state, "published");
  assert.deepEqual(published.publishing, {
    state: "on",
    line: "1 need, 1 offer published on 4 November 2026, for anyone to read.",
    waits: null,
  });
  assert.equal(published.sharing?.state, "on", "publishing leaves sharing as it was");
  assert.deepEqual(cardStatus(renamed, "saved", example.snapshot(), "signed-out").publishing, {
    state: "changed",
    line: "Changed since publishing. The earlier listing is being withdrawn, and your changes stay private until you publish again.",
    waits: null,
  });

  await example.withdraw();
  const withdrawing = cardStatus(complete, "saved", example.snapshot(), "signed-out");
  assert.deepEqual(withdrawing.publishing, {
    state: "withdrawing",
    line: "Withdrawal asked for on 4 November 2026. The listing can stay readable until Certified confirms.",
    waits: null,
  });
  assert.equal(withdrawing.state, "published", "the listing counts as public until Certified confirms");
  await example.checkAgain();
  const withdrawn = cardStatus(complete, "saved", example.snapshot(), "signed-out");
  assert.equal(withdrawn.publishing?.line, "Not published.");
  assert.equal(withdrawn.state, "shared");
  await example.stopSharing();
  assert.equal(cardStatus(complete, "saved", example.snapshot(), "signed-out").state, "saved");

  const seeded = createSocialFixture("published", "2026-11-04");
  const listed = cardStatus(renamed, "saved", seeded.snapshot(), "signed-out");
  assert.equal(listed.sharing?.line, "1 need, 1 offer shared with people signed in until closed or withdrawn.");
  assert.equal(listed.publishing?.line, "1 need, 1 offer published on 2 November 2026, for anyone to read.");
  await seeded.signOut();
  const signedOut = cardStatus(complete, "saved", seeded.snapshot(), "signed-out");
  assert.equal(signedOut.state, "device", "signed out, the device is what we can vouch for");
  assert.equal(signedOut.publishing, null);
});

test("what leaves the team is the four public details and the chosen entries, counted in plain words", () => {
  assert.notEqual(publicKey(complete, "all"), publicKey(complete, []), "chosen entries are part of what goes out");
  assert.equal(publicKey(complete, everyEntry), publicKey(complete, "all"));
  assert.notEqual(publicKey(complete), publicKey(renamed));
  assert.equal(entryCount(chosenEntries(complete, "all")), "1 need, 1 offer");
  assert.equal(entryCount([{ kind: "needs" }, { kind: "needs" }, { kind: "offers" }]), "2 needs, 1 offer");
  assert.equal(entryCount([{ kind: "offers" }, { kind: "offers" }]), "2 offers");
  assert.equal(entryCount([]), "Nothing");
  assert.deepEqual(publicCard(complete), {
    name: complete.confirmed!.name,
    locations: [...complete.confirmed!.locations],
    description: complete.confirmed!.description,
    links: [...complete.confirmed!.links],
  });
});

test("the card opens where it is waiting", () => {
  assert.equal(cardRoute(newDraft()), "initiative");
  assert.equal(cardRoute(revise(newDraft(), { proposal: complete.confirmed, proposalVersion: 0 })), "check-card");
  assert.equal(cardRoute(complete), "your-initiative");
  assert.equal(cardName(newDraft()), "Your initiative");
  assert.equal(cardName(complete), complete.confirmed!.name);
});

test("a record from Certified becomes a card with its four fields in ink and nothing left in pencil", () => {
  const draft = draftFromRecord(SEED_LIBRARY_RECORD);
  assert.deepEqual(pendingDetails(draft), []);
  assert.equal(draft.form?.name, "Seed library of the upper valley");
  assert.equal(cardRoute(draft), "check-card");
  const confirmed = confirmDraft(draft).confirmed!;
  assert.equal(confirmed.name, SEED_LIBRARY_RECORD.name);
  assert.deepEqual(confirmed.locations, ["Upper valley, Brazil"]);
  assert.equal(confirmed.stage, null);
});

test("linking reuses the project's verified details and keeps the needs, offers and other answers already here", () => {
  const linked = draftWithRecord(complete, ORCHARD_RECORD);
  assert.deepEqual(publicCard(linked), {
    name: ORCHARD_RECORD.name,
    locations: [...ORCHARD_RECORD.locations],
    description: ORCHARD_RECORD.description,
    links: [...ORCHARD_RECORD.links],
  });
  assert.equal(linked.confirmed?.stage, complete.confirmed?.stage, "details Weave keeps for matching stay");
  assert.deepEqual(chosenEntries(linked, "all"), chosenEntries(complete, "all"));
  assert.equal(intakeComplete(linked), true, "nothing has to be checked again");
  assert.equal(cardRoute(linked), "your-initiative");

  const fresh = draftWithRecord(newDraft(), ORCHARD_RECORD);
  assert.equal(fresh.confirmed?.name, ORCHARD_RECORD.name, "a complete project record is checked as it arrives");
  assert.equal(cardRoute(fresh), "needs", "so the person goes straight to needs and offers");
  const started = draftWithRecord(revise(newDraft(), { composer: "a few words" }), ORCHARD_RECORD);
  assert.equal(started.confirmed?.name, ORCHARD_RECORD.name);
});
