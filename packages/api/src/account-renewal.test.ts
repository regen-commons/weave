import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createAccountHandlers, RENEW_BEFORE_SECONDS } from "./account.ts";
import { AccountError, createSupabaseAccountProvider, type AccountProvider, type AccountSessionTokens } from "./account-provider.ts";
import { parseDocument } from "./account-contract.ts";
import { SESSION_CAP_SECONDS, signedInAt, withRenewedSession } from "./account-session.ts";

const document = parseDocument(JSON.parse(readFileSync(new URL("./test-data/account.json", import.meta.url), "utf8")));
const user = { id: "b1000000-0000-4000-8000-000000000001", email: null };
const id = "b3000000-0000-4000-8000-000000000001", requestId = "b5000000-0000-4000-8000-000000000001";
const now = Date.parse("2026-11-20T12:00:00Z");
/** An unsigned token shaped like Supabase's, expiring `seconds` from the test clock. */
const jwt = (seconds: number, label = "a") =>
  `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ exp: now / 1000 + seconds, label })).toString("base64url")}.c2ln`;
const encoded = (refreshToken: string) => Buffer.from(refreshToken).toString("base64url");
const cookie = (access?: string, refreshToken?: string) =>
  [access && `__Host-weave_account=${access}`, refreshToken && `__Host-weave_account_renewal=${encoded(refreshToken)}`]
    .filter(Boolean).join("; ");
const fresh = jwt(3600, "renewed");

function fixture(renew: (refreshToken: string) => Promise<AccountSessionTokens> = async () =>
  ({ token: fresh, expiresIn: 3600, refreshToken: "rotated-refresh" })) {
  const calls: string[] = [];
  const provider: AccountProvider = {
    signInUrl: () => "https://supabase.example.test/auth/v1/authorize",
    exchangeCode: async () => { throw Error("not used"); },
    renew: async (refreshToken) => { calls.push(`renew:${refreshToken}`); return renew(refreshToken); },
    authorize: async (token) => { calls.push(`authorize:${token === fresh ? "fresh" : "old"}`); return user; },
    signOut: async (token) => { calls.push(`signOut:${token === fresh ? "fresh" : "old"}`); },
    list: async () => [],
    load: async () => { throw Error("not used"); },
    save: async (_token, command) => ({ id: command.id, revision: 1, updatedAt: "2026-11-20T12:00:00Z", document: command.document }),
    deleteInitiative: async () => { throw Error("not used"); },
  };
  return { provider, calls, handlers: createAccountHandlers({ provider, now: () => now }) };
}
const get = (cookies: string) => new Request("https://weave.test/api/account", { headers: { cookie: cookies } });
const post = (body: unknown, cookies: string) => new Request("https://weave.test/api/account", {
  method: "POST", headers: { origin: "https://weave.test", "content-type": "application/json", cookie: cookies }, body: JSON.stringify(body),
});
const setCookies = (response: Response) => response.headers.getSetCookie();
const renewedCookies = [
  `__Host-weave_account=${fresh}; Path=/; HttpOnly; SameSite=Strict; Max-Age=3600; Secure`,
  `__Host-weave_account_renewal=${encoded("rotated-refresh")}; Path=/; HttpOnly; SameSite=Strict; Max-Age=1209600; Secure`,
];
const endedCookies = [
  "__Host-weave_account=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Secure",
  "__Host-weave_account_renewal=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0; Secure",
];

test("an access token near expiry is renewed, authorized again and both cookies rotate", async () => {
  for (const access of [jwt(RENEW_BEFORE_SECONDS - 1), jwt(-10), undefined]) {
    const { handlers, calls } = fixture();
    const response = await handlers.GET(get(cookie(access, "first-refresh")));
    assert.equal(response.status, 200);
    const body = await response.json() as { user: unknown; renewIn: number };
    assert.deepEqual(body.user, user);
    // The app asks again 30 seconds inside the next renewal window.
    assert.equal(body.renewIn, 3600 - RENEW_BEFORE_SECONDS + 30);
    assert.deepEqual(calls, ["renew:first-refresh", "authorize:fresh"], "the renewed session passes the access predicate");
    assert.deepEqual(setCookies(response), renewedCookies);
  }
});

