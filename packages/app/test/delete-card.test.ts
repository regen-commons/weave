import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseDocument, record } from "@weave/api/account-contract";
import { deletableCards, deleteFailure, deleteSavedCard, deletedMessage, draftsBoundTo, forgetSavedCard } from "../src/account/delete-card.ts";
import { AccountFailure, type AccountState } from "../src/account/client.ts";
import { loadedDraft, saveCommand } from "../src/account/document.ts";
import { DraftController } from "../src/describe/controller.ts";
import { MemoryDraftRepository, RemovalNotice } from "../src/describe/repository.ts";
import { newDraft, revise } from "../src/describe/contracts.ts";
import { SaveDetached, saveAccountCard } from "../src/account/actions.ts";
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

test("forgetting a removed card releases every binding to it and retires a draft ID that was the card's", async () => {
  const { draft } = await device();
  const pending = { ...draft.account.saved!, requestId: crypto.randomUUID() };
  const both = revise(draft, { account: { saved: draft.account.saved, pending } });
  const forgotten = revise(both, forgetSavedCard(both, saved.id)!);
  assert.deepEqual(forgotten.account, { saved: null, pending: null, retired: [saved.id] });
  assert.equal(forgotten.id, saved.id, "device state keyed by the draft ID stays attached");
  assert.equal(forgotten.composer, "Synthetic device words");
  assert.notEqual(saveCommand(forgotten, owner).command.id, saved.id, "the next Save never meets the removed ID");
  assert.equal(saveCommand(forgotten, owner).command.expectedRevision, 0);
  assert.equal(forgetSavedCard(forgotten, saved.id), null, "retiring twice changes nothing");
  assert.equal(forgetSavedCard(draft, other), null, "another card leaves the device draft alone");
  const unbound = revise(draft, { account: { saved: null, pending: null } });
  assert.deepEqual(revise(unbound, forgetSavedCard(unbound, saved.id)!).account.retired, [saved.id]);
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
  assert.deepEqual(stored.account, { saved: null, pending: null, retired: [saved.id] });
  assert.equal(stored.composer, "Synthetic device words");
  assert.equal(stored.id, saved.id, "the draft keeps its ID and retires it");
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
      "This card is linked to a Certified project, shared for matching or has saved partners, so it cannot be deleted here yet. Nothing was removed."],
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
    { code: "initiative_deleted" }, "a stale first save cannot bring the card back");
  const again = saveCommand(controller.getSnapshot().draft, owner);
  assert.notEqual(again.command.id, id);
  assert.equal(again.command.expectedRevision, 0);
});

function heldSave() {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const original = globalThis.fetch;
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    await gate;
    return new Response(JSON.stringify({ saved: { id: body.id, revision: body.expectedRevision + 1,
      updatedAt: "2026-11-16T00:00:00Z", document: body.document } }), { status: 200 });
  }) as typeof fetch;
  return { release, restore: () => { globalThis.fetch = original; } };
}

test("a draft with an unconfirmed save is never removed, so a save answer cannot bind the next blank draft", async () => {
  const { controller } = await device({ composer: "Edited words" });
  const held = heldSave();
  try {
    const saving = saveAccountCard(controller, owner, async () => {});
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.ok(controller.getSnapshot().draft.account.pending, "the save is waiting for its answer");
    await assert.rejects(controller.discardCurrent(), RemovalNotice);
    held.release();
    await saving;
    assert.equal(controller.getSnapshot().draft.composer, "Edited words");
    assert.equal(controller.getSnapshot().draft.account.saved?.revision, 4);
  } finally { held.restore(); }
});

