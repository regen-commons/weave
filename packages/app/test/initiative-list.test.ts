import assert from "node:assert/strict";
import { test } from "node:test";
import { newDraft, revise, type DeviceDraft } from "../src/describe/contracts.ts";
import { boundCardId, deviceDrafts, draftKinds, draftSaving, ENTRY_KINDS, initiativeEntries, linkedProject, projectKind, projectLinkLine, projectLinkState, savingLine, standsForProject, strongestFirst, openSavedOver } from "../src/initiative/list.ts";
import { projectSource } from "../src/intake/project-page.ts";
import { addEntry } from "../src/intake/entries.ts";

const owner = "b1000000-0000-4000-8000-000000000001", stranger = "b1000000-0000-4000-8000-000000000002";
const words = (text: string, at: string) => ({ ...revise(newDraft(), { composer: text }, true), updatedAt: at });
const bound = (draft: DeviceDraft, id: string, revision = 1, contentKey = "saved-content", by = owner): DeviceDraft =>
  revise(draft, { account: { saved: { id, owner: by, revision, contentKey }, pending: null } });
const key = (content: string | null) => () => content;

test("the list shows the tab's draft as it reads now, the others newest first, and leaves out empty and hidden ones", () => {
  const stored = words("As stored", "2026-11-10T09:00:00.000Z");
  const current = { ...stored, composer: "As it reads in this tab", updatedAt: "2026-11-12T09:00:00.000Z" };
  const older = words("Older", "2026-11-01T09:00:00.000Z"), newer = words("Newer", "2026-11-15T09:00:00.000Z");
  const theirs = words("Another account's", "2026-11-16T09:00:00.000Z");
  const listed = deviceDrafts(current, [older, stored, newDraft(), newer, theirs], (draft) => draft.id === theirs.id);
  assert.deepEqual(listed.map((draft) => draft.composer), ["Newer", "As it reads in this tab", "Older"]);
  assert.deepEqual(deviceDrafts(newDraft(), []), [], "a blank draft is not an initiative yet");
});

test("a draft and the card it was saved as are one entry, a workspace card is never listed alone, and two copies never double it", () => {
  const cardA = { id: crypto.randomUUID(), name: "A" }, cardB = { id: crypto.randomUUID(), name: "B" }, workspace = { id: crypto.randomUUID(), name: "W" };
  const copy = bound(words("Copy of A", "2026-11-10T09:00:00.000Z"), cardA.id);
  const second = bound(words("Second copy of A", "2026-11-09T09:00:00.000Z"), cardA.id);
  const onWorkspace = bound(words("Linked to a personal project", "2026-11-08T09:00:00.000Z"), workspace.id);
  const unsaved = words("Only here", "2026-11-07T09:00:00.000Z");
  const entries = initiativeEntries([copy, second, onWorkspace, unsaved], [cardA, cardB, workspace],
    (draft) => boundCardId(draft, owner), (card) => card.id !== workspace.id);
  assert.deepEqual(
    entries.map((entry) => (entry.kind === "draft" ? [entry.draft.composer, entry.saved?.name ?? null] : ["card", entry.card.name])),
    [["Copy of A", "A"], ["Second copy of A", "A"], ["Linked to a personal project", "W"], ["Only here", null], ["card", "B"]],
  );
  // No list key can repeat: a draft's key is its own ID, and a card listed alone is never one a draft stands for.
  const keys = entries.map((entry) => (entry.kind === "draft" ? entry.draft.id : entry.card.id));
  assert.equal(new Set(keys).size, keys.length);
});

test("a draft belongs to the card it was saved as, or to the one a save without its answer asked for, and only for its own account", () => {
  const draft = words("Words", "2026-11-10T09:00:00.000Z");
  const card = crypto.randomUUID(), request = crypto.randomUUID();
  assert.equal(boundCardId(draft, owner), null);
  assert.equal(boundCardId(bound(draft, card), owner), card);
  assert.equal(boundCardId(bound(draft, card), stranger), null, "another account's card is not this account's");
  assert.equal(boundCardId(bound(draft, card), null), null, "signed out, nothing is claimed");
  const waiting = revise(draft, { account: { saved: null, pending: { id: card, owner, revision: 0, contentKey: "k", requestId: request } } });
  assert.equal(boundCardId(waiting, owner), card, "a lost answer still leaves the draft and its card as one entry");
});

