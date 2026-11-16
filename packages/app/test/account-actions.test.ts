import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseDocument } from "@weave/api/account-contract";
import { saveAccountCard, loadAccountCard } from "../src/account/actions.ts";
import { AccountFailure } from "../src/account/client.ts";
import { loadedDraft } from "../src/account/document.ts";
import { AccountSession } from "../src/account/session.ts";
import { DraftController } from "../src/describe/controller.ts";
import { MemoryDraftRepository } from "../src/describe/repository.ts";
import { revise } from "../src/describe/contracts.ts";

const owner = "b1000000-0000-4000-8000-000000000001";
const document = parseDocument(JSON.parse(readFileSync(new URL("../../api/src/test-data/account.json", import.meta.url), "utf8")));
const saved = { id: "b3000000-0000-4000-8000-000000000001", revision: 1, updatedAt: "2026-11-15T00:00:00Z", document };
const changed = (error: unknown) => error instanceof AccountFailure && error.code === "account_changed";
const deferred = () => Promise.withResolvers<void>();
async function setup() {
  const localFile = new Blob(["Synthetic local file"]);
  const draft = revise(loadedDraft(saved, owner), { composer: "Synthetic device words", account: { saved: null, pending: null },
    attachments: [{ id: crypto.randomUUID(), name: "synthetic.txt", type: "text/plain", bytes: localFile.size, blob: localFile }] });
  const repository = new MemoryDraftRepository(draft), controller = new DraftController(repository);
  await controller.initialize();
  return { repository, controller, draft };
}

test("the account panel's Save cannot POST after sign-out and same-account reentry while device persistence waits", async t => {
  const { repository, controller, draft } = await setup();
  const entered = deferred(), release = deferred();
  const persist = repository.save.bind(repository);
  t.mock.method(repository, "save", async (...args: Parameters<typeof persist>) => {
    entered.resolve(); await release.promise; return persist(...args);
  });
  let posts = 0, refreshes = 0;
  const commands: Record<string, unknown>[] = [];
  t.mock.method(globalThis, "fetch", async (_url: unknown, options?: RequestInit) => {
    posts++;
    const command = JSON.parse(String(options?.body));
    commands.push(command);
    return Response.json({ saved: { ...saved, id: command.id, document: command.document } });
  });
  const saving = saveAccountCard(controller, owner, async () => { refreshes++; });
  await entered.promise;
  const session = new AccountSession(async () => ({ available: true, signIn: "certified", user: { id: owner, email: null }, items: [] }));
  session.clear();
  await session.refresh();
  release.resolve();
  await assert.rejects(saving, changed);
  assert.equal(posts, 0);
  assert.equal(refreshes, 0);
  assert.equal(controller.getSnapshot().draft.composer, draft.composer);
  assert.equal(controller.getSnapshot().draft.account.saved, null);
  assert.ok(controller.getSnapshot().draft.account.pending?.requestId, "the retry command stays recoverable on the device");
  assert.equal(repository.value?.account.pending?.requestId, controller.getSnapshot().draft.account.pending?.requestId);
  assert.deepEqual(await controller.backups(), []);
  const requestId = controller.getSnapshot().draft.account.pending!.requestId;
  await saveAccountCard(controller, owner, async () => { refreshes++; });
  await controller.settled();
  assert.equal(posts, 1, "only a new explicit Save may send the retained command");
  assert.equal(refreshes, 1);
  assert.equal(controller.getSnapshot().draft.account.saved?.owner, owner);
  assert.equal(repository.value?.account.pending, null);
  assert.equal(commands[0]!.requestId, requestId);
});

test("the account panel's Load cannot commit a replacement after sign-out while the repository waits", async t => {
  const { repository, controller, draft } = await setup();
  const entered = deferred(), release = deferred();
  const replace = repository.replace.bind(repository);
  t.mock.method(repository, "replace", async (...args: Parameters<typeof replace>) => {
    entered.resolve(); await release.promise; return replace(...args);
  });
  t.mock.method(globalThis, "fetch", async () => Response.json({ user: { id: owner, email: null }, saved }));
  const loading = loadAccountCard(controller, owner, saved.id);
  await entered.promise;
  new AccountSession().clear();
  release.resolve();
  await assert.rejects(loading, changed);
  assert.equal(controller.getSnapshot().draft, draft);
  assert.equal(repository.value, draft);
  assert.deepEqual(await controller.backups(), []);
  assert.equal(await controller.getSnapshot().draft.attachments[0]!.blob.text(), "Synthetic local file");
});

test("the account panel's Load stops while waiting for earlier device writes without discarding those writes", async t => {
  const { repository, controller } = await setup();
  const entered = deferred(), release = deferred();
  const persist = repository.save.bind(repository);
  t.mock.method(repository, "save", async (...args: Parameters<typeof persist>) => {
    entered.resolve(); await release.promise; return persist(...args);
  });
  controller.change(current => revise(current, { composer: "Latest synthetic words awaiting persistence" }));
  await entered.promise;
  const latest = controller.getSnapshot().draft;
  const replacing = deferred(), replace = controller.replace.bind(controller);
  t.mock.method(controller, "replace", (...args: Parameters<typeof replace>) => { replacing.resolve(); return replace(...args); });
  t.mock.method(globalThis, "fetch", async () => Response.json({ user: { id: owner, email: null }, saved }));
  const loading = loadAccountCard(controller, owner, saved.id);
  await replacing.promise;
  new AccountSession().clear();
  release.resolve();
  await assert.rejects(loading, changed);
  assert.equal(controller.getSnapshot().draft, latest);
  assert.equal(repository.value?.composer, "Latest synthetic words awaiting persistence");
  assert.deepEqual(await controller.backups(), []);
});

test("the account panel's completed Save and Load retain their intended behavior and a committed Load stays on device after sign-out", async t => {
  const { repository, controller, draft } = await setup();
  let refreshes = 0;
  t.mock.method(globalThis, "fetch", async (_url: unknown, options?: RequestInit) => {
    if (options?.method !== "POST") return Response.json({ user: { id: owner, email: null }, saved });
    const command = JSON.parse(String(options.body));
    assert.equal(command.accountId, owner);
    assert.equal(JSON.stringify(command).includes("Synthetic device words"), false);
    return Response.json({ saved: { ...saved, id: command.id, revision: command.expectedRevision + 1, document: command.document } });
  });
  const contentKey = await saveAccountCard(controller, owner, async () => { refreshes++; });
  await controller.settled();
  assert.equal(refreshes, 1);
  assert.equal(controller.getSnapshot().draft.account.saved?.contentKey, contentKey);
  assert.equal(controller.getSnapshot().draft.account.pending, null);
  const backups = await loadAccountCard(controller, owner, saved.id);
  assert.equal(backups.length, 1);
  assert.equal(backups[0]!.draft.composer, draft.composer);
  assert.equal(await backups[0]!.draft.attachments[0]!.blob.text(), "Synthetic local file");
  const committed = controller.getSnapshot().draft;
  new AccountSession().clear();
  assert.equal(controller.getSnapshot().draft, committed);
  assert.equal(repository.value?.id, committed.id);
  assert.deepEqual(await controller.backups(), backups);
});
