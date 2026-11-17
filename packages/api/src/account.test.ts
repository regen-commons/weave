import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { once } from "node:events";
import { createAccountHandlers, GET } from "./account.ts";
import { createSupabaseAccountProvider, AccountError, type AccountProvider } from "./account-provider.ts";
import { parseDocument, parseSaved, parseSavedAsk } from "./account-contract.ts";
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
    exchangeCode: async () => ({ token: "test.access.token", expiresIn: 3600 }),
    authorize: async (token) => {
      assert.equal(token, "test.access.token");
      return user;
    },
    signOut: async () => {},
    list: async () => [{ id, revision: 1, name: "Synthetic initiative", updatedAt: saved.updatedAt }],
    load: async () => saved,
    save: async (_token, command) => ({ ...saved, document: command.document }),
    deleteInitiative: async (_token, command) => {
      calls.push(`delete:${command.id}:${command.expectedRevision}:${command.requestId}`);
      return { id: command.id, deleted: true, revision: command.expectedRevision, removed: [command.id], kept: 2 };
    },
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

test("private account reads use the session and email-code sign-in is unavailable", async () => {
  const { handlers } = fixture();
  assert.equal((await handlers.POST(post({ action: "request_code", email: "example@weave.test" }))).status, 400);
  assert.equal((await handlers.POST(post({ action: "verify_code", email: "example@weave.test", code: "12345678" }))).status, 400);
  const list = await handlers.GET(
    new Request("https://weave.test/api/account", {
      headers: { cookie: "__Host-weave_account=test.access.token" },
    }),
  );
  assert.equal(list.status, 200);
  const listed = (await list.json()) as { items: unknown[] };
  assert.equal(listed.items.length, 1);
});
test("writes reject cross-site, oversized, missing-session and invalid unchecked data", async () => {
  const { handlers } = fixture();
  const command = { action: "save", accountId: user.id, id, requestId, expectedRevision: 0, document };
  for (const [body, headers, status] of [
    [command, { origin: "https://other.test" }, 403],
    [command, { "content-type": "text/plain" }, 415],
    [command, { cookie: "" }, 401],
    [{ ...command, document: { ...document, attachments: [] } }, {}, 400],
    [{ ...command, expectedRevision: -1 }, {}, 400],
    [{ ...command, expectedRevision: 2147483647 }, {}, 400],
    [{ action: "request_code", email: "invalid" }, {}, 400],
    [{ action: "verify_code", email: user.email, code: "123456" }, {}, 400],
    [{ action: "nope" }, {}, 400],
    [{ ...command, padding: "x".repeat(65536) }, {}, 413],
  ] as const)
    assert.equal((await handlers.POST(post(body, headers))).status, status);
  assert.equal((await handlers.POST(post(command))).status, 200);
  const duplicateCookie = await handlers.POST(
    post(command, {
      cookie: "__Host-weave_account=test.access.token; __Host-weave_account=other.access.token",
    }),
  );
  assert.equal(duplicateCookie.status, 401);
});
test("revocation clears the cookie; unavailable providers and failed remote sign-out stay explicit", async () => {
  const { provider } = fixture();
  provider.authorize = async () => {
    throw new AccountError(401, "sign_in_required");
  };
  const handlers = createAccountHandlers({ provider });
  const expired = await handlers.POST(
    post({ action: "save", accountId: user.id, id, requestId, expectedRevision: 0, document }),
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
          ? { access_token: "test.access.token", refresh_token: "never-return-this", expires_in: 7200 }
          : req.url === "/auth/v1/user"
            ? user
            : req.url === "/rest/v1/rpc/account_access"
              ? true
              : req.url === "/rest/v1/rpc/list_initiatives"
                ? []
                : req.url === "/rest/v1/rpc/save_initiative" || req.url === "/rest/v1/rpc/load_initiative"
                  ? saved
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
  assert.deepEqual(await provider.exchangeCode("synthetic-code", "synthetic-verifier"), { token: "test.access.token", expiresIn: 3600 });
  assert.deepEqual(seen[0]!.body, { auth_code: "synthetic-code", code_verifier: "synthetic-verifier" });
  assert.deepEqual(await provider.authorize("test.access.token"), user);
  await provider.list("test.access.token", 0);
  assert.deepEqual(await provider.load("test.access.token", id), saved);
  await provider.save("test.access.token", { id, requestId, expectedRevision: 0, document });
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
    provider.save("test.access.token", { id, requestId, expectedRevision: 1, document }),
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

test("a cookie changed by another tab cannot save under a different account", async () => {
  const { provider } = fixture();
  let writes = 0;
  provider.authorize = async () => ({ ...user, id: "b1000000-0000-4000-8000-000000000002" });
  provider.save = async () => {
    writes++;
    return saved;
  };
  const result = await createAccountHandlers({ provider }).POST(
    post({ action: "save", accountId: user.id, id, requestId, expectedRevision: 0, document }),
  );
  assert.equal(result.status, 409);
  assert.deepEqual(await result.json(), { error: "account_changed" });
  assert.equal(writes, 0);
});

test("private save and load round-trip unclassified entries while matching still requires classification", async () => {
  const draft = structuredClone(document);
  const need = draft.needs[0];
  assert.ok(need);
  need.value.capitalForms = [];
  need.value.amount = null;
  const checked = parseDocument(draft);
  const receipt = { ...saved, document: checked };
  const calls: string[] = [];
  const provider = createSupabaseAccountProvider("https://db.example.test", "publishable-fixture", async url => {
    calls.push(String(url).split("/").pop()!);
    return Response.json(receipt);
  });
  assert.deepEqual(await provider.save("fixture.token", { id, expectedRevision: 0, requestId, document: checked }), receipt);
  assert.deepEqual(await provider.load("fixture.token", id), receipt);
  // The browser parses the same receipt after the server's provider boundary.
  assert.deepEqual(parseSaved(receipt), receipt);
  assert.deepEqual(calls, ["save_initiative", "load_initiative"]);
  assert.throws(() => parseSavedAsk(need), /invalid_data/u);
});

test("a saved card carries any type of work the app offers, learning included, and nothing else", () => {
  const withLenses = (lenses: unknown) => parseDocument({ ...document, initiative: { ...document.initiative, lenses } });
  assert.deepEqual(withLenses(["learning", "place_based"]).initiative.lenses, ["learning", "place_based"]);
  assert.throws(() => withLenses(["schools"]), /invalid_data/);
});

test("delete removes one exact saved card through the provider and reports what was removed and kept", async () => {
  const { handlers, calls } = fixture();
  const command = { action: "delete", id, expectedRevision: 3, requestId };
  const result = await handlers.POST(post(command));
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { deleted: { id, deleted: true, revision: 3, removed: [id], kept: 2 } });
  assert.deepEqual(calls, [`delete:${id}:3:${requestId}`]);
});

test("delete rejects cross-site, non-JSON, oversized, signed-out and malformed commands before the provider", async () => {
  const { handlers, calls } = fixture();
  const command = { action: "delete", id, expectedRevision: 3, requestId };
  for (const [body, headers, status, error] of [
    [command, { origin: "https://other.test" }, 403, "origin_required"],
    [command, { "content-type": "text/plain" }, 415, "json_required"],
    [command, { cookie: "" }, 401, "sign_in_required"],
    [{ ...command, padding: "x".repeat(65536) }, {}, 413, "request_too_large"],
    [{ ...command, accountId: user.id }, {}, 400, "invalid_data"],
    [{ action: "delete", id, expectedRevision: 3 }, {}, 400, "invalid_data"],
    [{ action: "delete", id, requestId }, {}, 400, "invalid_data"],
    [{ ...command, id: "not-a-uuid" }, {}, 400, "invalid_data"],
    [{ ...command, requestId: "x" }, {}, 400, "invalid_data"],
    [{ ...command, expectedRevision: 0 }, {}, 400, "invalid_data"],
    [{ ...command, expectedRevision: 1.5 }, {}, 400, "invalid_data"],
    [{ ...command, expectedRevision: "3" }, {}, 400, "invalid_data"],
    [{ ...command, expectedRevision: 2147483647 }, {}, 400, "invalid_data"],
  ] as const) {
    const result = await handlers.POST(post(body, headers));
    assert.equal(result.status, status, JSON.stringify(body).slice(0, 80));
    assert.deepEqual(await result.json(), { error });
  }
  assert.deepEqual(calls, []);
});

test("delete failures keep stable codes, clear an ended session and never echo the provider", async () => {
  const command = { action: "delete", id, expectedRevision: 3, requestId };
  for (const [failure, status, code] of [
    [new AccountError(401, "sign_in_required"), 401, "sign_in_required"],
    [new AccountError(404, "not_found"), 404, "not_found"],
    [new AccountError(409, "save_conflict"), 409, "save_conflict"],
    [new AccountError(409, "initiative_referenced"), 409, "initiative_referenced"],
    [new Error("private provider detail"), 503, "account_unavailable"],
  ] as const) {
    const { provider } = fixture();
    provider.deleteInitiative = async () => { throw failure; };
    const result = await createAccountHandlers({ provider }).POST(post(command));
    assert.equal(result.status, status);
    assert.deepEqual(await result.json(), { error: code });
    assert.equal(/Max-Age=0/.test(result.headers.get("set-cookie") ?? ""), status === 401);
  }
  const { provider } = fixture();
  provider.authorize = async () => { throw new AccountError(401, "sign_in_required"); };
  let removed = 0;
  provider.deleteInitiative = async () => { removed++; throw new Error("unreachable"); };
  assert.equal((await createAccountHandlers({ provider }).POST(post(command))).status, 401);
  assert.equal(removed, 0, "an expired session never reaches the delete command");
  const other = fixture().provider;
  other.deleteInitiative = async () => ({ id: "b3000000-0000-4000-8000-000000000009", deleted: true, revision: 3,
    removed: ["b3000000-0000-4000-8000-000000000009"], kept: 0 });
  const mismatch = await createAccountHandlers({ provider: other }).POST(post(command));
  assert.equal(mismatch.status, 503, "a result for another card is not reported as this deletion");
});

test("the delete RPC uses the person's token and maps only known database reasons", async () => {
  const replies: { status: number; body: unknown }[] = [];
  const seen: { url: string; authorization: string | null; profile: string | null; body: unknown }[] = [];
  const provider = createSupabaseAccountProvider("https://db.example.test", "sb_publishable_synthetic", async (url, init) => {
    const headers = new Headers(init?.headers);
    seen.push({ url: String(url), authorization: headers.get("authorization"), profile: headers.get("content-profile"),
      body: JSON.parse(String(init?.body)) });
    const reply = replies.shift()!;
    return Response.json(reply.body, { status: reply.status });
  });
  const command = { id, expectedRevision: 3, requestId };
  replies.push({ status: 200, body: { id, deleted: true, revision: 3, removed: [id], kept: 4 } });
  assert.deepEqual(await provider.deleteInitiative("test.access.token", command), { id, deleted: true, revision: 3, removed: [id], kept: 4 });
  assert.deepEqual(seen[0], { url: "https://db.example.test/rest/v1/rpc/delete_initiative", authorization: "Bearer test.access.token",
    profile: "weave", body: { p_id: id, p_expected_revision: 3, p_request_id: requestId } });
  for (const [body, status, code] of [
    [{ code: "PT409", message: "initiative_referenced", details: "private detail" }, 409, "initiative_referenced"],
    [{ code: "PT409", message: "initiative_deleted" }, 409, "initiative_deleted"],
    [{ code: "PT409", message: "revision_conflict" }, 409, "save_conflict"],
    [{ code: "PT409", message: "something private" }, 409, "save_conflict"],
    [{ code: "PT404", message: "not_found" }, 404, "not_found"],
    [{ code: "PT401", message: "sign_in_required" }, 401, "sign_in_required"],
    [{ code: "PT400", message: "invalid_data" }, 400, "invalid_data"],
    [{ code: "42501", message: "permission denied for table initiatives" }, 403, "account_unavailable"],
  ] as const) {
    replies.push({ status, body });
    await assert.rejects(provider.deleteInitiative("test.access.token", command),
      (error) => error instanceof AccountError && error.code === code && !error.message.includes("private"));
  }
  for (const body of [{ id, deleted: false, revision: 3, removed: [id], kept: 0 }, { id, deleted: true, revision: 3, removed: [], kept: 0 },
    { id, deleted: true, revision: 3, removed: [id], kept: -1 }, { id, deleted: true, revision: 3, removed: [id], kept: 0, extra: 1 }]) {
    replies.push({ status: 200, body });
    await assert.rejects(provider.deleteInitiative("test.access.token", command), /account_unavailable/);
  }
});