test("a token with time left is used as it is, and the app is told when to come back", async () => {
  const { handlers, calls } = fixture();
  const response = await handlers.GET(get(cookie(jwt(1800), "first-refresh")));
  assert.equal(response.status, 200);
  assert.equal((await response.json() as { renewIn: number }).renewIn, 1800 - RENEW_BEFORE_SECONDS + 30);
  assert.deepEqual(calls, ["authorize:old"]);
  assert.deepEqual(setCookies(response), []);
});

test("without a renewal cookie the session still ends at expiry, and the app checks right after", async () => {
  const { handlers, provider, calls } = fixture();
  const live = await handlers.GET(get(cookie(jwt(1800))));
  assert.equal((await live.json() as { renewIn: number }).renewIn, 1801);
  const gone = await handlers.GET(get(""));
  assert.deepEqual((await gone.json() as { user: unknown }).user, null);
  provider.authorize = async () => { throw new AccountError(401, "sign_in_required"); };
  const expired = await handlers.GET(get(cookie(jwt(-1))));
  assert.equal(expired.status, 401);
  assert.deepEqual(setCookies(expired), endedCookies);
  assert.ok(!calls.some(call => call.startsWith("renew") || call.startsWith("signOut")));
});

test("a revoked, reused or expired refresh token ends the session and clears both cookies", async () => {
  for (const access of [jwt(60), jwt(-60), undefined]) {
    const { handlers, calls } = fixture(async () => { throw new AccountError(401, "sign_in_required"); });
    const response = await handlers.GET(get(cookie(access, "reused-refresh")));
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "sign_in_required" });
    assert.deepEqual(setCookies(response), endedCookies);
    assert.deepEqual(calls, ["renew:reused-refresh"], "nothing private is read for an ended session");
  }
});

test("an outage during renewal ends nothing: a valid token carries on, an expired one waits", async () => {
  const outage = async () => { throw new AccountError(503, "account_unavailable"); };
  const valid = fixture(outage);
  const kept = await valid.handlers.GET(get(cookie(jwt(120), "first-refresh")));
  assert.equal(kept.status, 200);
  assert.deepEqual(valid.calls, ["renew:first-refresh", "authorize:old"]);
  assert.deepEqual(setCookies(kept), []);
  for (const failure of [outage, async () => { throw new AccountError(429, "rate_limited"); },
    async () => { throw new Error("private provider detail"); }]) {
    const expired = fixture(failure);
    const waited = await expired.handlers.GET(get(cookie(jwt(-5), "first-refresh")));
    assert.ok([429, 503].includes(waited.status));
    assert.doesNotMatch(await waited.text(), /private/);
    assert.deepEqual(setCookies(waited), [], "the person stays signed in for a retry");
  }
});

test("a renewed session the access predicate rejects is revoked at Supabase", async () => {
  const { handlers, provider, calls } = fixture();
  provider.authorize = async (token) => {
    calls.push(`authorize:${token === fresh ? "fresh" : "old"}`);
    throw new AccountError(401, "sign_in_required");
  };
  const response = await handlers.GET(get(cookie(jwt(10), "first-refresh")));
  assert.equal(response.status, 401);
  assert.deepEqual(setCookies(response), endedCookies);
  assert.deepEqual(calls, ["renew:first-refresh", "authorize:fresh", "signOut:fresh"]);
  const live = fixture();
  live.provider.authorize = async () => { throw new AccountError(401, "sign_in_required"); };
  await live.handlers.GET(get(cookie(jwt(1800), "first-refresh")));
  assert.deepEqual(live.calls, ["signOut:old"], "a renewable session is revoked even before it needs renewing");
});

test("a failure after renewal still delivers the rotated cookies", async () => {
  const { handlers, provider } = fixture();
  provider.list = async () => { throw new AccountError(503, "account_unavailable"); };
  const response = await handlers.GET(get(cookie(jwt(10), "first-refresh")));
  assert.equal(response.status, 503);
  assert.deepEqual(setCookies(response), renewedCookies);
});

