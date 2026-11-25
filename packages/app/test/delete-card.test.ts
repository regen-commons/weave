import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseDocument, record } from "@weave/api/account-contract";
import { backUpCopies, CardReferenced, cardReferences, deletableCards, deleteFailure, deleteSavedCard, deletedMessage, draftsBoundTo,
  forgetSavedCard, namesakesLine } from "../src/account/delete-card.ts";
import { privateSavesExport, exportedMessage } from "../src/account/export-saves.ts";
import { backUpDraft, backUpWarning, NOT_BACKED_UP } from "../src/describe/device-removal.ts";
import { matchingFixture } from "../dev/matching-fixture.ts";
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
const deleted = (id = saved.id, revision = 3, kept = 2) => ({ deleted: { id, deleted: true as const, revision, removed: [id], kept } });

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
    "Removed Seed library from your account. 2 saved cards kept. Its copy on this device keeps its words and stays in Your Initiatives, marked Not saved yet.");
  assert.equal(deletedMessage("Seed library", { deleted: { ...result.deleted, kept: 1 }, device: "unrelated" }),
    "Removed Seed library from your account. 1 saved card kept.");
  assert.equal(deletedMessage("Seed library", { deleted: { ...result.deleted, kept: 0 }, device: "unrelated" }),
    "Removed Seed library from your account. No other cards are saved in your account.");
});

