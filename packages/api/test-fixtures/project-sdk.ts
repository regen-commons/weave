import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type { TestContext } from "node:test";
import type { NodeSavedSession } from "@atproto/oauth-client-node";
import { certifiedProjectOAuthPaths as paths, createCertifiedProjectAuth, type ProjectOAuthStore } from "../src/certified-project-auth.ts";

export const sdkOrigin = "https://weave.example.test";
export const sdkIssuer = "https://certified.one";
export const sdkMembership = "app.certified.groups.membership.list";
const cgsOrigin = "https://dev.groups.certified.app", cgs = "did:web:dev.groups.certified.app#certified_group_service";
const scope = `atproto rpc:${sdkMembership}?aud=${cgs.replace("#", "%23")}`;
const cookie = (response: Response) => response.headers.get("set-cookie")?.split(";")[0] ?? "";

export async function projectSdkFixture(t: TestContext, suppliedStore?: ProjectOAuthStore) {
  const actor = { did: "did:plc:aaaaaaaaaaaaaaaaaaaaaaaa", sessionId: "oauth-sdk-fixture" };
  const rows = new Map<string, unknown>(), queues = new Map<string, Promise<void>>();
  const memory: ProjectOAuthStore = {
    async put(kind, id, value) { rows.set(`${kind}/${id}`, structuredClone(value)); },
    async find(kind, id) { return structuredClone(rows.get(`${kind}/${id}`)); },
    async take(kind, id) { const value = rows.get(`${kind}/${id}`); rows.delete(`${kind}/${id}`); return structuredClone(value); },
    async remove(kind, id) { rows.delete(`${kind}/${id}`); },
    async withLock(id, run, signal) {
      const previous = queues.get(id) ?? Promise.resolve();
      let release!: () => void;
      const held = new Promise<void>(resolve => { release = resolve; });
      const queued = previous.then(() => held);
      queues.set(id, queued);
      await previous;
      const snapshot = structuredClone(rows);
      try { signal?.throwIfAborted(); return await run(memory); }
      catch (error) { rows.clear(); for (const [key, value] of snapshot) rows.set(key, value); throw error; }
      finally { release(); if (queues.get(id) === queued) queues.delete(id); }
    },
  };
  const backend = suppliedStore ?? memory, grantKeys = new Set<string>();
  const wrap = (records: Pick<ProjectOAuthStore, "put" | "find" | "take" | "remove">) => ({
    async put(...args: Parameters<ProjectOAuthStore["put"]>) {
      await records.put(...args); if (args[0] === "grant") grantKeys.add(args[1]);
    },
    find: records.find.bind(records), take: records.take.bind(records), remove: records.remove.bind(records),
  });
  const store: ProjectOAuthStore = { ...wrap(backend),
    withLock: (id, run, signal) => backend.withLock(id, records => run(wrap(records)), signal),
  };
  const control = {
    exchanges: 0, refreshes: 0, refreshAttempts: 0, proxyCalls: 0, inFlight: 0, peak: 0,
    resourceDelay: 0, challengeRefresh: false,
    refreshSignals: [] as (AbortSignal | null | undefined)[],
    onRefresh: null as ((request: Request) => Promise<void>) | null,
    onNonce: null as (() => void) | null,
    resource: null as ((request: Request) => Promise<Response>) | null,
  };
  let par: URLSearchParams | undefined, access = "access-fixture", refresh = "refresh-fixture";
  t.mock.method(globalThis, "fetch", async (input: string | Request | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const { origin: host, pathname } = new URL(request.url);
    if (host === "https://plc.directory" && decodeURIComponent(pathname) === "/" + actor.did)
      return Response.json({ id: actor.did, service: [{ id: "#atproto_pds", type: "AtprotoPersonalDataServer", serviceEndpoint: sdkIssuer }] });
    assert.equal(host, sdkIssuer, "the fixture must never contact a live service");
    if (pathname === "/.well-known/oauth-protected-resource") return Response.json({ resource: sdkIssuer, authorization_servers: [sdkIssuer] });
    if (pathname === "/.well-known/oauth-authorization-server") return Response.json({
      issuer: sdkIssuer, authorization_endpoint: "https://auth.certified.one/oauth/authorize", token_endpoint: sdkIssuer + "/oauth/token",
      pushed_authorization_request_endpoint: sdkIssuer + "/oauth/par", client_id_metadata_document_supported: true,
      token_endpoint_auth_methods_supported: ["private_key_jwt"], token_endpoint_auth_signing_alg_values_supported: ["ES256"],
      dpop_signing_alg_values_supported: ["ES256"], require_pushed_authorization_requests: true,
      authorization_response_iss_parameter_supported: true, code_challenge_methods_supported: ["S256"],
    });
    if (pathname === "/oauth/par") {
      assert.ok(request.headers.get("dpop"));
      par = new URLSearchParams(await request.text());
      assert.equal(par.get("scope"), scope);
      assert.equal(par.get("client_id"), sdkOrigin + paths.metadata);
      assert.equal(par.get("redirect_uri"), sdkOrigin + paths.callback);
      assert.equal(par.get("code_challenge_method"), "S256");
      assert.ok(par.get("client_assertion"));
      assert.ok(!par.toString().includes(actor.sessionId));
      assert.ok(!par.toString().includes(encodeURIComponent(actor.did)));
      return Response.json({ request_uri: "urn:ietf:params:oauth:request_uri:fixture", expires_in: 300 }, { status: 201 });
    }
    if (pathname === "/oauth/token") {
      const parameters = new URLSearchParams(await request.text());
      assert.ok(request.headers.get("dpop"));
      if (parameters.get("grant_type") === "authorization_code") {
        control.exchanges++;
        assert.equal(parameters.get("code"), "provider-code");
        assert.equal(createHash("sha256").update(parameters.get("code_verifier")!).digest("base64url"), par?.get("code_challenge"));
      } else {
        assert.equal(parameters.get("grant_type"), "refresh_token");
        control.refreshAttempts++;
        control.refreshSignals.push(init?.signal);
        if (control.challengeRefresh && control.refreshAttempts === 1) {
          control.onNonce?.();
          return Response.json({ error: "use_dpop_nonce" }, { status: 400, headers: { "DPoP-Nonce": "fixture-refresh-nonce" } });
        }
        assert.equal(parameters.get("refresh_token"), refresh, "a consumed refresh token must never be reused");
        control.refreshes++;
        access = `rotated-access-${control.refreshes}`; refresh = `rotated-refresh-${control.refreshes}`;
        await control.onRefresh?.(request);
      }
      return Response.json({ sub: actor.did, token_type: "DPoP", expires_in: 300, access_token: access, refresh_token: refresh, scope });
    }
    assert.equal(pathname, "/xrpc/" + sdkMembership);
    assert.equal(request.headers.get("atproto-proxy"), cgs);
    assert.ok(request.headers.get("dpop"));
    control.proxyCalls++; control.inFlight++; control.peak = Math.max(control.peak, control.inFlight);
    try {
      if (control.resource) return await control.resource(request);
      assert.equal(request.headers.get("authorization"), "DPoP " + access);
      if (control.resourceDelay) await delay(control.resourceDelay);
      return Response.json({ groups: [] });
    } finally { control.inFlight--; }
  });
  const key = { ...generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey.export({ format: "jwk" }), kid: "sdk-fixture", alg: "ES256" };
  const makeAuth = (storage = store) => createCertifiedProjectAuth({ origin: sdkOrigin, cgsOrigin, signingKeys: [key], store: storage, allowsDid: () => true, async resolveActor() { return actor; } });
  const auth = await makeAuth();
  const command = (action = "unused", value = "") => new Request(sdkOrigin + "/api/certified-project-consent", {
    method: "POST", body: JSON.stringify({ action }), headers: { Origin: sdkOrigin, "Content-Type": "application/json", Cookie: value },
  });
  const started = await auth.consent(command("membership"));
  assert.equal(started.status, 200);
  assert.match(JSON.stringify(await started.json()), /urn%3Aietf%3Aparams%3Aoauth%3Arequest_uri%3Afixture/);
  const callback = () => new Request(sdkOrigin + paths.callback + "?" + new URLSearchParams({ state: par!.get("state")!, code: "provider-code", iss: sdkIssuer }), { headers: { Cookie: cookie(started) } });
  const completed = await auth.callback(callback());
  assert.equal(new URL(completed.headers.get("location")!).searchParams.get("projectConsent"), "ready");
  assert.equal(new URL((await auth.callback(callback())).headers.get("location")!).searchParams.get("projectConsent"), "failed");
  assert.equal(control.exchanges, 1);
  assert.equal((await auth.consent(command("finish", cookie(completed)))).status, 200);
  const grantKey = () => [...grantKeys][0]!;
  const saved = async () => await backend.find("grant", grantKey()) as { expiresAt: number; session: NodeSavedSession } | undefined;
  return {
    auth, actor, command, control, saved, makeAuth,
    async expire() {
      const grant = (await saved())!;
      grant.session.tokenSet.expires_at = new Date(0).toISOString();
      await backend.put("grant", grantKey(), grant, Math.floor((grant.expiresAt - Date.now()) / 1000));
    },
  };
}