test("saving near expiry renews first and writes with the new token", async () => {
  const { handlers, provider, calls } = fixture();
  let saved = "";
  provider.save = async (token, command) => {
    saved = token === fresh ? "fresh" : "old";
    return { id: command.id, revision: 1, updatedAt: "2026-11-20T12:00:00Z", document: command.document };
  };
  const response = await handlers.POST(post({ action: "save", accountId: user.id, id, requestId, expectedRevision: 0, document },
    cookie(undefined, "first-refresh")));
  assert.equal(response.status, 200);
  assert.equal(saved, "fresh");
  assert.deepEqual(calls, ["renew:first-refresh", "authorize:fresh"]);
  assert.deepEqual(setCookies(response), renewedCookies);
});

test("sign-out revokes the session, renewing an expired token first, and clears every session cookie", async () => {
  const cleared = [...endedCookies, "__Host-weave_sign_in=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure"];
  const live = fixture();
  const signedOut = await live.handlers.POST(post({ action: "sign_out" }, cookie(jwt(1800), "first-refresh")));
  assert.equal(signedOut.status, 200);
  assert.deepEqual(live.calls, ["signOut:old"]);
  assert.deepEqual(setCookies(signedOut), cleared);

  const expired = fixture();
  const renewedThenSignedOut = await expired.handlers.POST(post({ action: "sign_out" }, cookie(undefined, "first-refresh")));
  assert.equal(renewedThenSignedOut.status, 200);
  assert.deepEqual(expired.calls, ["renew:first-refresh", "signOut:fresh"], "the refresh token is revoked, not just dropped");
  assert.deepEqual(setCookies(renewedThenSignedOut), cleared);

  const ended = fixture(async () => { throw new AccountError(401, "sign_in_required"); });
  const alreadyEnded = await ended.handlers.POST(post({ action: "sign_out" }, cookie(jwt(-5), "reused-refresh")));
  assert.equal(alreadyEnded.status, 200);
  assert.deepEqual(ended.calls, ["renew:reused-refresh"]);
  assert.deepEqual(setCookies(alreadyEnded), cleared);

  const offline = fixture(async () => { throw new AccountError(503, "account_unavailable"); });
  const unconfirmed = await offline.handlers.POST(post({ action: "sign_out" }, cookie(jwt(-5), "first-refresh")));
  assert.equal(unconfirmed.status, 503);
  assert.deepEqual(await unconfirmed.json(), { error: "sign_out_unconfirmed" });
  assert.deepEqual(setCookies(unconfirmed), [], "the person keeps the session and can try again");

  const refused = fixture();
  refused.provider.signOut = async () => { throw new AccountError(503, "sign_out_unconfirmed"); };
  const retry = await refused.handlers.POST(post({ action: "sign_out" }, cookie(undefined, "first-refresh")));
  assert.equal(retry.status, 503);
  assert.deepEqual(setCookies(retry), renewedCookies, "a retry uses the rotated refresh token");
});

test("concurrent renewals with one refresh token send one refresh and agree on the result", async () => {
  let release: () => void = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  const { provider, calls } = fixture(async () => { await gate; return { token: fresh, expiresIn: 3600, refreshToken: "rotated-refresh" }; });
  // Separate handler instances, as separate requests to one function instance get.
  const tabs = [0, 1, 2].map(() => createAccountHandlers({ provider, now: () => now }).GET(get(cookie(jwt(30), "shared-refresh"))));
  release();
  const responses = await Promise.all(tabs);
  assert.deepEqual(calls.filter(call => call.startsWith("renew")), ["renew:shared-refresh"]);
  for (const response of responses) {
    assert.equal(response.status, 200);
    assert.deepEqual(setCookies(response), renewedCookies);
  }
  // Once settled, the next request with a new refresh token renews again.
  await createAccountHandlers({ provider, now: () => now }).GET(get(cookie(jwt(30), "next-refresh")));
  assert.deepEqual(calls.filter(call => call.startsWith("renew")), ["renew:shared-refresh", "renew:next-refresh"]);
});

