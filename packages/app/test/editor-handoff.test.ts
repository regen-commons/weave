import assert from "node:assert/strict";
import { test } from "node:test";
import { beginEditorHandoff, editorHandoffKey, finishEditorHandoff, PROJECT_EDITORS, readEditorHandoff } from "../src/initiative/editor-handoff.ts";
import { projectCreationKey, submitProjectCreate } from "../src/initiative/project-creation.ts";
import { newDraft, revise } from "../src/describe/contracts.ts";
import { DraftController } from "../src/describe/controller.ts";
import { DraftConflict, MemoryDraftRepository } from "../src/describe/repository.ts";

const owner = "10000000-0000-4000-8000-000000000001", other = "10000000-0000-4000-8000-000000000002";
function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); } };
}
async function device() {
  const blob = new Blob(["Private original file bytes"]);
  const draft = revise(newDraft(), { composer: "Private unfinished words", attachments: [
    { id: crypto.randomUUID(), name: "private-notes.txt", type: "text/plain", bytes: blob.size, blob },
  ] });
  const repo = new MemoryDraftRepository(draft), controller = new DraftController(repo);
  await controller.initialize();
  return { repo, controller, draft };
}

test("both editor handoffs persist the complete device draft and send only a fixed public URL", async () => {
  for (const editor of ["maearth", "certified"] as const) {
    const { repo, controller, draft } = await device(), session = storage();
    controller.change(current => revise(current, { composer: "Latest private words" }));
    let target = "";
    await beginEditorHandoff({ controller, storage: session, owner, editor, signal: new AbortController().signal,
      isCurrent: () => true, navigate: url => { target = url; } });
    assert.equal(target, PROJECT_EDITORS[editor].url);
    assert.equal(new URL(target).search, "");
    assert.equal(repo.value?.id, draft.id);
    assert.equal(repo.value?.composer, "Latest private words");
    assert.equal(await repo.value?.attachments[0]?.blob.text(), "Private original file bytes");
    assert.equal(repo.value?.account.saved, null, "leaving does not upload a private save");
    const hint = readEditorHandoff(session, owner, draft.id)!;
    assert.deepEqual(hint, { version: 1, editor, owner, draftId: draft.id });
    assert.ok(!JSON.stringify(hint).includes("Private"));
    const reloaded = new DraftController(repo); await reloaded.initialize();
    assert.equal(reloaded.getSnapshot().draft.id, draft.id);
    assert.equal(reloaded.getSnapshot().draft.composer, "Latest private words");
  }
});

test("an editor return is scoped to its account and original draft and is not an authority receipt", async () => {
  const { controller, draft } = await device(), session = storage();
  await beginEditorHandoff({ controller, storage: session, owner, editor: "maearth", signal: new AbortController().signal,
    isCurrent: () => true, navigate() {} });
  assert.equal(readEditorHandoff(session, other, draft.id), null);
  assert.equal(readEditorHandoff(session, owner, crypto.randomUUID()), null);
  const valid = readEditorHandoff(session, owner, draft.id)!;
  for (const invalid of [null, { ...valid, editor: "unknown" }, { ...valid, editor: ["certified"] },
    { ...valid, editor: 1 }, { ...valid, editor: { name: "certified" } }, { ...valid, owner: other }, { ...valid, version: 2 },
    { ...valid, projectUri: "at://unverified" }, { ...valid, accessRole: "admin" }]) {
    session.setItem(editorHandoffKey(owner, draft.id), JSON.stringify(invalid));
    assert.equal(readEditorHandoff(session, owner, draft.id), null);
  }
  session.setItem(editorHandoffKey(owner, draft.id), "invalid json");
  assert.equal(readEditorHandoff(session, owner, draft.id), null);
  assert.equal(readEditorHandoff({ getItem() { throw Error("blocked"); } }, owner, draft.id), null);
  session.setItem(editorHandoffKey(owner, draft.id), JSON.stringify(valid));
  finishEditorHandoff(session, owner, draft.id);
  assert.equal(readEditorHandoff(session, owner, draft.id), null);
  assert.equal(controller.getSnapshot().draft, draft, "finishing a hint never changes the draft");
});

