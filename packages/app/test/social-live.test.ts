import assert from "node:assert/strict";
import { record } from "@weave/api/account-contract";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createLiveSocialService } from "../src/social/live.ts";
import { DraftController } from "../src/describe/controller.ts";
import { MemoryDraftRepository } from "../src/describe/repository.ts";
import { newDraft, revise } from "../src/describe/contracts.ts";
import { loadedDraft } from "../src/account/document.ts";
import { draftWithRecord } from "../src/initiative/import.ts";
import { likelyDuplicate } from "../src/initiative/duplicates.ts";
import { AccountFailure, type AccountState } from "../src/account/client.ts";
import { accountFixture, fixtureSession } from "../dev/account-fixture.ts";
import { projectEvidenceFixture, FIXTURE_TEAM_ADMIN, FIXTURE_GROUP_MEMBER, FIXTURE_UNAVAILABLE, FIXTURE_TEAM_ID } from "../dev/matching-fixture.ts";

const origin = "http://localhost:5175";
async function fixture(id = FIXTURE_TEAM_ADMIN) {
  const token = fixtureSession(id), bodies: Record<string, unknown>[] = [], opened: string[] = [];
  const seed = revise(newDraft(), { composer: "Unfinished private words" });
  const repo = new MemoryDraftRepository(seed), controller = new DraftController(repo);
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
    storage: { getItem: key => stored.get(key) ?? null, setItem: (key, value) => { stored.set(key, value); }, removeItem: key => { stored.delete(key); } },
    openWorkspace: id => { opened.push(id); }, signIn: async () => {}, signedOut: () => {} });
  return { service, controller, repo, bodies, opened, request };
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

test("the live screen adapter saves and reloads a private card through the authenticated account handlers", async () => {
  const { service, controller, repo, request } = await fixture();
  const document = JSON.parse(readFileSync(new URL("../../api/src/test-data/account.json", import.meta.url), "utf8"));
  const id = crypto.randomUUID();
  const card = loadedDraft({ id, document, revision: 1, updatedAt: "2026-11-11T00:00:00Z" }, FIXTURE_TEAM_ADMIN);
  await controller.replace(revise(card, { account: { saved: null, pending: null } }));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input), origin);
    return Response.json(await request(url.search, init?.body ? JSON.parse(String(init.body)) : undefined, url.pathname));
  };
  try {
    await service.save(String(document.initiative.name), "private");
    const saved = controller.getSnapshot().draft.account.saved!;
    assert.equal(saved.id, id); assert.equal(saved.revision, 1);
    assert.ok(service.snapshot().cards.some(item => item.id === id));
    await controller.replace(revise(newDraft(), { composer: "Another unfinished initiative" }));
    await service.openCard(id, null);
    assert.equal(controller.getSnapshot().draft.account.saved?.id, id);
    assert.equal(controller.getSnapshot().draft.confirmed?.name, document.initiative.name);
    assert.equal(repo.history[0]?.draft.composer, "Another unfinished initiative");
    assert.equal(service.snapshot().shared, null);
  } finally { globalThis.fetch = originalFetch; }
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