test("malformed or duplicate renewal cookies are ignored", async () => {
  for (const cookies of [
    `__Host-weave_account_renewal=not+base64`,
    `__Host-weave_account_renewal=${encoded("short")}`,
    `__Host-weave_account_renewal=${encoded("has a space inside")}`,
    `__Host-weave_account_renewal=${encoded("x".repeat(1025))}`,
    `__Host-weave_account_renewal=${encoded("first-refresh")}; __Host-weave_account_renewal=${encoded("other-refresh")}`,
    `weave_local_account_renewal=${encoded("first-refresh")}`,
  ]) {
    const { handlers, calls } = fixture();
    const response = await handlers.GET(get(cookies));
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json() as { user: unknown }).user, null);
    assert.deepEqual(calls, [], cookies);
  }
});

test("Supabase's refresh grant maps refusals to an ended session and never leaks its words", async () => {
  const renew = (status: number, body: unknown) =>
    createSupabaseAccountProvider("https://synthetic.test", "synthetic", async () => Response.json(body, { status })).renew("first-refresh");
  const rejected = (code: string) => (error: unknown) =>
    error instanceof AccountError && error.code === code && !error.message.includes("private");
  for (const [status, errorCode] of [[400, "refresh_token_already_used"], [400, "refresh_token_not_found"], [403, "user_banned"],
    [400, "session_expired"], [404, "session_not_found"]] as const)
    await assert.rejects(renew(status, { error_code: errorCode, msg: "private detail" }), rejected("sign_in_required"));
  await assert.rejects(renew(429, { msg: "private detail" }), rejected("rate_limited"));
  await assert.rejects(renew(500, { msg: "private detail" }), rejected("account_unavailable"));
  await assert.rejects(renew(200, { access_token: "a.b.c", expires_in: 3600 }), rejected("account_unavailable"));
  await assert.rejects(renew(200, { access_token: "a.b.c", expires_in: 3600, refresh_token: "bad token" }), rejected("account_unavailable"));
  await assert.rejects(createSupabaseAccountProvider("https://synthetic.test", "synthetic", async () => { throw Error("private"); })
    .renew("first-refresh"), rejected("account_unavailable"));
});

test("a rate limit on the user check ends nothing and revokes nothing", async () => {
  const { handlers, provider, calls } = fixture();
  provider.authorize = async () => { throw new AccountError(429, "rate_limited"); };
  for (const cookies of [cookie(jwt(1800), "first-refresh"), cookie(jwt(10), "first-refresh")]) {
    calls.length = 0;
    const response = await handlers.GET(get(cookies));
    assert.equal(response.status, 429);
    assert.deepEqual(await response.json(), { error: "rate_limited" });
    assert.ok(!setCookies(response).some(value => value.includes("Max-Age=0")), "no cookie is cleared");
    assert.ok(!calls.some(call => call.startsWith("signOut")), "the session is not revoked");
  }
  const user429 = createSupabaseAccountProvider("https://synthetic.test", "synthetic",
    async () => Response.json({ msg: "private detail" }, { status: 429 }));
  await assert.rejects(user429.authorize("a.b.c"),
    (error) => error instanceof AccountError && error.status === 429 && error.code === "rate_limited");
});

/** A matching or project handler: echoes the access cookie and the body it was given. */
const echo = async (request: Request) => Response.json({ cookie: request.headers.get("cookie"), body: await request.text() });
const wrapped = (provider: AccountProvider, handler = echo) =>
  withRenewedSession(handler, () => ({ provider, secureCookies: true, now: () => now }));
const command = (cookies: string) => new Request("https://weave.test/api/matching", {
  method: "POST", headers: { origin: "https://weave.test", "content-type": "application/json", cookie: cookies },
  body: JSON.stringify({ action: "state" }),
});

test("matching and project calls renew a lapsed token first and pass the handler the renewed one", async () => {
  for (const access of [jwt(-30), undefined]) {
    const { provider, calls } = fixture();
    const response = await wrapped(provider)(command(`theme=dark; ${cookie(access, "first-refresh")}`));
    assert.equal(response.status, 200);
    const seen = await response.json() as { cookie: string; body: string };
    assert.equal(seen.cookie, `theme=dark; __Host-weave_account_renewal=${encoded("first-refresh")}; __Host-weave_account=${fresh}`);
    assert.equal(seen.body, JSON.stringify({ action: "state" }), "the command body reaches the handler intact");
    assert.deepEqual(calls, ["renew:first-refresh"]);
    assert.deepEqual(setCookies(response), renewedCookies);
  }
  // A handler response with immutable headers still carries the rotated cookies.
  const redirect = await wrapped(fixture().provider, async () => Response.redirect("https://weave.test/partners", 303))(
    command(cookie(undefined, "first-refresh")));
  assert.equal(redirect.status, 303);
  assert.deepEqual(setCookies(redirect), renewedCookies);
});

