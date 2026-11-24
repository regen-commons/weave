import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseDocument, parseSaved } from "@weave/api/account-contract";
import { loadedDraft } from "../src/account/document.ts";
import { confirmDraft, newDraft, pendingDetails, revise } from "../src/describe/contracts.ts";
import { draftFromRecord, draftWithRecord, waitingSuggestions } from "../src/initiative/import.ts";
import { privatePartnerQueries } from "../src/partners/certified-suggestions.ts";
import { partnersWaitingLine } from "../src/social/words.ts";
import { notSharedLine } from "../src/partners/use-network-matching.ts";
import {
  cardName,
  cardRoute,
  cardStatus,
  chosenEntries,
  entryCount,
  NOT_PUBLIC_LINE,
  openSteps,
  PUBLISH_ACTION,
  publicListingsLine,
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
  assert.equal(cardStatus(draft, "saved", null, "signed-out").line, "Not saved yet.");
  assert.equal(cardStatus(draft, "saving", null, "signed-out").line, "Not saved yet.", "a write in progress is not a state to read");
  assert.equal(cardStatus(draft, "memory", null, "signed-out").line, "Not stored on this device yet.");
  // A card some account saved never says it was not saved, even while nobody is signed in.
  const savedBefore = revise(draft, {
    account: { saved: { id: crypto.randomUUID(), owner: crypto.randomUUID(), revision: 1, contentKey: "{}" }, pending: null },
  });
  assert.equal(cardStatus(savedBefore, "saved", null, "signed-out").line, "Saved to an account. Sign in to open the saved copy.");
  assert.equal(cardStatus(savedBefore, "saved", null, "none").line, "Not saved yet.", "signed in, the account answers for itself");
  assert.equal(cardStatus(draft, "saved", null, "none").save, null, "an unchecked card has nothing to save yet");

  const signedOut = cardStatus(complete, "saved", null, "signed-out");
  assert.equal(signedOut.state, "device");
  assert.deepEqual(signedOut.save, { needs: "sign-in", label: "Sign In To Save", note: "" });
  assert.deepEqual([signedOut.sharing, signedOut.publishing], [null, null], "no row for a service that is not built");

  const signedIn = cardStatus(complete, "saved", null, "none");
  assert.equal(signedIn.state, "device", "signing in alone saves nothing");
  assert.deepEqual(signedIn.save, { needs: "save", label: "Save Privately", note: PRIVATE_NOTE });

  const current = cardStatus(complete, "saved", null, "current");
  assert.deepEqual(
    [current.state, current.line, current.unsaved, current.save],
    ["saved", "Saved privately in Weave. Only you can see it.", false, null],
  );
  const changed = cardStatus(complete, "saved", null, "changed");
  assert.deepEqual(
    [changed.state, changed.line, changed.unsaved, changed.save?.label],
    ["saved", "Changed on this device since you saved.", true, "Save Changes"],
  );
});

