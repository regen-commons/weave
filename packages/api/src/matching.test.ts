import assert from "node:assert/strict";
import { test } from "node:test";
import { parseDocument } from "./account-contract.ts";
import { createSupabaseWeaveRpc } from "./account-provider.ts";
import { parseMatchingCommand, parseMatchingSearch, type MatchingProjection } from "./matching-contract.ts";
import { createMatchingProvider } from "./matching-provider.ts";
import { createMatchingHandlers } from "./matching.ts";
import { PARTNER_ENGINE_VERSION, type ProjectEvidence } from "./partner-matcher.ts";
import sample from "./test-data/account.json" with { type: "json" };

const owner = "10000000-0000-4000-8000-000000000001";
const peer = "10000000-0000-4000-8000-000000000002";
const needId = "20000000-0000-4000-8000-000000000001";
const offerId = "20000000-0000-4000-8000-000000000002";
const ref = { kind: "need", entryId: needId, revision: 3, shareVersion: 8 } as const;
const at = new Date().toISOString(), later = new Date(Date.now() + 86_400_000).toISOString();
const origin = "https://weave.example.test";
const token = "fixture.token.signature";
const request = (body: unknown, headers: Record<string, string> = {}) => new Request(`${origin}/api/matching`, {
  method: "POST",
  headers: { origin, "content-type": "application/json", cookie: `__Host-weave_account=${token}`, ...headers },
  body: JSON.stringify(body),
});
const summary = { name: "River circle", description: "", isGlobal: false, locations: ["Upper valley"], themes: [], lenses: [] };
const common = { description: null, capitalForms: ["experiential"], amount: null, timeframe: null, urgency: null,
  placeScope: "anywhere", exchangeTerms: ["gift"], purpose: null, capacity: null, audience: null, status: "open" };
const need: MatchingProjection = {
  ...ref, initiativeId: owner, summary, confirmedAt: at, expiresAt: later,
  value: { ...common, title: "Need a watershed mapping workshop" },
};
const offer: MatchingProjection = {
  ...need, kind: "offer", entryId: offerId, initiativeId: peer,
  value: { ...common, title: "Watershed mapping workshops" },
};
const source: ProjectEvidence = {
  id: "evidence-1", projectUri: "at://did:plc:synthetic/org.hypercerts.collection/example",
  projectName: "Mapping project", sourceUri: "at://did:plc:synthetic/org.hypercerts.collection/example",
  sourceUrl: "https://api.hypercerts.org/example", cid: "bafyfixture", contentHash: "hash", fieldPath: "description",
  passage: "The team runs watershed mapping workshops.", sourceCreatedAt: at, sourceIndexedAt: null,
  fetchedAt: at, extractionVersion: "fixture", kind: "work",
};

test("rejects foreign origins, missing sessions, duplicate selection and injected draft text before RPC", async () => {
  const provider = createMatchingProvider(async () => assert.fail("request must not reach the database"));
  const { POST } = createMatchingHandlers({ provider, origin });
  const command = { action: "search", initiativeId: owner };
  const attempts = [
    [request(command, { origin: "https://elsewhere.example.test" }), 403],
    [request(command, { cookie: "" }), 401],
    [request({ ...command, query: "private unshared note" }), 400],
    [request({ ...command, entries: [ref, ref] }), 400],
    [request(command, { "content-type": "text/plain" }), 415],
    [request(command, { "content-length": "65537" }), 413],
  ] as const;
  for (const [input, expected] of attempts) {
    const response = await POST(input);
    assert.equal(response.status, expected);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  }
});

