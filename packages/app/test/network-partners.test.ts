import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseDocument, parseSaved, record, type AccountDocument } from "@weave/api/account-contract";
import { parseMatchingLeads, parseMatchingPreview, parseMatchingSearch, parseMatchingState } from "@weave/api/matching-contract";
import { accountFixture, fixtureSession } from "../dev/account-fixture.ts";
import { matchingFixture } from "../dev/matching-fixture.ts";
import { activeInitiative } from "../src/account/active-initiative.ts";
import { AccountFailure } from "../src/account/client.ts";
import { loadedDraft } from "../src/account/document.ts";
import { EMPTY_ASK } from "../src/intake/contracts.ts";
import { entryReference, matchingRequest } from "../src/partners/matching-client.ts";
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
async function save(token: string, accountId: string, id: string, document: AccountDocument, expectedRevision = 0) {
  const result = await accountFixture.POST(post("/api/account", {
    action: "save", id, accountId, expectedRevision, requestId: crypto.randomUUID(), document,
  }, token));
  assert.equal(result.status, 200);
  return parseSaved(record(await result.json()).saved);
}
async function matching(token: string, initiativeId: string, input: object, status = 200) {
  const result = await matchingFixture(post("/api/matching", { initiativeId, ...input }, token));
  const data = await result.json();
  assert.equal(result.status, status, JSON.stringify(data));
  assert.equal(result.headers.get("cache-control"), "private, no-store");
  return record(data);
}

