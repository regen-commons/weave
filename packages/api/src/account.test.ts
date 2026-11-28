import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { once } from "node:events";
import { createAccountHandlers, GET } from "./account.ts";
import { createSupabaseAccountProvider, createSupabaseWeaveRpc, AccountError, type AccountProvider } from "./account-provider.ts";
import { ASK_LIMIT, STORED_ASK_LIMIT, parseDocument, parseTeamSaved } from "./account-contract.ts";
const document = parseDocument(
  JSON.parse(readFileSync(new URL("./test-data/account.json", import.meta.url), "utf8")),
);
const user = { id: "b1000000-0000-4000-8000-000000000001", email: null };
const id = "b3000000-0000-4000-8000-000000000001",
  requestId = "b5000000-0000-4000-8000-000000000001";
const saved = { id, revision: 1, updatedAt: "2026-11-05T00:00:00Z", document };
function fixture() {
  const calls: string[] = [];
  const provider: AccountProvider = {
    signInUrl: () => "https://supabase.example.test/auth/v1/authorize",
    exchangeCode: async () => ({ token: "test.access.token", expiresIn: 3600, refreshToken: "test-refresh" }),
    renew: async () => { throw new Error("no renewal cookie was sent"); },
    authorize: async (token) => {
      assert.equal(token, "test.access.token");
      return user;
    },
    signOut: async () => { calls.push("signOut"); },
  };
  return { provider, calls, handlers: createAccountHandlers({ provider }) };
}
function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://weave.test/api/account", {
    method: "POST",
    headers: {
      origin: "https://weave.test",
      "content-type": "application/json",
      cookie: "__Host-weave_account=test.access.token",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

test("the account state uses the session, lists no saved cards, and email-code sign-in is unavailable", async () => {
  const { handlers } = fixture();
  assert.equal((await handlers.POST(post({ action: "request_code", email: "example@weave.test" }))).status, 400);
  assert.equal((await handlers.POST(post({ action: "verify_code", email: "example@weave.test", code: "12345678" }))).status, 400);
  const state = await handlers.GET(
    new Request("https://weave.test/api/account", {
      headers: { cookie: "__Host-weave_account=test.access.token" },
    }),
  );
  assert.equal(state.status, 200);
  const body = (await state.json()) as Record<string, unknown>;
  assert.deepEqual(Object.keys(body).sort(), ["available", "fixture", "renewIn", "signIn", "user"]);
  assert.deepEqual(body.user, user);
  const signedOut = await handlers.GET(new Request("https://weave.test/api/account"));
  assert.deepEqual(await signedOut.json(), { available: true, signIn: "certified", fixture: false, user: null });
});
test("writes reject cross-site, non-JSON and oversized bodies first, and saves and deletions are retired by name", async () => {
  const { handlers, calls } = fixture();
  const command = { action: "delete", id, requestId, expectedRevision: 1 };
  const save = { action: "save", accountId: user.id, id, requestId, expectedRevision: 0, document };
  for (const [body, headers, status] of [
    [command, { origin: "https://other.test" }, 403],
    [command, { "content-type": "text/plain" }, 415],
    [command, { cookie: "" }, 410],
    [{ ...command, expectedRevision: 0 }, {}, 410],
    [{ action: "request_code", email: "invalid" }, {}, 400],
    [{ action: "verify_code", email: user.email, code: "123456" }, {}, 400],
    [{ action: "nope" }, {}, 400],
    [{ ...command, padding: "x".repeat(65536) }, {}, 413],
    [save, { origin: "https://other.test" }, 403],
    [save, {}, 410],
    [{ ...save, document: { ...document, attachments: [] } }, {}, 410],
  ] as const)
    assert.equal((await handlers.POST(post(body, headers))).status, status);
  assert.deepEqual(await (await handlers.POST(post(save))).json(), { error: "private_saves_retired" });
  assert.deepEqual(await (await handlers.POST(post(command))).json(), { error: "private_saves_retired" });
  assert.equal(calls.length, 0, "nothing reached the provider");
});
test("revocation clears the cookie; unavailable providers and failed remote sign-out stay explicit", async () => {
  const { provider } = fixture();
  provider.authorize = async () => {
    throw new AccountError(401, "sign_in_required");
  };
  const handlers = createAccountHandlers({ provider });
  const expired = await handlers.GET(
    new Request("https://weave.test/api/account", { headers: { cookie: "__Host-weave_account=test.access.token" } }),
  );
  assert.equal(expired.status, 401);
  assert.match(expired.headers.get("set-cookie")!, /Max-Age=0/);
  provider.signOut = async () => {
    throw new AccountError(503, "sign_out_unconfirmed");
  };
  const logout = await handlers.POST(post({ action: "sign_out" }));
  assert.equal(logout.status, 503);
  assert.equal(logout.headers.get("set-cookie"), null);
  assert.deepEqual(await logout.json(), { error: "sign_out_unconfirmed" });
  assert.deepEqual(
    await (
      await createAccountHandlers({ provider: null }).GET(new Request("https://weave.test/api/account"))
    ).json(),
    { available: false },
  );
  const enabled = process.env.WEAVE_ACCOUNTS_ENABLED;
  try {
    process.env.WEAVE_ACCOUNTS_ENABLED = "false";
    assert.deepEqual(await (await GET(new Request("https://weave.test/api/account"))).json(), {
      available: false,
    });
  } finally {
    if (enabled === undefined) delete process.env.WEAVE_ACCOUNTS_ENABLED;
    else process.env.WEAVE_ACCOUNTS_ENABLED = enabled;
  }
  provider.authorize = async () => {
    throw new Error("private provider detail");
  };
  assert.deepEqual(
    await (
      await handlers.GET(
        new Request("https://weave.test/api/account", {
          headers: { cookie: "__Host-weave_account=test.access.token" },
        }),
      )
    ).json(),
    { error: "account_unavailable" },
  );
});
test("native HTTP adapter sends Auth and schema RPC requests with the person's token; provider errors are sanitized", async (t) => {
  const seen: { url: string; headers: Record<string, string | string[] | undefined>; body: unknown }[] = [];
  let fail = false;
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const raw = Buffer.concat(chunks).toString();
    seen.push({ url: req.url!, headers: req.headers, body: raw ? JSON.parse(raw) : null });
    res.setHeader("content-type", "application/json");
    if (fail) {
      res.statusCode = 409;
      res.end(JSON.stringify({ code: "PT409", message: "private database detail" }));
      return;
    }
    res.end(
      JSON.stringify(
        req.url === "/auth/v1/token?grant_type=pkce"
          ? { access_token: "test.access.token", refresh_token: "synthetic-refresh-1", expires_in: 7200 }
          : req.url === "/auth/v1/token?grant_type=refresh_token"
            ? { access_token: "renewed.access.token", refresh_token: "synthetic-refresh-2", expires_in: 3600 }
          : req.url === "/auth/v1/user"
            ? user
            : req.url === "/rest/v1/rpc/account_access"
              ? true
              : {},
      ),
    );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(
    () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  );
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const provider = createSupabaseAccountProvider(
    `http://127.0.0.1:${address.port}`,
    "sb_publishable_synthetic",
  );
  const target = new URL(provider.signInUrl("synthetic-challenge", "https://weave.test/api/sign-in?state=synthetic"));
  assert.equal(target.searchParams.get("provider"), "custom:certified");
  assert.equal(target.searchParams.get("code_challenge_method"), "s256");
  assert.deepEqual(await provider.exchangeCode("synthetic-code", "synthetic-verifier"),
    { token: "test.access.token", expiresIn: 3600, refreshToken: "synthetic-refresh-1" });
  assert.deepEqual(seen[0]!.body, { auth_code: "synthetic-code", code_verifier: "synthetic-verifier" });
  assert.deepEqual(await provider.renew("synthetic-refresh-1"),
    { token: "renewed.access.token", expiresIn: 3600, refreshToken: "synthetic-refresh-2" });
  assert.deepEqual(seen[1]!.body, { refresh_token: "synthetic-refresh-1" });
  assert.equal(seen[1]!.headers.authorization, undefined, "renewal sends only the refresh token and the publishable key");
  assert.deepEqual(await provider.authorize("test.access.token"), user);
  await provider.signOut("test.access.token");
  for (const item of seen) {
    assert.equal(item.headers.apikey, "sb_publishable_synthetic");
    if (item.url.startsWith("/rest/")) {
      assert.equal(item.headers.authorization, "Bearer test.access.token");
      assert.equal(item.headers["content-profile"], "weave");
      assert.equal(item.headers["accept-profile"], "weave");
    }
  }
  fail = true;
  await assert.rejects(
    createSupabaseWeaveRpc(`http://127.0.0.1:${address.port}`, "sb_publishable_synthetic")("synthetic_command", {}, "test.access.token"),
    (error) =>
      error instanceof AccountError && error.code === "save_conflict" && error.message === "save_conflict",
  );
});
test("timeouts, corrupt successful responses and exchange throttling do not leak provider content", async () => {
  const offline = createSupabaseAccountProvider("https://synthetic.test", "synthetic", async () => {
    throw new Error("private error");
  });
  await assert.rejects(offline.exchangeCode("synthetic", "verifier"), /account_unavailable/);
  const corrupt = createSupabaseAccountProvider(
    "https://synthetic.test",
    "synthetic",
    async () => new Response("{}"),
  );
  await assert.rejects(corrupt.exchangeCode("synthetic", "verifier"), /account_unavailable/);
  const throttled = createSupabaseAccountProvider(
    "https://synthetic.test",
    "synthetic",
    async () => new Response(JSON.stringify({ message: "private detail" }), { status: 429 }),
  );
  await assert.rejects(
    throttled.exchangeCode("synthetic", "verifier"),
    (error) => error instanceof AccountError && error.status === 429 && error.code === "rate_limited",
  );
});
test("only Supabase's expired-flow code reports an expired sign-in; its message is never kept", async () => {
  const exchange = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    createSupabaseAccountProvider("https://synthetic.test", "synthetic", async () =>
      new Response(JSON.stringify(body), { status, headers })).exchangeCode("synthetic", "verifier");
  const rejected = (code: string) => (error: unknown) =>
    error instanceof AccountError && error.code === code && !JSON.stringify(error).includes("private") && !error.message.includes("private");
  const detail = "private provider detail";
  // Supabase's initial API version sends the code in the body; every version sends the header.
  await assert.rejects(exchange(422, { code: 422, error_code: "flow_state_expired", msg: detail }), rejected("sign_in_expired"));
  await assert.rejects(exchange(422, { code: "flow_state_expired", message: detail }, { "x-sb-error-code": "flow_state_expired" }),
    rejected("sign_in_expired"));
  await assert.rejects(exchange(404, { code: 404, error_code: "flow_state_not_found", msg: detail }), rejected("sign_in_failed"));
  await assert.rejects(exchange(422, { code: 422, error_code: "validation_failed", msg: detail }), rejected("sign_in_failed"));
  await assert.rejects(exchange(500, { code: 500, error_code: "flow_state_expired", msg: detail }), rejected("account_unavailable"));
});

test("a private save is refused by name whichever account the cookie names, and the provider is never reached", async () => {
  const { provider } = fixture();
  provider.authorize = async () => ({ ...user, id: "b1000000-0000-4000-8000-000000000002" });
  const reached: string[] = [];
  const watched = new Proxy(provider, { get(target, key, receiver) {
    reached.push(String(key));
    return Reflect.get(target, key, receiver);
  } });
  const handlers = createAccountHandlers({ provider: watched });
  reached.length = 0;
  const result = await handlers.POST(post({ action: "save", accountId: user.id, id, requestId, expectedRevision: 0, document }));
  assert.equal(result.status, 410);
  assert.deepEqual(await result.json(), { error: "private_saves_retired" });
  assert.deepEqual(reached, [], "no session check, no read and no write");
});

test("a team draft with an unclassified entry still loads", () => {
  const draft = structuredClone(document);
  const need = draft.needs[0];
  assert.ok(need);
  need.value.capitalForms = [];
  need.value.amount = null;
  const receipt = { ...saved, document: parseDocument(draft) };
  assert.deepEqual(parseTeamSaved(receipt), receipt);
});

test("a card saved under the earlier limits stays readable: five needs, five offers, six links and long answers", async () => {
  assert.equal(ASK_LIMIT, 4);
  assert.equal(STORED_ASK_LIMIT, 5);
  const need = document.needs[0];
  assert.ok(need);
  const many = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
      id: `b7000000-0000-4000-8000-00000000000${index}`,
      value: { ...need.value, title: `Synthetic entry ${index}`, description: "d".repeat(600) },
    }));
  const links = Array.from({ length: 6 }, (_, index) => `https://example.test/page-${index}`);
  const older = {
    ...document,
    initiative: { ...document.initiative, links, description: "a".repeat(800) },
    needs: many(5),
    offers: many(5),
  };
  const checked = parseDocument(older);
  assert.equal(checked.needs.length, 5);
  assert.equal(checked.offers.length, 5);
  assert.deepEqual(checked.initiative.links, links);
  // A saved card read back keeps parsing, so it still opens on a device and downloads.
  // One past the stored limit is refused, for lists and for links.
  assert.throws(() => parseDocument({ ...older, needs: many(6) }), /invalid_data/u);
  assert.throws(() => parseDocument({ ...older, offers: many(6) }), /invalid_data/u);
  assert.throws(
    () => parseDocument({ ...older, initiative: { ...older.initiative, links: [...links, "https://example.test/page-6"] } }),
    /invalid_data/u,
  );
});

