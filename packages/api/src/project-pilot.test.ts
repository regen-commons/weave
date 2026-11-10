import assert from "node:assert/strict";
import { test } from "node:test";
import { AccountError } from "./account-provider.ts";
import { createProjectPilot } from "./project-pilot.ts";
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