test("private Save, selected sharing, evidence, leads and returning account use the same initiative IDs", async () => {
  const ownerA = crypto.randomUUID(), ownerB = crypto.randomUUID();
  const first = fixtureSession(ownerA), second = fixtureSession(ownerB);
  const need = ask("GPS watershed mapping"), privateNeed = ask("Keep this off the network");
  const offer = ask("GPS mapping training"), secondNeed = ask("Environmental monitoring");
  const documentA = { ...base, initiative: { ...base.initiative, name: "Watershed A", links: [] }, needs: [need, privateNeed], offers: [] };
  const documentB = { ...base, initiative: { ...base.initiative, name: "Mapping B", links: ["https://example.org/project"] }, needs: [secondNeed], offers: [offer] };
  const a = await save(first, ownerA, crypto.randomUUID(), documentA);
  const b = await save(second, ownerB, crypto.randomUUID(), documentB);

  async function prepare(token: string, initiativeId: string, id: string) {
    const state = parseMatchingState(await matching(token, initiativeId, { action: "state" }));
    const selected = state.entries.find(({ entryId }) => entryId === id)!;
    assert.equal(selected.sharing, "private");
    const review = parseMatchingPreview(await matching(token, initiativeId, {
      action: "preview", initiativeRevision: state.initiativeRevision, entries: [entryReference(selected)],
    }));
    assert.equal(review.entries.length, 1);
    assert.equal(review.entries[0]?.entryId, id);
    assert.equal(review.audience, "weave_users");
    assert.deepEqual(parseMatchingSearch(await matching(token, initiativeId, { action: "search" })).results, []);
    return review;
  }
  const aReview = await prepare(first, a.id, need.id);
  const bReview = await prepare(second, b.id, offer.id);
  assert.equal(Object.hasOwn(bReview.summary, "links"), false);
  const aCommand = { action: "share", reviewId: aReview.reviewId, requestId: crypto.randomUUID() };
  const aShare = parseMatchingState(await matching(first, a.id, aCommand));
  assert.deepEqual(await matching(first, a.id, aCommand), aShare);
  assert.equal((await matching(first, a.id, { ...aCommand, requestId: crypto.randomUUID() }, 409)).error, "matching_conflict");
  const bShare = parseMatchingState(await matching(second, b.id, { action: "share", reviewId: bReview.reviewId, requestId: crypto.randomUUID() }));
  assert.equal((await matching(second, a.id, { action: "state" }, 404)).error, "not_found");
  assert.equal(aShare.entries.find(({ entryId }) => entryId === privateNeed.id)?.sharing, "private");

  const resultsA = parseMatchingSearch(await matching(first, a.id, { action: "search" }));
  const resultsB = parseMatchingSearch(await matching(second, b.id, { action: "search" }));
  assert.ok(resultsA.results.some((match) => match.evidenceKind === "confirmed_offer" && match.evidence.type === "shared" && match.evidence.entryId === offer.id));
  assert.ok(resultsA.results.some((match) => match.evidenceKind === "inferred_capability" && match.evidence.type === "public"));
  assert.ok(resultsB.results.some((match) => match.evidenceKind === "confirmed_need" && match.evidence.type === "shared" && match.evidence.entryId === need.id));
  assert.ok(resultsB.results.some((match) => match.evidenceKind === "potential_use" && match.evidence.type === "public"));
  assert.ok(resultsA.results.every(({ query }) => query.entryId === need.id));
  assert.equal(resultsA.coverage.modelVersion, null);

  const candidate = resultsA.results.find(({ evidence }) => evidence.type === "shared" && evidence.entryId === offer.id)!;
  const aEntry = aShare.entries.find(({ entryId }) => entryId === need.id)!;
  const saveLead = { action: "set_lead", entry: entryReference(aEntry), candidateId: candidate.candidateId, disposition: "saved", requestId: crypto.randomUUID() };
  assert.equal(parseMatchingLeads(await matching(first, a.id, saveLead)).leads[0]?.disposition, "saved");
  const dismiss = { ...saveLead, disposition: "dismissed", requestId: crypto.randomUUID() };
  assert.equal(parseMatchingLeads(await matching(first, a.id, dismiss)).leads[0]?.disposition, "dismissed");
  await matching(first, a.id, { ...saveLead, requestId: crypto.randomUUID() });

  const bEntry = bShare.entries.find(({ entryId }) => entryId === offer.id)!;
  const renew = parseMatchingPreview(await matching(second, b.id, {
    action: "preview", initiativeRevision: bShare.initiativeRevision, entries: [entryReference(bEntry)],
  }));
  const renewed = parseMatchingState(await matching(second, b.id, { action: "renew", reviewId: renew.reviewId, requestId: crypto.randomUUID() }));
  const withdraw = { action: "withdraw", entries: [entryReference(bEntry)], requestId: crypto.randomUUID() };
  await matching(second, b.id, withdraw, 409);
  await matching(second, b.id, { ...withdraw, entries: [entryReference(renewed.entries.find(({ entryId }) => entryId === offer.id)!)], requestId: crypto.randomUUID() });
  assert.ok(parseMatchingSearch(await matching(first, a.id, { action: "search" })).results.every(({ candidateId }) => candidateId !== candidate.candidateId));
  assert.equal((await accountFixture.POST(post("/api/account", { action: "sign_out" }, first))).status, 200);
  assert.equal((await matching(first, a.id, { action: "leads" }, 401)).error, "sign_in_required");
  const returning = fixtureSession(ownerA);
  const loaded = await accountFixture.GET(new Request(`${origin}/api/account?id=${a.id}`, { headers: { Cookie: `weave_local_account=${returning}` } }));
  const draft = loadedDraft(parseSaved(record(await loaded.json()).saved), ownerA);
  assert.equal(activeInitiative(draft.account.saved, ownerA)?.id, a.id);
  assert.equal(activeInitiative(draft.account.saved, ownerB), null);
  assert.deepEqual(draft.needs.items.map(({ id }) => id), [need.id, privateNeed.id]);
  assert.equal(parseMatchingLeads(await matching(returning, a.id, { action: "leads" })).leads[0]?.evidenceStatus, "unavailable");
  await save(returning, ownerA, a.id, { ...documentA, needs: [privateNeed] }, a.revision);
  assert.equal(parseMatchingLeads(await matching(returning, a.id, { action: "leads" })).leads[0]?.entryId, need.id);
  const remove = {
    action: "set_lead", entry: { kind: "need", entryId: need.id },
    candidateId: candidate.candidateId, disposition: "removed", requestId: crypto.randomUUID(),
  };
  assert.deepEqual(parseMatchingLeads(await matching(returning, a.id, remove)).leads, []);
});