test("a saved card carries any type of work the app offers, learning included, and nothing else", () => {
  const withLenses = (lenses: unknown) => parseDocument({ ...document, initiative: { ...document.initiative, lenses } });
  assert.deepEqual(withLenses(["learning", "place_based"]).initiative.lenses, ["learning", "place_based"]);
  assert.throws(() => withLenses(["schools"]), /invalid_data/);
});

test("a deletion is refused by name before the session is read, after the origin, JSON and size checks", async () => {
  const { handlers, calls } = fixture();
  const command = { action: "delete", id, expectedRevision: 3, requestId };
  for (const [body, headers, status, error] of [
    [command, { origin: "https://other.test" }, 403, "origin_required"],
    [command, { "content-type": "text/plain" }, 415, "json_required"],
    [{ ...command, padding: "x".repeat(65536) }, {}, 413, "request_too_large"],
    [command, { cookie: "" }, 410, "private_saves_retired"],
    [command, {}, 410, "private_saves_retired"],
    [{ action: "delete", id: "not-a-uuid" }, {}, 410, "private_saves_retired"],
  ] as const) {
    const result = await handlers.POST(post(body, headers));
    assert.equal(result.status, status, JSON.stringify(body).slice(0, 80));
    assert.deepEqual(await result.json(), { error });
    assert.equal(result.headers.get("set-cookie"), null, "a refusal never touches the session");
  }
  assert.deepEqual(calls, []);
});