test("the entry says where a draft stands against its saved card, and never calls a saved one unsaved", () => {
  const draft = words("Words", "2026-11-10T09:00:00.000Z");
  const saved = bound(draft, crypto.randomUUID(), 3, "same");
  assert.equal(draftSaving(draft, null, owner, key("same")), "unsaved");
  assert.equal(draftSaving(saved, { revision: 3 }, owner, key("same")), "saved");
  assert.equal(draftSaving(saved, { revision: 3 }, owner, key("edited")), "changed-here");
  assert.equal(draftSaving(saved, { revision: 3 }, owner, key(null)), "changed-here", "an unchecked card differs from its saved copy");
  // Saved again on another device: the account is ahead of what this browser last saw.
  assert.equal(draftSaving(saved, { revision: 4 }, owner, key("same")), "newer-in-account");
  assert.equal(draftSaving(saved, { revision: 4 }, owner, key("edited")), "changed-both");
  // The card is past the first page of saved cards, or is listed as a workspace: still saved.
  assert.equal(draftSaving(saved, null, owner, key("same")), "saved-unlisted");
  assert.equal(draftSaving(saved, null, owner, key("edited")), "changed-here");
  // An example account knows the card without a binding on the draft.
  assert.equal(draftSaving(draft, { revision: 1 }, owner, key("same")), "saved");
  // A card without a revision in its listing is never called newer.
  assert.equal(draftSaving(saved, {}, owner, key("same")), "saved");
  assert.equal(savingLine("unsaved", null), "", "the badge says it");
  // The card's tag says where it is saved (DL-134), so the line only adds when.
  assert.equal(savingLine("saved", "15 November 2026"), "Saved on 15 November 2026.");
  assert.equal(savingLine("saved", null), "");
  assert.equal(savingLine("saved-unlisted", null), "");
  assert.equal(savingLine("changed-here", null), "Changed on this device since you saved.");
  assert.match(savingLine("newer-in-account", null), /newer version is saved in your account/);
  assert.match(savingLine("changed-both", null), /on this device and in your account/);
  for (const state of ["saved", "saved-unlisted", "changed-here", "newer-in-account", "changed-both"] as const)
    assert.doesNotMatch(savingLine(state, null), /Not saved yet/);
});

test("a project a draft already stands for is that draft: by this account's choice, or by suggestions read from its page", () => {
  const uri = "at://did:plc:example/org.example.project/abc", another = "at://did:plc:example/org.example.project/xyz";
  const plain = words("Nothing to do with it", "2026-11-10T09:00:00.000Z");
  assert.equal(standsForProject(plain, uri, null), false);
  assert.equal(standsForProject(plain, uri, uri), true, "chosen on this device");
  assert.equal(standsForProject(plain, uri, another), false);
  const needs = addEntry(plain.needs, "Seedlings");
  const suggested = revise(plain, { needs: { ...needs, items: needs.items.map((item) => ({ ...item, sourceKey: `${projectSource(uri)}:0` })) } });
  assert.equal(standsForProject(suggested, uri, null), true, "a card linked before choices were kept still carries the suggestions");
  assert.equal(standsForProject(suggested, another, null), false);
});

