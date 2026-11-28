import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseDocument, parseSaved } from "@weave/api/account-contract";
import { loadedDraft } from "../src/account/document.ts";
import { confirmDraft, newDraft, pendingDetails, revise } from "../src/describe/contracts.ts";
import { draftFromRecord, draftWithRecord, waitingSuggestions } from "../src/initiative/import.ts";
import { privatePartnerQueries } from "../src/partners/certified-suggestions.ts";
import { partnersWaitingLine } from "../src/social/words.ts";
import { cardName, cardRoute, cardStatus, chosenEntries, entryCount, NOT_PUBLIC_LINE, openSteps, PUBLISH_ACTION, publicListingsLine, publicCard, publicKey, shareable, GROUP_PUBLISH_AUTHORITY } from "../src/initiative/status.ts";
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

// DL-155, step 4: nothing is saved privately any more. A card lives on this device, and a private save made
// earlier stays readable, but no step offers a new one.
test("with the live account, the line says where the card is kept, and no step offers a private save", () => {
  assert.deepEqual(cardStatus(newDraft(), "saved", null, "signed-out"), {
    state: "none",
    line: "",
    unsaved: false,
    save: null,
    publishing: null,
  });
  const draft = revise(newDraft(), { composer: "a few words" });
  assert.equal(cardStatus(draft, "saved", null, "signed-out").line, "On this device.");
  assert.equal(cardStatus(draft, "saving", null, "signed-out").line, "On this device.", "a write in progress is not a state to read");
  assert.equal(cardStatus(draft, "memory", null, "signed-out").line, "Not stored on this device yet.");
  // A card some account saved never says it was not saved, even while nobody is signed in.
  const savedBefore = revise(draft, {
    account: { saved: { id: crypto.randomUUID(), owner: crypto.randomUUID(), revision: 1, contentKey: "{}" }, pending: null },
  });
  assert.equal(cardStatus(savedBefore, "saved", null, "signed-out").line, "Saved to an account. Sign in to open the saved copy.");
  assert.equal(cardStatus(savedBefore, "saved", null, "none").line, "On this device.", "signed in, the account answers for itself");

  const signedOut = cardStatus(complete, "saved", null, "signed-out");
  assert.deepEqual([signedOut.state, signedOut.save, signedOut.publishing], ["device", null, null]);
  const signedIn = cardStatus(complete, "saved", null, "none");
  assert.deepEqual([signedIn.state, signedIn.save], ["device", null], "signing in saves nothing and offers no private save");

  const current = cardStatus(complete, "saved", null, "current");
  assert.deepEqual(
    [current.state, current.line, current.unsaved, current.save],
    ["saved", "Also kept as a private save in Weave, which no longer changes. Only you can see it.", false, null],
  );
  const changed = cardStatus(complete, "saved", null, "changed");
  assert.deepEqual(
    [changed.state, changed.line, changed.unsaved, changed.save],
    ["saved", "Changed on this device since your private save in Weave, which no longer changes.", true, null],
    "a changed card is not offered Save Changes: the private save stays as it was",
  );
});

test("a need with no kind of support stays on the device, and publishing leaves it out", () => {
  const needs = reviewStep(keepPending(addEntry(complete.needs, "Something unusual we cannot classify")));
  const bare = revise(complete, { needs });
  assert.equal(intakeComplete(bare), true, "a kept entry needs no kind of support on the device");
  assert.equal(cardStatus(bare, "saved", null, "none").line, "On this device.");
  assert.equal(chosenEntries(bare, "all").length, 3);
  assert.deepEqual(
    shareable(bare).map((entry) => entry.title),
    chosenEntries(complete, "all").map((entry) => entry.title),
    "publishing leaves out an entry with no kind of support",
  );
});

test("signing in saves nothing, and a private save made earlier reads as kept and no longer changing", async () => {
  const example = createSocialFixture("draft", "2026-11-04");
  const visitor = cardStatus(complete, "saved", example.snapshot(), "signed-out");
  assert.deepEqual([visitor.state, visitor.save], ["device", null]);
  assert.equal(visitor.publishing, null, "nothing to say about publishing before a project is linked");
  await example.signIn();
  const signedIn = cardStatus(complete, "saved", example.snapshot(), "signed-out");
  assert.deepEqual([signedIn.state, signedIn.line, signedIn.save], ["device", "On this device.", null]);

  const seeded = createSocialFixture("private", "2026-11-04");
  const kept = cardStatus(complete, "saved", seeded.snapshot(), "signed-out");
  assert.deepEqual(
    [kept.state, kept.line, kept.unsaved, kept.save],
    ["saved", "Also kept as a private save in Weave, which no longer changes. Only you can see it.", false, null],
  );
  assert.equal(cardStatus(renamed, "saved", seeded.snapshot(), "signed-out").unsaved, false, "a seeded save has no version to compare");
});

