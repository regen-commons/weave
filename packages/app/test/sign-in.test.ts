import assert from "node:assert/strict";
import { test } from "node:test";
import { signInResults } from "@weave/api/account-contract";
import { continueToCertified, doorOnReturn, isSignInReturn, signInReturnFailed, signInReturnMessage, doorShows } from "../src/account/sign-in.ts";
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
test("every callback result has a fixed message; only a finished sign-in is not a failure", () => {
  for (const result of signInResults) {
    assert.ok(isSignInReturn(result));
    assert.match(signInReturnMessage(result), /Your device draft is (still here|unchanged)\./);
    assert.equal(signInReturnFailed(result), result !== "signed-in");
  }
  assert.equal(signInReturnMessage("expired"), "Certified sign-in took too long and expired. Your device draft is still here. Sign in again.");
  for (const other of [null, "", "sign_in_expired", "private-provider-detail", "toString"]) {
    assert.equal(isSignInReturn(other), false);
    assert.equal(signInReturnMessage(other), "");
    assert.equal(signInReturnFailed(other), false);
  }
});

test("coming back from Certified opens a dialog only to finish saving or to say sign-in did not finish (DL-085)", () => {
  // Signed in from the app bar or a page: the page alone, with no dialog nobody asked for.
  assert.equal(doorOnReturn("signed-in", false, false), null);
  // Left from the save dialog: back to it, whether or not the sign-in finished.
  assert.equal(doorOnReturn("signed-in", true, false), "keep");
  for (const failed of signInResults.filter((result) => result !== "signed-in")) {
    assert.equal(doorOnReturn(failed, true, false), "keep", failed);
    // A sign-in that did not finish is never silent: the sign-in dialog says why.
    assert.equal(doorOnReturn(failed, false, false), "sign-in", failed);
    // A page that shows the account says it in place.
    assert.equal(doorOnReturn(failed, false, true), null, failed);
  }
  assert.equal(doorOnReturn("signed-in", true, true), null);
  // An ordinary visit opens nothing.
  assert.equal(doorOnReturn(null, true, false), null);
  assert.equal(doorOnReturn("anything-else", false, false), null);
});

test("the account dialog offers Save only to the account the card belongs to (DL-055)", () => {
  // Back from a sign-in that began at Save, as account B on a device holding account A's card.
  assert.equal(doorShows("keep", true, true), "another-accounts-card");
  assert.equal(doorShows("keep", true, false), "save");
  // Signed out, nothing is set aside and nothing is offered but the sign-in.
  assert.equal(doorShows("keep", false, false), "sign-in");
  for (const intent of ["sign-in", "certified"] as const)
    for (const setAside of [true, false]) assert.equal(doorShows(intent, true, setAside), "sign-in");
});