test("a draft is linked to the project chosen for it, or with no choice to the workspace it was saved to", () => {
  const first = { uri: "at://did:plc:example/org.example.project/abc" };
  const second = { uri: "at://did:plc:example/org.example.project/xyz", workspaceId: "b3000000-0000-4000-8000-000000000002" };
  assert.equal(linkedProject(null, null, [first, second]), null, "nothing links a card nobody linked");
  assert.equal(linkedProject(second.uri, null, [first, second]), second, "the choice decides");
  assert.equal(linkedProject(second.uri, null, [first]), null, "a chosen project that is no longer listed links to nothing");
  assert.equal(linkedProject(null, second.workspaceId, [first, second]), second, "a saved card is linked to its workspace's project");
  assert.equal(linkedProject(first.uri, second.workspaceId, [first, second]), first, "a choice comes before the saved workspace");
  assert.equal(linkedProject("at://did:plc:example/org.example.project/gone", second.workspaceId, [first, second]), null, "and is never replaced by it");
  assert.equal(linkedProject(null, "b3000000-0000-4000-8000-000000000009", [first, second]), null);
  assert.equal(linkedProject(null, null, [{ uri: first.uri, workspaceId: undefined }]), null, "a project with no workspace matches no saved card");
});

test("a card with a stored project choice is never called unlinked while the choice cannot be checked", () => {
  const owner = "a1000000-0000-4000-8000-000000000001";
  const other = "a1000000-0000-4000-8000-000000000002";
  const read = { linked: false, owner, choosers: [owner], loading: false, problem: false };
  assert.equal(projectLinkState({ ...read, linked: true }), "linked");
  assert.equal(projectLinkState({ ...read, owner: null }), "signed-out", "signed out, the choice says it is linked");
  assert.equal(projectLinkState({ ...read, owner: null, choosers: [other] }), "signed-out", "whichever account made it");
  assert.equal(projectLinkState({ ...read, owner: null, choosers: [] }), "not-linked", "with no choice, nothing is linked");
  assert.equal(projectLinkState({ ...read, loading: true }), "checking", "signed in, it waits for the projects");
  assert.equal(projectLinkState({ ...read, problem: true }), "unchecked", "and a failed read keeps the link");
  assert.equal(projectLinkState({ ...read, loading: true, problem: true }), "checking", "a new read comes before the last failure");
  assert.equal(projectLinkState(read), "not-linked", "a choice checked against a loaded list that lacks it links nothing");
  assert.equal(projectLinkState({ ...read, choosers: [other], loading: true }), "not-linked", "another account's choice is not this one's to check");
  assert.equal(projectLinkState({ ...read, choosers: [], loading: true }), "not-linked");
  assert.equal(projectLinkLine("linked"), "");
  assert.equal(projectLinkLine("not-linked"), "Not linked to a Certified project yet.");
  assert.match(projectLinkLine("signed-out"), /^Linked to a Certified project\. Sign in/u);
  assert.doesNotMatch(projectLinkLine("checking"), /not linked/iu);
  assert.doesNotMatch(projectLinkLine("unchecked"), /not linked/iu);
});

test("a draft that carries a project's suggestions stands for it in the list, and is still not linked to it", () => {
  const project = { uri: "at://did:plc:example/org.example.project/abc" };
  const plain = words("Nothing to do with it", "2026-11-10T09:00:00.000Z");
  const needs = addEntry(plain.needs, "Seed jars");
  const carrying = revise(plain, { needs: { ...needs, items: needs.items.map((item) => ({ ...item, sourceKey: `${projectSource(project.uri)}:0` })) } });
  assert.equal(standsForProject(plain, project.uri, null), false);
  assert.equal(standsForProject(carrying, project.uri, null), true, "the project is listed once, as that draft");
  assert.equal(standsForProject(plain, project.uri, project.uri), true, "as it is for a draft its account chose it for");
  // Suggestions are not a choice, so the linking rule is not given the draft at all: it takes the
  // account's choice and the saved card's ID, and the live adapter's tests cover a card that carries them.
  assert.equal(linkedProject.length, 3);
});