test("a private edit after preview invalidates that preview and an edited share requires another review", async () => {
  const owner = crypto.randomUUID(), id = crypto.randomUUID(), token = fixtureSession(owner);
  const need = ask("Mapping training");
  const document = { ...base, needs: [need], offers: [] };
  const saved = await save(token, owner, id, document);
  const preview = async () => {
    const state = parseMatchingState(await matching(token, id, { action: "state" }));
    return parseMatchingPreview(await matching(token, id, {
      action: "preview", initiativeRevision: state.initiativeRevision, entries: [entryReference(state.entries[0]!)],
    }));
  };
  const review = await preview();
  const changed = { ...document, initiative: { ...document.initiative, name: "A more specific name" } };
  await save(token, owner, id, changed, saved.revision);
  await matching(token, id, { action: "share", reviewId: review.reviewId, requestId: crypto.randomUUID() }, 409);
  const current = await preview();
  const share = parseMatchingState(await matching(token, id, { action: "share", reviewId: current.reviewId, requestId: crypto.randomUUID() }));
  const edited = { ...changed, needs: [{ ...need, value: { ...need.value, title: "GPS mapping workshop" } }] };
  await save(token, owner, id, edited, share.initiativeRevision);
  const state = parseMatchingState(await matching(token, id, { action: "state" }));
  assert.equal(state.entries[0]?.entryId, need.id);
  assert.equal(state.entries[0]?.sharing, "needs_review");
  assert.equal(parseMatchingSearch(await matching(token, id, { action: "search" })).results.length, 0);
  const next = await preview();
  await matching(token, id, { action: "renew", reviewId: next.reviewId, requestId: crypto.randomUUID() }, 409);
  await matching(token, id, { action: "share", reviewId: next.reviewId, requestId: crypto.randomUUID() });
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
  await save(token, owner, id, { ...base, needs: [need], offers: [offer] });
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
    assert.deepEqual(parseMatchingSearch(await matching(token, id, { action: "search" })).results, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal((await handler(post("/api/projects", { action: "public_evidence", workspaceId: id }))).status, 401);
  assert.equal((await handler(post("/api/projects", { action: "public_evidence", workspaceId: id },
    fixtureSession(crypto.randomUUID())))).status, 404);
  assert.equal((await handler(post("/api/projects", { action: "public_evidence", workspaceId: id, query: need.value.title },
    token))).status, 400);
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

test("team editing shares only selected entries, invalidates edits and denies viewer commands", async () => {
  const { FIXTURE_TEAM_ID, FIXTURE_TEAM_EDITOR, FIXTURE_SECOND_TEAM_ID, FIXTURE_SECOND_EDITOR,
    projectEvidenceFixture } = await import("../dev/matching-fixture.ts");
  const { FIXTURE_ACCOUNT_ID } = await import("../dev/account-fixture.ts");
  const { requestTeamWorkspace, saveTeamWorkspace } = await import("../src/partners/team-workspace.ts");
  const { matchingRequest } = await import("../src/partners/matching-client.ts");
  const handler = projectEvidenceFixture(origin);
  const tokens = { editor: fixtureSession(FIXTURE_TEAM_EDITOR), viewer: fixtureSession(FIXTURE_ACCOUNT_ID),
    second: fixtureSession(FIXTURE_SECOND_EDITOR) };
  let token = tokens.editor;
  const signal = new AbortController().signal;
  const original = globalThis.fetch;
  globalThis.fetch = (input, options) => {
    const body = JSON.parse(String(options?.body));
    const request = post(String(input), body, token);
    return input === "/api/projects" ? handler(request) : matchingFixture(request);
  };
  try {
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

    token = tokens.second;
    const initialSecond = (await requestTeamWorkspace(FIXTURE_SECOND_TEAM_ID, signal)).saved!;
    const second = await saveTeamWorkspace(FIXTURE_SECOND_TEAM_ID, { expectedRevision: initialSecond.revision,
      requestId: crypto.randomUUID(), document: { ...initialSecond.document,
        offers: initialSecond.document.offers.map((entry) => ({ ...entry, value: { ...entry.value,
          title: "GPS watershed mapping training" } })),
      } }, signal);
    const initial = await matchingRequest(second.id, "state", {}, signal);
    const secondReview = await matchingRequest(second.id, "preview", { initiativeRevision: second.revision,
      entries: initial.entries.filter(({ kind }) => kind === "offer").map(entryReference) }, signal);
    await matchingRequest(second.id, "share", { reviewId: secondReview.reviewId, requestId: crypto.randomUUID() }, signal);
    const findTeam = async () => {
      token = tokens.second;
      return (await matchingRequest(second.id, "search", {}, signal)).results.filter(({ counterpart }) => counterpart.id === team.id);
    };
    assert.deepEqual(await findTeam(), []);
    token = tokens.editor;
    const state = await matchingRequest(team.id, "state", {}, signal);
    assert.ok(state.entries.every(({ sharing }) => sharing === "private"));
    const ref = state.entries.find(({ kind }) => kind === "need")!;
    const review = await matchingRequest(team.id, "preview", { initiativeRevision: team.revision,
      entries: [entryReference(ref)] }, signal);
    token = tokens.viewer;
    await assert.rejects(matchingRequest(team.id, "preview", { initiativeRevision: team.revision,
      entries: [entryReference(ref)] }, signal), { code: "workspace_edit_required" });
    await assert.rejects(matchingRequest(team.id, "share", { reviewId: review.reviewId,
      requestId: crypto.randomUUID() }, signal), { code: "workspace_edit_required" });
    token = tokens.editor;
    await matchingRequest(team.id, "share", { reviewId: review.reviewId, requestId: crypto.randomUUID() }, signal);
    assert.equal((await findTeam()).length, 1);
    token = tokens.editor;
    const selected = (await matchingRequest(team.id, "state", {}, signal)).entries.find(({ kind }) => kind === "need")!;
    const oldReview = await matchingRequest(team.id, "preview", { initiativeRevision: team.revision,
      entries: [entryReference(selected)] }, signal);
    team = await saveTeamWorkspace(team.id, { expectedRevision: team.revision, requestId: crypto.randomUUID(),
      document: { ...team.document, needs: [{ ...need, value: { ...need.value, description: "Updated GPS watershed mapping" } }] } }, signal);
    assert.deepEqual(await findTeam(), []);
    token = tokens.editor;
    await assert.rejects(matchingRequest(team.id, "share", { reviewId: oldReview.reviewId, requestId: crypto.randomUUID() }, signal),
      { code: "matching_conflict" });
    const current = (await matchingRequest(team.id, "state", {}, signal)).entries.find(({ kind }) => kind === "need")!;
    const renewed = await matchingRequest(team.id, "preview", { initiativeRevision: team.revision,
      entries: [entryReference(current)] }, signal);
    await matchingRequest(team.id, "share", { reviewId: renewed.reviewId, requestId: crypto.randomUUID() }, signal);
    assert.equal((await findTeam()).length, 1);
    token = tokens.editor;
    const shared = (await matchingRequest(team.id, "state", {}, signal)).entries.find(({ kind }) => kind === "need")!;
    await matchingRequest(team.id, "withdraw", { entries: [entryReference(shared)], requestId: crypto.randomUUID() }, signal);
    assert.deepEqual(await findTeam(), []);
  } finally {
    globalThis.fetch = original;
  }
});
