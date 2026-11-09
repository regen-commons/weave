import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { parseDocument, parseSaved } from "@weave/api/account-contract";
import { assertAccount, AccountFailure } from "../src/account/client.ts";
import { accountDocument, accountKey, loadedDraft, saveCommand } from "../src/account/document.ts";
import { newDraft, revise, DeviceDraftSchema } from "../src/describe/contracts.ts";
import { DraftController } from "../src/describe/controller.ts";
import { MemoryDraftRepository, DraftConflict } from "../src/describe/repository.ts";
const document = parseDocument(
  JSON.parse(readFileSync(new URL("../../api/src/test-data/account.json", import.meta.url), "utf8")),
);
const owner = "b1000000-0000-4000-8000-000000000001",
  other = "b1000000-0000-4000-8000-000000000002";
const saved = parseSaved({
  id: "b3000000-0000-4000-8000-000000000001",
  revision: 4,
  updatedAt: "2026-11-05T00:00:00Z",
  document,
});
test("checked card roundtrips without source text, files, confidence or local editors", () => {
  const draft = loadedDraft(saved, owner);
  assert.deepEqual(accountDocument(draft), document);
  assert.equal(draft.confirmed!.confidence, 0);
  assert.equal(draft.turns.length, 0);
  const local = revise(draft, { composer: "private unfinished text", attachments: [], runs: [] });
  assert.equal(accountKey(local), JSON.stringify(document));
  assert.equal(JSON.stringify(accountDocument(local)).includes("private unfinished"), false);
  assert.throws(() => accountDocument(newDraft()), /Check/);
  assert.throws(
    () => accountDocument(revise(draft, { funding: { ...draft.funding, editor: draft.funding.form } })),
    /funding/,
  );
});
test("save retries reuse the same request only for the same owner and checked payload", () => {
  const draft = loadedDraft(saved, owner),
    first = saveCommand(draft, owner);
  assert.equal(first.command.id, saved.id);
  assert.equal(first.command.expectedRevision, 4);
  const pending = revise(draft, { account: { ...draft.account, pending: first.binding } });
  assert.deepEqual(saveCommand(pending, owner), first);
  const changed = revise(pending, { confirmed: { ...pending.confirmed!, name: "Changed initiative" } });
  assert.notEqual(saveCommand(changed, owner).command.requestId, first.command.requestId);
  const alternate = saveCommand(pending, other);
  assert.notEqual(alternate.command.id, saved.id);
  assert.equal(alternate.command.expectedRevision, 0);
  const initial = revise(draft, { account: { saved: null, pending: null } });
  const create = saveCommand(initial, owner);
  assert.equal(create.command.id, draft.id);
  assert.equal(create.command.expectedRevision, 0);
});
test("loading first stores a recoverable local backup including unfinished words and files", async () => {
  const blob = new Blob(["Synthetic file bytes"]);
  const source = revise(newDraft(), {
    composer: "unfinished original",
    attachments: [
      { id: crypto.randomUUID(), name: "synthetic.txt", type: "text/plain", bytes: blob.size, blob },
    ],
  });
  const repo = new MemoryDraftRepository(source),
    controller = new DraftController(repo);
  await controller.initialize();
  await controller.replace(loadedDraft(saved, owner));
  assert.equal(controller.getSnapshot().draft.confirmed!.name, document.initiative.name);
  assert.equal(repo.history[0]!.draft.composer, "unfinished original");
  assert.equal(await repo.history[0]!.draft.attachments[0]!.blob.text(), "Synthetic file bytes");
  await controller.replace(repo.history[0]!.draft);
  assert.equal(controller.getSnapshot().draft.composer, "unfinished original");
  assert.equal(repo.history.length, 2);
  assert.equal(repo.history[0]!.draft.confirmed!.name, document.initiative.name);
});
test("failed backup and a competing tab preserve the visible draft", async () => {
  const original = revise(newDraft(), { composer: "keep my words" });
  const repo = new MemoryDraftRepository(original),
    controller = new DraftController(repo);
  await controller.initialize();
  repo.value = revise(original, { composer: "other tab" });
  await assert.rejects(controller.replace(loadedDraft(saved, owner)), DraftConflict);
  assert.equal(controller.getSnapshot().draft.composer, "keep my words");
  assert.equal(repo.value.composer, "other tab");
  assert.equal(repo.history.length, 0);
  const unavailable = new DraftController({
    load: async () => original,
    save: async () => {},
    replace: async () => {
      throw new Error("quota");
    },
  });
  await unavailable.initialize();
  await assert.rejects(unavailable.replace(loadedDraft(saved, owner)), /quota/);
  assert.equal(unavailable.getSnapshot().draft.composer, "keep my words");
});
test("legacy drafts acquire account metadata without losing local text", () => {
  const { account: _account, ...legacy } = newDraft();
  assert.deepEqual(DeviceDraftSchema.parse({ ...legacy, composer: "old words" }).account, {
    saved: null,
    pending: null,
  });
  assert.equal(DeviceDraftSchema.parse({ ...legacy, composer: "old words" }).composer, "old words");
});

test("saved list and load responses must belong to the account shown in the UI", () => {
  assert.doesNotThrow(() => assertAccount({ user: { id: owner, email: "owner@example.test" } }, owner));
  assert.throws(
    () => assertAccount({ user: { id: other, email: "other@example.test" } }, owner),
    (error) => error instanceof AccountFailure && error.code === "account_changed",
  );
});
