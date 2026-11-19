import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseDocument } from "@weave/api/account-contract";
import { saveAccountCard, loadAccountCard } from "../src/account/actions.ts";
import { AccountFailure } from "../src/account/client.ts";
import { AnotherAccountsCard, loadedDraft, saveCommand } from "../src/account/document.ts";
import { AccountSession } from "../src/account/session.ts";
import { DraftController } from "../src/describe/controller.ts";
import { MemoryDraftRepository } from "../src/describe/repository.ts";
import { revise, type DeviceDraft } from "../src/describe/contracts.ts";
import { saveForProject } from "../src/initiative/project-save.ts";
import { projectChoiceKey } from "../src/social/project-choice.ts";

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

// A card is never copied into another account (DL-055). The refusal is in the save path itself,
// so it holds whichever button, dialog or return from sign-in reaches it.
const other = "b1000000-0000-4000-8000-000000000002";
const refused = (error: unknown) => error instanceof AnotherAccountsCard && /belongs to another account/u.test(error.message);
/** The save entry points: the account panel's Save, and the reviewed save behind Save Privately, sharing and linking. */
const entryPoints: readonly [name: string, save: (controller: DraftController) => Promise<unknown>][] = [
  ["the account panel's Save", (controller) => saveAccountCard(controller, owner, async () => {})],
  ["the reviewed save", (controller) => saveForProject(controller, owner, new AbortController().signal)],
];
/** Another account's card as it sits on a shared device, in each way a card can belong to someone. */
function theirCards(): readonly [state: string, draft: DeviceDraft][] {
  const theirs = loadedDraft(saved, other);
  const binding = saveCommand(revise(theirs, { account: { saved: null, pending: null } }), other).binding;
  return [
    ["saved by another account", theirs],
    ["saved by another account and changed since", revise(theirs, { confirmed: { ...theirs.confirmed!, name: "Changed synthetic card" } })],
    ["being saved by another account", revise(theirs, { account: { saved: null, pending: binding } })],
  ];
}

test("no save path copies another account's card: each refuses, sends nothing and leaves the card with its owner (DL-055)", async t => {
  let posts = 0;
  t.mock.method(globalThis, "fetch", async () => { posts++; return Response.json({ saved }); });
  for (const [state, theirs] of theirCards())
    for (const [name, save] of entryPoints) {
      const repository = new MemoryDraftRepository(theirs), controller = new DraftController(repository);
      await controller.initialize();
      await assert.rejects(save(controller), refused, `${name} refuses a card ${state}`);
      await controller.settled();
      assert.equal(posts, 0, `${name} sends nothing for a card ${state}`);
      assert.deepEqual(controller.getSnapshot().draft, theirs, `${name} leaves a card ${state} untouched in the tab`);
      assert.deepEqual(repository.value, theirs, "and on the device: no new card ID, no pending save for this account");
    }
});

test("a card nobody saved, opened from another account's Certified project, is refused the same way", async t => {
  let posts = 0;
  t.mock.method(globalThis, "fetch", async () => { posts++; return Response.json({ saved }); });
  const unsaved = revise(loadedDraft(saved, other), { account: { saved: null, pending: null } });
  // The other account's choice of project for this card, as this browser session holds it.
  const keys = [projectChoiceKey(other, unsaved.id)];
  const window = { sessionStorage: { length: keys.length, key: (index: number) => keys[index] ?? null } };
  const scope = globalThis as { window?: unknown };
  scope.window = window;
  t.after(() => { delete scope.window; });
  for (const [name, save] of entryPoints) {
    const repository = new MemoryDraftRepository(unsaved), controller = new DraftController(repository);
    await controller.initialize();
    await assert.rejects(save(controller), refused, name);
    assert.equal(posts, 0, name);
    assert.deepEqual(repository.value, unsaved, name);
  }
  // Once this account has chosen it too, or nobody has, the card is this account's to save.
  keys.push(projectChoiceKey(owner, unsaved.id));
  window.sessionStorage.length = keys.length;
  assert.equal(saveCommand(unsaved, owner, [other, owner]).command.accountId, owner);
  assert.equal(saveCommand(unsaved, owner).command.id, unsaved.id);
  assert.throws(() => saveCommand(unsaved, owner, [other]), refused);
});

test("the account a card belongs to still saves it, after another account was refused", async t => {
  const commands: Record<string, unknown>[] = [];
  t.mock.method(globalThis, "fetch", async (_url: unknown, options?: RequestInit) => {
    const command = JSON.parse(String(options?.body));
    commands.push(command);
    return Response.json({ saved: { ...saved, id: command.id, revision: command.expectedRevision + 1, document: command.document } });
  });
  const mine = loadedDraft(saved, owner);
  const changed = revise(mine, { confirmed: { ...mine.confirmed!, name: "Changed synthetic card" } });
  const controller = new DraftController(new MemoryDraftRepository(changed));
  await controller.initialize();
  await assert.rejects(saveForProject(controller, other, new AbortController().signal), refused);
  assert.equal(commands.length, 0);
  await saveAccountCard(controller, owner, async () => {});
  assert.equal(commands.length, 1);
  assert.deepEqual([commands[0]!.accountId, commands[0]!.id], [owner, saved.id], "the same card, in the same account");
  assert.equal(controller.getSnapshot().draft.account.saved?.owner, owner);
});
