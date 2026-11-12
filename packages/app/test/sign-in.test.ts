import assert from "node:assert/strict";
import { test } from "node:test";
import { continueToCertified } from "../src/account/sign-in.ts";
import { DraftController } from "../src/describe/controller.ts";
import { MemoryDraftRepository } from "../src/describe/repository.ts";
import { newDraft, revise } from "../src/describe/contracts.ts";
import { accountState } from "../src/account/client.ts";

test("Certified navigation preserves unfinished words and files without saving to an account", async () => {
  const blob = new Blob(["synthetic original"]);
  const original = revise(newDraft(), { composer: "unfinished art research idea", attachments: [
    { id: crypto.randomUUID(), name: "notes.txt", type: "text/plain", bytes: blob.size, blob },
  ] });
  const repository = new MemoryDraftRepository(original), controller = new DraftController(repository);
  await controller.initialize();
  let target = "";
  await continueToCertified(controller, "/start/initiative", async path => {
    assert.equal(path, "/start/initiative"); return { redirect: "https://database.example.test/auth/v1/authorize" };
  }, url => { target = url; });
  assert.equal(target, "https://database.example.test/auth/v1/authorize");
  assert.equal(repository.value?.composer, original.composer);
  assert.equal(await repository.value?.attachments[0]?.blob.text(), "synthetic original");
  assert.equal(repository.value?.account.saved, null);
});
test("storage failure, competing edits and unavailable sign-in keep the tab and its draft intact", async () => {
  const original = revise(newDraft(), { composer: "keep these words" });
  const controller = new DraftController({ load: async () => original, save: async () => { throw Error("quota"); } });
  await controller.initialize();
  controller.change(draft => revise(draft, { composer: "latest words" }));
  let requests = 0, navigations = 0;
  const start = async () => { requests++; return { redirect: "https://database.example.test/auth/v1/authorize" }; };
  await assert.rejects(continueToCertified(controller, "/settings", start, () => { navigations++; }));
  assert.equal(requests, 0);
  assert.equal(controller.getSnapshot().draft.composer, "latest words");
  const available = new DraftController(new MemoryDraftRepository(original));
  await available.initialize();
  await assert.rejects(continueToCertified(available, "/settings", async () => {
    available.change(draft => revise(draft, { composer: "edited while connecting" }));
    await available.settled();
    return start();
  }, () => { navigations++; }));
  await assert.rejects(continueToCertified(available, "/settings", async () => { throw Error("offline"); }, () => { navigations++; }));
  assert.equal(navigations, 0);
  assert.equal(available.getSnapshot().draft.composer, "edited while connecting");
});
test("an email-free account is signed in and old email-code protocol responses are rejected", () => {
  for (const email of [null, undefined, ""]) assert.equal(accountState({ available: true, signIn: "certified", user: { id: "b1000000-0000-4000-8000-000000000001", email }, items: [] }).user?.email, null);
  assert.throws(() => accountState({ available: true, otpDigits: 8, user: null, items: [] }));
});
