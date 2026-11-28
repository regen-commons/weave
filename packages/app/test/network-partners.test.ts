import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseDocument, record, type AccountDocument } from "@weave/api/account-contract";
import { parseMatchingSearch, parseMatchingState } from "@weave/api/matching-contract";
import { accountFixture, fixtureSession, seedFixtureSave } from "../dev/account-fixture.ts";
import { matchingFixture } from "../dev/matching-fixture.ts";
import { AccountFailure } from "../src/account/client.ts";
import { loadedDraft } from "../src/account/document.ts";
import { EMPTY_ASK } from "../src/intake/contracts.ts";
import { matchingRequest } from "../src/partners/matching-client.ts";
import { localPartnerQuery, rankLocalPartners } from "../src/partners/match.ts";
import { PUBLIC_PARTNER_EVIDENCE } from "../src/partners/catalog.ts";

const origin = "http://localhost:5173";
const base = parseDocument(JSON.parse(readFileSync(new URL("../../api/src/test-data/account.json", import.meta.url), "utf8")));

function post(path: string, body: unknown, token?: string) {
  return new Request(origin + path, {
    method: "POST", body: JSON.stringify(body), headers: {
      Origin: origin, "Content-Type": "application/json",
      ...(token ? { Cookie: `weave_local_account=${token}` } : {}),
    },
  });
}
const ask = (title: string) => ({
  id: crypto.randomUUID(),
  value: { ...EMPTY_ASK, title, capitalForms: ["intellectual"] },
});
/** A private save made before Weave stopped taking them (DL-155, step 4); the account endpoint refuses new ones. */
const save = (token: string, id: string, document: AccountDocument, expectedRevision = 0) =>
  seedFixtureSave(token, { id, document, expectedRevision });
async function matching(token: string, initiativeId: string, input: object, status = 200) {
  const result = await matchingFixture(post("/api/matching", { initiativeId, ...input }, token));
  const data = await result.json();
  assert.equal(result.status, status, JSON.stringify(data));
  assert.equal(result.headers.get("cache-control"), "private, no-store");
  return record(data);
}

/** The fields a matching command names an entry by. */
const reference = ({ kind, entryId, revision, shareVersion }: { kind: string; entryId: string; revision: number; shareVersion: number }) =>
  ({ kind, entryId, revision, shareVersion });

// DL-155: sharing for matching has ended (steps 4 and 5), and Weave no longer parses its commands (step 7).
// `state` still reads, since a team draft publishes from its entry revisions; every share command is refused by name.
test("sharing for matching has ended: state still reads, and every share command is refused by name", async () => {
  const owner = crypto.randomUUID(), token = fixtureSession(owner);
  const need = ask("GPS watershed mapping"), privateNeed = ask("Keep this off the network");
  const document = { ...base, initiative: { ...base.initiative, name: "Watershed A", links: [] }, needs: [need, privateNeed], offers: [] };
  const card = await save(token, crypto.randomUUID(), document);
  const shared = parseMatchingState(await matching(token, card.id, { action: "state" }));
  assert.deepEqual(shared.entries.map(({ sharing }) => sharing), ["private", "private"], "nothing is shared");
  assert.equal((await matching(fixtureSession(crypto.randomUUID()), card.id, { action: "state" }, 404)).error, "not_found");
  const ref = reference(shared.entries.find(({ entryId }) => entryId === need.id)!);
  const requestId = crypto.randomUUID();
  for (const command of [
    { action: "search" }, { action: "leads" },
    { action: "set_lead", entry: ref, candidateId: "public:at://did:plc:weave-matching-fixture/org.hypercerts.collection/stream-surveys",
      disposition: "saved", requestId },
    { action: "withdraw", entries: [ref], requestId },
    { action: "preview", initiativeRevision: shared.initiativeRevision, entries: [ref] },
    { action: "share", reviewId: crypto.randomUUID(), requestId },
    { action: "renew", reviewId: crypto.randomUUID(), requestId },
  ]) assert.equal((await matching(token, card.id, command, 410)).error, "matching_shares_retired", command.action);
  // A malformed one is refused by name too, and nothing above changed the state.
  assert.equal((await matching(token, card.id, { action: "share", reviewId: "not-an-id", requestId }, 410)).error, "matching_shares_retired");
  assert.equal((await matching(token, card.id, { action: "state", query: "words" }, 400)).error, "invalid_data");
  assert.deepEqual(parseMatchingState(await matching(token, card.id, { action: "state" })), shared);

  // A returning account reads the same state by the same initiative ID, and the account no longer opens the card (D49).
  assert.equal((await accountFixture.POST(post("/api/account", { action: "sign_out" }, token))).status, 200);
  assert.equal((await matching(token, card.id, { action: "state" }, 401)).error, "sign_in_required");
  const returning = fixtureSession(owner);
  assert.deepEqual(parseMatchingState(await matching(returning, card.id, { action: "state" })), shared);
  const loaded = await accountFixture.GET(new Request(`${origin}/api/account?id=${card.id}`, { headers: { Cookie: `weave_local_account=${returning}` } }));
  assert.deepEqual([loaded.status, await loaded.json()], [410, { error: "private_saves_retired" }]);
});

