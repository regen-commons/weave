import assert from "node:assert/strict";
import { test } from "node:test";
import { supabaseDirect, SUPABASE_DIRECT_PAUSE_MS, SUPABASE_DIRECT_TIMEOUT_MS } from "./sign-in-direct.ts";
import { createSignInHandlers } from "./sign-in.ts";
import type { SignInAttempt, SignInStore } from "./sign-in-store.ts";
import type { AccountProvider } from "./account-provider.ts";

const origin = "https://weave.example.test", bridge = "https://bridge.example.test";
const supabase = "https://project.example.test/auth/v1/authorize";
const state = "s".repeat(43), callback = `${origin}/api/sign-in?state=${state}`;
const authorizeUrl = `${supabase}?provider=custom%3Acertified&redirect_to=${encodeURIComponent(callback)}&code_challenge=c&code_challenge_method=s256`;
const supabaseCallback = "https://project.example.test/auth/v1/callback";
const bridgeAuth = (back: string | string[] = callback, base = `${bridge}/auth`, change: (params: URLSearchParams) => void = () => {}) => {
  const url = new URL(base);
  url.search = new URLSearchParams({ client_id: "weave-platform", response_type: "code", scope: "openid", state: "flow-id",
    redirect_uri: supabaseCallback }).toString();
  for (const value of [back].flat()) url.searchParams.append("redirect_to", value);
  change(url.searchParams);
  return url.href;
};
const redirectTo = (location: string, status = 302) => new Response(null, { status, headers: { Location: location, "Set-Cookie": "__cf_bm=cloudflare; Path=/; HttpOnly" } });

test("Supabase's answer is used only when it is exactly the browser's next step, asked without cookies", async () => {
  const sent: { url: string; init: RequestInit }[] = [];
  const toBridge = supabaseDirect(bridge, async (url, init) => { sent.push({ url: String(url), init: init! }); return redirectTo(bridgeAuth()); });
  assert.equal(await toBridge(authorizeUrl, callback), bridgeAuth());
  assert.equal(sent.length, 1);
  assert.equal(sent[0]!.url, authorizeUrl, "the same URL the browser would have been sent");
  assert.equal(sent[0]!.init.method, "GET");
  assert.equal(sent[0]!.init.redirect, "manual", "Supabase's redirect is read, not followed");
  assert.equal(sent[0]!.init.credentials, "omit");
  assert.deepEqual(sent[0]!.init.headers, { Accept: "text/html" }, "no cookie and nothing of the browser's");
  assert.ok(sent[0]!.init.signal instanceof AbortSignal);
  assert.equal(await supabaseDirect(bridge, async () => redirectTo(bridgeAuth(), 303))(authorizeUrl, callback), bridgeAuth());
});

test("anything but that exact answer sends the browser to Supabase itself", async () => {
  const cases: [string, () => Promise<Response>][] = [
    ["a Cloudflare challenge", async () => new Response("<html>Just a moment...</html>", { status: 403, headers: { "Content-Type": "text/html", "cf-mitigated": "challenge" } })],
    ["a challenge page served as 200", async () => new Response("<html>challenge</html>", { status: 200, headers: { "Content-Type": "text/html" } })],
    ["Supabase down", async () => new Response("upstream error", { status: 503 })],
    ["a network failure", async () => { throw new TypeError("fetch failed"); }],
    ["a redirect with no Location", async () => new Response(null, { status: 302 })],
    ["an unreadable Location", async () => redirectTo("http://[bad")],
    ["another host", async () => redirectTo(bridgeAuth(callback, "https://elsewhere.example.test/auth"))],
    ["the bridge over HTTP", async () => redirectTo(bridgeAuth(callback, "http://bridge.example.test/auth"))],
    ["another bridge path", async () => redirectTo(bridgeAuth(callback, `${bridge}/interaction/x`))],
    ["credentials in the Location", async () => redirectTo(bridgeAuth(callback, "https://user:pass@bridge.example.test/auth"))],
    ["a fragment", async () => redirectTo(bridgeAuth() + "#x")],
    ["another attempt's state", async () => redirectTo(bridgeAuth(`${origin}/api/sign-in?state=${"o".repeat(43)}`))],
    ["Supabase's Site URL in place of the callback", async () => redirectTo(bridgeAuth("https://regencommons.example.test/"))],
    ["two return addresses", async () => redirectTo(bridgeAuth([callback, callback]))],
    ["no return address", async () => redirectTo(bridgeAuth([]))],
    ["a permanent redirect", async () => redirectTo(bridgeAuth(), 301)],
    ["a 307", async () => redirectTo(bridgeAuth(), 307)],
    ["a 308", async () => redirectTo(bridgeAuth(), 308)],
    ["a relative Location", async () => redirectTo(new URL(bridgeAuth()).pathname + new URL(bridgeAuth()).search)],
    ["a backslash path", async () => redirectTo(bridgeAuth(callback, `${bridge}/x/..%5Cauth`))],
    ["an encoded path", async () => redirectTo(bridgeAuth(callback, `${bridge}/%61uth`))],
    ["a trailing slash", async () => redirectTo(bridgeAuth(callback, `${bridge}/auth/`))],
    ["another Supabase callback", async () => redirectTo(bridgeAuth(callback, undefined, p => p.set("redirect_uri", "https://evil.example.test/cb")))],
    ["two callbacks", async () => redirectTo(bridgeAuth(callback, undefined, p => p.append("redirect_uri", supabaseCallback)))],
    ["another response type", async () => redirectTo(bridgeAuth(callback, undefined, p => p.set("response_type", "token")))],
    ["two clients", async () => redirectTo(bridgeAuth(callback, undefined, p => p.append("client_id", "other")))],
    ["no client", async () => redirectTo(bridgeAuth(callback, undefined, p => p.delete("client_id")))],
    ["no state", async () => redirectTo(bridgeAuth(callback, undefined, p => p.delete("state")))],
    ["two states", async () => redirectTo(bridgeAuth(callback, undefined, p => p.append("state", "other")))],
  ];
  for (const [name, answer] of cases)
    assert.equal(await supabaseDirect(bridge, answer)(authorizeUrl, callback), undefined, name);
  let asked = 0;
  assert.equal(await supabaseDirect(undefined, async () => { asked++; return redirectTo(bridgeAuth()); })(authorizeUrl, callback), undefined);
  assert.equal(asked, 0, "without a bridge, Supabase is not asked");
});

