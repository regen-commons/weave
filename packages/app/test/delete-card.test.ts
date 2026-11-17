import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseDocument, record } from "@weave/api/account-contract";
import { deletableCards, deleteFailure, deleteSavedCard, deletedMessage, forgetSavedCard } from "../src/account/delete-card.ts";
import { AccountFailure, type AccountState } from "../src/account/client.ts";
import { loadedDraft, saveCommand } from "../src/account/document.ts";
import { DraftController } from "../src/describe/controller.ts";
import { MemoryDraftRepository } from "../src/describe/repository.ts";
import { revise } from "../src/describe/contracts.ts";
import { createLiveSocialService } from "../src/social/live.ts";
import { accountFixture, fixtureSession } from "../dev/account-fixture.ts";

const owner = "b1000000-0000-4000-8000-000000000001";
const document = parseDocument(JSON.parse(readFileSync(new URL("../../api/src/test-data/account.json", import.meta.url), "utf8")));
const saved = { id: "b3000000-0000-4000-8000-000000000001", revision: 3, updatedAt: "2026-11-15T00:00:00Z", document };
const other = "b3000000-0000-4000-8000-000000000002";
async function device(change: Parameters<typeof revise>[1] = {}) {
  const draft = revise(loadedDraft(saved, owner), { composer: "Synthetic device words", ...change });
  const repository = new MemoryDraftRepository(draft), controller = new DraftController(repository);
  await controller.initialize();
  return { repository, controller, draft };
}
const deleted = (id = saved.id, revision = 3, kept = 2) => ({ deleted: { id, deleted: true, revision, removed: [id], kept } });

test("forgetting a removed card releases every binding to it and gives a draft with its ID a new one", async () => {
  const { draft } = await device();
  const pending = { ...draft.account.saved!, requestId: crypto.randomUUID() };
  const both = revise(draft, { account: { saved: draft.account.saved, pending } });
  const forgotten = revise(both, forgetSavedCard(both, saved.id)!);
  assert.deepEqual(forgotten.account, { saved: null, pending: null });
  assert.notEqual(forgotten.id, saved.id, "the next Save creates a new card instead of meeting the removed ID");
  assert.equal(forgotten.composer, "Synthetic device words");
  assert.equal(saveCommand(forgotten, owner).command.id, forgotten.id);
  assert.equal(saveCommand(forgotten, owner).command.expectedRevision, 0);
  assert.equal(forgetSavedCard(draft, other), null, "another card leaves the device draft alone");
  const unbound = revise(draft, { account: { saved: null, pending: null } });
  assert.notEqual(revise(unbound, forgetSavedCard(unbound, saved.id)!).id, saved.id);
  const elsewhere = revise(draft, { id: crypto.randomUUID() });
  const kept = revise(elsewhere, forgetSavedCard(elsewhere, saved.id)!);
  assert.equal(kept.id, elsewhere.id);
  assert.equal(kept.account.saved, null);
});

test("deleting sends the exact ID, listed revision and request, then unbinds the device and keeps its words", async () => {
  const { controller, repository } = await device();
  const bodies: unknown[] = [], requestId = crypto.randomUUID();
  const result = await deleteSavedCard(controller, { id: saved.id, revision: 3 }, requestId, async (path, body, endpoint) => {
    assert.equal(path, ""); assert.equal(endpoint, "/api/account");
    bodies.push(body); return deleted();
  });
  assert.deepEqual(bodies, [{ action: "delete", id: saved.id, expectedRevision: 3, requestId }]);
  assert.equal(result.device, "unbound");
  const stored = repository.value!;
  assert.deepEqual(stored.account, { saved: null, pending: null });
  assert.equal(stored.composer, "Synthetic device words");
  assert.notEqual(stored.id, saved.id);
  assert.equal(deletedMessage("Seed library", result),
    "Removed Seed library from your account. 2 saved cards kept. The card on this device keeps its words. Save it again to keep a new copy.");
  assert.equal(deletedMessage("Seed library", { deleted: { ...result.deleted, kept: 1 }, device: "unrelated" }),
    "Removed Seed library from your account. 1 saved card kept.");
  assert.equal(deletedMessage("Seed library", { deleted: { ...result.deleted, kept: 0 }, device: "unrelated" }),
    "Removed Seed library from your account. No other cards are saved in your account.");
});

test("a refused, unconfirmed or mismatched deletion changes nothing on the device and says why", async () => {
  for (const [reply, code, words] of [
    [new AccountFailure("save_conflict"), "save_conflict", "This card changed somewhere else. Reload to see the latest version."],
    [new AccountFailure("initiative_referenced"), "initiative_referenced",
      "A card linked to a team or shared for matching cannot be deleted here yet. Nothing was removed."],
    [new AccountFailure("not_found"), "not_found", "This card is no longer saved in your account. Reload to see your saved cards."],
    [new AccountFailure("connection_failed"), "connection_failed", "The connection failed before Weave could confirm the deletion. Try again."],
    [{ deleted: { id: saved.id, deleted: true, revision: 3, removed: [], kept: 0 } }, "account_unavailable", null],
    [deleted(other), "account_unavailable", null],
    [deleted(saved.id, 4), "account_unavailable", null],
  ] as const) {
    const { controller, repository, draft } = await device();
    const before = structuredClone(repository.value);
    await assert.rejects(deleteSavedCard(controller, { id: saved.id, revision: 3 }, crypto.randomUUID(), async () => {
      if (reply instanceof AccountFailure) throw reply;
      return structuredClone(reply) as unknown as Record<string, unknown>;
    }), (error) => {
      assert.ok(error instanceof AccountFailure); assert.equal(error.code, code);
      if (words) assert.equal(deleteFailure(error), words);
      return true;
    });
    assert.deepEqual(repository.value, before);
    assert.equal(controller.getSnapshot().draft, draft);
  }
});