test("browser client uses no-store POST with cancellation and refuses a response for another initiative", async (t) => {
  const id = crypto.randomUUID();
  let body: unknown;
  let signal: AbortSignal | null | undefined;
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.equal(url, "/api/matching");
    assert.equal(init.method, "POST");
    assert.equal(init.credentials, "same-origin");
    assert.equal(init.cache, "no-store");
    body = JSON.parse(init.body as string);
    signal = init.signal;
    return Response.json({ initiativeId: crypto.randomUUID(), initiativeRevision: 1, entries: [] });
  });
  const controller = new AbortController();
  await assert.rejects(matchingRequest(id, "state", {}, controller.signal), (error: unknown) =>
    error instanceof AccountFailure && error.code === "matching_unavailable");
  assert.deepEqual(body, { initiativeId: id, action: "state" });
  controller.abort();
  assert.equal((signal as AbortSignal | undefined)?.aborted, true);
});

test("the local matcher query excludes account metadata, files and unfinished text", () => {
  const document = { ...base, needs: [ask("GPS mapping")], offers: [] };
  const draft = loadedDraft({ id: crypto.randomUUID(), revision: 1, document, updatedAt: new Date().toISOString() }, crypto.randomUUID());
  draft.needs.composer = "unfinished sentence";
  const query = localPartnerQuery(draft.needs, draft.offers, draft.confirmed?.locations);
  assert.equal(JSON.stringify(query).includes("unfinished sentence"), false);
  assert.deepEqual(Object.keys(query).sort(), ["locations", "needs", "offers"]);
  assert.ok(rankLocalPartners(query, PUBLIC_PARTNER_EVIDENCE).some(({ evidence }) => evidence.id === "osm:mapping"));
});