test("after an unusable answer the instance lets browsers go to Supabase for a minute; a good answer keeps it direct", async () => {
  let now = 0, answer: () => Response = () => redirectTo(bridgeAuth()), asked = 0;
  const toBridge = supabaseDirect(bridge, async () => { asked++; return answer(); }, 100, () => now);
  assert.ok(await toBridge(authorizeUrl, callback)); assert.ok(await toBridge(authorizeUrl, callback));
  answer = () => new Response("challenge", { status: 403 });
  assert.equal(await toBridge(authorizeUrl, callback), undefined);
  answer = () => redirectTo(bridgeAuth());
  now += SUPABASE_DIRECT_PAUSE_MS - 1;
  assert.equal(await toBridge(authorizeUrl, callback), undefined);
  assert.equal(asked, 3, "nothing is asked while paused");
  now += 1;
  assert.ok(await toBridge(authorizeUrl, callback));
  assert.equal(SUPABASE_DIRECT_PAUSE_MS, 60_000);
});

test("a slow Supabase is given up on at the limit", async () => {
  assert.equal(SUPABASE_DIRECT_TIMEOUT_MS, 450);
  const hanging: typeof fetch = (_url, init) => new Promise((_resolve, reject) =>
    init?.signal?.addEventListener("abort", () => reject(init.signal!.reason)));
  const started = performance.now();
  assert.equal(await supabaseDirect(bridge, hanging, 40)(authorizeUrl, callback), undefined);
  const waited = performance.now() - started;
  assert.ok(waited >= 35 && waited < 500, `gave up after ${Math.round(waited)} ms`);
});

function handlers(toBridge: ReturnType<typeof supabaseDirect>, failStore = false, emailHints?: Parameters<typeof createSignInHandlers>[0]["emailHints"]) {
  const attempts = new Map<string, SignInAttempt>();
  const store: SignInStore = {
    async put(id, value) { if (failStore) throw Error("database down"); attempts.set(id, value); },
    async take(id) { const value = attempts.get(id); attempts.delete(id); return value; },
  };
  const provider = {
    signInUrl(challenge: string, back: string, loginHint?: string) {
      const url = new URL(supabase);
      url.search = new URLSearchParams({ provider: "custom:certified", redirect_to: back, code_challenge: challenge, code_challenge_method: "s256" }).toString();
      if (loginHint) { url.searchParams.set("login_hint", loginHint); url.searchParams.set("prompt", "login"); }
      return url.href;
    },
    async exchangeCode() { return { token: "synthetic.access.token", expiresIn: 3600, refreshToken: "synthetic-refresh" }; },
    async authorize() { return { id: "b1000000-0000-4000-8000-000000000001", email: null }; },
    async signOut() {},
  } as unknown as AccountProvider;
  const make = () => createSignInHandlers({ origin, secureCookies: true, provider, store, toBridge, ...(emailHints ? { emailHints } : {}) });
  const start = (extra: Record<string, unknown> = {}) => make().POST(new Request(`${origin}/api/sign-in`, { method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ returnTo: "/your-initiatives", ...extra }) }));
  return { make, start, attempts };
}
/** Stands in for Supabase: answers for whatever attempt asked, the way it does, passing on an email hint. */
const honestSupabase = supabaseDirect(bridge, async url => {
  const asked = new URL(String(url)).searchParams;
  return redirectTo(bridgeAuth(asked.get("redirect_to")!, undefined, params => {
    if (asked.get("login_hint")) { params.set("login_hint", asked.get("login_hint")!); params.set("prompt", "login"); }
  }));
});