test("a linked project decides what publishing waits on, and only a team workspace takes a save", async () => {
  const team = createSocialFixture("private", "2026-11-04");
  await team.linkProject(ORCHARD_RECORD.uri);
  const open = cardStatus(complete, "saved", team.snapshot(), "signed-out");
  assert.deepEqual(
    [open.state, open.line, open.save],
    ["saved", "Saved in the Upper valley growers workspace. Teammates with access can see it.", null],
  );
  assert.deepEqual(open.publishing, { state: "off", line: NOT_PUBLIC_LINE, waits: null });
  const editedInTeam = cardStatus(renamed, "saved", createSocialFixture("workspace", "2026-11-04").snapshot(), "signed-out");
  assert.equal(editedInTeam.unsaved, false, "a seeded workspace has no version to compare");

  const waiting = createSocialFixture("private", "2026-11-04");
  await waiting.linkProject(SEED_LIBRARY_RECORD.uri);
  const absent = cardStatus(complete, "saved", waiting.snapshot(), "signed-out");
  assert.equal(absent.line, "Also kept as a private save in Weave, which no longer changes. Only you can see it.");
  assert.equal(absent.save, null);
  // A group project waits for its team workspace first, then for edit access in it (D48, 28 November 2026).
  assert.deepEqual(absent.publishing, { state: "locked", line: "Waits for the team workspace.", waits: "workspace" });
  await waiting.requestWorkspace();
  await waiting.checkAgain();
  const approved = cardStatus(complete, "saved", waiting.snapshot(), "signed-out");
  assert.deepEqual(approved.publishing, { state: "locked", line: GROUP_PUBLISH_AUTHORITY, waits: "authority" },
    "a member whose workspace opened has no edit access until a workspace admin grants it");
  assert.deepEqual(approved.save, {
    needs: "save",
    label: "Save To Team Workspace",
    note: "Teammates with access to the Valley seed keepers workspace can see it. Files and conversations stay on this device.",
  }, "a team's open workspace still takes the card until step 6");
  assert.equal(approved.line, "Also kept as a private save in Weave, which no longer changes. Only you can see it.", "approval moves nothing by itself");
  await waiting.save(cardName(complete), "workspace", publicKey(complete));
  const moved = cardStatus(complete, "saved", waiting.snapshot(), "signed-out");
  assert.equal(moved.line, "Saved in the Valley seed keepers workspace. Teammates with access can see it.");
  assert.equal(moved.save, null);
  // With an editor grant, a plain group member publishes from the team draft; a viewer grant still cannot.
  const grant = (accessRole: "viewer" | "editor") => ({ ...waiting.snapshot(), project: { ...waiting.snapshot().project!, accessRole } });
  assert.deepEqual(cardStatus(complete, "saved", grant("editor"), "signed-out").publishing, { state: "off", line: NOT_PUBLIC_LINE, waits: null });
  assert.equal(cardStatus(complete, "saved", grant("viewer"), "signed-out").publishing?.waits, "authority");
  assert.equal(moved.publishing?.waits, "authority", "a group member still cannot publish");
  const changedInTeam = cardStatus(renamed, "saved", waiting.snapshot(), "signed-out");
  assert.deepEqual([changedInTeam.line, changedInTeam.save?.label],
    ["Changed on this device since you saved. Your team still sees the earlier version.", "Save Changes"]);

  const solo = createSocialFixture("private", "2026-11-04");
  await solo.linkProject(WATER_NOTES_RECORD.uri);
  const personal = cardStatus(complete, "saved", solo.snapshot(), "signed-out");
  assert.deepEqual([personal.line, personal.save],
    ["Also kept as a private save in Weave, which no longer changes. Only you can see it.", null]);
  assert.deepEqual(personal.publishing, { state: "off", line: NOT_PUBLIC_LINE, waits: null });
});

