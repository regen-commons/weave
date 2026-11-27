import assert from "node:assert/strict";
import { record } from "@weave/api/account-contract";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createLiveSocialService } from "../src/social/live.ts";
import { DraftController } from "../src/describe/controller.ts";
import { MemoryDraftRepository } from "../src/describe/repository.ts";
import { DeviceDraftSchema, newDraft, revise } from "../src/describe/contracts.ts";
import { AnotherAccountsCard, belongsToAnotherAccount, loadedDraft } from "../src/account/document.ts";
import { projectChoiceKey, projectChoosers } from "../src/social/project-choice.ts";
import { draftWithRecord } from "../src/initiative/import.ts";
import { standsForProject } from "../src/initiative/list.ts";
import { addEntry } from "../src/intake/entries.ts";
import { projectSource } from "../src/intake/project-page.ts";
import { likelyDuplicate } from "../src/initiative/duplicates.ts";
import { publicCard } from "../src/initiative/status.ts";
import { AccountFailure, type AccountState } from "../src/account/client.ts";
import { accountFixture, fixtureSession, seedFixtureSave } from "../dev/account-fixture.ts";
import { projectEvidenceFixture, FIXTURE_TEAM_ADMIN, FIXTURE_GROUP_MEMBER, FIXTURE_UNAVAILABLE, FIXTURE_TEAM_ID, FIXTURE_PROJECT_STARTER, publishFixtureProject } from "../dev/matching-fixture.ts";
import { editorHandoffKey, readEditorHandoff } from "../src/initiative/editor-handoff.ts";

const origin = "http://localhost:5175";
function keyed(stored: Map<string, string>) {
  return { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => { stored.set(key, value); },
    removeItem: (key: string) => { stored.delete(key); }, get length() { return stored.size; }, key: (index: number) => [...stored.keys()][index] ?? null };
}
/**
 * `device` is storage that outlives the tab, and `repo` the drafts another tab already stored.
 * `blank` starts on a card with nothing in it, `refuse` makes the device turn every write away, and
 * `noDevice` is a browser that gives no device storage at all. `stored` is the tab's own storage.
 */