test("a start sends the browser straight to the bridge, with the same state binding as before", async () => {
  const h = handlers(honestSupabase);
  const response = await h.start();
  assert.equal(response.status, 200);
  const { redirect } = await response.json() as { redirect: string };
  const target = new URL(redirect);
  assert.equal(target.origin + target.pathname, `${bridge}/auth`);
  assert.deepEqual(response.headers.getSetCookie().map(line => line.split("=")[0]), ["__Host-weave_sign_in"],
    "only Weave's own attempt cookie; Supabase's cookie never reaches the browser");
  assert.match(response.headers.get("server-timing") ?? "", /supabase;desc=direct;dur=\d+/u);
  const binding = response.headers.get("set-cookie")!.split(";")[0]!;
  const back = new URL(target.searchParams.get("redirect_to")!);
  assert.equal(h.attempts.size, 1);
  assert.equal([...h.attempts.values()][0]!.state, back.searchParams.get("state"), "the state Supabase carries is the stored attempt's");

  // The return is judged exactly as before: this browser's cookie and this attempt's state, once.
  back.searchParams.set("code", "synthetic-code");
  const tampered = new URL(back); tampered.searchParams.set("state", "x".repeat(43));
  assert.match((await h.make().GET(new Request(tampered, { headers: { Cookie: binding } }))).headers.get("location")!, /account=failed/u);
  const again = await handlers(honestSupabase).start();
  const other = new URL(new URL((await again.json() as { redirect: string }).redirect).searchParams.get("redirect_to")!);
  other.searchParams.set("code", "synthetic-code");
  assert.match((await h.make().GET(new Request(other, { headers: { Cookie: binding } }))).headers.get("location")!, /account=failed/u,
    "another attempt's return does not finish this one");
});

test("the return from a direct start signs in with this browser's cookie only, and only once", async () => {
  const h = handlers(honestSupabase);
  const response = await h.start();
  const binding = response.headers.get("set-cookie")!.split(";")[0]!;
  const back = new URL(new URL((await response.json() as { redirect: string }).redirect).searchParams.get("redirect_to")!);
  back.searchParams.set("code", "synthetic-code");
  assert.match((await h.make().GET(new Request(back))).headers.get("location")!, /account=failed/u, "no cookie, no sign-in");
  const h2 = handlers(honestSupabase);
  const r2 = await h2.start();
  const b2 = r2.headers.get("set-cookie")!.split(";")[0]!;
  const back2 = new URL(new URL((await r2.json() as { redirect: string }).redirect).searchParams.get("redirect_to")!);
  back2.searchParams.set("code", "synthetic-code");
  assert.match((await h2.make().GET(new Request(back2, { headers: { Cookie: b2 } }))).headers.get("location")!, /account=signed-in/u);
  assert.match((await h2.make().GET(new Request(back2, { headers: { Cookie: b2 } }))).headers.get("location")!, /account=failed/u, "used once");
});

test("a fallback start is today's start, and a failed store still fails the start", async () => {
  const h = handlers(supabaseDirect(bridge, async () => new Response("challenge", { status: 403 })));
  const response = await h.start();
  const { redirect } = await response.json() as { redirect: string };
  assert.equal(new URL(redirect).origin + new URL(redirect).pathname, supabase);
  assert.match(response.headers.get("server-timing") ?? "", /supabase;desc=fallback;dur=\d+/u);
  const broken = handlers(honestSupabase, true);
  const failed = await broken.start();
  assert.equal(failed.status, 503);
  assert.deepEqual(await failed.json(), { error: "sign_in_unavailable" });
  assert.equal(failed.headers.get("set-cookie"), null);
});

test("an email hint reaches the bridge sealed, as it did through the browser", async () => {
  const { certifiedEmailHints } = await import("./certified/email-hint.ts");
  const { randomBytes } = await import("node:crypto");
  const hints = certifiedEmailHints(randomBytes(32).toString("base64url"))!;
  const response = await handlers(honestSupabase, false, hints).start({ email: "person@example.test", emailRedirectConsent: true });
  const target = new URL((await response.json() as { redirect: string }).redirect);
  assert.equal(target.origin + target.pathname, `${bridge}/auth`);
  assert.equal(hints.open(target.searchParams.get("login_hint")!)?.email, "person@example.test");
  assert.ok(!target.href.includes("person@example.test"), "never in the clear");
});

test("a start that waits out a slow Supabase sends the browser the old way and says so", async () => {
  const hanging: typeof fetch = (_url, init) => new Promise((_resolve, reject) =>
    init?.signal?.addEventListener("abort", () => reject(init.signal!.reason)));
  const response = await handlers(supabaseDirect(bridge, hanging, 30)).start();
  const { redirect } = await response.json() as { redirect: string };
  assert.equal(new URL(redirect).origin + new URL(redirect).pathname, supabase);
  assert.match(response.headers.get("server-timing") ?? "", /supabase;desc=fallback;dur=\d+/u);
});