test("matches both directions with shared entries and public evidence without confusing evidence classes", async () => {
  const ownerOffer = { ...offer, initiativeId: owner };
  const peerNeed = { ...need, initiativeId: peer };
  const rpc = createSupabaseWeaveRpc("https://db.example.test", "publishable-fixture", async (url, init) => {
    assert.equal(url, "https://db.example.test/rest/v1/rpc/matching_shortlist");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("authorization"), `Bearer ${token}`);
    assert.equal(headers.get("content-profile"), "weave");
    assert.deepEqual(JSON.parse(String(init?.body)), { p_id: owner, p_entries: null });
    return Response.json({ externalCoverage: { status: "bounded", corpusVersion: "pilot-1" }, groups: [
      { entry: need, candidates: [offer], publicEvidence: [source] },
      { entry: ownerOffer, candidates: [peerNeed], publicEvidence: [source, { ...source, sourceUrl: "javascript:bad()" }] },
    ] });
  });
  const response = await createMatchingHandlers({ provider: createMatchingProvider(rpc) }).POST(
    request({ action: "search", initiativeId: owner }),
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const { results, coverage } = parseMatchingSearch(await response.json());
  assert.deepEqual(new Set(results.map((r: { evidenceKind: string }) => r.evidenceKind)),
    new Set(["confirmed_need", "confirmed_offer", "inferred_capability", "potential_use"]));
  assert.equal(results.filter((r: { action: string }) => r.action === "open_source").length, 2);
  assert.equal(coverage.external, "partial");
  assert.equal(coverage.engineVersion, PARTNER_ENGINE_VERSION);
  assert.equal(coverage.modelVersion, null);
});

test("passes private mutations only to narrow RPCs and never returns database error details", async () => {
  const calls: { rpc: string; body: unknown }[] = [];
  const requestId = "50000000-0000-4000-8000-000000000002";
  const reviewId = "50000000-0000-4000-8000-000000000003";
  const rpc = createSupabaseWeaveRpc("https://db.example.test", "publishable-fixture", async (url, init) => {
    calls.push({ rpc: String(url).split("/").pop()!, body: JSON.parse(String(init?.body)) });
    return Response.json({ code: "PT409", message: "private-provider-details" }, { status: 409 });
  });
  const { POST } = createMatchingHandlers({ provider: createMatchingProvider(rpc) });
  const response = await POST(request({ action: "share", initiativeId: owner, reviewId, requestId }));
  assert.deepEqual(calls, [{ rpc: "matching_change", body: {
    p_id: owner, p_action: "share", p_request_id: requestId, p_review_id: reviewId, p_entries: null,
  } }]);
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: "matching_conflict" });
});

test("preserves Weave entry identity and rejects case-only duplicate IDs in version 1 saves", () => {
  assert.deepEqual(parseDocument(sample), sample);
  const row = sample.needs[0]!;
  assert.throws(() => parseDocument({ ...sample, needs: [row, { ...row, id: row.id.toUpperCase() }] }), /invalid_data/);
  assert.throws(() => parseMatchingCommand({
    action: "preview", initiativeId: owner, initiativeRevision: 1, entries: [ref], expiresAt: "2027-02-31T00:00:00Z",
  }), /invalid_data/);
});

test("removes a saved lead by its entry key and still requires a current reference for saving", async () => {
  const entry = { kind: ref.kind, entryId: ref.entryId };
  const candidateId = `weave:${peer}:offer:${offerId}`;
  const requestId = "50000000-0000-4000-8000-000000000004";
  const body = { action: "set_lead", initiativeId: owner, candidateId, requestId };
  let calls = 0;
  const provider = createMatchingProvider(async (rpc, payload) => {
    calls++;
    assert.equal(rpc, "matching_set_lead");
    assert.deepEqual(payload, {
      p_id: owner, p_entry: entry, p_candidate_id: candidateId, p_disposition: "removed", p_request_id: requestId,
    });
    return { initiativeId: owner, leads: [] };
  });
  const { POST } = createMatchingHandlers({ provider });
  assert.equal((await POST(request({ ...body, entry, disposition: "saved" }))).status, 400);
  assert.equal((await POST(request({ ...body, entry, disposition: "dismissed" }))).status, 400);
  const response = await POST(request({ ...body, entry, disposition: "removed" }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { initiativeId: owner, leads: [] });
  assert.equal((await POST(request({ ...body, entry: ref, disposition: "removed" }))).status, 200);
  assert.equal(calls, 2);
});
