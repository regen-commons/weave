import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { parseDocument, parseSaved } from "@weave/api/account-contract";
import { assertAccount, AccountFailure } from "../src/account/client.ts";
import { AnotherAccountsCard, accountDocument, accountKey, belongsToAnotherAccount, cardOwner, loadedDraft, saveCommand } from "../src/account/document.ts";
import { choiceStorage, chosenProjectUri, deviceChoosers, projectChoiceKey, projectChoosers } from "../src/social/project-choice.ts";
import { newDraft, revise, DeviceDraftSchema } from "../src/describe/contracts.ts";
import { addEntry, keepPending, toggleKind } from "../src/intake/entries.ts";
import { intakeComplete } from "../src/intake/finish.ts";
import { reviewStep } from "../src/intake/state.ts";
import { DraftController } from "../src/describe/controller.ts";
import { MemoryDraftRepository } from "../src/describe/repository.ts";
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
test("a private save accepts an entry without a kind of support", () => {
  const draft = loadedDraft(saved, owner);
  const needs = reviewStep(keepPending(addEntry(draft.needs, "Something unusual we cannot classify")));
  const bare = revise(draft, { needs });
  assert.equal(intakeComplete(bare), true);
  assert.deepEqual(accountDocument(bare).needs.at(-1)?.value.capitalForms, []);
  assert.ok(accountKey(bare));
  const id = needs.items.at(-1)!.id;
  const fixed = revise(bare, { needs: reviewStep(toggleKind(needs, id, "social")) });
  assert.deepEqual(accountDocument(fixed).needs.at(-1)?.value?.capitalForms, ["social"]);
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
  // Another account gets no command at all for it: a card is never copied (DL-055).
  assert.throws(() => saveCommand(pending, other), AnotherAccountsCard);
  assert.throws(() => saveCommand(revise(draft, { account: { saved: null, pending: first.binding } }), other), AnotherAccountsCard);
  const initial = revise(draft, { account: { saved: null, pending: null } });
  const create = saveCommand(initial, owner);
  assert.equal(create.command.id, draft.id);
  assert.equal(create.command.expectedRevision, 0);
});
test("loading a saved card leaves the unfinished draft on the device as its own draft, words and files included", async () => {
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
  // The card opens under its own ID. The unfinished draft is untouched, so nothing needs backing up.
  assert.equal(repo.history.length, 0);
  const kept = repo.drafts.get(source.id)!;
  assert.equal(kept, source);
  assert.equal(await kept.attachments[0]!.blob.text(), "Synthetic file bytes");
  assert.deepEqual(controller.getSnapshot().drafts.map((draft) => draft.id).sort(), [source.id, saved.id].sort());
  // It opens again from the list, as it was.
  await controller.open(source.id);
  assert.equal(controller.getSnapshot().draft.composer, "unfinished original");
  // Loading the card again goes over the device's copy of that card, which is backed up first.
  controller.change((draft) => revise(draft, { composer: "more unfinished words" }));
  await controller.replace(loadedDraft(saved, owner));
  assert.equal(repo.history.length, 1);
  assert.equal(repo.history[0]!.draft.id, saved.id);
  assert.equal(repo.history[0]!.draft.confirmed!.name, document.initiative.name);
  assert.equal(repo.drafts.get(source.id)!.composer, "more unfinished words");
});
test("a failed backup keeps the visible draft, and another tab's version of a card is backed up before a load replaces it", async () => {
  const original = revise(newDraft(), { composer: "keep my words" });
  const repo = new MemoryDraftRepository(original),
    controller = new DraftController(repo);
  await controller.initialize();
  // Another tab changed this draft. Loading a different card does not touch it.
  repo.value = revise(original, { composer: "other tab" });
  await controller.replace(loadedDraft(saved, owner));
  assert.equal(repo.drafts.get(original.id)!.composer, "other tab");
  assert.equal(repo.history.length, 0);
  // Another tab changed the device's copy of the card. Loading it again keeps that version as a backup.
  repo.drafts.set(saved.id, revise(repo.drafts.get(saved.id)!, { composer: "card words from another tab" }));
  await controller.replace(loadedDraft(saved, owner));
  assert.equal(repo.history.length, 1);
  assert.equal(repo.history[0]!.draft.composer, "card words from another tab");
  assert.equal(controller.getSnapshot().draft.composer, "");
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

test("a card on this device belongs to the account that saved it, and is set aside for any other", () => {
  const mine = loadedDraft(saved, owner);
  assert.equal(cardOwner(mine), owner);
  assert.equal(belongsToAnotherAccount(mine, owner), false, "its own account opens it");
  assert.equal(belongsToAnotherAccount(mine, other), true, "another account signed in sets it aside");
  assert.equal(belongsToAnotherAccount(mine, null), false, "signed out, it stays with whoever uses the device");
  const unsaved = newDraft();
  assert.equal(cardOwner(unsaved), null);
  assert.equal(belongsToAnotherAccount(unsaved, other), false, "a card nobody saved can be saved by whoever signs in");
  // A save on its way already decides whose the card is.
  const pending = { id: "b3000000-0000-4000-8000-000000000009", owner, revision: 0, contentKey: "{}", requestId: "b5000000-0000-4000-8000-000000000009" };
  const saving = revise(unsaved, { account: { saved: null, pending } });
  assert.equal(cardOwner(saving), owner);
  assert.equal(belongsToAnotherAccount(saving, other), true);
});

test("a card nobody saved, opened from another account's Certified project, is set aside for others", () => {
  const card = newDraft();
  const keys = [projectChoiceKey(owner, card.id), projectChoiceKey(other, "another-card"), "unrelated"];
  const session = { length: keys.length, key: (index: number) => keys[index] ?? null };
  const chosenBy = projectChoosers(session, card.id);
  assert.deepEqual(chosenBy, [owner], "only the choices for this card count");
  assert.equal(belongsToAnotherAccount(card, other, chosenBy), true, "another account does not get it");
  assert.equal(belongsToAnotherAccount(card, owner, chosenBy), false, "the account that opened it does");
  assert.equal(belongsToAnotherAccount(card, other, []), false, "with no choice made, it stays with the device");
  assert.deepEqual(projectChoosers(undefined, card.id), []);
});

test("a project choice is read from the device, and storage that fails holds no choice and names no chooser", () => {
  const values = new Map<string, string>();
  const device = { get length() { return values.size; }, key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (key: string) => values.get(key) ?? null };
  const card = newDraft(), uri = "at://did:plc:example/org.example.project/abc";
  assert.equal(chosenProjectUri(device, owner, card.id), null);
  assert.equal(chosenProjectUri(undefined, owner, card.id), null, "storage the browser refuses holds no choice");
  values.set(projectChoiceKey(owner, card.id), uri);
  assert.equal(chosenProjectUri(device, owner, card.id), uri);
  assert.equal(chosenProjectUri(device, other, card.id), null, "a choice is one account's");
  assert.equal(chosenProjectUri(device, null, card.id), null, "signed out, nobody has chosen");
  assert.deepEqual(projectChoosers(device, card.id), [owner]);
  // Every read can throw where the browser blocks storage. None of them may reach the page.
  const blocked = () => { throw Error("blocked"); };
  assert.equal(chosenProjectUri({ getItem: blocked }, owner, card.id), null);
  assert.deepEqual(projectChoosers({ get length(): number { return blocked(); }, key: blocked }, card.id), []);
  assert.deepEqual(projectChoosers({ length: 1, key: blocked }, card.id), []);
});

test("project choices are kept in the device's storage alone, and never read from the tab's", (t) => {
  const scope = globalThis as { window?: unknown };
  t.after(() => { delete scope.window; });
  const card = newDraft(), key = projectChoiceKey(owner, card.id);
  const local = { length: 0, key: () => null };
  // What an earlier build kept for a tab, or a team workspace that tab merely opened, stays in the tab.
  let read = 0;
  scope.window = { localStorage: local, get sessionStorage() { read++; return { length: 1, key: () => key }; } };
  assert.equal(choiceStorage(), local);
  assert.deepEqual(deviceChoosers(card.id), [], "a tab's own entry names no chooser");
  assert.equal(read, 0, "the tab's storage is not read at all");
  // The same answer on every call where the browser refuses the device's storage.
  scope.window = { get localStorage(): never { throw Error("blocked"); } };
  assert.equal(choiceStorage(), undefined);
  assert.equal(choiceStorage(), undefined);
  assert.deepEqual(deviceChoosers(card.id), []);
});

test("another account's card is set aside in Settings too: no Save for any card, and no removal or backups of it (DL-055)", async () => {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const source = (path: string) => readFileSync(fileURLToPath(new URL(`../src/${path}`, import.meta.url)), "utf8");
  const section = source("account/AccountSection.tsx");
  assert.match(section, /const setAside = useSetAside\(\);/u);
  assert.match(section, /\{setAside && <p>A card from another account is on this device\./u, "the card is said to be another account's");
  assert.doesNotMatch(section, /Save Privately|saveAccountCard|"save"/u, "and no card is offered a private save (DL-155, step 4)");
  const backups = source("data/DeviceBackups.tsx");
  assert.match(backups, /const current = manage && hasDraft\(draft\) && !setAside;/u, "nor is removing it from the device");
  assert.match(backups, /stored\.filter\(\(item\) => !belongsToAnotherAccount\(item\.draft, account\.state\?\.user\?\.id\)\)/u);
  // The rule the list and the backups share: a card belongs to the account that saved it.
  const theirs = revise(newDraft(), { account: { saved: { id: crypto.randomUUID(), owner: other, revision: 1, contentKey: "{}" }, pending: null } });
  assert.equal(belongsToAnotherAccount(theirs, owner), true);
  assert.equal(belongsToAnotherAccount(theirs, other), false);
  assert.equal(belongsToAnotherAccount(theirs, undefined), false, "signed out, nothing is hidden");
});
