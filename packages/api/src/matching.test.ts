import assert from "node:assert/strict";
import { test } from "node:test";
import { parseDocument } from "./account-contract.ts";
import { createSupabaseWeaveRpc } from "./account-provider.ts";
import { parseMatchingCommand } from "./matching-contract.ts";
import { createMatchingProvider } from "./matching-provider.ts";
import { createMatchingHandlers } from "./matching.ts";
import sample from "./test-data/account.json" with { type: "json" };

const owner = "10000000-0000-4000-8000-000000000001";
const needId = "20000000-0000-4000-8000-000000000001";
const ref = { kind: "need", entryId: needId, revision: 3, shareVersion: 8 } as const;
const origin = "https://weave.example.test";
const token = "fixture.token.signature";
const request = (body: unknown, headers: Record<string, string> = {}) => new Request(`${origin}/api/matching`, {
  method: "POST",
  headers: { origin, "content-type": "application/json", cookie: `__Host-weave_account=${token}`, ...headers },
  body: JSON.stringify(body),
});
const projectUri = "at://did:plc:synthetic/org.hypercerts.collection/example";

test("rejects foreign origins, missing sessions and injected draft text before RPC", async () => {
  const provider = createMatchingProvider(async () => assert.fail("request must not reach the database"));
  const { POST } = createMatchingHandlers({ provider, origin });
  // A retired action meets every check before its refusal by name, so no origin can probe for it signed out.
  for (const command of [{ action: "state", initiativeId: owner }, { action: "listing_search", initiativeId: owner },
    { action: "share", initiativeId: owner }]) {
    const attempts = [
      [request(command, { origin: "https://elsewhere.example.test" }), 403],
      [request(command, { cookie: "" }), 401],
      ...(command.action === "share" ? [] : [
        [request({ ...command, query: "private unshared note" }), 400],
        [request({ ...command, entries: [ref] }), 400],
        [request({ ...command, initiativeId: "not-an-id" }), 400],
      ] as const),
      [request(command, { "content-type": "text/plain" }), 415],
      [request(command, { "content-length": "65537" }), 413],
    ] as const;
    for (const [input, expected] of attempts) {
      const response = await POST(input);
      assert.equal(response.status, expected, `${command.action} ${expected}`);
      assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    }
  }
});

test("the provider reads team state through its narrow RPC and never returns database error details", async () => {
  const calls: { rpc: string; body: unknown }[] = [];
  const rpc = createSupabaseWeaveRpc("https://db.example.test", "publishable-fixture", async (url, init) => {
    calls.push({ rpc: String(url).split("/").pop()!, body: JSON.parse(String(init?.body)) });
    return Response.json({ code: "PT409", message: "private-provider-details" }, { status: 409 });
  });
  await assert.rejects(createMatchingProvider(rpc).execute(token, { action: "state", initiativeId: owner }),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "matching_conflict"
      && !JSON.stringify(error).includes("private-provider-details"));
  assert.deepEqual(calls, [{ rpc: "matching_state", body: { p_id: owner } }]);
});

test("sharing for matching is retired: a preview, a share, a renewal, a withdrawal, a share search and saved partners are refused by name before any RPC (DL-155)", async () => {
  const calls: string[] = [];
  const rpc = createSupabaseWeaveRpc("https://db.example.test", "publishable-fixture", async (url) => {
    calls.push(String(url).split("/").pop()!);
    return Response.json({});
  });
  const { POST } = createMatchingHandlers({ provider: createMatchingProvider(rpc) });
  const reviewId = "50000000-0000-4000-8000-000000000003", requestId = "50000000-0000-4000-8000-000000000002";
  for (const body of [
    { action: "preview", initiativeId: owner, initiativeRevision: 1, entries: [ref] },
    { action: "share", initiativeId: owner, reviewId, requestId },
    { action: "renew", initiativeId: owner, reviewId, requestId },
    { action: "withdraw", initiativeId: owner, entries: [ref], requestId },
    { action: "search", initiativeId: owner },
    { action: "leads", initiativeId: owner },
    { action: "set_lead", initiativeId: owner, candidateId: `public:${projectUri}`, requestId, entry: ref, disposition: "saved" },
  ]) {
    const response = await POST(request(body));
    assert.equal(response.status, 410, body.action);
    assert.deepEqual(await response.json(), { error: "matching_shares_retired" });
  }
  assert.deepEqual(calls, [], "no command reached the database");
  // Weave no longer parses these commands (DL-155, step 7), so a malformed one is refused by name too.
  for (const body of [{ action: "share", initiativeId: owner }, { action: "search", initiativeId: "not-an-id", query: "x" }]) {
    const response = await POST(request(body));
    assert.equal(response.status, 410);
    assert.deepEqual(await response.json(), { error: "matching_shares_retired" });
  }
  assert.deepEqual(calls, []);
  // Nor does the contract parse one, so nothing past the endpoint can run it.
  for (const action of ["preview", "share", "renew", "withdraw", "search", "leads", "set_lead"])
    assert.throws(() => parseMatchingCommand({ action, initiativeId: owner }), /invalid_data/u, action);
});

test("preserves Weave entry identity and rejects case-only duplicate IDs in version 1 saves", () => {
  assert.deepEqual(parseDocument(sample), sample);
  const row = sample.needs[0]!;
  assert.throws(() => parseDocument({ ...sample, needs: [row, { ...row, id: row.id.toUpperCase() }] }), /invalid_data/);
});