test("a Weave RPC uses the person's token and maps only known database reasons", async () => {
  const replies: { status: number; body: unknown }[] = [];
  const seen: { url: string; authorization: string | null; profile: string | null; body: unknown }[] = [];
  const rpc = createSupabaseWeaveRpc("https://db.example.test", "sb_publishable_synthetic", async (url, init) => {
    const headers = new Headers(init?.headers);
    seen.push({ url: String(url), authorization: headers.get("authorization"), profile: headers.get("content-profile"),
      body: JSON.parse(String(init?.body)) });
    const reply = replies.shift()!;
    return Response.json(reply.body, { status: reply.status });
  });
  replies.push({ status: 200, body: { ok: true } });
  assert.deepEqual(await rpc("synthetic_command", { p_id: id }, "test.access.token"), { ok: true });
  assert.deepEqual(seen[0], { url: "https://db.example.test/rest/v1/rpc/synthetic_command", authorization: "Bearer test.access.token",
    profile: "weave", body: { p_id: id } });
  for (const [body, status, code] of [
    [{ code: "PT409", message: "initiative_deleted", details: "private detail" }, 409, "initiative_deleted"],
    [{ code: "PT409", message: "initiative_referenced" }, 409, "save_conflict"],
    [{ code: "PT409", message: "revision_conflict" }, 409, "save_conflict"],
    [{ code: "PT409", message: "something private" }, 409, "save_conflict"],
    [{ code: "PT404", message: "not_found" }, 404, "not_found"],
    [{ code: "PT401", message: "sign_in_required" }, 401, "sign_in_required"],
    [{ code: "PT400", message: "invalid_data" }, 400, "invalid_data"],
    [{ code: "42501", message: "permission denied for table initiatives" }, 403, "account_unavailable"],
  ] as const) {
    replies.push({ status, body });
    await assert.rejects(rpc("synthetic_command", {}, "test.access.token"),
      (error) => error instanceof AccountError && error.code === code && !error.message.includes("private"));
  }
});

