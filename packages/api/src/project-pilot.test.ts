import assert from "node:assert/strict";
import { test } from "node:test";
import { AccountError } from "./account-provider.ts";
import { createProjectAccess, createProjectPilot } from "./project-pilot.ts";
import { createProjectHandler } from "./project-http.ts";

const first = "did:plc:aaaaaaaaaaaaaaaaaaaaaaaa";
const second = "did:plc:bbbbbbbbbbbbbbbbbbbbbbbb";
const outsider = "did:plc:cccccccccccccccccccccccc";
const origin = "https://weave.example";

test("project pilot needs exactly two distinct Certified DIDs", () => {
  for (const input of [undefined, "", first, `${first},${first}`, `${first},${second},${outsider}`, `${first},a@example.test`])
    assert.throws(() => createProjectPilot(input));
  const pilot = createProjectPilot(`${first}, ${second}`);
  assert.equal(pilot.allowsDid(first), true);
  assert.equal(pilot.allowsDid(second), true);
  assert.equal(pilot.allowsDid(outsider), false);
});

test("open project access requires an explicit mode and valid Certified identifiers", () => {
  const access = createProjectAccess("authenticated", undefined);
  for (const did of [first, second, outsider]) assert.equal(access.allowsDid(did), true);
  for (const did of ["", "*", "account@example.test", "not-a-did"])
    assert.equal(access.allowsDid(did), false);
  for (const mode of ["", "public", "true"])
    assert.throws(() => createProjectAccess(mode, undefined), /invalid_project_access_mode/);
  assert.throws(() => createProjectAccess("authenticated", `${first},${second}`), /conflicting_project_access_configuration/);
  assert.throws(() => createProjectAccess(undefined, undefined), /invalid_project_pilot/);
  for (const mode of [undefined, "pilot"])
    assert.equal(createProjectAccess(mode, `${first},${second}`).allowsDid(outsider), false);
});

test("open project access still resolves the authenticated actor before dispatch", async () => {
  const access = createProjectAccess("authenticated", undefined);
  let signedIn = false, calls = 0;
  const handle = createProjectHandler({
    origin,
    resolveActor: access.restrict(async () => {
      if (!signedIn) throw new AccountError(401, "sign_in_required");
      return { userId: "synthetic", sessionId: "synthetic", did: outsider };
    }),
    async execute() { calls++; return { status: "linked" }; },
  });
  const request = () => new Request(`${origin}/api/projects`, {
    method: "POST", headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ action: "lookup", projectUri: `at://${first}/org.hypercerts.collection/3jzfcijpj2z2a` }),
  });
  assert.equal((await handle(request())).status, 401);
  assert.equal(calls, 0);
  signedIn = true;
  assert.equal((await handle(request())).status, 200);
  assert.equal(calls, 1);
});

test("the pilot checks the verified actor before running a project command", async () => {
  const pilot = createProjectPilot(`${first},${second}`);
  let did = outsider;
  let calls = 0;
  const resolveActor = pilot.restrict(async () => ({ userId: "synthetic", sessionId: "synthetic", did }));
  const handle = createProjectHandler({
    origin,
    resolveActor,
    async execute() { calls++; return { status: "linked" }; },
  });
  const request = () => new Request(`${origin}/api/projects`, {
    method: "POST", headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ action: "lookup", projectUri: `at://${first}/org.hypercerts.collection/3jzfcijpj2z2a` }),
  });
  const denied = await handle(request());
  assert.equal(denied.status, 403);
  assert.deepEqual(await denied.json(), { error: "project_pilot_restricted" });
  assert.equal(calls, 0);
  did = second;
  assert.equal((await handle(request())).status, 200);
  assert.equal(calls, 1);

  const revoked = pilot.restrict(async () => { throw new AccountError(401, "sign_in_required"); });
  await assert.rejects(revoked(request()), { code: "sign_in_required" });
});
