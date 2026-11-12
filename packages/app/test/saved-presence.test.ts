import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { AccountFailure } from "../src/account/client.ts";
import { checkSavedPresence } from "../src/account/saved-presence.ts";
import { proposeProjectGroupLabel, submitProjectCreate, validProjectGroupLabel } from "../src/initiative/project-creation.ts";
import { readWorkspaceResume, rememberWorkspace } from "../src/initiative/workspace-resume.ts";
const owner = "b1000000-0000-4000-8000-000000000001", id = "b3000000-0000-4000-8000-000000000001";
const binding = { id, owner, revision: 4, contentKey: "checked content" };
const document = JSON.parse(readFileSync(new URL("../../api/src/test-data/account.json", import.meta.url), "utf8"));
const signal = new AbortController().signal;
test("a record outside the first list page is checked by ID instead of being declared missing", async () => {
  let path = "";
  const status = await checkSavedPresence(binding, owner, [], signal, async received => {
    path = received!; return { user: { id: owner, email: null }, saved: { id, revision: 4, document, updatedAt: "2026-11-10T00:00:00Z" } };
  });
  assert.equal(status, "present"); assert.equal(path, `?id=${id}`);
  assert.equal(await checkSavedPresence(binding, owner, [{ id, name: "Changed", revision: 5, updatedAt: "2026-11-10T00:00:00Z" }], signal), "changed");
});
test("only a confirmed exact-ID 404 is absence; outages and another account never clear a save", async () => {
  for (const code of ["connection_failed", "sign_in_required", "account_unavailable"])
    assert.equal(await checkSavedPresence(binding, owner, [], signal, async () => { throw new AccountFailure(code); }), "unavailable");
  assert.equal(await checkSavedPresence(binding, owner, [], signal, async path => {
    if (path) throw new AccountFailure("not_found"); return { user: { id: owner, email: null } };
  }), "missing");
  assert.equal(await checkSavedPresence(binding, owner, [], signal, async path => {
    if (path) throw new AccountFailure("not_found"); return { user: { id: "b1000000-0000-4000-8000-000000000002", email: null } };
  }), "unavailable");
  assert.equal(await checkSavedPresence(binding, owner, [], signal, async () => ({ user: { id: "b1000000-0000-4000-8000-000000000002", email: null } })), "unavailable");
});
test("a proposed group address is valid for accented, numeric, short and non-Latin initiative names", () => {
  for (const name of ["École de la vallée", "123 soil school", "A", "水の学校", "🌱", "A".repeat(200)])
    assert.equal(validProjectGroupLabel(proposeProjectGroupLabel(name, "abc123")), true);
});
test("resume hints are scoped to the account and tolerate unavailable device storage", () => {
  const values = new Map<string, string>();
  const storage = { setItem: (key: string, value: string) => { values.set(key, value); }, getItem: (key: string) => values.get(key) ?? null };
  rememberWorkspace(owner, id, storage);
  assert.equal(readWorkspaceResume(owner, storage), id);
  assert.equal(readWorkspaceResume("different-account", storage), null);
  assert.equal(readWorkspaceResume(owner, { getItem() { throw Error("unavailable"); } }), null);
});

test("uncertain project creation retries the same reviewed intent, and unreadable state sends no new write", async () => {
  const values = new Map<string, string>(), commands: unknown[] = [];
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  let saves = 0;
  const options = { owner, draftId: id, groupLabel: "learning-abc123", profile: { title: "School", description: "Learning together" }, storage, signal,
    save: async () => { saves++; return { initiativeId: id, expectedRevision: 1 }; },
    request: async (command: unknown) => { commands.push(structuredClone(command)); throw new AccountFailure("connection_failed"); } };
  await assert.rejects(submitProjectCreate(options));
  await assert.rejects(submitProjectCreate({ ...options, profile: { title: "Changed later", description: "Keep the first review" } }));
  assert.deepEqual(commands[0], commands[1]); assert.equal(saves, 1);
  const key = [...values.keys()][0]!; values.set(key, "corrupt data");
  await assert.rejects(submitProjectCreate(options), /earlier creation request/);
  assert.equal(commands.length, 2); assert.equal(saves, 1);
});