test("storage failure and competing-tab conflicts block departure without losing the latest words", async () => {
  for (const failure of [Error("quota"), new DraftConflict()]) {
    const original = revise(newDraft(), { composer: "Earlier words" });
    const controller = new DraftController({ load: async () => original, save: async () => { throw failure; } });
    await controller.initialize(); controller.change(draft => revise(draft, { composer: "Keep the latest words" }));
    const session = storage();
    await assert.rejects(beginEditorHandoff({ controller, storage: session, owner, editor: "certified", signal: new AbortController().signal,
      isCurrent: () => true, navigate() { assert.fail("must remain in Weave"); } }), /stored on this device/);
    assert.equal(controller.getSnapshot().draft.composer, "Keep the latest words");
    assert.equal(readEditorHandoff(session, owner, original.id), null);
  }
});

test("an edit, account switch or cancellation while storage settles cannot navigate", async () => {
  for (const kind of ["edit", "account", "cancel"] as const) {
    const { controller } = await device(), session = storage(), cancel = new AbortController();
    let current = true;
    const leaving = beginEditorHandoff({ controller, storage: session, owner, editor: "maearth", signal: cancel.signal,
      isCurrent: () => current, navigate() { assert.fail("stale task must not leave"); } });
    if (kind === "edit") controller.change(draft => revise(draft, { composer: "Newer edit" }));
    if (kind === "account") current = false;
    if (kind === "cancel") cancel.abort();
    await assert.rejects(leaving);
  }
});

test("an unavailable return store and any unresolved legacy creation block external navigation", async () => {
  const { controller, draft } = await device();
  const failing = { ...storage(), setItem() { throw Error("blocked"); } };
  for (const session of [undefined, failing]) await assert.rejects(beginEditorHandoff({ controller, storage: session, owner,
    editor: "certified", signal: new AbortController().signal, isCurrent: () => true, navigate() { assert.fail(); } }));
  const session = storage();
  for (const raw of ["unreadable legacy intent", JSON.stringify({ action: "create" })]) {
    session.setItem(projectCreationKey(owner, draft.id), raw);
    await assert.rejects(beginEditorHandoff({ controller, storage: session, owner, editor: "maearth", signal: new AbortController().signal,
      isCurrent: () => true, navigate() { assert.fail(); } }), /earlier Certified creation/);
    assert.equal(session.getItem(projectCreationKey(owner, draft.id)), raw);
  }
});

test("another account's saved device card cannot start an editor handoff", async () => {
  const { controller } = await device();
  controller.change(draft => revise(draft, { account: { saved: { owner: other, id: crypto.randomUUID(), revision: 1, contentKey: "private" }, pending: null } }));
  await controller.settled();
  await assert.rejects(beginEditorHandoff({ controller, storage: storage(), owner, editor: "certified", signal: new AbortController().signal,
    isCurrent: () => true, navigate() { assert.fail("account boundary must hold"); } }));
});

test("the retired creator only resumes the same frozen intent and never starts one or saves again", async () => {
  const session = storage(), draftId = crypto.randomUUID();
  const command = { action: "create" as const, initiativeId: crypto.randomUUID(), expectedRevision: 2,
    requestId: crypto.randomUUID(), groupLabel: "earlier-project", publicProfile: { title: "Earlier project", description: "Reviewed before departure" } };
  let requests = 0;
  const input = { owner, draftId, groupLabel: "different-project", profile: { title: "New name", description: "New words" }, storage: session,
    resumeOnly: true, signal: new AbortController().signal,
    async save(): Promise<{ initiativeId: string; expectedRevision: number }> { assert.fail("no new private save"); },
    async request(value: unknown) { requests++; assert.deepEqual(value, command); throw Error("uncertain response"); } };
  await assert.rejects(submitProjectCreate(input), /No earlier creation/);
  assert.equal(requests, 0);
  session.setItem(projectCreationKey(owner, draftId), JSON.stringify(command));
  await assert.rejects(submitProjectCreate(input), /uncertain/);
  await assert.rejects(submitProjectCreate(input), /uncertain/);
  assert.equal(requests, 2);
  assert.equal(session.getItem(projectCreationKey(owner, draftId)), JSON.stringify(command));
});