test("a need with no kind of support can be saved privately while sharing still needs classification", async () => {
  const needs = reviewStep(keepPending(addEntry(complete.needs, "Something unusual we cannot classify")));
  const bare = revise(complete, { needs });
  assert.equal(intakeComplete(bare), true, "a kept entry needs no kind of support on the device");
  assert.equal(
    cardStatus(bare, "saved", null, "none").save?.note,
    PRIVATE_NOTE,
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
  assert.deepEqual(signedIn.save, { needs: "save", label: "Save Privately", note: PRIVATE_NOTE });

  await example.save(cardName(complete), "private", publicKey(complete));
  const kept = cardStatus(complete, "saved", example.snapshot(), "signed-out");
  assert.deepEqual(
    [kept.state, kept.line, kept.unsaved, kept.save],
    ["saved", "Saved privately in Weave. Only you can see it.", false, null],
  );
  const edited = cardStatus(renamed, "saved", example.snapshot(), "signed-out");
  assert.deepEqual(
    [edited.line, edited.unsaved, edited.save?.label, edited.save?.note],
    ["Changed on this device since you saved.", true, "Save Changes", PRIVATE_NOTE],
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
  assert.deepEqual(open.publishing, { state: "off", line: NOT_PUBLIC_LINE, waits: null });
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
    label: "Save To Team Workspace",
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
  assert.deepEqual(personal.publishing, { state: "off", line: NOT_PUBLIC_LINE, waits: null });
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
  assert.equal(withdrawn.publishing?.line, NOT_PUBLIC_LINE);
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
  // A card that is not confirmed yet waits on the one describe page (DL-110).
  assert.equal(cardRoute(revise(newDraft(), { proposal: complete.confirmed, proposalVersion: 0 })), "initiative");
  assert.equal(cardRoute(complete), "your-initiative");
  // Needs and offers are two steps: a card waits on the first whose list is not checked as it stands.
  const unchecked = (kind: "needs" | "offers") =>
    revise(complete, { [kind]: { ...complete[kind], inputVersion: complete[kind].inputVersion + 1 } });
  assert.equal(cardRoute(unchecked("offers")), "offers", "needs are checked, so the card opens on offers");
  assert.equal(cardRoute(unchecked("needs")), "needs");
  assert.equal(cardRoute(revise(unchecked("needs"), { offers: unchecked("offers").offers })), "needs", "the earlier step comes first");
  assert.equal(cardName(newDraft()), "Your initiative");
  assert.equal(cardName(complete), complete.confirmed!.name);
});

test("a record from Certified becomes a card with its four fields in ink and nothing left in pencil", () => {
  const draft = draftFromRecord(SEED_LIBRARY_RECORD);
  assert.deepEqual(pendingDetails(draft), []);
  assert.equal(draft.form?.name, "Seed library of the upper valley");
  assert.equal(cardRoute(draft), "initiative");
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
  // The orchard's description offers what its families learn, so that offer waits in pencil (15 November 2026).
  assert.deepEqual(
    linked.offers.items.filter((item) => item.decision === "pencil").map((item) => item.value.title),
    ["Families restore an old orchard and share what they learn about soil, water and seed saving"],
  );
  const quiet = draftWithRecord(complete, WATER_NOTES_RECORD);
  assert.deepEqual([...quiet.needs.items, ...quiet.offers.items], [...complete.needs.items, ...complete.offers.items]);

  const fresh = draftWithRecord(newDraft(), ORCHARD_RECORD);
  assert.equal(fresh.confirmed?.name, ORCHARD_RECORD.name, "a complete project record is checked as it arrives");
  assert.equal(cardRoute(fresh), "needs", "so the person goes straight to needs and offers");
  const started = draftWithRecord(revise(newDraft(), { composer: "a few words" }), ORCHARD_RECORD);
  assert.equal(started.confirmed?.name, ORCHARD_RECORD.name);
});

// Release blocker, 23 November 2026: a person signed in with Certified opened a project whose page named a
// need and an offer, saw them on the card, and was told matching had none. The project page's suggestions
// wait in pencil, the card counts as checked with them waiting, and partner suggestions compare kept
// entries only. Partners For You now says the suggestions wait and must be kept, instead of saying none.
test("a project's suggested needs and offers are not taken for none: Partners For You says to keep them", () => {
  const fresh = draftWithRecord(newDraft(), ORCHARD_RECORD);
  // Continuing past the needs and offers steps without keeping the suggestion is allowed.
  const checked = revise(fresh, { needs: reviewStep(fresh.needs), offers: reviewStep(fresh.offers) });
  assert.equal(intakeComplete(checked), true, "the card counts as checked");
  const kept = (kind: "needs" | "offers") => checked[kind].items.filter(({ decision }) => decision === "kept");
  assert.deepEqual(privatePartnerQueries("w1", 1, kept("needs"), kept("offers")), [], "so matching has nothing to compare");
  const waiting = waitingSuggestions(checked);
  assert.equal(waiting.length, 1, "while the project page's offer waits");
  assert.equal(partnersWaitingLine(waiting), "Your project page suggests 1 offer. Keep it to see partners for it.");
  assert.equal(partnersWaitingLine([{ kind: "needs" }, { kind: "offers" }]),
    "Your project page suggests 1 need, 1 offer. Keep them to see partners for them.");
  assert.equal(partnersWaitingLine([]), "", "with nothing waiting the list keeps its own line");
  const source = readFileSync(new URL("../src/partners/CertifiedSuggestions.tsx", import.meta.url), "utf8");
  assert.match(source, /!hasQueries \? \(waiting\.length \? \(/u, "the empty list speaks of the suggestions first");
  assert.match(source, /<ButtonLink href=\{pathTo\(waiting\[0\]!\.kind\)\}/u, "and leads to where they are kept");
  const partners = readFileSync(new URL("../src/partners/PartnerExperience.tsx", import.meta.url), "utf8");
  assert.match(partners, /waiting=\{waitingSuggestions\(draft\)\}/u);
});

// Release blocker, 23 November 2026: a project from Certified read "Not published." beside Publish On
// Certified. Publishing makes needs and offers public listings of the project; the project is already on
// Certified. The row and its button now say which.
test("a project already on Certified is never read as unpublished: the row and button name the needs and offers", () => {
  assert.equal(NOT_PUBLIC_LINE, "Your project is on Certified. Its needs and offers are not public.");
  assert.equal(PUBLISH_ACTION, "Publish Needs And Offers");
  assert.equal(publicListingsLine(1), "1 need or offer public on Certified.");
  assert.equal(publicListingsLine(3), "3 needs and offers public on Certified.");
  for (const file of ["../src/social/LiveExposure.tsx", "../src/social/Share.tsx", "../src/initiative/status.ts"]) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(source, /Publish On Certified|"Not published\."/u, file);
  }
  const live = readFileSync(new URL("../src/social/LiveExposure.tsx", import.meta.url), "utf8");
  assert.match(live, /count \? publicListingsLine\(count\) : NOT_PUBLIC_LINE/u);
  assert.match(live, />\{PUBLISH_ACTION\}<\/button>/u);
});

// Release blocker, 23 November 2026, reproduced with the signed-in fixture: a saved card with one need
// and one offer, neither shared for matching, read "share at least one open need or offer" under Partners
// For You, which a person took for having none. The line now names them as theirs and private.
test("saved needs and offers that are not shared are named as private, never as missing", () => {
  const entry = (kind: "need" | "offer", over: Record<string, unknown> = {}) =>
    ({ kind, entryId: `${kind}-${Math.random()}`, status: "open", sharing: "private", expiresAt: null, ...over }) as never;
  assert.equal(notSharedLine([entry("need"), entry("offer")]), "Your need and offer are private. Share them for matching to find partners.");
  assert.equal(notSharedLine([entry("need")]), "Your need is private. Share it for matching to find partners.");
  assert.equal(notSharedLine([entry("need"), entry("need"), entry("offer")]),
    "Your 2 needs and offer are private. Share them for matching to find partners.");
  assert.equal(notSharedLine([entry("need", { sharing: "withdrawn" })]), "Your need is private. Share it for matching to find partners.",
    "withdrawn is private again");
  assert.equal(notSharedLine([entry("need", { sharing: "shared" }), entry("offer")]), "", "once one is shared, the search speaks for itself");
  // Changed since sharing, or sharing that ended: each has its own line where it is listed, so this says nothing.
  assert.equal(notSharedLine([entry("offer", { sharing: "needs_review" })]), "");
  assert.equal(notSharedLine([entry("offer", { sharing: "shared", expiresAt: "2026-01-01T00:00:00Z" })]), "");
  assert.equal(notSharedLine([entry("need", { status: "met" })]), "Add an open need or offer to find partners.");
  assert.equal(notSharedLine([]), "Add an open need or offer to find partners.");
  assert.equal(notSharedLine([entry("need"), entry("offer")], { team: true }),
    "Your team's need and offer are not shared for matching. Share them for matching to find partners.");
  assert.equal(notSharedLine([entry("need")], { readOnly: true }), "Your need is private.", "someone who can only read is not asked to share");
  for (const file of ["../src/partners/PartnerExperience.tsx", "../src/partners/ExamplePartners.tsx"])
    assert.doesNotMatch(readFileSync(new URL(file, import.meta.url), "utf8"), /share at least one open need or offer/u, file);
  // Before the entries load, after a failed read, or for an earlier version, the list is empty and says nothing.
  assert.match(readFileSync(new URL("../src/partners/PartnerExperience.tsx", import.meta.url), "utf8"),
    /!network\.loading && state !== null && !stale && notSharedLine\(entries, \{ team, readOnly \}\)/u);
});

// The user's choice, 23 November 2026 ("One-tap share, clearly worded"): Partners For You names the private
// entries and offers Share For Matching right there. It opens the same share step as Saving And Sharing,
// which shows what other signed-in teams will see; nothing is shared until the person confirms there.
test("Partners For You offers the share step beside the private entries, and says plainly when no team fits", () => {
  const partners = readFileSync(new URL("../src/partners/PartnerExperience.tsx", import.meta.url), "utf8");
  assert.match(partners, /onClick=\{\(\) => setSharing\(true\)\}>Share For Matching<\/button>/u, "one tap opens the step");
  assert.match(partners, /<SavedMatching[^>]*presentation="sharing"/u, "the same step that shows what will be seen");
  assert.match(partners, /onClose=\{\(\) => \{ setSharing\(false\); network\.refresh\(\); onShared\?\.\(\); \}\}/u, "and the results follow");
  // So does the sharing row in Saving And Sharing, which would otherwise still read "Not shared".
  const page = readFileSync(new URL("../src/pages/YourInitiative.tsx", import.meta.url), "utf8");
  assert.match(page, /onShared=\{\(\) => setSharedVersion\(v => v \+ 1\)\}/u);
  assert.match(page, /<LiveExposure[\s\S]*?refreshVersion=\{sharedVersion\}/u);
  assert.match(readFileSync(new URL("../src/social/LiveExposure.tsx", import.meta.url), "utf8"), /version, online, team, refreshVersion\]/u);
  assert.doesNotMatch(partners, /network\.mutate\(\{\s*action: "share"/u, "nothing is shared without the step's own confirmation");
  const results = readFileSync(new URL("../src/partners/NetworkResults.tsx", import.meta.url), "utf8");
  assert.match(results, /No team has shared a match for this yet\./u);
});