test("a deletion whose device update cannot be stored says so instead of claiming the device is clear", async () => {
  const { controller, repository } = await device();
  repository.save = async () => { throw new Error("Synthetic storage failure"); };
  const result = await deleteSavedCard(controller, { id: saved.id, revision: 3 }, crypto.randomUUID(), async () => deleted());
  assert.equal(result.device, "unbound_unsaved");
  assert.match(deletedMessage("Seed library", result), /could not store the change\. Copy your words before reloading\.$/u);
});

test("only listed private saves with a revision are offered, and the device's own copy is marked", () => {
  const cards = [{ id: "a", name: "Kept", savedOn: "2026-11-01", revision: 2 }, { id: "b", name: "Team", savedOn: "2026-11-02", revision: 1 },
    { id: "c", name: "Example", savedOn: "2026-11-03" }, { id: "d", name: "Device", savedOn: "2026-11-04", revision: 5 }];
  assert.deepEqual(deletableCards(cards, ["b", undefined], "d"), [
    { id: "a", name: "Kept", revision: 2, savedOn: "2026-11-01", onDevice: false },
    { id: "d", name: "Device", revision: 5, savedOn: "2026-11-04", onDevice: true },
  ]);
});

test("the live adapter deletes through the account handlers, retries with one request and never brings the card back", async () => {
  const token = fixtureSession(owner), origin = "http://localhost:5175";
  const request = async (path = "", body?: unknown, endpoint = "/api/account", signal?: AbortSignal) => {
    signal?.throwIfAborted();
    const response = await accountFixture[body ? "POST" : "GET"](new Request(`${origin}${endpoint}${path}`, {
      method: body ? "POST" : "GET", headers: { origin, "content-type": "application/json", cookie: `weave_local_account=${token}` },
      ...(body ? { body: JSON.stringify(body) } : {}) }));
    const result = record(await response.json());
    if (!response.ok) throw new AccountFailure(String(result.error));
    return result;
  };
  const id = crypto.randomUUID(), keep = crypto.randomUUID();
  for (const card of [id, keep])
    await request("", { action: "save", accountId: owner, id: card, expectedRevision: 0, requestId: crypto.randomUUID(), document });
  const draft = revise(loadedDraft({ ...saved, id, revision: 1 }, owner), { composer: "Unfinished words on this device" });
  const repository = new MemoryDraftRepository(draft), controller = new DraftController(repository);
  await controller.initialize();
  const items = async () => (await request()).items as AccountState["items"];
  const account: AccountState = { available: true, fixture: true, user: { id: owner, email: null }, items: await items() };
  const service = createLiveSocialService({ account, controller, request,
    refreshAccount: async () => ({ ...account, items: await items() }),
    openWorkspace: () => {}, signIn: async () => {}, signedOut: () => {} });
  assert.equal(service.snapshot().cards.find(card => card.id === id)?.revision, 1);
  await assert.rejects(service.deleteCard!({ id, revision: 2 }, crypto.randomUUID()), { code: "save_conflict" });
  assert.equal(controller.getSnapshot().draft.account.saved?.id, id, "a stale revision changes nothing");
  const requestId = crypto.randomUUID();
  const result = await service.deleteCard!({ id, revision: 1 }, requestId);
  assert.deepEqual(result.deleted, { id, deleted: true, revision: 1, removed: [id], kept: 1 });
  assert.deepEqual(service.snapshot().cards.map(card => card.id), [keep]);
  assert.deepEqual((await items()).map(item => item.id), [keep]);
  assert.equal(controller.getSnapshot().draft.composer, "Unfinished words on this device");
  assert.equal(controller.getSnapshot().draft.account.saved, null);
  assert.deepEqual((await request("", { action: "delete", id, expectedRevision: 1, requestId })).deleted, result.deleted,
    "a lost response retried with its request ID reports the same deletion");
  await assert.rejects(request("", { action: "delete", id, expectedRevision: 1, requestId: crypto.randomUUID() }), { code: "not_found" });
  await assert.rejects(request("", { action: "save", accountId: owner, id, expectedRevision: 0, requestId: crypto.randomUUID(), document }),
    { code: "save_conflict" }, "a stale first save cannot bring the card back");
  const again = saveCommand(controller.getSnapshot().draft, owner);
  assert.notEqual(again.command.id, id);
  assert.equal(again.command.expectedRevision, 0);
});
