import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createServer, type RequestListener } from "node:http";
import { once } from "node:events";
import { createSignInHandlers } from "./sign-in.ts";
import type { SignInAttempt, SignInStore } from "./sign-in-store.ts";
import { AccountError, type AccountProvider } from "./account-provider.ts";
import { accountConfiguration, bridgeWarmer } from "./account-runtime.ts";
import { createCipher } from "./certified/crypto.ts";
import { certifiedEmailHints } from "./certified/email-hint.ts";
import { certifiedEmailRedirect, type CertifiedClient } from "./certified/adapters.ts";
import { createBridge, RELYING_PARTY_WINDOW_SECONDS } from "./certified/bridge.ts";
import { generateSigningMaterial, type SigningMaterial } from "./certified/keys.ts";
import { identitySubject } from "./certified/identity.ts";
import { createBridgeObserver } from "./certified/operations.ts";
import type { AuthStore } from "./certified/store.ts";
const origin = "https://weave.example.test";
function fixture(emailHints?: ReturnType<typeof certifiedEmailHints>) {
  const attempts = new Map<string, SignInAttempt>();
  const store: SignInStore = {
    async put(id, value) { attempts.set(id, value); },
    async take(id) { const value = attempts.get(id); attempts.delete(id); return value; },
  };
  let exchanges = 0, revocations = 0;
  const provider: AccountProvider = {
    signInUrl(challenge, callback, loginHint) {
      const url = new URL("https://database.example.test/auth/v1/authorize");
      url.search = new URLSearchParams({ redirect_to: callback, code_challenge: challenge }).toString();
      if (loginHint) url.searchParams.set("login_hint", loginHint);
      return url.href;
    },
    async exchangeCode(code, verifier) {
      assert.equal(code, "synthetic-code"); assert.match(verifier, /^[A-Za-z0-9_-]{43}$/);
      exchanges++; return { token: "synthetic.access.token", expiresIn: 3600, refreshToken: "synthetic-refresh" };
    },
    async renew() { throw Error("sign-in must never renew"); },
    async authorize() { return { id: "b1000000-0000-4000-8000-000000000001", email: null }; },
    async signOut() { revocations++; },
    async save() { throw Error("sign-in must never save"); },
    async load() { throw Error("sign-in must never load"); },
    async list() { throw Error("sign-in must never list private documents"); },
    async deleteInitiative() { throw Error("sign-in must never delete"); },
  };
  const make = () => createSignInHandlers({ origin, secureCookies: true, provider, store, emailHints });
  const post = (returnTo: string, headers = {}, email?: string, emailRedirectConsent?: boolean) =>
    new Request(`${origin}/api/sign-in`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ returnTo, email, emailRedirectConsent }) });
  async function begin(returnTo = "/start/finish", priorCookie?: string) {
    const response = await make().POST(post(returnTo, priorCookie ? { Cookie: priorCookie } : {}));
    assert.equal(response.status, 200);
    const cookie = response.headers.get("set-cookie")!.split(";")[0]!;
    const { redirect } = await response.json() as { redirect: string };
    const authorize = new URL(redirect), callback = new URL(authorize.searchParams.get("redirect_to")!);
    callback.searchParams.set("code", "synthetic-code");
    return { response, cookie, callback, authorize };
  }
  return { make, begin, post, provider, attempts, counts: () => ({ exchanges, revocations }) };
}
test("email entry sends only an encrypted hint through Platform and keeps app callback state free of email", async () => {
  const key = randomBytes(32);
  const hints = certifiedEmailHints(key.toString("base64url"))!;
  const f = fixture(hints), email = "preview@example.test";
  const response = await f.make().POST(f.post("/settings", {}, email, true));
  assert.equal(response.status, 200);
  const { redirect } = await response.json() as { redirect: string };
  const url = new URL(redirect), hint = url.searchParams.get("login_hint")!;
  assert.equal(hints.open(hint)?.email, email);
  assert.equal(hints.open(hint + "bad"), undefined);
  const legacy = createCipher({ active: "v1", keys: { v1: key }, lookup: key }, "weave:certified")
    .seal("certified:login_hint", "email", { email, id: randomBytes(32).toString("base64url"), expires: Date.now() + 120000 });
  assert.equal(hints.open(legacy), undefined);
  assert.ok(!decodeURIComponent(redirect).includes(email));
  assert.ok(!JSON.stringify([...f.attempts.values()]).includes(email));
  assert.equal((await f.make().POST(f.post("/settings", {}, "invalid", true))).status, 400);
  const stale = await f.make().POST(f.post("/settings", {}, email));
  assert.equal(stale.status, 200);
  const { redirect: staleRedirect } = await stale.json() as { redirect: string };
  assert.equal(new URL(staleRedirect).searchParams.has("login_hint"), false);
  const disabled = fixture();
  assert.equal((await disabled.make().POST(disabled.post("/settings", {}, email, true))).status, 503);
});
test("the email goes only to Certified's email page after PAR", () => {
  const email = "preview+tag@example.test";
  const clientId = "https://weave.example.test/client-metadata.json";
  const requestUri = "urn:ietf:params:oauth:request_uri:req-synthetic";
  const query = new URLSearchParams({ client_id: clientId, request_uri: requestUri });
  for (const endpoint of ["https://certified.one/oauth/authorize", "https://auth.certified.one/oauth/authorize"]) {
    const authorization = new URL(`${endpoint}?${query}`);
    assert.equal(certifiedEmailRedirect(authorization, undefined), authorization);
    const target = certifiedEmailRedirect(authorization, email);
    assert.equal(target.origin + target.pathname, "https://auth.certified.one/oauth/authorize");
    assert.deepEqual(Object.fromEntries(target.searchParams), {
      client_id: clientId, request_uri: requestUri, prompt: "login", login_hint: email,
    });
    assert.equal(authorization.searchParams.has("login_hint"), false);
  }
  for (const endpoint of ["https://other.example.test/oauth/authorize", "http://auth.certified.one/oauth/authorize",
    "https://auth.certified.one/other", "https://user@auth.certified.one/oauth/authorize"]) {
    assert.throws(() => certifiedEmailRedirect(new URL(`${endpoint}?${query}`), email), /invalid_certified_authorization_endpoint/);
  }
  for (const fragment of ["#", "#fragment"]) {
    const authorization = new URL(`https://auth.certified.one/oauth/authorize?${query}${fragment}`);
    assert.throws(() => certifiedEmailRedirect(authorization, email), /invalid_certified_authorization_endpoint/);
    assert.equal(certifiedEmailRedirect(authorization, undefined), authorization);
  }
  for (const name of ["client_id", "request_uri"]) {
    const duplicate = new URLSearchParams(query);
    duplicate.append(name, duplicate.get(name)!);
    assert.throws(() => certifiedEmailRedirect(new URL(`https://auth.certified.one/oauth/authorize?${duplicate}`), email),
      /invalid_certified_authorization_request/);
    const malformed = new URLSearchParams(query);
    malformed.delete(name);
    assert.throws(() => certifiedEmailRedirect(new URL(`https://auth.certified.one/oauth/authorize?${malformed}`), email),
      /invalid_certified_authorization_request/);
    for (const value of ["", " ", "embedded space", "decoded\nnewline", "decoded\u0000control", "decoded\u0085control"]) {
      malformed.set(name, value);
      assert.throws(() => certifiedEmailRedirect(new URL(`https://auth.certified.one/oauth/authorize?${malformed}`), email),
        /invalid_certified_authorization_request/);
    }
  }
});
test("one-use PKCE callback survives handler replacement and establishes only an HttpOnly session", async () => {
  const f = fixture(), pending = await f.begin();
  assert.match(pending.response.headers.get("set-cookie")!, /HttpOnly; SameSite=Lax; Max-Age=600; Secure/);
  const attempt = [...f.attempts.values()][0]!;
  assert.equal(pending.authorize.searchParams.get("code_challenge"), createHash("sha256").update(attempt.verifier).digest("base64url"));
  const callback = () => f.make().GET(new Request(pending.callback, { headers: { Cookie: pending.cookie } }));
  const results = await Promise.all([callback(), callback()]);
  const success = results.find(r => r.headers.get("location")?.endsWith("account=signed-in"))!;
  assert.ok(success);
  assert.equal(success.headers.get("location"), `${origin}/start/finish?account=signed-in`);
  assert.ok(success.headers.getSetCookie().some(c => c === "__Host-weave_account=synthetic.access.token; Path=/; HttpOnly; SameSite=Strict; Max-Age=3600; Secure"));
  // The refresh token is kept only in its own host-only HttpOnly cookie, never in the redirect.
  assert.ok(success.headers.getSetCookie().some(c => c ===
    `__Host-weave_account_renewal=${Buffer.from("synthetic-refresh").toString("base64url")}; Path=/; HttpOnly; SameSite=Strict; Max-Age=1209600; Secure`));
  assert.doesNotMatch(success.headers.get("location")!, /refresh/);
  assert.equal(await success.text(), "");
  assert.deepEqual(f.counts(), { exchanges: 1, revocations: 0 });
  assert.ok(results.every(r => !r.headers.get("location")!.includes("synthetic")));
});
test("missing, duplicate, wrong and expired browser state fail without exchanging or moving data", async () => {
  for (const mode of ["missing", "duplicate-cookie", "wrong-state", "duplicate-state", "expired", "duplicate-code", "wrong-origin"]) {
    const f = fixture(), pending = await f.begin();
    let cookie = pending.cookie;
    if (mode === "missing") cookie = "";
    if (mode === "duplicate-cookie") cookie += `; ${cookie}`;
    if (mode === "wrong-state") pending.callback.searchParams.set("state", "wrong");
    if (mode === "duplicate-state") pending.callback.searchParams.append("state", "wrong");
    if (mode === "duplicate-code") pending.callback.searchParams.append("code", "wrong");
    if (mode === "expired") f.attempts.clear();
    if (mode === "wrong-origin") pending.callback.host = "other.example.test";
    const response = await f.make().GET(new Request(pending.callback, { headers: { Cookie: cookie } }));
    assert.ok(response.headers.get("location")!.endsWith("account=failed"), mode);
    assert.equal(response.headers.getSetCookie().some(c => c.startsWith("__Host-weave_account=")), false);
    assert.equal(f.counts().exchanges, 0, mode);
  }
});
test("a newer sign-in cancels the old attempt; cancellation and rejected identity never create an account cookie", async () => {
  const f = fixture(), first = await f.begin(), second = await f.begin("/settings", first.cookie);
  assert.equal(f.attempts.size, 1);
  assert.match((await f.make().GET(new Request(first.callback, { headers: { Cookie: first.cookie } }))).headers.get("location")!, /failed$/);
  second.callback.searchParams.set("error", "access_denied");
  second.callback.searchParams.set("error_description", "private-provider-detail");
  const cancelled = await f.make().GET(new Request(second.callback, { headers: { Cookie: second.cookie } }));
  assert.equal(cancelled.headers.get("location"), `${origin}/settings?account=cancelled`);
  const third = await f.begin();
  f.provider.authorize = async () => { throw new AccountError(401, "sign_in_required"); };
  const rejected = await f.make().GET(new Request(third.callback, { headers: { Cookie: third.cookie } }));
  assert.match(rejected.headers.get("location")!, /failed$/);
  assert.equal(rejected.headers.getSetCookie().some(c => c.startsWith("__Host-weave_account")), false,
    "a rejected identity gets neither an access nor a renewal cookie");
  assert.deepEqual(f.counts(), { exchanges: 1, revocations: 1 });
});
test("a warm request readies the store and wakes the bridge, and starts nothing", async () => {
  const f = fixture();
  let readied = 0, woken = 0;
  const attempts = new Map<string, SignInAttempt>();
  const store: SignInStore = { async ready() { readied++; }, async put(id, value) { attempts.set(id, value); },
    async take(id) { const value = attempts.get(id); attempts.delete(id); return value; } };
  const handlers = (overrides: Partial<Parameters<typeof createSignInHandlers>[0]> = {}) => createSignInHandlers({
    origin, secureCookies: true, provider: f.provider, store, warmBridge: async () => { woken++; }, ...overrides });
  const warm = (body: unknown = { warm: true }, headers: Record<string, string> = {}) => new Request(`${origin}/api/sign-in`, { method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
  const response = await handlers().POST(warm());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { warm: true });
  assert.equal(response.headers.get("set-cookie"), null, "warming binds nothing to the browser");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual([readied, woken, attempts.size], [1, 1, 0], "no attempt is stored");
  assert.deepEqual(f.counts(), { exchanges: 0, revocations: 0 });

  // It is a write endpoint like the start: same origin and JSON only, and nothing rides along with it.
  assert.equal((await handlers().POST(warm({ warm: true }, { Origin: "https://attacker.test" }))).status, 403);
  assert.equal((await handlers().POST(warm({ warm: true }, { "Content-Type": "text/plain" }))).status, 415);
  assert.equal((await handlers().POST(warm({ warm: true, returnTo: "/settings" }))).status, 400);
  assert.equal((await handlers().POST(warm({ warm: "yes" }))).status, 400, "anything but the exact request is a start, and needs a task");
  assert.deepEqual([readied, woken, attempts.size], [1, 1, 0]);

  // A database or bridge that cannot be reached is not reported, and never blocks the sign-in that follows.
  const failing = handlers({ store: { ...store, async ready() { throw Error("database unreachable"); } },
    warmBridge: async () => { throw Error("bridge unreachable"); } });
  const quiet = await failing.POST(warm());
  assert.equal(quiet.status, 200);
  assert.deepEqual(await quiet.json(), { warm: true });
  const started = await failing.POST(f.post("/your-initiatives"));
  assert.equal(started.status, 200, "a start still works when the bridge could not be woken");
  assert.equal(attempts.size, 1);

  // A store with nothing to open, and no bridge to wake, still answers.
  assert.equal((await f.make().POST(warm())).status, 200);

  // A sign-in already under way in this browser is left exactly as it was.
  const pending = await f.begin("/funding");
  const before = [...f.attempts.entries()];
  const beside = await f.make().POST(warm({ warm: true }, { Cookie: pending.cookie }));
  assert.equal(beside.status, 200);
  assert.equal(beside.headers.get("set-cookie"), null);
  assert.deepEqual([...f.attempts.entries()], before, "warming neither takes nor replaces the stored attempt");
  const finished = await f.make().GET(new Request(pending.callback, { headers: { Cookie: pending.cookie } }));
  assert.equal(finished.headers.get("location"), `${origin}/funding?account=signed-in`);
});

test("a start gives the bridge a head start without waiting for it", async () => {
  const f = fixture();
  let woken = 0;
  const never = new Promise<void>(() => {});
  const handlers = createSignInHandlers({ origin, secureCookies: true, provider: f.provider,
    store: { async put() {}, async take() { return undefined; } }, warmBridge: () => { woken++; return never; } });
  const response = await handlers.POST(f.post("/funding"));
  assert.equal(response.status, 200, "the redirect is returned while the bridge is still waking");
  assert.equal(woken, 1);
  // A waker that breaks outright changes nothing either.
  const broken = createSignInHandlers({ origin, secureCookies: true, provider: f.provider,
    store: { async put() {}, async take() { return undefined; } }, warmBridge: () => { throw new Error("waker broke"); } });
  assert.equal((await broken.POST(f.post("/funding"))).status, 200);
});

test("the bridge is woken by one bounded read of its public discovery document, at most once in 30 seconds", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  let now = 1_000_000, cancelled = 0, answer: () => Promise<Response> = async () =>
    ({ body: { cancel: async () => { cancelled++; } } }) as unknown as Response;
  const wake = bridgeWarmer("https://bridge.example.test", async (url, init) => { calls.push({ url: String(url), init: init! }); return answer(); }, () => now);
  await Promise.all([wake(), wake(), wake()]);
  assert.equal(calls.length, 1, "pages that ask together share one request");
  assert.equal(calls[0]!.url, "https://bridge.example.test/.well-known/openid-configuration");
  assert.equal(calls[0]!.init.method, undefined, "a read, never a write");
  assert.equal(calls[0]!.init.body, undefined);
  assert.equal(calls[0]!.init.redirect, "manual", "it follows the bridge nowhere");
  assert.deepEqual(calls[0]!.init.headers, { Accept: "application/json" }, "no cookie, token or address of the person's goes with it");
  assert.ok(calls[0]!.init.signal instanceof AbortSignal, "it cannot hang the function");
  assert.equal(cancelled, 1, "the document is not read");
  now += 29_000;
  await wake();
  assert.equal(calls.length, 1);
  now += 2_000;
  answer = async () => { throw new TypeError("fetch failed"); };
  await assert.doesNotReject(wake(), "a bridge that cannot be reached never fails the caller");
  assert.equal(calls.length, 2);
  await wake();
  assert.equal(calls.length, 2, "a failed wake is not repeated inside the 30 seconds either");
  // Dropping the unread document is never waited for, so a body that will not close cannot pin the waker.
  now += 31_000;
  answer = async () => ({ body: { cancel: () => new Promise<void>(() => {}) } }) as unknown as Response;
  await wake();
  now += 31_000;
  await wake();
  assert.equal(calls.length, 4);
  await bridgeWarmer(undefined, async () => { throw Error("no bridge is configured"); })();
});