test("the session's two checks run together, and the user's answer is still judged first", async () => {
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  // Each reply is released by hand, so the order they were asked in is the order the adapter chose.
  function adapter(replies: { user: () => Response; access: () => Response }) {
    const asked: string[] = [];
    const provider = createSupabaseAccountProvider("https://db.example.test", "sb_publishable_synthetic", async url => {
      const path = new URL(String(url)).pathname;
      asked.push(path);
      await new Promise(resolve => setImmediate(resolve));
      return path === "/auth/v1/user" ? replies.user() : replies.access();
    });
    return { provider, asked };
  }
  const refused = (status: number, code: string) => (error: unknown) => error instanceof AccountError && error.status === status && error.code === code;
  const both = adapter({ user: () => json(200, user), access: () => json(200, true) });
  const pending = both.provider.authorize("test.access.token");
  assert.deepEqual([...both.asked].sort(), ["/auth/v1/user", "/rest/v1/rpc/account_access"], "neither check waits for the other");
  assert.deepEqual(await pending, user);

  // The user's answer decides first, whatever the database predicate says.
  await assert.rejects(adapter({ user: () => json(401, {}), access: () => json(200, true) }).provider.authorize("t.t.t"), refused(401, "sign_in_required"));
  await assert.rejects(adapter({ user: () => json(429, {}), access: () => json(401, { code: "PT401" }) }).provider.authorize("t.t.t"),
    refused(429, "rate_limited"), "a rate limit is not turned into a refusal by the other check");
  await assert.rejects(adapter({ user: () => json(503, {}), access: () => json(200, false) }).provider.authorize("t.t.t"), refused(503, "account_unavailable"));
  await assert.rejects(adapter({ user: () => json(200, { id: "not-a-user" }), access: () => json(200, true) }).provider.authorize("t.t.t"),
    refused(503, "account_unavailable"));
  // Then the database predicate: only an exact true admits.
  await assert.rejects(adapter({ user: () => json(200, user), access: () => json(200, false) }).provider.authorize("t.t.t"), refused(401, "sign_in_required"));
  await assert.rejects(adapter({ user: () => json(200, user), access: () => json(200, null) }).provider.authorize("t.t.t"), refused(401, "sign_in_required"));
  await assert.rejects(adapter({ user: () => json(200, user), access: () => json(401, { code: "PT401" }) }).provider.authorize("t.t.t"), refused(401, "sign_in_required"));
  await assert.rejects(adapter({ user: () => json(200, user), access: () => json(500, {}) }).provider.authorize("t.t.t"), refused(503, "account_unavailable"));
  await assert.rejects(adapter({ user: () => json(200, user), access: () => json(429, { code: "PT429" }) }).provider.authorize("t.t.t"), refused(429, "rate_limited"));
});

