import assert from "node:assert/strict";
import { test } from "node:test";
import { newDraft, revise, type DeviceDraft } from "../src/describe/contracts.ts";
import { boundCardId, deviceDrafts, draftKinds, ENTRY_KINDS, linkedProject, projectKind, projectLinkLine, projectLinkState, standsForProject, strongestFirst } from "../src/initiative/list.ts";
import { projectSource } from "../src/intake/project-page.ts";
import { addEntry } from "../src/intake/entries.ts";

const owner = "b1000000-0000-4000-8000-000000000001", stranger = "b1000000-0000-4000-8000-000000000002";
const words = (text: string, at: string) => ({ ...revise(newDraft(), { composer: text }, true), updatedAt: at });
const bound = (draft: DeviceDraft, id: string, revision = 1, contentKey = "saved-content", by = owner): DeviceDraft =>
  revise(draft, { account: { saved: { id, owner: by, revision, contentKey }, pending: null } });

test("the list shows the tab's draft as it reads now, the others newest first, and leaves out empty and hidden ones", () => {
  const stored = words("As stored", "2026-11-10T09:00:00.000Z");
  const current = { ...stored, composer: "As it reads in this tab", updatedAt: "2026-11-12T09:00:00.000Z" };
  const older = words("Older", "2026-11-01T09:00:00.000Z"), newer = words("Newer", "2026-11-15T09:00:00.000Z");
  const theirs = words("Another account's", "2026-11-16T09:00:00.000Z");
  const listed = deviceDrafts(current, [older, stored, newDraft(), newer, theirs], (draft) => draft.id === theirs.id);
  assert.deepEqual(listed.map((draft) => draft.composer), ["Newer", "As it reads in this tab", "Older"]);
  assert.deepEqual(deviceDrafts(newDraft(), []), [], "a blank draft is not an initiative yet");
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
  assert.deepEqual(draftKinds(null), ["device"]);
  // A linked draft is its project first, and still says it is on this device. Nothing is saved privately any
  // more, so a draft that carries the mark of an earlier private save is tagged the same (DL-155, D49).
  assert.deepEqual(draftKinds({ group: null, workspace: "solo" }), ["personal-project", "device"]);
  assert.deepEqual(draftKinds({ group: "Valley seed keepers", workspace: "open" }), ["team-workspace", "device"]);
  assert.deepEqual(draftKinds({ group: "Valley seed keepers", workspace: "absent" }), ["group-project", "device"]);
  // Each kind has its own words and an icon, so colour is never the only sign.
  const labels = Object.values(ENTRY_KINDS).map((kind) => kind.label);
  assert.equal(new Set(labels).size, labels.length);
  assert.deepEqual(labels, ["On this device", "Personal project", "Group project", "Team workspace"]);
  for (const kind of Object.values(ENTRY_KINDS)) assert.ok(kind.icon);
});

test("example funding on Your Initiative reads strongest fit first, as the live list does", () => {
  const records: readonly { id: string; fit?: "strong" | "good" | "possible" }[] =
    [{ id: "a", fit: "good" }, { id: "b", fit: "strong" }, { id: "c" }, { id: "d", fit: "possible" }, { id: "e", fit: "strong" }];
  assert.deepEqual(strongestFirst(records).map((record) => record.id), ["b", "e", "a", "d", "c"], "equal strengths keep their order");
  assert.deepEqual(records.map((record) => record.id), ["a", "b", "c", "d", "e"], "the examples themselves are left as they are");
});
