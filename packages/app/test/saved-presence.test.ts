import assert from "node:assert/strict";
import { test } from "node:test";
import { AccountFailure } from "../src/account/client.ts";
import { proposeProjectGroupLabel, submitProjectCreate, validProjectGroupLabel } from "../src/initiative/project-creation.ts";
import { readWorkspaceResume, rememberWorkspace } from "../src/initiative/workspace-resume.ts";
const owner = "b1000000-0000-4000-8000-000000000001", id = "b3000000-0000-4000-8000-000000000001";
const signal = new AbortController().signal;
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