test("matching and project calls get 401 only when the session ended, and never on an outage", async () => {
  let handled = 0;
  const counting = async (request: Request) => { handled++; return echo(request); };
  const ended = fixture(async () => { throw new AccountError(401, "sign_in_required"); });
  const refused = await wrapped(ended.provider, counting)(command(cookie(jwt(-30), "reused-refresh")));
  assert.equal(refused.status, 401);
  assert.deepEqual(await refused.json(), { error: "sign_in_required" });
  assert.deepEqual(setCookies(refused), endedCookies);
  const offline = fixture(async () => { throw new AccountError(503, "account_unavailable"); });
  const unavailable = await wrapped(offline.provider, counting)(command(cookie(jwt(-30), "first-refresh")));
  assert.equal(unavailable.status, 503);
  assert.deepEqual(setCookies(unavailable), [], "an outage keeps the session for a retry");
  assert.equal(handled, 0, "neither reaches the handler");
  const stillValid = await wrapped(offline.provider, counting)(command(cookie(jwt(120), "first-refresh")));
  assert.equal(stillValid.status, 200);
  assert.equal(handled, 1, "a token that is still valid carries on through an outage");
});

test("calls with time left, without a renewal cookie or without accounts pass through untouched", async () => {
  const { provider, calls } = fixture();
  let received: Request | undefined;
  const capture = async (request: Request) => { received = request; return new Response(null, { status: 204 }); };
  for (const cookies of [cookie(jwt(1800), "first-refresh"), cookie(jwt(-30)), ""]) {
    const request = command(cookies);
    const response = await wrapped(provider, capture)(request);
    assert.equal(received, request);
    assert.deepEqual(setCookies(response), []);
  }
  const request = command(cookie(undefined, "first-refresh"));
  await withRenewedSession(capture, () => null)(request);
  assert.equal(received, request);
  assert.deepEqual(calls, []);
});

test("an account check and a matching call renewing together share one refresh and both stay signed in", async () => {
  let release: () => void = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  const { provider, calls } = fixture(async () => { await gate; return { token: fresh, expiresIn: 3600, refreshToken: "rotated-refresh" }; });
  const lapsed = cookie(jwt(-30), "shared-refresh");
  const account = createAccountHandlers({ provider, now: () => now }).GET(get(lapsed));
  const matching = wrapped(provider)(command(lapsed));
  release();
  const [checked, matched] = await Promise.all([account, matching]);
  assert.equal(checked.status, 200);
  assert.equal(matched.status, 200, "the matching call is not refused while the session renews");
  assert.deepEqual(calls.filter(call => call.startsWith("renew")), ["renew:shared-refresh"]);
  assert.deepEqual(setCookies(checked), renewedCookies);
  assert.deepEqual(setCookies(matched), renewedCookies);
});

/** A token Supabase issued for a session signed in `ago` seconds before the test clock, as its refresh grant returns. */
const issuedFor = (ago: number, extra: unknown[] = []) => {
  const payload = { exp: now / 1000 + 3600, amr: [...extra, { method: "oauth", timestamp: now / 1000 - ago }] };
  return `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.c2ln`;
};
const day = 24 * 60 * 60;

test("the original sign-in time is the earliest amr timestamp, and only numeric timestamps count", () => {
  assert.equal(signedInAt(issuedFor(5 * day, [{ method: "totp", timestamp: now / 1000 - day }])), now / 1000 - 5 * day);
  for (const amr of [undefined, ["oauth"], [{ method: "oauth" }], [{ method: "oauth", timestamp: "1700000000" }],
    [{ method: "oauth", timestamp: -1 }], [{ method: "oauth", timestamp: 1.5 }], "oauth"]) {
    const token = `a.${Buffer.from(JSON.stringify({ exp: 1, amr })).toString("base64url")}.c`;
    assert.equal(signedInAt(token), null, JSON.stringify(amr));
  }
  assert.equal(signedInAt("not-a-token"), null);
});