async function fixture(id = FIXTURE_TEAM_ADMIN, { device = new Map<string, string>(), repo: shared, blank = false, refuse = false, noDevice = false }:
  { device?: Map<string, string>; repo?: MemoryDraftRepository; blank?: boolean; refuse?: boolean; noDevice?: boolean } = {}) {
  const token = fixtureSession(id), bodies: Record<string, unknown>[] = [], opened: string[] = [];
  const seed = blank ? newDraft() : revise(newDraft(), { composer: "Unfinished private words" });
  const repo = shared ?? new MemoryDraftRepository(seed), controller = new DraftController(repo);
  await controller.initialize();
  const account: AccountState = { available: true, fixture: true, user: { id, email: null }, items: [] };
  const request = async (path = "", body?: unknown, endpoint = "/api/account", signal?: AbortSignal) => {
    signal?.throwIfAborted();
    if (body) bodies.push(body as Record<string, unknown>);
    const request = new Request(`${origin}${endpoint}${path}`, { method: body ? "POST" : "GET",
      headers: { origin, "content-type": "application/json", cookie: `weave_local_account=${token}` },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    const response = endpoint === "/api/projects" ? await projectEvidenceFixture(origin)(request)
      : await accountFixture[body ? "POST" : "GET"](request);
    const result = record(await response.json());
    if (!response.ok) throw new AccountFailure(String(result.error));
    return result;
  };
  const stored = new Map<string, string>();
  const service = createLiveSocialService({ account, controller, request, refreshAccount: async () => {
    const result = await request(); return { ...account, items: result.items as AccountState["items"] };
  },
    // As browser storage is: its keys can be listed, which is how a card's choosers are read.
    storage: keyed(stored),
    ...(noDevice ? {} : { choices: refuse ? { ...keyed(device), setItem() { throw Error("quota"); } } : keyed(device) }),
    openWorkspace: id => { opened.push(id); }, signIn: async () => {}, signedOut: () => {} });
  return { service, controller, repo, bodies, opened, request, stored, device, account };
}

test("the agreed initiative list reads Certified projects and authorized workspaces without saving or sharing", async () => {
  const { service, controller, bodies, repo, opened } = await fixture();
  await service.reload();
  assert.equal(service.status().problem, null);
  const state = service.snapshot();
  assert.equal(state.workspaces?.[0]?.workspaceId, FIXTURE_TEAM_ID);
  assert.equal(state.workspaces?.[0]?.accessRole, "admin");
  assert.equal(state.records.find(p => p.name === "Seed library (fixture)")?.group, "Valley seed keepers");
  assert.ok(bodies.every(body => String(body.action).startsWith("list_")));
  await service.openWorkspace(state.workspaces![0]!.uri, null);
  assert.deepEqual(opened, [FIXTURE_TEAM_ID]);
  assert.equal(controller.getSnapshot().draft.composer, "Unfinished private words");
  assert.equal(repo.history.length, 0, "opening a workspace does not replace or upload the device draft");
  assert.equal("remind" in service, false, "example-only actions do not enter the live service");
});

test("a member explicitly requests setup after choosing a public project, with no grant or private upload", async () => {
  const { service, bodies, controller } = await fixture(FIXTURE_GROUP_MEMBER);
  await service.reload();
  const project = service.snapshot().records.find(p => p.name === "Seed library (fixture)")!;
  await service.linkProject(project.uri);
  assert.equal(service.snapshot().project?.workspace, "absent");
  assert.equal(bodies.some(body => body.action === "request_setup"), false);
  await service.requestWorkspace();
  assert.equal(service.snapshot().project?.workspace, "requested");
  service.syncAccount({ available: true, fixture: true, user: { id: FIXTURE_GROUP_MEMBER, email: null }, items: [] });
  await service.reload();
  assert.equal(service.snapshot().project?.workspace, "requested", "an acknowledged request survives refresh");
  assert.equal(bodies.some(body => ["save", "team_save", "activate", "grant_access"].includes(String(body.action))), false);
  assert.equal(controller.getSnapshot().draft.composer, "Unfinished private words");
  await controller.replace(newDraft());
  service.syncAccount({ available: true, fixture: true, user: { id: FIXTURE_GROUP_MEMBER, email: null }, items: [] });
  assert.equal(service.snapshot().project, null, "a different draft does not inherit the project selection");
});

test("a 503 leaves device work intact and shows an honest partial project-list failure", async () => {
  const { service, controller, opened } = await fixture(FIXTURE_UNAVAILABLE);
  await service.reload();
  assert.match(service.status().problem!, /could not be checked/);
  assert.equal(service.snapshot().records.length, 0);
  assert.equal(controller.getSnapshot().draft.composer, "Unfinished private words");
  assert.deepEqual(opened, []);
});

test("duplicate suggestions use actual project names and only verified fields replace the device card", async () => {
  const { service, controller } = await fixture();
  await service.reload();
  const match = likelyDuplicate({ name: "Watershed Team", links: [] }, service.snapshot().workspaces!)!;
  assert.ok(match);
  const draft = controller.getSnapshot().draft;
  const withFields = revise(draft, { proposal: { name: "Watershed Team", description: "Private description", locations: ["Local place"],
    isGlobal: false, links: ["https://example.org/local"], stage: null, lenses: [], themes: [], beneficiaries: [], languages: [], confidence: 1 }, proposalVersion: draft.inputVersion });
  const next = draftWithRecord(withFields, match);
  assert.deepEqual(next.proposal?.links, ["https://example.org/local"]);
  assert.deepEqual(next.proposal?.locations, ["Local place"]);
  assert.equal(next.composer, draft.composer);
});

test("Use this project on a team workspace brings the source place, keeps it on reload and writes nothing", async () => {
  const { service, controller, repo, bodies } = await fixture();
  await service.reload();
  const match = likelyDuplicate({ name: "Watershed Team", links: [] }, service.snapshot().workspaces!)!;
  assert.deepEqual(match.verifiedFields, ["name", "description", "locations"]);
  assert.deepEqual([match.links, match.publisherLinks], [[], ["https://watershed.example.org/"]],
    "the group's links are kept apart from the project's own");
  await service.linkProject(match.uri);
  const linked = controller.getSnapshot().draft;
  assert.deepEqual(publicCard(linked).locations, ["Lower river meadows (fixture)"]);
  assert.deepEqual(publicCard(linked).links, [], "the group's links stay off the card");
  assert.equal(service.snapshot().project?.workspaceId, FIXTURE_TEAM_ID, "the existing workspace is reused");
  assert.deepEqual(bodies.filter(body => !String(body.action).startsWith("list_")).map(body => body.action), ["lookup"],
    "no project is created and nothing is saved to the team");
  assert.equal(linked.account.saved, null, "the card stays on this device only");
  // A reload reads the stored device draft back through the draft validator, as a new tab does.
  const stored = DeviceDraftSchema.parse(JSON.parse(JSON.stringify(await repo.load())));
  const reopened = new DraftController(new MemoryDraftRepository(stored));
  await reopened.initialize();
  assert.deepEqual(publicCard(reopened.getSnapshot().draft), publicCard(linked));
  assert.equal(reopened.getSnapshot().draft.form?.where, "Lower river meadows (fixture)");
});

test("a fresh link takes the source place, and a place Weave cannot read stays empty and named as unread", async () => {
  const member = await fixture(FIXTURE_GROUP_MEMBER);
  await member.service.reload();
  const seeds = member.service.snapshot().records.find(p => p.name === "Seed library (fixture)")!;
  await member.service.linkProject(seeds.uri);
  assert.deepEqual(publicCard(member.controller.getSnapshot().draft).locations, ["Upper valley seed house (fixture)"]);
  assert.deepEqual(publicCard(member.controller.getSnapshot().draft).links, []);
  const admin = await fixture();
  await admin.service.reload();
  const notes = admin.service.snapshot().records.find(p => p.name === "Water notes (fixture)")!;
  assert.deepEqual([notes.locations, notes.links, notes.unreadFields], [[], [], ["locations"]]);
  await admin.service.linkProject(notes.uri);
  assert.deepEqual(publicCard(admin.controller.getSnapshot().draft).locations, [], "no place is guessed");
  assert.deepEqual(publicCard(admin.controller.getSnapshot().draft).links, []);
});

test("the live screen adapter lists and opens a private save made earlier, and offers no new one (DL-155)", async () => {
  const { service, controller, repo, request } = await fixture();
  const document = JSON.parse(readFileSync(new URL("../../api/src/test-data/account.json", import.meta.url), "utf8"));
  const id = crypto.randomUUID();
  await seedFixtureSave(fixtureSession(FIXTURE_TEAM_ADMIN), { id, document });
  assert.equal("save" in service, false, "the live service has no way to save privately");
  await assert.rejects(request("", { action: "save", accountId: FIXTURE_TEAM_ADMIN, id: crypto.randomUUID(), expectedRevision: 0,
    requestId: crypto.randomUUID(), document }), { code: "private_saves_retired" });
  // Your Initiatives lists it from the account, as the account context passes it on.
  service.syncAccount({ available: true, fixture: true, user: { id: FIXTURE_TEAM_ADMIN, email: null },
    items: (await request()).items as AccountState["items"] });
  assert.ok(service.snapshot().cards.some(item => item.id === id && item.revision === 1));
  const other = revise(newDraft(), { composer: "Another unfinished initiative" });
  await controller.replace(other);
  await service.openCard(id, null);
  assert.equal(controller.getSnapshot().draft.account.saved?.id, id);
  assert.equal(controller.getSnapshot().draft.confirmed?.name, document.initiative.name);
  // The other initiative stays on the device as its own draft.
  assert.equal(repo.drafts.get(other.id)?.composer, "Another unfinished initiative");
  assert.equal(service.snapshot().shared, null);
});

test("refreshing a full first page restores pagination and rejects an older in-flight page", async () => {
  const { controller } = await fixture();
  const owner = FIXTURE_TEAM_ADMIN;
  const items = Array.from({ length: 25 }, (_, index) => ({ id: crypto.randomUUID(), name: `Saved initiative ${index}`,
    revision: 1, updatedAt: "2026-11-11T00:00:00Z" }));
  const account: AccountState = { available: true, fixture: true, user: { id: owner, email: null }, items: [] };
  let release: (() => void) | undefined;
  let delayed = false;
  const offsets: number[] = [];
  const service = createLiveSocialService({ account, controller, refreshAccount: async () => account,
    request: async path => {
      const offset = Number(new URLSearchParams(path).get("offset")); offsets.push(offset);
      if (delayed) await new Promise<void>(resolve => { release = resolve; });
      return { user: account.user, items: items.slice(offset, offset + 20) };
    }, openWorkspace() {}, async signIn() {}, signedOut() {} });
  assert.equal(service.snapshot().hasMoreCards, false);
  service.syncAccount({ ...account, items: items.slice(0, 20) });
  assert.equal(service.snapshot().hasMoreCards, true, "a newly full first page can load older saves");
  await service.moreCards!();
  assert.equal(service.snapshot().cards.length, 25);
  assert.equal(service.snapshot().hasMoreCards, false);
  service.syncAccount({ ...account, items: items.slice(0, 20) });
  assert.equal(service.snapshot().cards.length, 25, "an unchanged account snapshot retains loaded pages");
  const refreshed = items.slice(0, 20).map(item => ({ ...item, revision: 2 }));
  service.syncAccount({ ...account, items: refreshed });
  assert.equal(service.snapshot().cards.length, 20);
  assert.equal(service.snapshot().hasMoreCards, true);
  delayed = true;
  const olderPage = service.moreCards!();
  service.syncAccount({ ...account, items: refreshed.slice(0, 19) });
  release!();
  await assert.rejects(olderPage, /saved list changed/);
  assert.equal(service.snapshot().cards.length, 19, "a stale page never replaces a refreshed list");
  assert.deepEqual(offsets, [20, 20]);
});

test("an external publication is discovered on return, explicitly selected and reused without uploading or replacing private entries", async () => {
  const { service, controller, repo, bodies, opened } = await fixture(FIXTURE_PROJECT_STARTER);
  const document = JSON.parse(readFileSync(new URL("../../api/src/test-data/account.json", import.meta.url), "utf8"));
  const initial = loadedDraft({ id: crypto.randomUUID(), document, revision: 1, updatedAt: "2026-11-11T00:00:00Z" }, FIXTURE_PROJECT_STARTER);
  await controller.replace(revise(initial, { composer: "Private unfinished source", account: { saved: null, pending: null } }));
  const before = controller.getSnapshot().draft;
  await service.reload();
  assert.equal(service.snapshot().records.length, 0, "an upstream private draft is not a published record");
  assert.equal(service.snapshot().project, null);
  publishFixtureProject(FIXTURE_PROJECT_STARTER);
  await service.reload();
  const project = service.snapshot().records[0]!;
  assert.equal(project.name, "Editor return project (fixture)");
  assert.equal(service.snapshot().project, null, "discovery and return do not link automatically");
  assert.equal(controller.getSnapshot().draft, before);
  await service.linkProject(project.uri);
  const after = controller.getSnapshot().draft;
  assert.equal(after.id, before.id);
  assert.deepEqual(after.needs, before.needs); assert.deepEqual(after.offers, before.offers);
  assert.equal(after.composer, before.composer); assert.equal(repo.value?.id, before.id);
  await service.reload(); await service.reload();
  assert.equal(service.snapshot().records.filter(item => item.uri === project.uri).length, 1);
  assert.equal(service.snapshot().project?.uri, project.uri, "the canonical AT URI is retained");
  assert.ok(bodies.every(body => ["list_project_groups", "list_projects", "list_workspaces", "lookup"].includes(String(body.action))));
  assert.deepEqual(opened, []);
  assert.equal(service.snapshot().shared, null); assert.equal(service.snapshot().published, null);
  await service.requestWorkspace();
  const id = service.snapshot().project?.workspaceId;
  assert.ok(id); assert.deepEqual(opened, [id]);
  await service.reload();
  assert.equal(service.snapshot().workspaces?.find(item => item.uri === project.uri)?.workspaceId, id);
  assert.equal(bodies.some(body => ["save", "team_save", "create", "share", "publish_support"].includes(String(body.action))), false);
});

test("an older project discovery response cannot erase the refreshed return list", async () => {
  const { controller } = await fixture();
  let release!: (value: Record<string, unknown>) => void, delayed = true;
  const project = { uri: "at://did:plc:aaaaaaaaaaaaaaaaaaaaaaaa/org.hypercerts.collection/returned", cid: "fixture",
    repoDid: "did:plc:aaaaaaaaaaaaaaaaaaaaaaaa", title: "Returned project" };
  const service = createLiveSocialService({ controller, account: { available: true, fixture: true, user: { id: FIXTURE_TEAM_ADMIN, email: null }, items: [] },
    refreshAccount: async () => { throw Error("unused"); }, async signIn() {}, signedOut() {}, openWorkspace() {},
    request: async (_path, input) => {
      const body = record(input);
      if (body.action === "list_project_groups") return { groups: [] };
      if (body.action === "list_workspaces") return { workspaces: [] };
      if (delayed) { delayed = false; return new Promise(resolve => { release = resolve; }); }
      return { projects: [project] };
    } });
  const earlier = service.reload();
  await service.reload();
  release({ projects: [] }); await earlier;
  assert.equal(service.snapshot().records[0]?.uri, project.uri);
  assert.equal(service.status().problem, null); assert.equal(service.status().loading, false);
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
/** Words a project page can carry that are read as a need and an offer, so linking writes suggestions into the card. */
const SUGGESTING = "We need volunteers for river sampling. We offer training in water testing.";
async function linkingFixture(beforeWrite: () => Promise<void>, description = "Verified public words.", savedTo: { uri: string } | null = null) {
  const document = JSON.parse(readFileSync(new URL("../../api/src/test-data/account.json", import.meta.url), "utf8"));
  const seed = revise(loadedDraft({ id: crypto.randomUUID(), document, revision: 1, updatedAt: "2026-11-11T00:00:00Z" }, FIXTURE_TEAM_ADMIN),
    { composer: "Private source words", ...(savedTo ? {} : { account: { saved: null, pending: null } }) });
  const repo = new MemoryDraftRepository(seed);
  const controller = new DraftController({ load: () => repo.load(), async save(draft, revision) { await beforeWrite(); await repo.save(draft, revision); } });
  await controller.initialize();
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  storage.setItem(editorHandoffKey(FIXTURE_TEAM_ADMIN, seed.id), JSON.stringify({ version: 1, editor: "certified", owner: FIXTURE_TEAM_ADMIN, draftId: seed.id }));
  const project = { uri: "at://did:plc:aaaaaaaaaaaaaaaaaaaaaaaa/org.hypercerts.collection/durable-link", cid: "fixture",
    repoDid: "did:plc:aaaaaaaaaaaaaaaaaaaaaaaa", title: "Published project", description };
  const account: AccountState = { available: true, fixture: true, user: { id: FIXTURE_TEAM_ADMIN, email: null }, items: [] };
  // The workspace a saved card already has, for another of the account's projects.
  const other = savedTo && { ...project, uri: savedTo.uri, title: "Saved project", description: "Other public words." };
  const service = createLiveSocialService({ controller, account, storage, choices: storage, refreshAccount: async () => account,
    async signIn() {}, signedOut() {}, openWorkspace() {},
    request: async (_path, input) => {
      const body = record(input);
      if (body.action === "list_project_groups") return { groups: [] };
      if (body.action === "list_workspaces") return { workspaces: other
        ? [{ workspaceId: seed.account.saved!.id, projectUri: other.uri, kind: "personal", accessRole: "admin", project: other }] : [] };
      if (body.action === "list_projects") return { projects: other ? [project, other] : [project] };
      assert.equal(body.action, "lookup"); return { status: "unlinked", projectUri: project.uri };
    } });
  controller.subscribe(() => service.syncAccount(account));
  await service.reload();
  const hint = () => readEditorHandoff(storage, FIXTURE_TEAM_ADMIN, seed.id);
  const choice = () => storage.getItem(projectChoiceKey(FIXTURE_TEAM_ADMIN, seed.id));
  return { service, controller, repo, project, hint, seed, choice };
}

test("linking finishes durable device work and hint cleanup before the initiative host can unmount its task", async () => {
  const started = deferred(), finish = deferred(), task = new AbortController();
  const { service, controller, repo, project, hint, seed } = await linkingFixture(async () => { started.resolve(); await finish.promise; });
  // The initiative page removes its link task as soon as a selection is published.
  service.subscribe(() => {
    if (service.snapshot().project) {
      assert.equal(controller.getSnapshot().storage, "saved");
      assert.equal(hint(), null);
      task.abort();
    }
  });
  const linking = service.linkProject(project.uri, task.signal);
  await Promise.race([started.promise, linking.then(() => assert.fail("selection must wait for device storage"))]);
  assert.equal(service.snapshot().project, null); assert.ok(hint());
  finish.resolve();
  assert.equal((await linking).uri, project.uri);
  assert.equal(task.signal.aborted, true, "host removal happens only after completion");
  assert.equal(repo.value?.confirmed?.name, project.title);
  assert.equal(repo.value?.id, seed.id); assert.deepEqual(repo.value?.needs, seed.needs); assert.deepEqual(repo.value?.offers, seed.offers);
});

test("a failed device write retains the handoff and does not publish a selection that would hide its error", async () => {
  const { service, controller, project, hint, seed } = await linkingFixture(async () => { throw Error("quota"); });
  await assert.rejects(service.linkProject(project.uri), /could not be stored/);
  assert.equal(service.snapshot().project, null); assert.ok(hint());
  assert.equal(controller.getSnapshot().storage, "memory");
  assert.equal(controller.getSnapshot().draft.composer, seed.composer);
});

test("canceling a link during device persistence retains its return hint and publishes no selection", async () => {
  const started = deferred(), finish = deferred(), task = new AbortController();
  const { service, project, hint } = await linkingFixture(async () => { started.resolve(); await finish.promise; });
  const linking = service.linkProject(project.uri, task.signal);
  await Promise.race([started.promise, linking.then(() => assert.fail("link finished before storage"))]);
  task.abort(); finish.resolve();
  await assert.rejects(linking, { name: "AbortError" });
  assert.equal(service.snapshot().project, null); assert.ok(hint());
});

test("an edit while a link is being stored preserves the newer words and requires another review", async () => {
  const started = deferred(), finish = deferred();
  const { service, controller, repo, project, hint } = await linkingFixture(async () => { started.resolve(); await finish.promise; });
  const linking = service.linkProject(project.uri);
  await Promise.race([started.promise, linking.then(() => assert.fail("link finished before storage"))]);
  controller.change(draft => revise(draft, { composer: "Newer private words" }));
  finish.resolve(); await assert.rejects(linking, /device card changed/);
  assert.equal(repo.value?.composer, "Newer private words");
  assert.equal(service.snapshot().project, null); assert.ok(hint());
});

test("linking a project whose words give suggestions publishes nothing before the device write, and keeps the choice", async () => {
  const started = deferred(), finish = deferred(), task = new AbortController();
  const { service, controller, project, choice } = await linkingFixture(async () => { started.resolve(); await finish.promise; }, SUGGESTING);
  // The initiative page removes its link task as soon as a project is published, which stops a link under way.
  service.subscribe(() => {
    if (service.snapshot().project) {
      assert.equal(controller.getSnapshot().storage, "saved");
      task.abort();
    }
  });
  const linking = service.linkProject(project.uri, task.signal);
  await Promise.race([started.promise, linking.then(() => assert.fail("selection must wait for device storage"))]);
  assert.ok(standsForProject(controller.getSnapshot().draft, project.uri, null), "the card already carries the project's suggestions");
  assert.equal(service.snapshot().project, null, "and suggestions alone publish nothing");
  finish.resolve();
  assert.equal((await linking).uri, project.uri);
  assert.equal(choice(), project.uri, "the choice is kept, so the card has an owner");
});

test("a failed device write publishes no project even when the card already carries its suggestions", async () => {
  const { service, controller, project, choice, hint } = await linkingFixture(async () => { throw Error("quota"); }, SUGGESTING);
  await assert.rejects(service.linkProject(project.uri), /could not be stored/);
  assert.ok(standsForProject(controller.getSnapshot().draft, project.uri, null));
  assert.equal(service.snapshot().project, null, "nothing hides the failure");
  assert.equal(choice(), null); assert.ok(hint());
});

test("linking a card that is saved to a workspace shows the new project only once the choice is stored", async () => {
  const started = deferred(), finish = deferred();
  const savedTo = { uri: "at://did:plc:aaaaaaaaaaaaaaaaaaaaaaaa/org.hypercerts.collection/saved-workspace" };
  const { service, controller, project, choice } = await linkingFixture(async () => { started.resolve(); await finish.promise; }, SUGGESTING, savedTo);
  assert.equal(service.snapshot().project?.uri, savedTo.uri, "the card is linked through the workspace it was saved to");
  const shown: (string | undefined)[] = [];
  service.subscribe(() => { shown.push(`${service.snapshot().project?.uri} ${controller.getSnapshot().storage}`); });
  const linking = service.linkProject(project.uri);
  await Promise.race([started.promise, linking.then(() => assert.fail("selection must wait for device storage"))]);
  assert.equal(service.snapshot().project?.uri, savedTo.uri, "nothing new is shown while the link is stored");
  finish.resolve();
  assert.equal((await linking).uri, project.uri);
  assert.equal(choice(), project.uri);
  assert.equal(service.snapshot().project?.uri, project.uri, "the choice comes before the saved workspace");
  assert.deepEqual(shown.filter(entry => entry?.startsWith(project.uri)).map(entry => entry!.split(" ")[1]), ["saved"], "the new project appeared once, after the write");
});

test("a card another account opened from its project takes no project choice from this account, so it stays set aside (DL-055)", async () => {
  // Account A opened this unsaved card from its Certified project in this tab and signed out.
  // Account B signs in on the same tab. The card is set aside for B, and must stay so whatever B opens.
  const { service, controller, device: stored, bodies, opened } = await fixture(FIXTURE_TEAM_ADMIN);
  const theirs = controller.getSnapshot().draft;
  stored.set(projectChoiceKey(FIXTURE_GROUP_MEMBER, theirs.id), "at://did:plc:example/org.example.project/theirs");
  const storage = { get length() { return stored.size; }, key: (index: number) => [...stored.keys()][index] ?? null };
  const setAside = () => belongsToAnotherAccount(controller.getSnapshot().draft, FIXTURE_TEAM_ADMIN, projectChoosers(storage, theirs.id));
  assert.equal(setAside(), true);
  await service.reload();
  const workspace = service.snapshot().workspaces!.find((item) => item.workspaceId)!;
  // Opening a team workspace is allowed, and records nothing against the other account's card.
  await service.openWorkspace(workspace.uri, null);
  assert.deepEqual(projectChoosers(storage, theirs.id), [FIXTURE_GROUP_MEMBER], "no second chooser is written");
  assert.equal(setAside(), true, "the card is still set aside");
  // The workspace itself opens for the person who is signed in, and the other account's card
  // is never shown as linked to it, now or after the list is read again.
  assert.deepEqual(opened, [workspace.workspaceId]);
  assert.equal(service.snapshot().project, null);
  await service.reload();
  assert.equal(service.snapshot().project, null);
  // Linking a project would write this account's project into that card. It is refused whole.
  const before = bodies.length;
  await assert.rejects(service.linkProject(workspace.uri), AnotherAccountsCard);
  assert.equal(controller.getSnapshot().draft, theirs, "the card is untouched");
  assert.equal(bodies.length, before, "and nothing was asked of the server");
  assert.deepEqual(projectChoosers(storage, theirs.id), [FIXTURE_GROUP_MEMBER]);
  assert.equal(setAside(), true);
});

test("a card linked to a Certified project is still linked in a new tab, because the choice is kept on the device", async () => {
  const device = new Map<string, string>();
  const first = await fixture(FIXTURE_TEAM_ADMIN, { device });
  await first.service.reload();
  const project = first.service.snapshot().records.find(p => p.name === "Water notes (fixture)")!;
  await first.service.linkProject(project.uri);
  const card = first.controller.getSnapshot().draft;
  assert.equal(device.get(projectChoiceKey(FIXTURE_TEAM_ADMIN, card.id)), project.uri, "the choice is on the device");
  assert.equal(first.stored.has(projectChoiceKey(FIXTURE_TEAM_ADMIN, card.id)), false, "and not in the tab's own storage");
  // The tab closes, or sign-in comes back in another window: a new session over the same device.
  const second = await fixture(FIXTURE_TEAM_ADMIN, { device, repo: first.repo });
  assert.equal(second.controller.getSnapshot().draft.id, card.id);
  assert.equal(second.stored.size, 0);
  await second.service.reload();
  assert.equal(second.service.snapshot().project?.uri, project.uri, "the unsaved card is still linked");
  assert.equal(second.service.snapshot().project?.workspace, "solo");
  // Another account on this device still does not get the card (DL-055), now for as long as it is here.
  const other = await fixture(FIXTURE_GROUP_MEMBER, { device, repo: first.repo });
  await other.service.reload();
  assert.equal(other.service.snapshot().project, null);
  assert.equal(belongsToAnotherAccount(other.controller.getSnapshot().draft, FIXTURE_GROUP_MEMBER, projectChoosers(keyed(device), card.id)), true);
});

test("suggestions from a project never link a card by themselves: it is nobody's until an account chooses the project (DL-055)", async () => {
  const device = new Map<string, string>();
  const first = await fixture(FIXTURE_TEAM_ADMIN, { device });
  await first.service.reload();
  // A group's project, which two accounts on this device can both list.
  const project = first.service.snapshot().records.find(p => p.name === "Seed library (fixture)")!;
  first.controller.change(draft => {
    const needs = addEntry(draft.needs, "Seed jars");
    return revise(draft, { needs: { ...needs, items: needs.items.map(item => ({ ...item, sourceKey: `${projectSource(project.uri)}:0` })) } });
  });
  await first.controller.settled();
  const card = first.controller.getSnapshot().draft;
  assert.ok(standsForProject(card, project.uri, null), "the card carries the project's suggestions, as one linked by an earlier build does");
  await first.service.reload();
  assert.equal(first.service.snapshot().project, null, "nobody chose the project, so the card is not linked");
  first.service.syncAccount(first.account);
  assert.equal(first.service.snapshot().project, null);
  const other = await fixture(FIXTURE_GROUP_MEMBER, { device, repo: first.repo });
  await other.service.reload();
  assert.ok(other.service.snapshot().records.some(p => p.uri === project.uri), "the other account can list the same project");
  assert.equal(other.service.snapshot().project, null, "and is not handed the card either");
  assert.equal(device.size, 0, "reading the lists records nothing");
  // Choosing the project is what links the card, and from then on it is that account's.
  await first.service.linkProject(project.uri);
  assert.equal(device.get(projectChoiceKey(FIXTURE_TEAM_ADMIN, card.id)), project.uri);
  assert.equal(first.service.snapshot().project?.uri, project.uri);
  assert.equal(belongsToAnotherAccount(first.controller.getSnapshot().draft, FIXTURE_GROUP_MEMBER, projectChoosers(keyed(device), card.id)), true);
});

test("opening a team workspace is noted for the tab only: it is not the card's project, and records no choice", async () => {
  const device = new Map<string, string>();
  const first = await fixture(FIXTURE_TEAM_ADMIN, { device });
  const mine = first.controller.getSnapshot().draft;
  await first.service.reload();
  const workspace = first.service.snapshot().workspaces!.find((item) => item.workspaceId)!;
  await first.service.openWorkspace(workspace.uri, null);
  assert.deepEqual(first.opened, [workspace.workspaceId]);
  assert.equal(device.size, 0, "nothing is kept on the device");
  assert.equal(first.stored.has(projectChoiceKey(FIXTURE_TEAM_ADMIN, mine.id)), false, "or in the tab's own storage");
  // In this tab the visit is kept while the lists are read again, so the team's page can offer to
  // save the card there. The card itself stays unlinked: it can still be linked to its own project.
  const here = () => first.service.snapshot();
  assert.equal(here().visit, workspace.workspaceId); assert.equal(here().project, null);
  await first.service.reload();
  assert.equal(here().visit, workspace.workspaceId); assert.equal(here().project, null);
  first.service.syncAccount(first.account);
  assert.equal(here().visit, workspace.workspaceId); assert.equal(here().project, null);
  // A new tab over the same device has the card as it was: not linked, not visited, and still anyone's.
  const second = await fixture(FIXTURE_TEAM_ADMIN, { device, repo: first.repo });
  await second.service.reload();
  assert.equal(second.controller.getSnapshot().draft.id, mine.id);
  assert.equal(second.service.snapshot().project, null);
  assert.equal(second.service.snapshot().visit ?? null, null);
  assert.equal(belongsToAnotherAccount(mine, FIXTURE_GROUP_MEMBER, projectChoosers(keyed(device), mine.id)), false, "another account is not set aside from it");
});

test("a card linked to its own project keeps that project when a team workspace is opened", async () => {
  const device = new Map<string, string>();
  const { service, controller, opened, account } = await fixture(FIXTURE_TEAM_ADMIN, { device });
  await service.reload();
  const project = service.snapshot().records.find(p => p.name === "Water notes (fixture)")!;
  await service.linkProject(project.uri);
  const card = controller.getSnapshot().draft;
  const workspace = service.snapshot().workspaces!.find((item) => item.workspaceId)!;
  await service.openWorkspace(workspace.uri, null);
  assert.deepEqual(opened, [workspace.workspaceId], "the workspace still opens");
  assert.equal(device.get(projectChoiceKey(FIXTURE_TEAM_ADMIN, card.id)), project.uri, "the choice is not overwritten");
  assert.equal(service.snapshot().project?.uri, project.uri, "and the card is still shown with its own project");
  assert.equal(service.snapshot().visit ?? null, null, "a card that has a project of its own is not noted as visiting");
  service.syncAccount(account);
  assert.equal(service.snapshot().project?.uri, project.uri);
  await service.reload();
  assert.equal(service.snapshot().project?.uri, project.uri);
  assert.equal(service.snapshot().visit ?? null, null);
});

test("a visit belongs to the card it was made over, and ends when that card is linked or cleared", async () => {
  const { service, controller, account, device } = await fixture(FIXTURE_TEAM_ADMIN);
  await service.reload();
  const visited = controller.getSnapshot().draft;
  const workspace = service.snapshot().workspaces!.find((item) => item.workspaceId)!;
  await service.openWorkspace(workspace.uri, null);
  assert.equal(service.snapshot().visit, workspace.workspaceId);
  // Another card in the tab was never taken to the workspace.
  const next = await controller.startNew();
  assert.notEqual(next.id, visited.id);
  service.syncAccount(account);
  assert.equal(service.snapshot().visit ?? null, null, "the visit does not follow the tab to another card");
  await controller.open(visited.id);
  service.syncAccount(account);
  assert.equal(service.snapshot().visit, workspace.workspaceId, "and is still the first card's");
  // Linking the card to its own project is still offered, and ends the visit.
  const project = service.snapshot().records.find(p => p.name === "Water notes (fixture)")!;
  await service.linkProject(project.uri);
  assert.equal(service.snapshot().project?.uri, project.uri);
  assert.equal(service.snapshot().visit ?? null, null);
  assert.equal(device.get(projectChoiceKey(FIXTURE_TEAM_ADMIN, visited.id)), project.uri);
  // Clearing the card ends a visit too.
  const again = await fixture(FIXTURE_TEAM_ADMIN);
  await again.service.reload();
  await again.service.openWorkspace(workspace.uri, null);
  assert.equal(again.service.snapshot().visit, workspace.workspaceId);
  await again.service.clearCard();
  again.service.syncAccount(again.account);
  assert.equal(again.service.snapshot().visit ?? null, null);
});

test("with no device storage the adapter reads nothing from the tab's storage and keeps a choice in memory", async () => {
  const { service, controller, stored, account } = await fixture(FIXTURE_TEAM_ADMIN, { noDevice: true });
  await service.reload();
  const card = controller.getSnapshot().draft;
  const project = service.snapshot().records.find(p => p.name === "Water notes (fixture)")!;
  // What an earlier build kept for this tab: this account's choice, and another account's for the same card.
  stored.set(projectChoiceKey(FIXTURE_TEAM_ADMIN, card.id), project.uri);
  stored.set(projectChoiceKey(FIXTURE_GROUP_MEMBER, card.id), "at://did:plc:example/org.example.project/theirs");
  const before = new Map(stored);
  await service.reload();
  assert.equal(service.snapshot().project, null, "the tab's entry links nothing");
  // The other account's entry does not set the card aside, so linking is not refused.
  await service.linkProject(project.uri);
  assert.equal(service.snapshot().project?.uri, project.uri);
  service.syncAccount(account);
  assert.equal(service.snapshot().project?.uri, project.uri, "the choice is held for the tab");
  assert.deepEqual([...stored].filter(([key]) => key.startsWith("weave-project-choice/")), [...before].filter(([key]) => key.startsWith("weave-project-choice/")), "and no choice is written to the tab's storage");
});

test("a blank card is tied to nothing, so an initiative started on it is not born linked", async () => {
  const device = new Map<string, string>();
  const { service, controller, opened, account } = await fixture(FIXTURE_TEAM_ADMIN, { device, blank: true });
  await service.reload();
  const workspace = service.snapshot().workspaces!.find((item) => item.workspaceId)!;
  await service.openWorkspace(workspace.uri, null);
  assert.deepEqual(opened, [workspace.workspaceId]);
  assert.equal(service.snapshot().project, null);
  assert.equal(service.snapshot().visit ?? null, null, "there is nothing on the card to save to the team");
  // Starting a new initiative reuses the blank card, so its ID is the one the workspace was opened over.
  controller.change(draft => revise(draft, { composer: "A new initiative's first words" }));
  await controller.settled();
  service.syncAccount(account);
  assert.equal(service.snapshot().project, null);
  assert.equal(service.snapshot().visit ?? null, null);
  assert.equal(device.size, 0);
});

test("a choice the device will not store is remembered while the tab is open, over an older one it still holds", async () => {
  const device = new Map<string, string>();
  const { service, controller, account } = await fixture(FIXTURE_TEAM_ADMIN, { device, refuse: true });
  // An older choice, of a project the account can no longer open, is still on the device.
  const stale = projectChoiceKey(FIXTURE_TEAM_ADMIN, controller.getSnapshot().draft.id);
  device.set(stale, "at://did:plc:example/org.example.project/gone");
  await service.reload();
  assert.equal(service.snapshot().project, null);
  const project = service.snapshot().records.find(p => p.name === "Water notes (fixture)")!;
  await service.linkProject(project.uri);
  assert.equal(device.get(stale), "at://did:plc:example/org.example.project/gone", "the write was turned away");
  assert.equal(service.snapshot().project?.uri, project.uri);
  service.syncAccount(account);
  assert.equal(service.snapshot().project?.uri, project.uri);
  await service.reload();
  assert.equal(service.snapshot().project?.uri, project.uri);
});

test("a projects request refused for a lapsed token is confirmed through /api/account and run again, not reported", async () => {
  const owner = "b1000000-0000-4000-8000-0000000000aa";
  const controller = new DraftController(new MemoryDraftRepository(newDraft()));
  await controller.initialize();
  const account: AccountState = { available: true, fixture: false, user: { id: owner, email: null }, items: [] };
  const refusedOnce = new Set<string>();
  let confirmations = 0;
  const service = createLiveSocialService({ account, controller, refreshAccount: async () => account,
    confirmAccount: async () => { confirmations++; return account; },
    request: async (_path, body) => {
      const action = String(record(body).action);
      if (!refusedOnce.has(action)) { refusedOnce.add(action); throw new AccountFailure("sign_in_required"); }
      return action === "list_project_groups" ? { groups: [] } : action === "list_workspaces" ? { workspaces: [] } : { projects: [] };
    }, openWorkspace() {}, async signIn() {}, signedOut() {} });
  await service.reload();
  assert.equal(service.status().problem, null, "the renewed session reads the projects as usual");
  assert.ok(confirmations >= 1);
  service.dispose();
});

test("a project made public from a draft is linked with no other saved workspace (DL-155)", async () => {
  const id = crypto.randomUUID(), person = crypto.randomUUID();
  const { service, controller, request } = await fixture(person);
  const document = JSON.parse(readFileSync(new URL("../../api/src/test-data/account.json", import.meta.url), "utf8"));
  await controller.replace(revise(loadedDraft({ id, document, revision: 1, updatedAt: "2026-11-11T00:00:00Z" }, person), { account: { saved: null, pending: null } }));
  await service.reload();
  const garden = "at://did:plc:aaaaaaaaaaaaaaaaaaaaaaaa/org.hypercerts.collection/3mfixturegard";
  // Make It Public linked the project in Weave with no saved card behind it.
  const published = await request("", { action: "link", projectUri: garden }, "/api/projects");
  assert.equal(published.status, "linked");
  const link = await service.linkProject(garden);
  assert.equal(link.uri, garden);
  assert.equal(link.workspaceId, undefined, "the card is not told the project has another saved initiative");
  assert.equal(controller.getSnapshot().draft.account.saved, null, "the card stays on this device");
  assert.equal(service.snapshot().project?.workspaceId, undefined, "and apart from the link the project was published through");
});
