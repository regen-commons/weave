import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseDocument } from "@weave/api/account-contract";
import { loadedDraft } from "../src/account/document.ts";
import { DraftController } from "../src/describe/controller.ts";
import { MemoryDraftRepository } from "../src/describe/repository.ts";
import { revise } from "../src/describe/contracts.ts";
import { saveForProject } from "../src/initiative/project-save.ts";

const owner = "b1000000-0000-4000-8000-000000000001";
const document = parseDocument(JSON.parse(readFileSync(new URL("../../api/src/test-data/account.json", import.meta.url), "utf8")));
async function setup() {
  const controller = new DraftController(new MemoryDraftRepository());
  await controller.initialize();
  await controller.replace(loadedDraft({ id: "b3000000-0000-4000-8000-000000000001", revision: 1,
    updatedAt: "2026-11-10T00:00:00Z", document }, owner));
  return controller;
}

test("project linking reuses a current private save without a second write", async () => {
  const controller = await setup();
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw Error("unexpected_network"); };
  try {
    assert.deepEqual(await saveForProject(controller, owner, new AbortController().signal), {
      initiativeId: controller.getSnapshot().draft.id, expectedRevision: 1,
    });
  } finally { globalThis.fetch = original; }
});

test("a lost save response retries the same request before project creation", async () => {
  const controller = await setup();
  controller.change((d) => revise(d, { confirmed: { ...d.confirmed!, name: "Changed checked card" } }));
  await controller.settled();
  const original = globalThis.fetch;
  const calls: Record<string, unknown>[] = [];
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)); calls.push(body);
    if (calls.length === 1) throw Error("lost_response");
    return Response.json({ saved: { id: body.id, revision: body.expectedRevision + 1,
      updatedAt: "2026-11-10T00:00:00Z", document: body.document } });
  };
  try {
    await assert.rejects(saveForProject(controller, owner, new AbortController().signal));
    assert.ok(controller.getSnapshot().draft.account.pending);
    const result = await saveForProject(controller, owner, new AbortController().signal);
    assert.deepEqual(calls[0], calls[1]);
    assert.equal(result.expectedRevision, 2);
    assert.equal(controller.getSnapshot().draft.account.pending, null);
  } finally { globalThis.fetch = original; }
});

test("an aborted account operation cannot rebind a card after its response arrives", async () => {
  const controller = await setup();
  controller.change((d) => revise(d, { confirmed: { ...d.confirmed!, name: "Changed checked card" } }));
  await controller.settled();
  const cancellation = new AbortController();
  const original = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body));
    cancellation.abort();
    return Response.json({ saved: { id: body.id, revision: body.expectedRevision + 1,
      updatedAt: "2026-11-10T00:00:00Z", document: body.document } });
  };
  try {
    await assert.rejects(saveForProject(controller, owner, cancellation.signal));
    assert.equal(controller.getSnapshot().draft.account.saved?.revision, 1);
    assert.ok(controller.getSnapshot().draft.account.pending);
  } finally { globalThis.fetch = original; }
});