test("renewal at or past 30 days from sign-in ends the session and revokes it", async () => {
  for (const ago of [SESSION_CAP_SECONDS, SESSION_CAP_SECONDS + 1, SESSION_CAP_SECONDS + 10 * day]) {
    const capped = issuedFor(ago);
    const { handlers, provider, calls } = fixture(async () => ({ token: capped, expiresIn: 3600, refreshToken: "rotated-refresh" }));
    const revoked: string[] = [];
    provider.signOut = async (token) => { revoked.push(token); };
    const response = await handlers.GET(get(cookie(jwt(-10), "first-refresh")));
    assert.equal(response.status, 401, String(ago));
    assert.deepEqual(await response.json(), { error: "sign_in_required" });
    assert.deepEqual(setCookies(response), endedCookies);
    assert.deepEqual(revoked, [capped], "the session Supabase just renewed is revoked");
    assert.deepEqual(calls, ["renew:first-refresh"], "nothing private is read past the cap");
  }
});

test("renewal just under 30 days works, and neither cookie outlives the cap", async () => {
  const ago = SESSION_CAP_SECONDS - 2 * 60 * 60, token = issuedFor(ago);
  const { handlers, calls } = fixture(async () => ({ token, expiresIn: 3600, refreshToken: "rotated-refresh" }));
  const response = await handlers.GET(get(cookie(jwt(-10), "first-refresh")));
  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["renew:first-refresh", "authorize:old"]);
  assert.deepEqual(setCookies(response), [
    `__Host-weave_account=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=3600; Secure`,
    `__Host-weave_account_renewal=${encoded("rotated-refresh")}; Path=/; HttpOnly; SameSite=Strict; Max-Age=7200; Secure`,
  ]);
  const late = issuedFor(SESSION_CAP_SECONDS - 600);
  const lastHour = await fixture(async () => ({ token: late, expiresIn: 3600, refreshToken: "rotated-refresh" }))
    .handlers.GET(get(cookie(jwt(-10), "first-refresh")));
  assert.deepEqual(setCookies(lastHour).map(value => value.match(/Max-Age=\d+/)![0]), ["Max-Age=600", "Max-Age=600"]);
  const fresh = issuedFor(day);
  const early = await fixture(async () => ({ token: fresh, expiresIn: 3600, refreshToken: "rotated-refresh" }))
    .handlers.GET(get(cookie(jwt(-10), "first-refresh")));
  assert.deepEqual(setCookies(early).map(value => value.match(/Max-Age=\d+/)![0]), ["Max-Age=3600", "Max-Age=1209600"],
    "far from the cap the usual lifetimes apply");
});

test("a renewed token without amr timestamps is allowed; the idle limit still bounds it", async () => {
  // Failing closed here would sign everyone out hourly if Supabase ever stopped sending timestamps.
  const { handlers } = fixture();
  const response = await handlers.GET(get(cookie(jwt(-10), "first-refresh")));
  assert.equal(response.status, 200);
  assert.deepEqual(setCookies(response), renewedCookies);
});

test("the cap applies to matching and project calls, and concurrent renewals revoke once", async () => {
  const capped = issuedFor(SESSION_CAP_SECONDS + day);
  let release: () => void = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  const { provider } = fixture(async () => { await gate; return { token: capped, expiresIn: 3600, refreshToken: "rotated-refresh" }; });
  let revocations = 0, handled = 0;
  provider.signOut = async () => { revocations++; };
  const lapsed = cookie(jwt(-30), "shared-refresh");
  const account = createAccountHandlers({ provider, now: () => now }).GET(get(lapsed));
  const matching = wrapped(provider, async (request) => { handled++; return echo(request); })(command(lapsed));
  release();
  const [checked, matched] = await Promise.all([account, matching]);
  assert.equal(checked.status, 401);
  assert.equal(matched.status, 401);
  assert.deepEqual(setCookies(matched), endedCookies);
  assert.equal(handled, 0);
  assert.equal(revocations, 1);
});
