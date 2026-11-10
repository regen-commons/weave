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
