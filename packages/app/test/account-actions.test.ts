import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseDocument } from "@weave/api/account-contract";
import { accountDocument, AnotherAccountsCard, belongsToAnotherAccount, loadedDraft } from "../src/account/document.ts";
import { DraftController } from "../src/describe/controller.ts";
import { MemoryDraftRepository } from "../src/describe/repository.ts";
import { revise, type DeviceDraft } from "../src/describe/contracts.ts";
import { offersDeviceCardToTeam, saveDeviceCardToTeam } from "../src/partners/team-workspace.ts";
import { projectChoiceKey } from "../src/social/project-choice.ts";

const owner = "b1000000-0000-4000-8000-000000000001";
const document = parseDocument(JSON.parse(readFileSync(new URL("../../api/src/test-data/account.json", import.meta.url), "utf8")));
const saved = { id: "b3000000-0000-4000-8000-000000000001", revision: 1, updatedAt: "2026-11-15T00:00:00Z", document };
// A card is never copied into another account (DL-055). The refusal is in the save path itself,
// so it holds whichever button, dialog or return from sign-in reaches it.
const other = "b1000000-0000-4000-8000-000000000002";
const refused = (error: unknown) => error instanceof AnotherAccountsCard && /belongs to another account/u.test(error.message);
/**
 * The one way a card on this device still reaches the server: the copy into a team workspace. Private saves
 * ended with DL-155 (step 4), and their client helpers with step 7.
 */
const TEAM = "b4000000-0000-4000-8000-000000000001";
const entryPoints: readonly [name: string, save: (controller: DraftController) => Promise<unknown>][] = [
  ["the save of a device card to a team", (controller) => saveDeviceCardToTeam(controller.getSnapshot().draft, owner, TEAM, null, new AbortController().signal)],
];
/** Another account's card as it sits on a shared device, in each way a card can belong to someone. */
function theirCards(): readonly [state: string, draft: DeviceDraft][] {
  const theirs = loadedDraft(saved, other);
  // The device's mark of a save that account asked for, as an earlier build left it.
  const binding = { id: saved.id, owner: other, revision: 0, contentKey: JSON.stringify(accountDocument(theirs)), requestId: crypto.randomUUID() };
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
  // The other account's choice of project for this card, as this device holds it.
  const keys = [projectChoiceKey(other, unsaved.id)];
  const window = { localStorage: { length: keys.length, key: (index: number) => keys[index] ?? null } };
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
  window.localStorage.length = keys.length;
  assert.equal(belongsToAnotherAccount(unsaved, owner, [other, owner]), false);
  assert.equal(belongsToAnotherAccount(unsaved, owner), false);
  assert.equal(belongsToAnotherAccount(unsaved, owner, [other]), true);
});

test("the account a card belongs to still copies it into its team, after another account was refused", async t => {
  const commands: Record<string, unknown>[] = [];
  t.mock.method(globalThis, "fetch", async (_url: unknown, options?: RequestInit) => {
    const command = JSON.parse(String(options?.body));
    commands.push(command);
    return Response.json({ saved: { ...saved, id: TEAM, revision: 1, document: command.document } });
  });
  const mine = loadedDraft(saved, owner);
  const changed = revise(mine, { confirmed: { ...mine.confirmed!, name: "Changed synthetic card" } });
  await assert.rejects(saveDeviceCardToTeam(changed, other, TEAM, null, new AbortController().signal), refused);
  assert.equal(commands.length, 0);
  await saveDeviceCardToTeam(changed, owner, TEAM, null, new AbortController().signal);
  assert.equal(commands.length, 1);
  assert.deepEqual([commands[0]!.action, commands[0]!.workspaceId], ["team_save", TEAM]);
});

test("the account a card belongs to can still copy it into its team, and a retry sends the same request", async t => {
  const commands: Record<string, unknown>[] = [];
  t.mock.method(globalThis, "fetch", async (_url: unknown, options?: RequestInit) => {
    const command = JSON.parse(String(options?.body));
    commands.push(command);
    return Response.json({ saved: { ...saved, id: TEAM, revision: 1, document: command.document } });
  });
  const mine = loadedDraft(saved, owner);
  const first = await saveDeviceCardToTeam(mine, owner, TEAM, null, new AbortController().signal);
  assert.deepEqual([commands[0]!.action, commands[0]!.workspaceId, commands[0]!.expectedRevision], ["team_save", TEAM, 0]);
  assert.equal(first.saved.id, TEAM);
  await saveDeviceCardToTeam(mine, owner, TEAM, first.command, new AbortController().signal);
  assert.equal(commands[1]!.requestId, commands[0]!.requestId, "the request it started with");
});

test("another account's card is neither offered to a team nor previewed, and the component asks this rule", () => {
  assert.equal(offersDeviceCardToTeam({ blocked: false, signedIn: true, setAside: false }), true);
  assert.equal(offersDeviceCardToTeam({ blocked: false, signedIn: true, setAside: true }), false, "set aside: no button and no preview");
  assert.equal(offersDeviceCardToTeam({ blocked: true, signedIn: true, setAside: false }), false);
  assert.equal(offersDeviceCardToTeam({ blocked: false, signedIn: false, setAside: false }), false);
  // The component returns nothing before it builds the button or reads the card for the preview.
  const component = readFileSync(new URL("../src/partners/SaveDeviceToTeam.tsx", import.meta.url), "utf8");
  const gate = component.indexOf("offersDeviceCardToTeam({ blocked: !!saveBlocker(draft), signedIn: !!owner, setAside })) return null;");
  assert.notEqual(gate, -1);
  assert.ok(gate < component.indexOf("accountDocument(draft)"), "the card is not read for a preview before the rule is asked");
  assert.match(component, /const setAside = useSetAside\(\);/u);
});
