import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer, type RequestListener } from "node:http";
import { once } from "node:events";
import { createHash } from "node:crypto";
import { createCertifiedClient, type CertifiedClient } from "./certified/adapters.ts";
import { createBridge } from "./certified/bridge.ts";
import { generateSigningMaterial } from "./certified/keys.ts";
import { certifiedOAuthCaches, certifiedPrimer, memoryStore, METADATA_TTL_MS, NONCE_TTL_MS, PRIME_RETRY_AFTER_MS, primeWithin } from "./certified/oauth-prime.ts";
import { createCertifiedProjectAuth, type ProjectOAuthStore } from "./certified-project-auth.ts";
import { generateKeyPairSync } from "node:crypto";
import { responseTiming, serverTiming, withServerTiming } from "./certified/server-timing.ts";
import type { AuthStore } from "./certified/store.ts";

const issuer = "https://certified.one";
const par = `${issuer}/oauth/par`;
const nonce = (n: number) => `nonce-${String(n).padStart(37, "0")}`;
const metadata = (overrides: Record<string, unknown> = {}) => ({
  issuer, authorization_endpoint: "https://auth.certified.one/oauth/authorize", token_endpoint: `${issuer}/oauth/token`,
  pushed_authorization_request_endpoint: par, require_pushed_authorization_requests: true,
  client_id_metadata_document_supported: true, response_types_supported: ["code"], scopes_supported: ["atproto"],
  token_endpoint_auth_methods_supported: ["private_key_jwt"], token_endpoint_auth_signing_alg_values_supported: ["ES256"],
  dpop_signing_alg_values_supported: ["ES256"], ...overrides,
});
const resolved = (overrides: Record<string, unknown> = {}) =>
  async () => ({ metadata: metadata(overrides) as { issuer: string; pushed_authorization_request_endpoint?: string } });
const parAnswer = (value: string | null, status = 400) => new Response(JSON.stringify({ error: "invalid_client" }), {
  status, headers: { "Content-Type": "application/json", ...(value === null ? {} : { "DPoP-Nonce": value }) },
});

test("a memory store forgets entries at their lifetime and keeps only the newest few", () => {
  let now = 0;
  const store = memoryStore<string>(1000, () => now, 2);
  store.set("a", "1"); store.set("b", "2");
  assert.equal(store.get("a"), "1");
  now = 999; assert.equal(store.get("b"), "2");
  now = 1000; assert.equal(store.get("a"), undefined, "an entry is gone at its lifetime");
  store.set("c", "3"); store.set("d", "4"); store.set("e", "5");
  assert.equal(store.get("c"), undefined, "the oldest entry makes room");
  assert.equal(store.get("e"), "5");
  store.del("e"); assert.equal(store.get("e"), undefined);
});

test("caches keep metadata for Certified's five minutes and nonces for the SDK's one", () => {
  let now = 0;
  const caches = certifiedOAuthCaches(() => now);
  caches.dpopNonceCache.set(issuer, nonce(1));
  caches.authorizationServerMetadataCache.set(issuer, metadata() as never);
  now = NONCE_TTL_MS;
  assert.equal(caches.dpopNonceCache.get(issuer), undefined);
  assert.ok(caches.authorizationServerMetadataCache.get(issuer));
  now = METADATA_TTL_MS;
  assert.equal(caches.authorizationServerMetadataCache.get(issuer), undefined);
});

test("priming asks Certified's PAR endpoint once, with an empty request, and keeps its nonce by origin", async () => {
  const caches = certifiedOAuthCaches(), sent: Request[] = [];
  const prime = certifiedPrimer({ caches, resolve: resolved(), fetch: async (input, init) => {
    sent.push(new Request(input, init)); return parAnswer(nonce(1));
  } });
  const [first, second] = await Promise.all([prime(), prime()]);
  assert.equal(first, "primed"); assert.equal(second, "primed", "a second call during the first shares it");
  assert.equal(sent.length, 1);
  assert.equal(sent[0]!.url, par); assert.equal(sent[0]!.method, "POST");
  assert.equal(await sent[0]!.text(), "", "nothing of anyone's is sent");
  assert.equal(sent[0]!.headers.get("authorization"), null); assert.equal(sent[0]!.headers.get("dpop"), null);
  assert.equal(caches.dpopNonceCache.get(issuer), nonce(1));
  assert.equal(await prime(), "ready", "a cached nonce makes no request");
  assert.equal(sent.length, 1);
});