test("the account state waits for the authorization, a refused session is ended, and no card opens by its ID", async () => {
  const get = (search = "") => new Request(`https://weave.test/api/account${search}`, { headers: { cookie: "__Host-weave_account=test.access.token" } });
  function handlers(authorize: () => Promise<typeof user>) {
    const order: string[] = [];
    let revoked = 0;
    const { provider } = fixture();
    const made = createAccountHandlers({ provider: { ...provider,
      authorize: async () => { order.push("authorize"); const result = await authorize(); order.push("authorized"); return result; },
      signOut: async () => { revoked++; } } });
    return { made, order, revoked: () => revoked };
  }
  const both = handlers(async () => user);
  const ok = await both.made.GET(get());
  assert.equal(ok.status, 200);
  assert.deepEqual(both.order, ["authorize", "authorized"]);

  // A refused session gets the refusal alone, with its cookies cleared.
  const refusedSession = handlers(async () => { throw new AccountError(401, "sign_in_required"); });
  const refused = await refusedSession.made.GET(get());
  assert.equal(refused.status, 401);
  assert.deepEqual(await refused.json(), { error: "sign_in_required" });
  assert.equal(refused.headers.getSetCookie().filter(cookie => /Max-Age=0/u.test(cookie)).length, 2);
  assert.equal(refusedSession.revoked(), 0, "a browser with no renewal cookie has nothing more to revoke");
  // One that could still renew is revoked at Supabase too.
  const revokedOrder: string[] = [];
  const future = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3000 })).toString("base64url");
  const stillValid = `synthetic.${future}.signature`;
  const refusedRenewable = await createAccountHandlers({ provider: { ...fixture().provider,
    authorize: async () => { throw new AccountError(401, "sign_in_required"); },
    signOut: async token => { assert.equal(token, stillValid); revokedOrder.push("revoked"); } } })
    .GET(new Request("https://weave.test/api/account", { headers: {
      cookie: `__Host-weave_account=${stillValid}; __Host-weave_account_renewal=${Buffer.from("synthetic-refresh").toString("base64url")}` } }));
  assert.equal(refusedRenewable.status, 401);
  assert.deepEqual(revokedOrder, ["revoked"], "the rejected session is revoked once");
  const unavailable = await handlers(async () => { throw new AccountError(503, "account_unavailable"); }).made.GET(get());
  assert.equal(unavailable.status, 503);
  assert.equal(unavailable.headers.getSetCookie().length, 0, "an outage never clears a session");
  const throttled = await handlers(async () => { throw new AccountError(429, "rate_limited"); }).made.GET(get());
  assert.deepEqual([throttled.status, await throttled.json()], [429, { error: "rate_limited" }]);
  // An earlier saved card no longer opens, signed in or not, and the session is never read for it.
  for (const request of [get(`?id=${id}`), get("?id=x"), new Request(`https://weave.test/api/account?id=${id}`)]) {
    const load = handlers(async () => user);
    const result = await load.made.GET(request);
    assert.deepEqual([result.status, await result.json()], [410, { error: "private_saves_retired" }]);
    assert.deepEqual(load.order, []);
    assert.equal(result.headers.getSetCookie().length, 0);
  }
  // A page offset is no longer read.
  assert.equal((await handlers(async () => user).made.GET(get("?offset=x"))).status, 200);
});