test("private Certified suggestions download workspace evidence once and rank both directions on device", async () => {
  const { requestPublicEvidence } = await import("../src/partners/matching-client.ts");
  const { privatePartnerQueries, rankCertifiedSuggestions } = await import("../src/partners/certified-suggestions.ts");
  const { projectEvidenceFixture } = await import("../dev/matching-fixture.ts");
  const owner = crypto.randomUUID();
  const token = fixtureSession(owner);
  const id = crypto.randomUUID();
  const need = ask("GPS watershed mapping"), offer = ask("Environmental monitoring training");
  await save(token, id, { ...base, needs: [need], offers: [offer] });
  const handler = projectEvidenceFixture(origin);
  const requests: unknown[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, options) => {
    assert.equal(input, "/api/projects");
    assert.equal(options?.cache, "no-store");
    assert.equal(options?.credentials, "same-origin");
    const body = JSON.parse(String(options?.body));
    requests.push(body);
    return handler(post(String(input), body, token));
  };
  try {
    const { evidence } = await requestPublicEvidence(id, new AbortController().signal);
    const queries = privatePartnerQueries(id, 1, [need], [offer]);
    const suggestions = rankCertifiedSuggestions(id, queries, evidence);
    assert.deepEqual(suggestions.map(({ evidenceKind }) => evidenceKind), ["inferred_capability", "potential_use"]);
    assert.ok(suggestions.every((match) => match.evidence.type === "public" && match.unknowns.includes("availability")));
    const changed = privatePartnerQueries(id, 2, [ask("Ceramics kiln fabrication")], []);
    assert.deepEqual(rankCertifiedSuggestions(id, changed, evidence), []);
    assert.deepEqual(requests, [{ action: "public_evidence", workspaceId: id }]);
    const state = parseMatchingState(await matching(token, id, { action: "state" }));
    assert.ok(state.entries.every(({ sharing }) => sharing === "private"));
    assert.equal((await matching(token, id, { action: "search" }, 410)).error, "matching_shares_retired");
    // The project's published listings are matched on the server: here the fixture's other project offers training.
    const listed = parseMatchingSearch(await matching(token, id, { action: "listing_search" }));
    assert.ok(listed.results.some(({ evidence, query }) => evidence.type === "listing" && query.entryId === need.id));
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal((await handler(post("/api/projects", { action: "public_evidence", workspaceId: id }))).status, 401);
  assert.equal((await handler(post("/api/projects", { action: "public_evidence", workspaceId: id },
    fixtureSession(crypto.randomUUID())))).status, 404);
  assert.equal((await handler(post("/api/projects", { action: "public_evidence", workspaceId: id, query: need.value.title },
    token))).status, 400);
});

test("the fixture links a personal project to the saved card, as the workspace candidate does", async () => {
  const { projectEvidenceFixture } = await import("../dev/matching-fixture.ts");
  const handler = projectEvidenceFixture(origin);
  const personal = "at://did:plc:aaaaaaaaaaaaaaaaaaaaaaaa/org.hypercerts.collection/water-notes";
  const group = "at://did:plc:bbbbbbbbbbbbbbbbbbbbbbbb/org.hypercerts.collection/watershed";
  const projects = async (body: object, token: string, status = 200) => {
    const result = await handler(post("/api/projects", body, token));
    const data = await result.json();
    assert.equal(result.status, status, JSON.stringify(data));
    return record(data);
  };
  const owner = crypto.randomUUID(), other = crypto.randomUUID();
  const token = fixtureSession(owner), otherToken = fixtureSession(other);
  const id = crypto.randomUUID();
  await save(token, id, { ...base, needs: [ask("GPS watershed mapping")] });
  const link = { action: "link", projectUri: personal, initiativeId: id, expectedRevision: 1 };
  const linked = { status: "linked", workspaceId: id, accessRole: "admin", projectUri: personal, cid: "bafyfixture" };

  assert.equal((await projects({ action: "lookup", projectUri: personal }, token)).status, "unlinked");
  await projects({ ...link, expectedRevision: 2 }, token, 409);
  await projects(link, otherToken, 404);
  await projects({ ...link, projectUri: group }, token, 400);
  assert.deepEqual(await projects(link, token), linked);
  assert.deepEqual(await projects(link, token), linked, "a repeated link returns the same canonical link");
  assert.deepEqual(await projects({ action: "lookup", projectUri: personal }, token), linked);
  const { workspaces } = await projects({ action: "list_workspaces" }, token);
  assert.deepEqual((workspaces as { workspaceId: string; kind: string }[]).map(({ workspaceId, kind }) => ({ workspaceId, kind })),
    [{ workspaceId: id, kind: "personal" }]);
  assert.equal((await projects({ action: "lookup", projectUri: personal }, otherToken)).status, "unlinked",
    "each fixture account keeps its own link to the shared personal project");
  assert.equal(parseMatchingState(await matching(token, id, { action: "state" })).initiativeId, id);
});

test("a viewer and editor use the same private team document without sharing it", async () => {
  const { FIXTURE_ACCOUNT_ID } = await import("../dev/account-fixture.ts");
  const { FIXTURE_TEAM_ID, FIXTURE_TEAM_EDITOR, projectEvidenceFixture } = await import("../dev/matching-fixture.ts");
  const { requestTeamWorkspace, teamPartnerQueries } = await import("../src/partners/team-workspace.ts");
  const { requestPublicEvidence } = await import("../src/partners/matching-client.ts");
  const { rankCertifiedSuggestions } = await import("../src/partners/certified-suggestions.ts");
  const handler = projectEvidenceFixture(origin);
  const signal = new AbortController().signal;
  const requests: unknown[] = [];
  let token = "";
  const original = globalThis.fetch;
  globalThis.fetch = async (input, options) => {
    assert.equal(input, "/api/projects");
    assert.equal(options?.cache, "no-store");
    const body = JSON.parse(String(options?.body));
    requests.push(body);
    const response = await handler(post(String(input), body, token));
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    return response;
  };
  try {
    const outcomes = [];
    for (const account of [FIXTURE_ACCOUNT_ID, FIXTURE_TEAM_EDITOR]) {
      token = fixtureSession(account);
      const workspace = await requestTeamWorkspace(FIXTURE_TEAM_ID, signal);
      const saved = workspace.saved;
      assert.equal(workspace.accessRole, account === FIXTURE_ACCOUNT_ID ? "viewer" : "editor");
      assert.ok(saved);
      assert.equal(saved.id, FIXTURE_TEAM_ID);
      assert.deepEqual(saved.document.needs[0]!.value.capitalForms, []);
      const { evidence } = await requestPublicEvidence(FIXTURE_TEAM_ID, signal);
      const matches = rankCertifiedSuggestions(saved.id, teamPartnerQueries(saved), evidence);
      assert.deepEqual(matches.map(({ evidenceKind }) => evidenceKind), ["inferred_capability", "potential_use"]);
      outcomes.push(matches.map(({ counterpart }) => counterpart));
    }
    assert.deepEqual(outcomes[0], outcomes[1]);
    assert.deepEqual(requests, [
      { action: "team_load", workspaceId: FIXTURE_TEAM_ID },
      { action: "public_evidence", workspaceId: FIXTURE_TEAM_ID },
      { action: "team_load", workspaceId: FIXTURE_TEAM_ID },
      { action: "public_evidence", workspaceId: FIXTURE_TEAM_ID },
    ]);
    token = fixtureSession(crypto.randomUUID());
    await assert.rejects(requestTeamWorkspace(FIXTURE_TEAM_ID, signal), { code: "not_found" });
    await assert.rejects(requestPublicEvidence(FIXTURE_TEAM_ID, signal), { code: "not_found" });
    token = "";
    await assert.rejects(requestTeamWorkspace(FIXTURE_TEAM_ID, signal), { code: "sign_in_required" });
  } finally {
    globalThis.fetch = original;
  }
});

test("membership consent returns to the same workspace and finishes once", async () => {
  const { FIXTURE_TEAM_ID } = await import("../dev/matching-fixture.ts");
  const { finishTeamAccess, startTeamAccess, takeTeamAccessReturn } = await import("../src/partners/team-workspace.ts");
  const { teamWorkspacePath } = await import("../src/routes.ts");
  let value: string | null = null;
  const storage: Storage = {
    get length() { return Number(value !== null); },
    key: () => null,
    getItem: () => value,
    setItem: (_key, next) => { value = next; },
    removeItem: () => { value = null; },
    clear: () => { value = null; },
  };
  const actions: string[] = [];
  const authorizeUrl = "https://auth.certified.one/oauth/authorize?request_uri=synthetic";
  const original = globalThis.fetch;
  globalThis.fetch = async (input, options) => {
    assert.equal(input, "/api/certified-project-consent");
    assert.equal(options?.cache, "no-store");
    const body = JSON.parse(String(options?.body));
    assert.deepEqual(Object.keys(body), ["action"]);
    actions.push(body.action);
    return Response.json(body.action === "membership" ? { authorizeUrl } : { granted: "membership" });
  };
  try {
    assert.equal(await startTeamAccess(FIXTURE_TEAM_ID, storage), authorizeUrl);
    assert.equal(takeTeamAccessReturn("unknown", () => storage), null);
    const returned = takeTeamAccessReturn("ready", () => storage);
    assert.ok(returned);
    assert.equal(await finishTeamAccess(returned), teamWorkspacePath(FIXTURE_TEAM_ID));
    assert.equal(takeTeamAccessReturn("ready", () => storage), null);
    assert.deepEqual(actions, ["membership", "finish"]);
    await startTeamAccess(FIXTURE_TEAM_ID, storage);
    const denied = takeTeamAccessReturn("denied", () => storage);
    assert.ok(denied);
    assert.equal(await finishTeamAccess(denied), teamWorkspacePath(FIXTURE_TEAM_ID) + "?access=denied");
    assert.deepEqual(actions, ["membership", "finish", "membership"]);
  } finally {
    globalThis.fetch = original;
  }
});

test("team editing still saves, team state still reads, and nobody on a team can search, keep or withdraw a share", async () => {
  const { FIXTURE_TEAM_ID, FIXTURE_TEAM_EDITOR, projectEvidenceFixture } = await import("../dev/matching-fixture.ts");
  const { FIXTURE_ACCOUNT_ID } = await import("../dev/account-fixture.ts");
  const { requestTeamWorkspace, saveTeamWorkspace } = await import("../src/partners/team-workspace.ts");
  const { matchingRequest } = await import("../src/partners/matching-client.ts");
  const handler = projectEvidenceFixture(origin);
  const tokens = { editor: fixtureSession(FIXTURE_TEAM_EDITOR), viewer: fixtureSession(FIXTURE_ACCOUNT_ID) };
  let token = tokens.editor;
  const signal = new AbortController().signal;
  const original = globalThis.fetch;
  globalThis.fetch = (input, options) => {
    const body = JSON.parse(String(options?.body));
    const request = post(String(input), body, token);
    return input === "/api/projects" ? handler(request) : matchingFixture(request);
  };
  try {
    // A group project keeps its shared team draft (D48, revised 28 November 2026).
    let team = (await requestTeamWorkspace(FIXTURE_TEAM_ID, signal)).saved!;
    const need = { ...team.document.needs[0]!, value: { ...team.document.needs[0]!.value,
      title: "GPS watershed mapping", capitalForms: ["intellectual"] } };
    const firstSave = { expectedRevision: team.revision, requestId: crypto.randomUUID(),
      document: { ...team.document, needs: [need] } };
    team = await saveTeamWorkspace(FIXTURE_TEAM_ID, firstSave, signal);
    assert.deepEqual(await saveTeamWorkspace(FIXTURE_TEAM_ID, firstSave, signal), team);
    await assert.rejects(saveTeamWorkspace(FIXTURE_TEAM_ID, { ...firstSave, requestId: crypto.randomUUID() }, signal),
      { code: "project_conflict" });
    token = tokens.viewer;
    assert.equal((await requestTeamWorkspace(FIXTURE_TEAM_ID, signal)).accessRole, "viewer");
    await assert.rejects(saveTeamWorkspace(FIXTURE_TEAM_ID, { ...firstSave,
      expectedRevision: team.revision, requestId: crypto.randomUUID() }, signal), { code: "workspace_edit_required" });

    // Publishing a team's saved card reads its entries' revisions from `state`, and a viewer may search its listings.
    for (const who of [tokens.editor, tokens.viewer]) {
      token = who;
      const state = await matchingRequest(team.id, "state", {}, signal);
      assert.equal(state.initiativeRevision, team.revision);
      const listed = await matchingRequest(team.id, "listing_search", {}, signal);
      assert.ok(listed.results.some(({ evidence, query }) => evidence.type === "listing" && query.entryId === need.id));
      const ref = reference(state.entries.find(({ kind }) => kind === "need")!);
      for (const command of [{ action: "search" }, { action: "leads" }, { action: "withdraw", entries: [ref], requestId: crypto.randomUUID() },
        { action: "preview", initiativeRevision: team.revision, entries: [ref] }])
        assert.equal((await matching(who, team.id, command, 410)).error, "matching_shares_retired", command.action);
    }
  } finally {
    globalThis.fetch = original;
  }
});

test("private suggestions understand related public wording without asserting offers or making a query request", async (t) => {
  const { privatePartnerQueries, rankCertifiedSuggestions } = await import("../src/partners/certified-suggestions.ts");
  const { extractCollection } = await import("../../api/src/project-index-source.ts");
  t.mock.method(globalThis, "fetch", () => { throw Error("private matching must not send a query"); });
  const did = "did:plc:pktwukejt6bnubpkhldnaeyc", uri = `at://${did}/org.hypercerts.collection/atlas`;
  const source = extractCollection({ uri, did,
    cid: "bafyreicr6uunzpaa7hzwbkvctviqz6pvnab5sziptgdqwe5jboqlhm55vi", indexedAt: null,
    author: { did, organization: null }, record: { $type: "org.hypercerts.collection", type: "project",
      title: "Civic atlas", createdAt: "2026-11-01T00:00:00Z", shortDescription: "Our ongoing work is cartography." },
  }, uri, "2026-11-11T00:00:00Z");
  assert.equal(source.status, "indexed");
  if (source.status !== "indexed") return;
  const id = crypto.randomUUID();
  const queries = privatePartnerQueries(id, 1, [ask("Mapmaking")], [ask("Mapmaking")]);
  const results = rankCertifiedSuggestions(id, queries, source.passages);
  assert.deepEqual(results.map(r=>r.evidenceKind), ["inferred_capability", "potential_use"]);
  assert.ok(results.every(r=>r.reasons.some(reason=>reason.type==="related_terms") && r.unknowns.includes("availability")));
  assert.ok(results.every(r=>r.evidence.passage==="Our ongoing work is cartography."));
  assert.deepEqual(rankCertifiedSuggestions(crypto.randomUUID(), queries, source.passages), []);
});

test("a team save review shows the card and its entries, never raw saved fields", async () => {
  const { documentCard } = await import("../src/partners/team-workspace.ts");
  const card = documentCard(base);
  assert.ok(card);
  assert.equal(card.fields.name, base.initiative.name);
  assert.deepEqual(card.needs.map((need) => need.title), base.needs.map((need) => need.value.title));
  assert.deepEqual(card.offers.map((offer) => offer.title), base.offers.map((offer) => offer.value.title));
  const unreadable = { ...base, initiative: { ...base.initiative, name: 7 } } as unknown as AccountDocument;
  assert.equal(documentCard(unreadable), null, "a document that cannot show as a card shows nothing rather than failing");
});

test("a draft's kept need finds another project's published offer in the snapshot, as a direct fit from that project (DL-155)", async () => {
  const { privatePartnerQueries, projectSuggestions, rankCertifiedSuggestions } = await import("../src/partners/certified-suggestions.ts");
  const workspace = crypto.randomUUID();
  const benProject = "at://did:plc:benbbbbbbbbbbbbbbbbbbbbb/org.hypercerts.collection/3mlistingben1";
  const listing = (title: string, rkey: string) => ({
    uri: `at://did:plc:benbbbbbbbbbbbbbbbbbbbbb/com.regencommons.weave.supportListing/${rkey}`, cid: `b${"d".repeat(58)}`,
    projectUri: benProject, projectName: "Ben's seed library", kind: "offer" as const, title, description: "",
    capitalForms: ["intellectual"], createdAt: new Date(Date.now() - 60_000).toISOString(), expiresAt: null,
  });
  const need = ask("Weekend volunteers for our seed library");
  const queries = privatePartnerQueries(workspace, 0, [need], []);
  const matches = rankCertifiedSuggestions(workspace, queries, [],
    [listing("Seed library volunteers on weekends", "3mlstdaaaaaaa"), listing("Bike repair", "3mlstnaaaaaaa")]);
  assert.deepEqual(matches.map(({ candidateId, evidenceKind, action }) => [candidateId, evidenceKind, action]), [[
    `listing:at://did:plc:benbbbbbbbbbbbbbbbbbbbbb/com.regencommons.weave.supportListing/3mlstdaaaaaaa`, "confirmed_offer", "open_listing",
  ]]);
  const [project] = projectSuggestions(matches, queries);
  assert.equal(project?.id, benProject);
  assert.equal(project?.name, "Ben's seed library");
  assert.equal(project?.fits.length, 1);
});

test("a project with two published offers that fit one need names that need once (DL-155)", async () => {
  const { privatePartnerQueries, projectSuggestions, rankCertifiedSuggestions } = await import("../src/partners/certified-suggestions.ts");
  const workspace = crypto.randomUUID();
  const benProject = "at://did:plc:benbbbbbbbbbbbbbbbbbbbbb/org.hypercerts.collection/3mlistingben1";
  const listing = (title: string, rkey: string) => ({
    uri: `at://did:plc:benbbbbbbbbbbbbbbbbbbbbb/com.regencommons.weave.supportListing/${rkey}`, cid: `b${"d".repeat(58)}`,
    projectUri: benProject, projectName: "Ben's seed library", kind: "offer" as const, title, description: "",
    capitalForms: ["intellectual"], createdAt: new Date(Date.now() - 60_000).toISOString(), expiresAt: null,
  });
  const queries = privatePartnerQueries(workspace, 0, [ask("Weekend volunteers for our seed library")], []);
  const matches = rankCertifiedSuggestions(workspace, queries, [], [
    listing("Seed library volunteers on weekends", "3mlstdaaaaaaa"), listing("Weekend seed library volunteers", "3mlsteaaaaaaa")]);
  assert.equal(matches.length, 2);
  const [project] = projectSuggestions(matches, queries);
  assert.equal(project?.fits.length, 1);
  assert.equal(project?.fits[0]?.match, matches[0]);
});

test("the server's listing matches lead, the device's follow, a candidate shows once per entry, and server public evidence stays out (DL-155)", async () => {
  const { withListingMatches } = await import("../src/partners/certified-suggestions.ts");
  const query = { kind: "need" as const, entryId: crypto.randomUUID(), revision: 0 };
  const listing = (rkey: string) => ({ query, candidateId: `listing:at://did:plc:benbbbbbbbbbbbbbbbbbbbbb/com.regencommons.weave.supportListing/${rkey}`,
    counterpart: { id: "at://did:plc:benbbbbbbbbbbbbbbbbbbbbb/org.hypercerts.collection/3mlistingben1", name: "Ben" },
    evidenceKind: "confirmed_offer" as const, action: "open_listing" as const, reciprocal: false, reasons: [], unknowns: [],
    evidence: { type: "listing" as const, uri: `at://did:plc:benbbbbbbbbbbbbbbbbbbbbb/com.regencommons.weave.supportListing/${rkey}`,
      cid: `b${"d".repeat(58)}`, title: "Offer", passage: "Offer", createdAt: new Date().toISOString(), expiresAt: null } });
  const publicMatch = (project: string) => ({ ...listing("3mlstxaaaaaaa"), candidateId: `public:${project}`, evidenceKind: "inferred_capability" as const,
    action: "open_source" as const, evidence: { type: "public" as const, id: project, projectUri: project, projectName: "P", sourceUri: project,
      sourceUrl: "https://example.org", cid: "c", contentHash: "h", fieldPath: "f", passage: "p", sourceCreatedAt: new Date().toISOString(),
      sourceIndexedAt: null, fetchedAt: new Date().toISOString(), extractionVersion: "x", kind: "work" as const } });
  const device = [listing("3mlstdaaaaaaa"), publicMatch("at://did:plc:a/org.hypercerts.collection/1")];
  const server = [publicMatch("at://did:plc:b/org.hypercerts.collection/2"), listing("3mlsteaaaaaaa"), listing("3mlstdaaaaaaa")];
  // The server's public evidence never joins: the device ranks public projects by each entry's place and limits.
  assert.deepEqual(withListingMatches(device, server).map(({ candidateId }) => candidateId.slice(-14)), [
    "/3mlsteaaaaaaa", "/3mlstdaaaaaaa", "rcerts.collection/1".slice(-14),
  ]);
});

test("a server match for an entry this draft no longer holds draws no card, so the empty line shows (DL-155)", async () => {
  const { privatePartnerQueries, projectSuggestions, withListingMatches } = await import("../src/partners/certified-suggestions.ts");
  const workspace = crypto.randomUUID();
  const queries = privatePartnerQueries(workspace, 0, [ask("Weekend volunteers for our seed library")], []);
  const uri = "at://did:plc:benbbbbbbbbbbbbbbbbbbbbb/com.regencommons.weave.supportListing/3mlstdaaaaaaa";
  const orphan = { query: { kind: "need" as const, entryId: crypto.randomUUID(), revision: 0 }, candidateId: `listing:${uri}`,
    counterpart: { id: "at://did:plc:benbbbbbbbbbbbbbbbbbbbbb/org.hypercerts.collection/3mlistingben1", name: "Ben" },
    evidenceKind: "confirmed_offer" as const, action: "open_listing" as const, reciprocal: false, reasons: [], unknowns: [],
    evidence: { type: "listing" as const, uri, cid: `b${"d".repeat(58)}`, title: "Offer", passage: "Offer",
      createdAt: new Date().toISOString(), expiresAt: null } };
  const matches = withListingMatches([], [orphan]);
  assert.equal(matches.length, 1);
  assert.deepEqual(projectSuggestions(matches, queries), []);
});