test("priming never rejects and stores nothing it cannot trust", async () => {
  const cases: [string, Parameters<typeof certifiedPrimer>[0]["resolve"], () => Promise<Response>, string][] = [
    ["no nonce", resolved(), async () => parAnswer(null), "failed"],
    ["a nonce with a space", resolved(), async () => parAnswer("bad nonce value"), "failed"],
    ["a nonce too long", resolved(), async () => parAnswer("n".repeat(513)), "failed"],
    ["a nonce too short", resolved(), async () => parAnswer("short"), "failed"],
    ["a failed request", resolved(), async () => { throw Error("network"); }, "failed"],
    ["a failed resolve", async () => { throw Error("discovery"); }, async () => parAnswer(nonce(1)), "failed"],
    ["another issuer", resolved({ issuer: "https://other.example" }), async () => parAnswer(nonce(1)), "skipped"],
    ["a PAR endpoint elsewhere", resolved({ pushed_authorization_request_endpoint: "https://other.example/oauth/par" }), async () => parAnswer(nonce(1)), "skipped"],
    ["a PAR endpoint over HTTP", resolved({ pushed_authorization_request_endpoint: "http://certified.one/oauth/par" }), async () => parAnswer(nonce(1)), "skipped"],
    ["no PAR endpoint", resolved({ pushed_authorization_request_endpoint: undefined }), async () => parAnswer(nonce(1)), "skipped"],
  ];
  for (const [name, resolve, answer, expected] of cases) {
    const caches = certifiedOAuthCaches();
    let asked = 0;
    const outcome = await certifiedPrimer({ caches, resolve, fetch: async () => { asked++; return answer(); } })();
    assert.equal(outcome, expected, name);
    assert.equal(caches.dpopNonceCache.get(issuer), undefined, name);
    if (expected === "skipped") assert.equal(asked, 0, `${name}: nothing is sent`);
  }
  // A Certified that never answers is given up on, and a later call can try again.
  const hanging = certifiedPrimer({ caches: certifiedOAuthCaches(), resolve: resolved(), timeoutMs: 20,
    fetch: (_input, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason))) });
  assert.equal(await hanging(), "failed");
});

test("after a failure, priming waits before it asks Certified again, so no caller can make it ask at will", async () => {
  let now = 0, asked = 0, answer: string | null = null;
  const prime = certifiedPrimer({ caches: certifiedOAuthCaches(), resolve: resolved(), now: () => now,
    fetch: async () => { asked++; return parAnswer(answer); } });
  assert.equal(await prime(), "failed");
  answer = nonce(3);
  now += PRIME_RETRY_AFTER_MS - 1;
  assert.equal(await prime(), "failed"); assert.equal(await prime(), "failed");
  assert.equal(asked, 1, "nothing is sent while it waits");
  now += 1;
  assert.equal(await prime(), "primed");
  assert.equal(asked, 2);
});

test("a start waits for readying only briefly, then goes on and lets it finish in the background", async () => {
  assert.equal(await primeWithin(Promise.resolve("primed"), 50), "primed");
  let finish!: (value: "primed") => void;
  const slow = new Promise<"primed">(resolve => { finish = resolve; });
  const started = performance.now();
  assert.equal(await primeWithin(slow, 30), "late");
  assert.ok(performance.now() - started < 1000);
  finish("primed");
  assert.equal(await slow, "primed");
});