test("start requires same-origin JSON and an allowlisted return task", async () => {
  const f = fixture();
  for (const path of ["https://other.test", "//other.test", "/api/account", "/settings?steal=1", "/funding/../api/account"])
    assert.equal((await f.make().POST(f.post(path))).status, 400);
  assert.equal((await f.make().POST(f.post("/settings", { Origin: "https://other.test" }))).status, 403);
  assert.equal((await f.make().POST(f.post("/settings", { "Content-Type": "text/plain" }))).status, 415);
  assert.equal((await f.make().POST(f.post("/settings", { "Content-Length": "70000" }))).status, 413);
  assert.equal(f.attempts.size, 0);
});
test("configuration permits only explicit loopback tests, publishable keys and fixed origins", () => {
  const env = { WEAVE_ACCOUNTS_ENABLED: "true", WEAVE_APP_ORIGIN: origin, WEAVE_SUPABASE_URL: "https://database.example.test",
    WEAVE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture", WEAVE_SIGN_IN_DATABASE_URL: "postgres://fixture:fixture@localhost/test",
    WEAVE_SIGN_IN_ENCRYPTION_KEYS: JSON.stringify({ active: "one", keys: { one: randomBytes(32).toString("base64url") }, lookup: randomBytes(32).toString("base64url") }) };
  assert.ok(accountConfiguration(env)?.secureCookies);
  assert.throws(() => accountConfiguration({ ...env, WEAVE_APP_ORIGIN: "http://127.0.0.1:5173" }));
  assert.throws(() => accountConfiguration({ ...env, WEAVE_LOCAL_AUTH: "true", VERCEL: "1", WEAVE_APP_ORIGIN: "http://127.0.0.1:5173" }));
  assert.throws(() => accountConfiguration({ ...env, WEAVE_SUPABASE_PUBLISHABLE_KEY: "sb_secret_fixture" }));
  assert.equal(accountConfiguration({ ...env, WEAVE_LOCAL_AUTH: "true", WEAVE_APP_ORIGIN: "http://127.0.0.1:5173" })?.secureCookies, false);
  // Only production wakes the production bridge unasked; any other Weave wakes the one it names, or none.
  assert.equal(accountConfiguration(env)?.bridge, undefined);
  assert.equal(accountConfiguration({ ...env, WEAVE_APP_ORIGIN: "https://weave.regencommons.com" })?.bridge, "https://auth.regencommons.com");
  assert.equal(accountConfiguration({ ...env, WEAVE_CERTIFIED_BRIDGE_ORIGIN: "https://bridge.example.test" })?.bridge, "https://bridge.example.test");
  // Waking has no part in who may sign in: a value that is not an exact HTTPS origin wakes none, and accounts stay on.
  for (const bridge of ["http://bridge.example.test", "https://bridge.example.test/", "https://user@bridge.example.test", "https://bridge.example.test/path",
    "HTTPS://BRIDGE.EXAMPLE.TEST", "not a url"]) {
    const config = accountConfiguration({ ...env, WEAVE_CERTIFIED_BRIDGE_ORIGIN: bridge });
    assert.ok(config?.secureCookies, bridge);
    assert.equal(config.bridge, undefined, bridge);
  }
  // An empty setting is no setting: production still wakes its own bridge.
  assert.equal(accountConfiguration({ ...env, WEAVE_APP_ORIGIN: "https://weave.regencommons.com", WEAVE_CERTIFIED_BRIDGE_ORIGIN: "" })?.bridge,
    "https://auth.regencommons.com");
  assert.equal(accountConfiguration({ ...env, WEAVE_CERTIFIED_BRIDGE_ORIGIN: "" })?.bridge, undefined);
});
test("a return without callback state recovers this browser's task as expired, never exchanging or signing in", async () => {
  const f = fixture(), pending = await f.begin("/start/finish");
  const recover = (query: string, cookie = pending.cookie) =>
    f.make().GET(new Request(`${origin}/api/sign-in${query}`, { headers: cookie ? { Cookie: cookie } : {} }));
  const expired = await recover("?error=sign_in_expired");
  assert.equal(expired.headers.get("location"), `${origin}/start/finish?account=expired`);
  assert.ok(expired.headers.getSetCookie().includes("__Host-weave_sign_in=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure"));
  assert.equal(expired.headers.getSetCookie().some(c => c.startsWith("__Host-weave_account=")), false);
  assert.equal(f.attempts.size, 0, "the abandoned attempt is consumed");
  // The binding is gone after ten minutes, or the person returns in a fresh browser.
  assert.equal((await recover("?error=sign_in_expired")).headers.get("location"), `${origin}/settings?account=expired`);
  assert.equal((await recover("?error=sign_in_expired", "")).headers.get("location"), `${origin}/settings?account=expired`);
  // A code without the state this handler issued is never exchanged.
  const second = await f.begin("/funding");
  assert.equal((await recover("?code=synthetic-code", second.cookie)).headers.get("location"), `${origin}/funding?account=failed`);
  assert.equal((await recover("", "")).headers.get("location"), `${origin}/settings?account=failed`);
  assert.equal(f.counts().exchanges, 0);
});
test("error returns map to fixed results; provider descriptions and codes never reach the address", async () => {
  for (const [query, result] of [
    [{ error: "access_denied", error_description: "private-provider-detail" }, "cancelled"],
    [{ error: "access_denied", error_code: "user_banned", error_description: "private-provider-detail" }, "failed"],
    [{ error: "access_denied", error_code: "signup_disabled" }, "failed"],
    [{ error: "server_error", error_description: "private-provider-detail" }, "failed"],
    [{ error: "invalid_request", error_code: "flow_state_expired", error_description: "private-provider-detail" }, "expired"],
    [{ error: "invalid_request", error_code: "bad_oauth_state" }, "expired"],
  ] as const) {
    const f = fixture(), pending = await f.begin("/start/needs");
    for (const [name, value] of Object.entries(query)) pending.callback.searchParams.set(name, value);
    const response = await f.make().GET(new Request(pending.callback, { headers: { Cookie: pending.cookie } }));
    assert.equal(response.headers.get("location"), `${origin}/start/needs?account=${result}`, JSON.stringify(query));
    assert.equal(f.counts().exchanges, 0);
  }
  const f = fixture(), pending = await f.begin("/start/needs");
  pending.callback.searchParams.append("error", "access_denied");
  pending.callback.searchParams.append("error", "access_denied");
  assert.match((await f.make().GET(new Request(pending.callback, { headers: { Cookie: pending.cookie } }))).headers.get("location")!, /account=failed$/);
});
test("a PKCE exchange after Supabase's flow window reports expired and keeps no session", async () => {
  const f = fixture(), pending = await f.begin("/your-initiative");
  f.provider.exchangeCode = async () => { throw new AccountError(401, "sign_in_expired"); };
  const response = await f.make().GET(new Request(pending.callback, { headers: { Cookie: pending.cookie } }));
  assert.equal(response.headers.get("location"), `${origin}/your-initiative?account=expired`);
  assert.equal(response.headers.getSetCookie().some(c => c.startsWith("__Host-weave_account=")), false);
  assert.deepEqual(f.counts(), { exchanges: 0, revocations: 0 });
});

