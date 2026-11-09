import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash, randomBytes } from "node:crypto";
import { createSignInHandlers } from "./sign-in.ts";
import type { SignInAttempt, SignInStore } from "./sign-in-store.ts";
import { AccountError, type AccountProvider } from "./account-provider.ts";
import { accountConfiguration } from "./account-runtime.ts";
import { createCipher } from "./certified/crypto.ts";
import { certifiedEmailHints } from "./certified/email-hint.ts";
import { certifiedEmailRedirect } from "./certified/adapters.ts";
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
      exchanges++; return { token: "synthetic.access.token", expiresIn: 3600 };
    },
    async authorize() { return { id: "b1000000-0000-4000-8000-000000000001", email: null }; },
    async signOut() { revocations++; },
    async save() { throw Error("sign-in must never save"); },
    async load() { throw Error("sign-in must never load"); },
    async list() { throw Error("sign-in must never list private documents"); },
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
  assert.equal(rejected.headers.getSetCookie().some(c => c.startsWith("__Host-weave_account=")), false);
  assert.deepEqual(f.counts(), { exchanges: 1, revocations: 1 });
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
});
