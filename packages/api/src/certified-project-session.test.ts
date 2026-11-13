import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { projectSdkFixture, sdkMembership } from "../test-fixtures/project-sdk.ts";
import { withProjectAuthCleanup } from "./project-runtime.ts";
import { createCertifiedProjectProvider } from "./certified-project-provider.ts";

test("same-grant ordinary SDK requests overlap after their short durable session locks", async t => {
  const f = await projectSdkFixture(t);
  f.control.resourceDelay = 100;
  const results = await Promise.all(Array.from({ length: 5 }, () =>
    f.auth.proxyServiceRequest(f.command(), f.actor.did, sdkMembership, { method: "GET" })));
  assert.equal(results.length, 5);
  for (const result of results) assert.equal(result?.status, 200);
  assert.ok(f.control.peak > 1);
  assert.equal(f.control.refreshes, 0);
});

test("concurrent expired SDK sessions consume the refresh token once and use its committed rotation", async t => {
  const f = await projectSdkFixture(t);
  await f.expire(); f.control.onRefresh = async () => { await delay(50); };
  const results = await Promise.all(Array.from({ length: 5 }, () =>
    f.auth.proxyServiceRequest(f.command(), f.actor.did, sdkMembership, { method: "GET" })));
  for (const result of results) assert.equal(result?.status, 200);
  assert.equal(f.control.refreshes, 1);
  assert.equal(new Set(f.control.refreshSignals).size, 1);
  assert.equal((await f.saved())!.session.tokenSet.refresh_token, "rotated-refresh-1");
});

test("HTTP cleanup waits for consumed refresh-token rotation after caller abort", async t => {
  const f = await projectSdkFixture(t);
  await f.expire();
  const controller = new AbortController(), request = f.command();
  let entered!: () => void, release!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const held = new Promise<void>(resolve => { release = resolve; });
  f.control.onRefresh = async refresh => {
    controller.abort(); entered(); await held;
    assert.equal(refresh.signal.aborted, false);
  };
  const provider = createCertifiedProjectProvider({
    groupServiceOrigin: "https://dev.groups.certified.app", groupPdsOrigin: "https://certified.one",
    serviceAuth: ({ actorDid, method, signal }) => f.auth.mintServiceAuth(request, actorDid, method, signal),
    serviceProxy: ({ actorDid, method, init, query, signal }) =>
      f.auth.proxyServiceRequest(request, actorDid, method, { ...init, signal }, query),
  });
  let responded = false;
  const response = withProjectAuthCleanup(f.auth, request, () =>
    provider.getMembership(f.actor.did, "did:plc:bbbbbbbbbbbbbbbbbbbbbbbb", controller.signal))
    .then(value => { responded = true; return value; });
  await started;
  await delay(25); assert.equal(responded, false);
  release(); assert.deepEqual(await response, { ok: false, code: "unavailable" });
  assert.equal((await f.saved())!.session.tokenSet.refresh_token, "rotated-refresh-1");
  assert.equal(f.control.proxyCalls, 0);
});

test("a caller abort cannot cancel the same bounded refresh's DPoP nonce retry", async t => {
  const f = await projectSdkFixture(t);
  await f.expire(); f.control.challengeRefresh = true;
  const controller = new AbortController(), request = f.command();
  f.control.onNonce = () => controller.abort();
  f.control.onRefresh = async refresh => { assert.equal(refresh.signal.aborted, false); };
  await assert.rejects(f.auth.proxyServiceRequest(request, f.actor.did, sdkMembership, { method: "GET", signal: controller.signal }));
  await f.auth.settle(request);
  assert.equal(f.control.refreshAttempts, 2);
  assert.equal(f.control.refreshes, 1);
  assert.equal(new Set(f.control.refreshSignals).size, 1);
  assert.equal((await f.saved())!.session.tokenSet.refresh_token, "rotated-refresh-1");
});

test("a late invalid-token response cannot delete a newer committed grant rotation", async t => {
  const f = await projectSdkFixture(t);
  let secondAttempt!: () => void, release!: () => void;
  const secondStarted = new Promise<void>(resolve => { secondAttempt = resolve; });
  const held = new Promise<void>(resolve => { release = resolve; });
  f.control.resource = async request => {
    const auth = request.headers.get("authorization");
    if (auth === "DPoP access-fixture") return Response.json({}, { status: 401, headers: { "WWW-Authenticate": 'DPoP error="invalid_token"' } });
    if (auth === "DPoP rotated-access-1") { secondAttempt(); await held; return Response.json({}, { status: 401, headers: { "WWW-Authenticate": 'DPoP error="invalid_token"' } }); }
    return Response.json({ groups: [] });
  };
  const earlier = f.auth.proxyServiceRequest(f.command(), f.actor.did, sdkMembership, { method: "GET" });
  await secondStarted;
  await f.expire();
  const later = await f.auth.proxyServiceRequest(f.command(), f.actor.did, sdkMembership, { method: "GET" });
  assert.equal(later?.status, 200); release();
  assert.equal((await earlier)?.status, 401);
  assert.equal((await f.saved())!.session.tokenSet.refresh_token, "rotated-refresh-2");
});

test("closing a request prevents any later SDK critical work", async t => {
  const f = await projectSdkFixture(t), request = f.command();
  await f.auth.settle(request);
  await assert.rejects(f.auth.proxyServiceRequest(request, f.actor.did, sdkMembership, { method: "GET" }), /project_request_closed/);
  assert.equal(f.control.refreshes, 0); assert.equal(f.control.proxyCalls, 0);
});

test("an uncertain consumed refresh is withdrawn instead of reusing the old token", async t => {
  const f = await projectSdkFixture(t);
  await f.expire();
  f.control.onRefresh = async () => { throw Error("synthetic lost refresh response"); };
  await assert.rejects(f.auth.proxyServiceRequest(f.command(), f.actor.did, sdkMembership, { method: "GET" }));
  assert.equal(await f.saved(), undefined);
  assert.equal(await f.auth.proxyServiceRequest(f.command(), f.actor.did, sdkMembership, { method: "GET" }), null);
  assert.equal(f.control.refreshes, 1);
});