test("the project primer keeps working after the instance's first ten seconds", async t => {
  const certified = certifiedServer(() => nonce(4));
  t.mock.method(globalThis, "fetch", certified.handler);
  // Every deadline set while the auth is built has already passed, as it would have ten seconds later.
  const timeout = t.mock.method(AbortSignal, "timeout", () => AbortSignal.abort(new DOMException("expired", "TimeoutError")));
  const key = { ...generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey.export({ format: "jwk" }), kid: "test-only", alg: "ES256" };
  const auth = await createCertifiedProjectAuth({
    origin: "https://weave.example.test", cgsOrigin: "https://groups.example.test", signingKeys: [key],
    store: {} as ProjectOAuthStore, resolveActor: async () => null, allowsDid: () => true,
  });
  timeout.mock.restore();
  assert.equal(await auth.prime(), "primed");
  assert.ok(certified.metadataReads() > 0, "the metadata was read through the long-lived client");
});

/** Certified as the SDK sees it: metadata, and a PAR endpoint that wants the current nonce. */
function certifiedServer(current: () => string) {
  const pars: { nonce: unknown }[] = [];
  let metadataReads = 0;
  const handler = async (resource: string | URL | Request, init?: RequestInit) => {
    const input = resource instanceof Request && !init ? resource : new Request(resource, init);
    // As a real fetch does, an aborted request never reaches the server.
    input.signal.throwIfAborted();
    if (input.url === `${issuer}/.well-known/oauth-protected-resource`) { metadataReads++; return new Response(null, { status: 404 }); }
    if (input.url === `${issuer}/.well-known/oauth-authorization-server`) { metadataReads++; return Response.json(metadata()); }
    assert.equal(input.url, par);
    const body = await input.text(), proof = input.headers.get("dpop");
    if (!body) return parAnswer(current());
    const claims = JSON.parse(Buffer.from(proof!.split(".")[1]!, "base64url").toString("utf8")) as { nonce?: unknown };
    pars.push({ nonce: claims.nonce });
    if (claims.nonce !== current()) return new Response(JSON.stringify({ error: "use_dpop_nonce" }), {
      status: 400, headers: { "Content-Type": "application/json", "DPoP-Nonce": current() } });
    return Response.json({ request_uri: "urn:ietf:params:oauth:request_uri:req-synthetic", expires_in: 300 },
      { status: 201, headers: { "DPoP-Nonce": current() } });
  };
  return { handler, pars, metadataReads: () => metadataReads };
}
const stateStore = () => ({ put: async () => {}, find: async () => undefined, take: async () => undefined } as unknown as AuthStore);

test("after priming, the bridge's PAR carries Certified's nonce on its first try and reads no metadata", async t => {
  let current = nonce(1);
  const certified = certifiedServer(() => current);
  t.mock.method(globalThis, "fetch", certified.handler);
  const client = await createCertifiedClient(stateStore(), generateSigningMaterial(), "https://auth.example.test");
  assert.equal(await client.prime(), "primed");
  const reads = certified.metadataReads();
  const target = await client.authorize("synthetic-state");
  assert.equal(target.searchParams.get("request_uri"), "urn:ietf:params:oauth:request_uri:req-synthetic");
  assert.deepEqual(certified.pars, [{ nonce: nonce(1) }], "one PAR, with the primed nonce");
  assert.equal(certified.metadataReads(), reads, "metadata came from the cache");

  // Certified has moved on since: the stale nonce costs one refusal and one retry, as without priming.
  current = nonce(2);
  certified.pars.length = 0;
  await client.authorize("synthetic-state-2");
  assert.deepEqual(certified.pars, [{ nonce: nonce(1) }, { nonce: nonce(2) }]);
  assert.equal(await client.prime(), "ready", "the retry's nonce is kept for the next press");
});

test("without priming the SDK still signs in: a refused PAR is retried with the nonce", async t => {
  const certified = certifiedServer(() => nonce(7));
  t.mock.method(globalThis, "fetch", certified.handler);
  const client = await createCertifiedClient(stateStore(), generateSigningMaterial(), "https://auth.example.test");
  await client.authorize("synthetic-state");
  assert.deepEqual(certified.pars, [{ nonce: undefined }, { nonce: nonce(7) }]);
});