test("sign-out lets go of what ends with the session first, and nothing there can stop or fail it", async () => {
  const signOutRequest = (cookie = "__Host-weave_account=test.access.token") => post({ action: "sign_out" }, { cookie });
  function handlers(onSignOut: (request: Request) => Promise<unknown>, signOut: () => Promise<void> = async () => {}) {
    const order: string[] = [];
    const made = createAccountHandlers({ provider: { ...fixture().provider, signOut: async () => { order.push("revoked"); await signOut(); } },
      onSignOut: async request => { order.push("cleanup"); return onSignOut(request); }, signOutWait: 30 });
    return { made, order };
  }
  // It runs before the session is revoked, on a request that carries the session and nothing of the sign-out's body.
  let seen: Request | undefined;
  const ok = handlers(async request => { seen = request; });
  const done = await ok.made.POST(signOutRequest());
  assert.deepEqual([done.status, await done.json()], [200, { signedOut: true }]);
  assert.deepEqual(ok.order, ["cleanup", "revoked"]);
  assert.equal(seen!.method, "GET");
  assert.equal(seen!.headers.get("cookie"), "__Host-weave_account=test.access.token");
  assert.equal(done.headers.getSetCookie().filter(cookie => /Max-Age=0/u.test(cookie)).length, 3, "every session cookie is cleared");

  // It throws, rejects or never answers: the session is revoked and the person is signed out all the same.
  for (const cleanup of [async () => { throw new Error("project store unreachable"); }, () => Promise.reject(new AccountError(503, "project_workspace_unavailable")),
    () => new Promise<never>(() => {}), () => { throw new Error("broke before it began"); }] as (() => Promise<unknown>)[]) {
    const failing = handlers(cleanup);
    const result = await failing.made.POST(signOutRequest());
    assert.deepEqual([result.status, await result.json()], [200, { signedOut: true }]);
    assert.deepEqual(failing.order, ["cleanup", "revoked"]);
  }
  // Nobody is signed in, or the session has already ended: there is nothing to find, so nothing is asked.
  const signedOut = handlers(async () => {});
  assert.equal((await signedOut.made.POST(post({ action: "sign_out" }, { cookie: "" }))).status, 200);
  assert.deepEqual(signedOut.order, []);
  // A sign-out Supabase could not confirm is still reported as unconfirmed.
  const unconfirmed = handlers(async () => {}, async () => { throw new AccountError(503, "sign_out_unconfirmed"); });
  const kept = await unconfirmed.made.POST(signOutRequest());
  assert.deepEqual([kept.status, await kept.json()], [503, { error: "sign_out_unconfirmed" }]);
  assert.deepEqual(unconfirmed.order, ["cleanup", "revoked"]);
  // Save and delete never run it.
  const other = handlers(async () => {});
  await other.made.POST(post({ action: "delete", id, expectedRevision: 1, requestId }));
  assert.deepEqual(other.order, []);
});