test("a refused, unconfirmed or mismatched deletion changes nothing on the device and says why", async () => {
  for (const [reply, code, words] of [
    [new AccountFailure("save_conflict"), "save_conflict", "This card changed somewhere else. Reload to see the latest version."],
    [new AccountFailure("initiative_referenced"), "initiative_referenced",
      "Weave still uses this card for something else, such as matching, saved partners, a public listing or a project being set up, so it cannot be deleted yet. Nothing was removed."],
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

test("only listed private saves with a revision are offered, with their copies on this device and the drafts that share their name", () => {
  const cards = [{ id: "a", name: "Kept", savedOn: "2026-11-01", revision: 2 }, { id: "b", name: "Team", savedOn: "2026-11-02", revision: 1 },
    { id: "c", name: "Example", savedOn: "2026-11-03" }, { id: "d", name: "Device", savedOn: "2026-11-04", revision: 5 }];
  // A device copy of d, and an unrelated draft that happens to be called "kept" too.
  const device = [{ id: "draft-d", name: "Device", cardId: "d" }, { id: "draft-x", name: " kept ", cardId: null }];
  assert.deepEqual(deletableCards(cards, ["b", undefined], device), [
    { id: "a", name: "Kept", revision: 2, savedOn: "2026-11-01", copies: [], namesakes: 1 },
    { id: "d", name: "Device", revision: 5, savedOn: "2026-11-04", copies: ["draft-d"], namesakes: 0 },
  ]);
  assert.equal(namesakesLine("Kept", 0), "");
  assert.equal(namesakesLine("Kept", 1), " A different draft named Kept is on this device and stays in Your Initiatives. It was never this saved card.");
  assert.equal(namesakesLine("Kept", 2), " 2 different drafts named Kept are on this device and stay in Your Initiatives. They were never this saved card.");
  const result = { deleted: { id: "a", deleted: true as const, revision: 2, removed: ["a"], kept: 1 }, device: "unrelated" as const };
  assert.equal(deletedMessage("Kept", result, 1),
    "Removed Kept from your account. 1 saved card kept. A different draft named Kept is on this device and stays in Your Initiatives. It was never this saved card.");
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
  assert.deepEqual(deletableCards(listed, [], [{ id: "x", name: "A", cardId: saved.id }, { id: "y", name: "B", cardId: other }]).map((card) => card.copies), [["x"], ["y"]]);
  assert.deepEqual(deletableCards(listed, [], [{ id: "x", name: "A", cardId: saved.id }]).map((card) => card.copies), [["x"], []]);
  assert.deepEqual(deletableCards(listed, [], []).map((card) => card.copies), [[], []]);
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

test("a deleted card's copies on this device move to the backups when chosen, the tab's own and another, and the list no longer shows them", async () => {
  const bound = revise(loadedDraft(saved, owner), { composer: "A copy not open in this tab" });
  const current = revise(loadedDraft({ ...saved, id: other }, owner), { composer: "The tab's own copy" });
  const unrelated = revise(newDraft(), { composer: "An unrelated draft" });
  const repository = new MemoryDraftRepository(current, [bound, unrelated]), controller = new DraftController(repository);
  await controller.initialize();
  // The account confirmed the deletion of both cards; the drafts are released first, as the live adapter does.
  for (const id of [saved.id, other]) await deleteSavedCard(controller, { id, revision: 3 }, crypto.randomUUID(), async () => deleted(id));
  const result = await backUpCopies(controller, { deleted: deleted().deleted, device: "unbound" }, [bound.id, current.id]);
  assert.equal(result.device, "backed_up");
  assert.deepEqual(controller.getSnapshot().drafts.map((draft) => draft.id).filter((id) => id !== controller.getSnapshot().draft.id), [unrelated.id],
    "only the unrelated draft is left in the list");
  assert.notEqual(controller.getSnapshot().draft.id, current.id, "the tab moved to a blank draft");
  const backups = await controller.backups();
  assert.deepEqual(backups.map((backup) => backup.draft.composer).sort(), ["A copy not open in this tab", "The tab's own copy"], "both are restorable");
  assert.equal(deletedMessage("Seed library", result),
    "Removed Seed library from your account. 2 saved cards kept. Its copy on this device is now a device backup. Restore it or delete it for good in Settings, under Device Backups.");
  assert.equal((await backUpCopies(controller, result, [])).device, "backed_up", "no copies leaves the result as it was");
});

test("a copy that cannot be moved stays listed, and the message says so instead of claiming it left", async () => {
  const pendingCopy = revise(loadedDraft(saved, owner), { composer: "Waiting for a save" });
  const waiting = revise(pendingCopy, { id: crypto.randomUUID(), account: { saved: null, pending: { ...pendingCopy.account.saved!, requestId: crypto.randomUUID() } } });
  const repository = new MemoryDraftRepository(newDraft(), [waiting]), controller = new DraftController(repository);
  await controller.initialize();
  assert.equal(await backUpDraft(controller, waiting.id), false, "a draft waiting for a save's answer is never moved");
  const result = await backUpCopies(controller, { deleted: deleted().deleted, device: "unbound" }, [waiting.id]);
  assert.equal(result.device, "backup_failed");
  assert.match(deletedMessage("Seed library", result), /could not be moved to the backups, so it stays in Your Initiatives, marked Not saved yet\.$/u);
  assert.match(NOT_BACKED_UP, /Nothing was removed\./u);
  assert.equal(backUpWarning(waiting, true),
    "This moves Synthetic river circle from Your Initiatives to the device backups in Settings, where you can restore it or delete it for good. Its saved copy in your account is not changed.");
});

/** The dev account and matching handlers behind one request function, as the app's live adapter calls them. */
function fixtureRequest(token: string, origin = "http://localhost:5175") {
  return async (path = "", body?: unknown, endpoint = "/api/account", signal?: AbortSignal) => {
    signal?.throwIfAborted();
    const handler = endpoint === "/api/matching" ? { POST: matchingFixture } : accountFixture;
    const method = body ? "POST" : "GET";
    const response = await (handler as Record<string, (request: Request) => Promise<Response>>)[method]!(new Request(`${origin}${endpoint}${path}`, {
      method, headers: { origin, "content-type": "application/json", cookie: `weave_local_account=${token}` },
      ...(body ? { body: JSON.stringify(body) } : {}) }));
    const result = record(await response.json());
    if (!response.ok) throw new AccountFailure(String(result.error));
    return result;
  };
}

test("a refusal names only the references Weave verified: sharing for matching is never called a Certified link", async () => {
  const token = fixtureSession(owner), request = fixtureRequest(token);
  const shared = crypto.randomUUID(), plain = crypto.randomUUID();
  for (const id of [shared, plain])
    await request("", { action: "save", accountId: owner, id, expectedRevision: 0, requestId: crypto.randomUUID(), document });
  // Share every entry of one card for matching, as Share For Matching does.
  const state = await request("", { action: "state", initiativeId: shared }, "/api/matching");
  const entries = (state.entries as { kind: string; entryId: string; revision: number; shareVersion: number }[])
    .map(({ kind, entryId, revision, shareVersion }) => ({ kind, entryId, revision, shareVersion }));
  const preview = await request("", { action: "preview", initiativeId: shared, initiativeRevision: state.initiativeRevision, entries }, "/api/matching");
  await request("", { action: "share", initiativeId: shared, reviewId: preview.reviewId, requestId: crypto.randomUUID() }, "/api/matching");

  const draft = revise(newDraft(), { composer: "Unrelated words" });
  const repository = new MemoryDraftRepository(draft), controller = new DraftController(repository);
  await controller.initialize();
  const items = async () => (await request()).items as AccountState["items"];
  const account: AccountState = { available: true, fixture: true, user: { id: owner, email: null }, items: await items() };
  const service = createLiveSocialService({ account, controller, request, refreshAccount: async () => ({ ...account, items: await items() }),
    openWorkspace: () => {}, signIn: async () => {}, signedOut: () => {} });
  const revision = (id: string) => service.snapshot().cards.find((card) => card.id === id)!.revision!;
  await assert.rejects(service.deleteCard!({ id: shared, revision: revision(shared) }, crypto.randomUUID()), (error) => {
    assert.ok(error instanceof CardReferenced);
    assert.deepEqual(error.references, { project: null, shared: true, partners: false });
    assert.equal(deleteFailure(error),
      "This card cannot be deleted yet because some of its needs or offers are shared for matching. Nothing was removed. Stop sharing it or remove its partners in Partners For You first.");
    assert.doesNotMatch(deleteFailure(error), /Certified/u, "never linked, so Certified is not named");
    return true;
  });
  assert.ok((await items()).some((item) => item.id === shared), "nothing was removed");
  // A card that is a listed project's workspace names that project; a check that fails names nothing it did not see.
  assert.deepEqual(await cardReferences(plain, [{ workspaceId: plain, name: "Water notes (fixture)" }], request),
    { project: "Water notes (fixture)", shared: false, partners: false });
  assert.equal(deleteFailure(new CardReferenced({ project: "Water notes (fixture)", shared: false, partners: false })),
    "This card cannot be deleted yet because it is the saved copy of your Certified project Water notes (fixture). Nothing was removed.");
  assert.deepEqual(await cardReferences(plain, [], async () => { throw new AccountFailure("connection_failed"); }),
    { project: null, shared: false, partners: false });
  // The plain card has no reference and is deleted.
  assert.equal((await service.deleteCard!({ id: plain, revision: revision(plain) }, crypto.randomUUID())).deleted.id, plain);
});

test("private saves download in full, page by page, for this account only", async () => {
  const exporter = crypto.randomUUID();
  const token = fixtureSession(exporter), request = fixtureRequest(token);
  const ids: string[] = [];
  for (let n = 0; n < 23; n++) {
    const id = crypto.randomUUID(); ids.push(id);
    await request("", { action: "save", accountId: exporter, id, expectedRevision: 0, requestId: crypto.randomUUID(), document });
  }
  const result = await privateSavesExport(exporter, request, undefined, () => new Date("2026-11-25T12:00:00Z"));
  assert.equal(result.kind, "weave-private-saves");
  assert.equal(result.exportedAt, "2026-11-25T12:00:00.000Z");
  assert.deepEqual(result.cards.map((card) => card.id).sort(), [...ids].sort(), "all 23, across two pages");
  assert.equal(result.cards[0]!.document.initiative.name, "Synthetic river circle");
  assert.equal(result.truncated, false);
  assert.equal(exportedMessage(result), "Download started: 23 private saves from your account.");
  await assert.rejects(privateSavesExport(owner, request), { code: "account_changed" }, "another account's session stops the export");
  assert.equal(exportedMessage({ ...result, cards: [] }), "No private saves to download.");
});