test("only open steps get a row, one step leads, and one line says what opens the rest", async () => {
  const steps = (fixture: ReturnType<typeof createSocialFixture>, draft = complete) => {
    const state = fixture.snapshot();
    const project = state.identity ? state.project : null;
    return openSteps(cardStatus(draft, "saved", state, "signed-out"), project?.workspace ?? null);
  };
  const person = createSocialFixture("draft", "2026-11-04");
  assert.deepEqual(steps(person), { lead: null, publishing: null, later: "" }, "a card on this device waits on nothing");
  await person.signIn();
  assert.deepEqual(steps(person), { lead: null, publishing: null, later: "" }, "signing in offers no private save");

  const team = createSocialFixture("private", "2026-11-04");
  await team.linkProject(ORCHARD_RECORD.uri);
  const open = steps(team);
  assert.deepEqual([open.lead, open.publishing?.state, open.later], [null, "off", ""]);

  const waiting = createSocialFixture("private", "2026-11-04");
  await waiting.linkProject(SEED_LIBRARY_RECORD.uri);
  const authority = GROUP_PUBLISH_AUTHORITY;
  assert.deepEqual(steps(waiting), { lead: "workspace", publishing: null, later: "Publishing opens once the team workspace is set up." });
  await waiting.requestWorkspace();
  assert.equal(steps(waiting).lead, "workspace", "asking does not open the workspace");
  await waiting.checkAgain();
  assert.deepEqual(steps(waiting), { lead: "save", publishing: null, later: authority });
  await waiting.save(cardName(complete), "workspace", publicKey(complete));
  assert.deepEqual(steps(waiting), { lead: null, publishing: null, later: authority });
  assert.equal(steps(waiting, renamed).lead, "save", "a changed team card is saved before anything else");

  // An admin's team publishes from its workspace, so publishing names the step that opens it.
  const admin = { save: null, publishing: { state: "locked", line: "Save to the team workspace first.", waits: "save" } } as const;
  assert.deepEqual(openSteps({ ...cardStatus(complete, "saved", null, "none"), ...admin }, "open"),
    { lead: null, publishing: null, later: "Publishing opens once you save it to the team workspace." });
});

test("publishing says what is out, who can see it, and when it changed since, with no sharing row", async () => {
  const example = createSocialFixture("workspace", "2026-11-04");
  await example.publish(everyEntry, publicKey(complete, everyEntry));
  const published = cardStatus(complete, "saved", example.snapshot(), "signed-out");
  assert.equal(published.state, "published");
  assert.deepEqual(published.publishing, {
    state: "on",
    line: "1 need, 1 offer published on 4 November 2026, for anyone to read.",
    waits: null,
  });
  assert.equal("sharing" in published, false, "sharing for matching has no row (DL-155)");
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
  assert.equal(withdrawn.state, "saved");

  const seeded = createSocialFixture("published", "2026-11-04");
  const listed = cardStatus(renamed, "saved", seeded.snapshot(), "signed-out");
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
  for (const file of ["../src/social/LiveExposure.tsx", "../src/social/Publish.tsx", "../src/initiative/status.ts"]) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(source, /Publish On Certified|"Not published\."/u, file);
  }
  const live = readFileSync(new URL("../src/social/LiveExposure.tsx", import.meta.url), "utf8");
  assert.match(live, /count \? publicListingsLine\(count\) : NOT_PUBLIC_LINE/u);
  assert.match(live, />\{PUBLISH_ACTION\}<\/button>/u);
});

// DL-155, step 5: sharing for matching has ended. No screen lists, stops or withdraws a share, saved and hidden
// partners are no longer kept on the server, and a partner is kept on the device's shortlist instead.
test("sharing for matching has ended: nothing lists, stops or withdraws a share, and partners are kept on the shortlist", () => {
  for (const file of ["../src/partners/PartnerExperience.tsx", "../src/partners/CertifiedSuggestions.tsx",
    "../src/social/LiveExposure.tsx", "../src/pages/TeamWorkspace.tsx", "../src/pages/YourInitiative.tsx",
    "../src/partners/ExamplePartners.tsx", "../src/partners/TeamEntries.tsx", "../src/ui/TeamSlots.tsx",
    "../src/social/Publish.tsx", "../src/social/gate.ts"]) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(source, /Stop Sharing|Withdraw From Matching|Share For Matching|Shared before|SavedMatching|set_lead|Remove From Saved|"withdraw"/u, file);
  }
  const suggestions = readFileSync(new URL("../src/partners/CertifiedSuggestions.tsx", import.meta.url), "utf8");
  assert.match(suggestions, /<InitiativeShortlistButton project=\{\{ uri: project\.id, name: project\.name \}\} place="card"/u);
  assert.match(suggestions, /matchingRequest\(workspaceId, "listing_search", \{\}, controller\.signal\)/u, "the project's listings are matched on the server");
  const page = readFileSync(new URL("../src/pages/YourInitiative.tsx", import.meta.url), "utf8");
  assert.match(page, /<PartnerExperience refreshVersion=\{matchVersion\}/u, "suggestions read again after the listings change");
  assert.match(page, /<LiveExposure[\s\S]*?refreshVersion=\{sharedVersion\}/u);
  assert.match(readFileSync(new URL("../src/social/LiveExposure.tsx", import.meta.url), "utf8"), /version, online, refreshVersion\]/u);
});