test("opening the saved version over a working copy keeps the copy, and the entry says so before the press", async () => {
  const calls: string[] = [];
  const open = async () => { calls.push("open"); };
  const retire = (kept: boolean) => async (id: string) => { calls.push(`retire ${id}`); return kept; };
  // The copy has the card's own ID: loading the saved version backed it up and replaced it.
  assert.equal(await openSavedOver({ id: "card" }, { id: "card" }, open, retire(false)), true);
  assert.deepEqual(calls, ["open"], "there is no second draft to move");
  // The copy is under another ID, so it is moved to the backups after the load.
  calls.length = 0;
  assert.equal(await openSavedOver({ id: "copy" }, { id: "card" }, open, retire(true)), true);
  assert.deepEqual(calls, ["open", "retire copy"]);
  // A copy still waiting for a save's answer is left where it is, and the page must not claim otherwise.
  assert.equal(await openSavedOver({ id: "copy" }, { id: "card" }, open, retire(false)), false);
  // The page leaves for the card on success, so the entry says the copy is kept before the press,
  // in words true whichever way it is kept.
  // and says where, in words true whichever way it is kept: the page cannot know in advance
  // whether the copy changes meanwhile, which keeps it in the list.
  assert.equal(
    savingLine("changed-both", null),
    "Changed on this device and in your account since you saved. Opening the saved version keeps this device's copy, in this list or in Device backups in Settings.",
  );
  // A load that fails moves nothing.
  calls.length = 0;
  await assert.rejects(openSavedOver({ id: "copy" }, { id: "card" }, async () => { throw new Error("offline"); }, retire(true)), /offline/);
  assert.deepEqual(calls, []);
});

test("every card says what it is, so a draft and a Certified project with one name can be told apart (DL-134)", () => {
  // A Certified project is its own, a group's, or a group's with a team workspace in Weave.
  assert.equal(projectKind({ group: null, workspace: false }), "personal-project");
  assert.equal(projectKind({ group: null, workspace: "solo" }), "personal-project", "a personal project's own workspace is not a team's");
  assert.equal(projectKind({ group: "Valley seed keepers", workspace: false }), "group-project");
  assert.equal(projectKind({ group: "Valley seed keepers", workspace: "absent" }), "group-project");
  assert.equal(projectKind({ group: "Valley seed keepers", workspace: "requested" }), "group-project");
  assert.equal(projectKind({ group: "Valley seed keepers", workspace: true }), "team-workspace");
  assert.equal(projectKind({ group: "Valley seed keepers", workspace: "open" }), "team-workspace");
  // A draft that is linked to nothing says only where it is kept.
  assert.deepEqual(draftKinds("unsaved", null), ["device"]);
  for (const saving of ["saved", "saved-unlisted", "changed-here", "newer-in-account", "changed-both"] as const)
    assert.deepEqual(draftKinds(saving, null), ["private"], saving);
  // A linked draft is its project first, and still says so when it is not saved.
  assert.deepEqual(draftKinds("unsaved", { group: null, workspace: "solo" }), ["personal-project", "device"]);
  assert.deepEqual(draftKinds("saved", { group: "Valley seed keepers", workspace: "open" }), ["team-workspace"]);
  assert.deepEqual(draftKinds("changed-here", { group: "Valley seed keepers", workspace: "absent" }), ["group-project"]);
  // Signed out, a draft an account saved carries no tag: its line says to sign in.
  assert.deepEqual(draftKinds("unsaved", null, true), []);
  // Each kind has its own words and an icon, so colour is never the only sign.
  const labels = Object.values(ENTRY_KINDS).map((kind) => kind.label);
  assert.equal(new Set(labels).size, labels.length);
  assert.deepEqual(labels, ["On this device", "Saved privately", "Personal project", "Group project", "Team workspace"]);
  for (const kind of Object.values(ENTRY_KINDS)) assert.ok(kind.icon);
});

test("example funding on Your Initiative reads strongest fit first, as the live list does", () => {
  const records: readonly { id: string; fit?: "strong" | "good" | "possible" }[] =
    [{ id: "a", fit: "good" }, { id: "b", fit: "strong" }, { id: "c" }, { id: "d", fit: "possible" }, { id: "e", fit: "strong" }];
  assert.deepEqual(strongestFirst(records).map((record) => record.id), ["b", "e", "a", "d", "c"], "equal strengths keep their order");
  assert.deepEqual(records.map((record) => record.id), ["a", "b", "c", "d", "e"], "the examples themselves are left as they are");
});