// The full redirect chain with the real bridge. Supabase Auth is modeled on its callback's decision in
// supabase/auth v2.198.0: loadFlowState sends an expired or unknown flow to the Site URL, never redirect_to.
const supabaseCallback = "http://127.0.0.1:1/auth/v1/callback";
const siteUrl = "http://localhost:3000/";
function platformAuth() {
  const flows = new Map<string, { referrer: string; created: number }>();
  return {
    authorize(referrer: string) {
      const state = randomUUID();
      flows.set(state, { referrer, created: Date.now() });
      return state;
    },
    callback(location: URL): string {
      const flow = flows.get(location.searchParams.get("state") ?? "");
      if (!flow || Date.now() > flow.created + 300_000)
        return `${siteUrl}?error=invalid_request&error_code=bad_oauth_state&error_description=OAuth+state+has+expired`;
      const back = new URL(flow.referrer);
      back.searchParams.set("code", "synthetic-code");
      return back.href;
    },
  };
}
/** Expiry follows the mocked clock, as the database clock does for the real store. */
function memoryStore(signing: SigningMaterial): AuthStore & { records: Map<string, { payload: Record<string, unknown> }> } {
  const rows = new Map<string, { payload: Record<string, unknown>; expires: number; consumed?: number }>();
  const live = (key: string) => {
    const row = rows.get(key);
    if (row && row.expires > Date.now()) return row;
    rows.delete(key);
    return undefined;
  };
  const copy = (row: { payload: Record<string, unknown>; consumed?: number } | undefined) =>
    row && { ...JSON.parse(JSON.stringify(row.payload)), ...(row.consumed ? { consumed: row.consumed } : {}) };
  return {
    signingMaterial: async () => signing,
    withLock: async <T>(_name: string, fn: () => Promise<T>) => fn(),
    async put(namespace: string, id: string, payload: Record<string, unknown>, ttl: number) {
      const key = `${namespace}:${id}`;
      rows.set(key, { payload: JSON.parse(JSON.stringify(payload)), expires: Date.now() + ttl * 1000, consumed: rows.get(key)?.consumed });
    },
    find: async (namespace: string, id: string) => copy(live(`${namespace}:${id}`)),
    async findByUid(namespace: string, uid: string) {
      for (const key of rows.keys()) if (key.startsWith(`${namespace}:`) && live(key)?.payload.uid === uid) return copy(live(key));
      return undefined;
    },
    async take(namespace: string, id: string) {
      const key = `${namespace}:${id}`, row = live(key);
      if (!row || row.consumed) return undefined;
      rows.delete(key);
      return copy(row);
    },
    async consume(namespace: string, id: string) {
      const row = live(`${namespace}:${id}`);
      if (!row || row.consumed) throw Error("state_already_used");
      row.consumed = Math.floor(Date.now() / 1000);
    },
    remove: async (namespace: string, id: string) => { rows.delete(`${namespace}:${id}`); },
    revokeGrant: async () => {},
    records: rows,
  } as unknown as AuthStore & { records: typeof rows };
}
function cookieJar() {
  const cookies = new Map<string, string>();
  const request = async (url: string) => {
    const response = await fetch(url, { redirect: "manual", headers: { Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; ") } });
    for (const value of response.headers.getSetCookie()) {
      const first = value.split(";")[0]!, equals = first.indexOf("=");
      if (first.slice(equals + 1)) cookies.set(first.slice(0, equals), first.slice(equals + 1));
      else cookies.delete(first.slice(0, equals));
    }
    return response;
  };
  return { cookies, request };
}
async function bridgeChain(run: (scenario: {
  issuer: string; browser: ReturnType<typeof cookieJar>; app: ReturnType<typeof fixture>; auth: ReturnType<typeof platformAuth>;
  certifiedCallbacks: () => number; store: ReturnType<typeof memoryStore>;
  /** The bounded reasons the bridge logged for each return to Weave. */
  expiries: () => string[];
  /** Follows bridge redirects until the browser leaves the bridge. */
  follow: (url: string) => Promise<string>;
  /** Supabase's callback and then Weave's, as the browser would continue. */
  finish: (location: string, appCookie: string) => Promise<string>;
}) => Promise<void>) {
  const signing = generateSigningMaterial(), lines: string[] = [];
  let callbacks = 0, bridge: RequestListener | undefined;
  const certified: CertifiedClient = {
    metadata: { scope: "atproto" }, jwks: { keys: [] },
    async authorize(state) { return new URL(`https://certified.example.test/authorize?state=${state}`); },
    async callback(params) {
      callbacks++;
      return { state: params.get("state"), subject: identitySubject("https://certified.one", "did:plc:synthetic", { did: "did:plc:synthetic" }) };
    },
  };
  const server = createServer((req, res) => bridge!(req, res));
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const issuer = `http://127.0.0.1:${address.port}`;
  try {
    const store = memoryStore(signing);
    bridge = await createBridge({ issuer, clientId: "weave-platform", clientSecret: "x".repeat(40), redirectUri: supabaseCallback,
      appOrigin: origin, loopbackTest: true }, store, certified, createBridgeObserver(line => lines.push(line)));
    const browser = cookieJar(), app = fixture(), auth = platformAuth();
    const follow = async (url: string) => {
      for (let n = 0; n < 12; n++) {
        const response = await browser.request(url), location = response.headers.get("location");
        assert.ok(location, `the bridge answered ${response.status} without a redirect`);
        if (!location.startsWith(issuer)) return location;
        url = location;
      }
      throw Error("bridge_redirect_limit");
    };
    const finish = async (location: string, appCookie: string) => {
      if (location.startsWith(supabaseCallback)) location = auth.callback(new URL(location));
      if (!location.startsWith(origin)) return location;
      return (await app.make().GET(new Request(location, { headers: { Cookie: appCookie } }))).headers.get("location")!;
    };
    await run({ issuer, browser, app, auth, follow, finish, store, certifiedCallbacks: () => callbacks,
      expiries: () => lines.map(line => JSON.parse(line)).filter(event => event.event === "sign_in_expired").map(event => event.reason) });
    assert.ok(lines.every(line => !line.includes("synthetic") && !line.includes("did:")));
  } finally {
    await new Promise<void>(resolve => { server.close(() => resolve()); server.closeAllConnections(); });
  }
}
/** Weave starts the attempt, Supabase records its flow, and the browser reaches Certified through the bridge. */
async function reachCertified({ issuer, app, auth, follow }: Parameters<Parameters<typeof bridgeChain>[0]>[0], returnTo = "/start/finish") {
  const started = await app.begin(returnTo);
  const flow = auth.authorize(started.authorize.searchParams.get("redirect_to")!);
  const params = new URLSearchParams({ client_id: "weave-platform", redirect_uri: supabaseCallback, response_type: "code",
    scope: "openid", state: flow, nonce: "synthetic-nonce", prompt: "login", code_challenge_method: "S256",
    code_challenge: createHash("sha256").update("synthetic-platform-verifier").digest("base64url") });
  const certified = new URL(await follow(`${issuer}/auth?${params}`));
  assert.equal(certified.origin, "https://certified.example.test");
  return { appCookie: started.cookie, certifiedState: certified.searchParams.get("state")! };
}
const minutes = (value: number) => value * 60_000;

test("a Certified return within Supabase's window finishes the sign-in on the person's task", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.UTC(2026, 10, 16, 20) });
  await bridgeChain(async scenario => {
    const { appCookie, certifiedState } = await reachCertified(scenario);
    t.mock.timers.tick((RELYING_PARTY_WINDOW_SECONDS - 1) * 1000);
    const returned = await scenario.follow(`${scenario.issuer}/at/callback?code=synthetic-code&state=${certifiedState}`);
    assert.ok(returned.startsWith(supabaseCallback));
    assert.equal(await scenario.finish(returned, appCookie), `${origin}/start/finish?account=signed-in`);
    assert.equal(scenario.certifiedCallbacks(), 1);
  });
});
test("a Certified return after Supabase's flow window goes back to the task, never to the Site URL", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.UTC(2026, 10, 16, 20) });
  // The hosted failure took 5 minutes 25 seconds; the boundary is the bridge's own window.
  for (const elapsed of [RELYING_PARTY_WINDOW_SECONDS * 1000, minutes(5) + 25_000]) {
    await bridgeChain(async scenario => {
      const { appCookie, certifiedState } = await reachCertified(scenario);
      t.mock.timers.tick(elapsed);
      const returned = await scenario.follow(`${scenario.issuer}/at/callback?code=synthetic-code&state=${certifiedState}`);
      assert.equal(returned, `${origin}/api/sign-in?error=sign_in_expired`);
      const landed = await scenario.finish(returned, appCookie);
      assert.equal(landed, `${origin}/start/finish?account=expired`);
      assert.ok(!landed.startsWith(siteUrl));
      assert.equal(scenario.certifiedCallbacks(), 0, "no Certified identity is read for a flow Supabase will refuse");
      assert.equal(scenario.app.counts().exchanges, 0);
      assert.deepEqual(scenario.expiries(), ["deadline"]);
    });
  }
});
test("a stall after Certified, a revisited start and expired bridge state all return to the task", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.UTC(2026, 10, 16, 20) });
  await bridgeChain(async scenario => {
    const { appCookie, certifiedState } = await reachCertified(scenario);
    t.mock.timers.tick((RELYING_PARTY_WINDOW_SECONDS - 5) * 1000);
    const response = await scenario.browser.request(`${scenario.issuer}/at/callback?code=synthetic-code&state=${certifiedState}`);
    const completion = response.headers.get("location")!;
    assert.match(completion, /\/interaction\/[A-Za-z0-9_-]+\/complete\?ticket=/);
    t.mock.timers.tick(10_000);
    assert.equal(await scenario.follow(completion), `${origin}/api/sign-in?error=sign_in_expired`);
    assert.equal(await scenario.finish(`${origin}/api/sign-in?error=sign_in_expired`, appCookie), `${origin}/start/finish?account=expired`);
    assert.deepEqual(scenario.expiries(), ["deadline"]);
  });
  await bridgeChain(async scenario => {
    await reachCertified(scenario);
    const uid = scenario.browser.cookies.get("_interaction");
    assert.ok(uid, "the provider's interaction cookie");
    t.mock.timers.tick(RELYING_PARTY_WINDOW_SECONDS * 1000);
    // Going back from Certified must not open a new Certified authorization for a flow Supabase will refuse.
    assert.equal(await scenario.follow(`${scenario.issuer}/interaction/${uid}`), `${origin}/api/sign-in?error=sign_in_expired`);
    assert.deepEqual(scenario.expiries(), ["deadline"]);
  });
  await bridgeChain(async scenario => {
    const { certifiedState } = await reachCertified(scenario);
    t.mock.timers.tick(minutes(11));
    // The cookie jar keeps the bridge's state cookie; its stored binding has expired.
    assert.equal(await scenario.follow(`${scenario.issuer}/at/callback?code=synthetic-code&state=${certifiedState}`),
      `${origin}/api/sign-in?error=sign_in_expired`);
    assert.deepEqual(scenario.expiries(), ["state_gone"]);
  });
  await bridgeChain(async scenario => {
    const { appCookie, certifiedState } = await reachCertified(scenario, "/settings");
    t.mock.timers.tick(minutes(11));
    // After ten minutes the browser has dropped the bridge's state cookie and Weave's attempt has expired.
    scenario.browser.cookies.clear();
    scenario.app.attempts.clear();
    assert.equal(await scenario.follow(`${scenario.issuer}/at/callback?code=synthetic-code&state=${certifiedState}`),
      `${origin}/api/sign-in?error=sign_in_expired`);
    assert.equal(await scenario.finish(`${origin}/api/sign-in?error=sign_in_expired`, appCookie), `${origin}/settings?account=expired`);
    assert.equal(scenario.certifiedCallbacks(), 0);
    assert.deepEqual(scenario.expiries(), ["cookie_missing"]);
  });
});
test("a provider interaction that lost its cookie, expired or changed hands returns to Weave without reading an identity", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.UTC(2026, 10, 16, 20) });
  const recovery = `${origin}/api/sign-in?error=sign_in_expired`;
  await bridgeChain(async scenario => {
    await reachCertified(scenario);
    const uid = scenario.browser.cookies.get("_interaction");
    assert.ok(uid, "the provider's interaction cookie");
    // The browser has dropped the provider's interaction cookie, as it does after its ten-minute lifetime.
    scenario.browser.cookies.delete("_interaction");
    scenario.browser.cookies.delete("_interaction.sig");
    assert.equal(await scenario.follow(`${scenario.issuer}/interaction/${uid}`), recovery);
    assert.equal(scenario.certifiedCallbacks(), 0);
    assert.deepEqual(scenario.expiries(), ["interaction_gone"]);
  });
  await bridgeChain(async scenario => {
    await reachCertified(scenario);
    const uid = scenario.browser.cookies.get("_interaction");
    assert.ok(uid);
    // The cookie is kept, but the provider's interaction record outlived its 600-second lifetime.
    // The lookup fails before the deadline is read, so this is the provider path, not the deadline.
    t.mock.timers.tick(601_000);
    assert.equal(await scenario.follow(`${scenario.issuer}/interaction/${uid}`), recovery);
    assert.equal(scenario.certifiedCallbacks(), 0);
    assert.deepEqual(scenario.expiries(), ["interaction_gone"]);
  });
  await bridgeChain(async scenario => {
    // A finished sign-in leaves a bridge session; the next attempt's interaction refers to it.
    const first = await reachCertified(scenario);
    assert.ok((await scenario.follow(`${scenario.issuer}/at/callback?code=synthetic-code&state=${first.certifiedState}`))
      .startsWith(supabaseCallback));
    await reachCertified(scenario);
    const uid = scenario.browser.cookies.get("_interaction");
    assert.ok(uid);
    let sessions = 0;
    for (const [key, record] of scenario.store.records)
      if (key.startsWith("oidc:Session:")) { sessions++; record.payload.accountId = "https://certified.one|did:plc:other"; }
    assert.equal(sessions, 1);
    assert.equal(await scenario.follow(`${scenario.issuer}/interaction/${uid}`), recovery);
    assert.equal(scenario.certifiedCallbacks(), 1, "only the first, finished attempt read an identity");
    assert.deepEqual(scenario.expiries(), ["principal_changed"]);
  });
});