test("server timing carries fixed labels only, on Fetch and Node responses", async () => {
  let clock = 0;
  const timing = serverTiming(() => clock);
  await timing.time("par", async () => { clock += 12.4; });
  await assert.rejects(timing.time("state", async () => { clock += 3; throw Error("private-failure"); }));
  timing.add("runtime", 5, "cold");
  timing.add("Bad Label", 1); timing.add("prime", 1, "did:plc:private"); timing.add("prime", Number.NaN, "ready");
  assert.equal(timing.header(), "par;dur=12, state;dur=3, runtime;desc=cold;dur=5, prime;desc=ready;dur=0");
  assert.equal(withServerTiming(new Response(null), timing).headers.get("Server-Timing"), timing.header());
  assert.equal(serverTiming().header(), undefined);
  // An immutable response is returned as it was.
  const fixed = Response.redirect("https://weave.example.test/", 303);
  assert.equal(withServerTiming(fixed, timing), fixed);

  const server = createServer((_req, res) => {
    responseTiming(res).add("runtime", 2, "warm");
    res.writeHead(204, { "X-Other": "kept" }); res.end();
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/`);
    assert.equal(response.headers.get("server-timing"), "runtime;desc=warm;dur=2");
    assert.equal(response.headers.get("x-other"), "kept");
  } finally { server.close(); server.closeAllConnections(); }
});

test("the bridge's warm address primes Certified, and its start primes before the PAR", async () => {
  const signing = generateSigningMaterial(), records = new Map<string, unknown>();
  const store = {
    signingMaterial: async () => signing,
    async put(namespace: string, id: string, payload: unknown) { records.set(`${namespace}:${id}`, payload); },
    async find(namespace: string, id: string) { return records.get(`${namespace}:${id}`); },
    async findByUid() { return undefined; },
    async remove(namespace: string, id: string) { records.delete(`${namespace}:${id}`); },
  } as unknown as AuthStore;
  const order: string[] = [];
  const certified: CertifiedClient = {
    metadata: {}, jwks: { keys: [] },
    async prime() { order.push("prime"); return "ready"; },
    async authorize(state) { order.push("authorize"); return new URL(`https://auth.certified.one/oauth/authorize?state=${state}`); },
    async callback() { throw Error("unused"); },
  };
  let bridge: RequestListener;
  const server = createServer((req, res) => bridge(req, res));
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`, redirectUri = "http://127.0.0.1:1/callback";
  try {
    bridge = await createBridge({ issuer: origin, clientId: "weave", clientSecret: "x".repeat(40), redirectUri, loopbackTest: true },
      store, certified, undefined, signing);
    const warm = await fetch(`${origin}/warm`);
    assert.equal(warm.status, 204);
    assert.equal(warm.headers.get("cache-control"), "private, no-store");
    assert.match(warm.headers.get("server-timing") ?? "", /^prime;desc=ready;dur=\d+$/u);
    assert.deepEqual(order, ["prime"]);
    assert.equal((await fetch(`${origin}/warm`, { method: "POST" })).status, 404, "only GET");

    order.length = 0;
    const params = new URLSearchParams({ client_id: "weave", redirect_uri: redirectUri, response_type: "code", scope: "openid",
      state: "synthetic-relying-party-state", prompt: "login", code_challenge_method: "S256",
      code_challenge: createHash("sha256").update("synthetic-verifier").digest("base64url") });
    // /auth now answers with Certified's address itself (see the joined-start tests in sign-in.test.ts).
    const started = await fetch(`${origin}/auth?${params}`, { redirect: "manual" });
    assert.equal(started.status, 303);
    assert.ok(started.headers.get("location")?.startsWith("https://auth.certified.one/oauth/authorize"));
    assert.deepEqual(order, ["prime", "authorize"]);
    assert.match(started.headers.get("server-timing") ?? "",
      /^state;dur=\d+, prime;desc=ready;dur=\d+, par;dur=\d+, interaction;desc=joined;dur=0$/u);
  } finally { server.close(); server.closeAllConnections(); }
});