test("a save answered after the person opened another initiative is bound to the draft that asked, and to no other", async () => {
  const { controller, repository, draft } = await device({ composer: "Edited words" });
  const held = heldSave();
  try {
    const saving = saveAccountCard(controller, owner, async () => {});
    await new Promise((resolve) => setTimeout(resolve, 20));
    // The person starts something else while the save is in flight. The first draft stays stored.
    await controller.startNew();
    controller.change((current) => revise(current, { composer: "Different initiative" }));
    await controller.settled();
    const elsewhere = controller.getSnapshot().draft;
    held.release();
    await saving;
    const asked = repository.drafts.get(draft.id)!;
    assert.equal(asked.account.pending, null, "nothing is left waiting");
    assert.equal(asked.account.saved?.revision, 4, "the draft that asked holds the receipt");
    assert.equal(asked.composer, "Edited words");
    assert.equal(controller.getSnapshot().draft.id, elsewhere.id, "the tab stays where the person went");
    assert.equal(controller.getSnapshot().draft.account.saved, null, "the other initiative is never bound to the saved card");
    assert.equal(controller.getSnapshot().drafts.find((item) => item.id === draft.id)?.account.saved?.revision, 4, "and the list knows");
  } finally { held.restore(); }
});

test("a save answer for a draft that was restored over meanwhile binds nothing and says so", async () => {
  const { controller, draft } = await device({ composer: "Edited words" });
  const held = heldSave();
  try {
    const saving = saveAccountCard(controller, owner, async () => {});
    await new Promise((resolve) => setTimeout(resolve, 20));
    // An earlier version of the same draft is restored: it never asked for this save.
    await controller.replace(revise(draft, { composer: "Restored earlier words" }));
    held.release();
    await assert.rejects(saving, SaveDetached);
    const after = controller.getSnapshot().draft;
    assert.equal(after.composer, "Restored earlier words");
    assert.equal(after.account.saved?.revision, 3, "the restored version keeps the binding it had, not the new receipt");
    assert.equal(after.account.pending, null);
  } finally { held.restore(); }
});

test("deleting a saved card releases every draft on this device that points at it, not only the tab's", async () => {
  const bound = revise(loadedDraft(saved, owner), { composer: "A copy of the card, not open in this tab" });
  const elsewhere = revise(newDraft(), { composer: "The initiative this tab is on" });
  const repository = new MemoryDraftRepository(elsewhere, [bound]), controller = new DraftController(repository);
  await controller.initialize();
  assert.equal(controller.getSnapshot().draft.id, elsewhere.id);
  assert.deepEqual(draftsBoundTo(controller, saved.id), [bound.id]);
  const result = await deleteSavedCard(controller, { id: saved.id, revision: 3 }, crypto.randomUUID(), async () => deleted());
  assert.equal(result.device, "unbound", "a draft on this device was bound, so the result says so");
  const released = repository.drafts.get(bound.id)!;
  assert.deepEqual(released.account, { saved: null, pending: null, retired: [saved.id] });
  assert.equal(released.composer, "A copy of the card, not open in this tab", "its words stay");
  assert.equal(controller.getSnapshot().draft.composer, "The initiative this tab is on", "the tab is not moved");
  assert.deepEqual(repository.drafts.get(elsewhere.id)!.account, elsewhere.account);
  // The dialog marks every card that a draft here stands for, by ID.
  const listed = [{ id: saved.id, name: "A", savedOn: "2026-11-15", revision: 3 }, { id: other, name: "B", savedOn: "2026-11-15", revision: 1 }];
  assert.deepEqual(deletableCards(listed, [], [saved.id, other]).map((card) => card.onDevice), [true, true]);
  assert.deepEqual(deletableCards(listed, [], saved.id).map((card) => card.onDevice), [true, false]);
  assert.deepEqual(deletableCards(listed, [], null).map((card) => card.onDevice), [false, false]);
});

test("a save refused because its card was deleted releases the device draft for a new save", async () => {
  const { controller } = await device();
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ error: "initiative_deleted" }), { status: 409 })) as typeof fetch;
  try {
    await assert.rejects(saveAccountCard(controller, owner, async () => {}), { code: "initiative_deleted" });
  } finally { globalThis.fetch = original; }
  const after = controller.getSnapshot().draft;
  assert.equal(after.account.saved, null);
  assert.deepEqual(after.account.retired, [saved.id]);
  assert.notEqual(saveCommand(after, owner).command.id, saved.id);
  assert.equal(after.composer, "Synthetic device words");
});
