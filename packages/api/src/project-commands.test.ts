import assert from "node:assert/strict";
import { test } from "node:test";
import { AccountError } from "./account-provider.ts";
import {
  createPersonalProjectCommand, createProjectCommands, parseProjectCommand,
  type PersonalProjectCommand, type ProjectActor, type ProjectStore,
} from "./project-commands.ts";
import { createCertifiedProjectProvider, type CertifiedProjectProvider, type CertifiedProject, type CertifiedProjectDraft } from "./certified-project-provider.ts";
import { createProjectHandler, parseProjectRequest } from "./project-http.ts";
import { createSupportPublication, parseSupportPublicationCommand, type SupportPublicationStore } from "./support-publication.ts";

const actor: ProjectActor = {
  userId: "00000000-0000-0000-0000-000000000001",
  sessionId: "00000000-0000-0000-0000-000000000002",
  did: "did:plc:aaaaaaaaaaaaaaaaaaaaaaaa",
};
const workspaceId = "00000000-0000-0000-0000-000000000003";
const requestId = "00000000-0000-0000-0000-000000000004";
const recipientDid = "did:plc:bbbbbbbbbbbbbbbbbbbbbbbb";
const groupDid = "did:plc:cccccccccccccccccccccccc";
const uri = `at://${groupDid}/org.hypercerts.collection/3jzfcijpj2z2a`;
const ok = <T>(value: T) => ({ ok: true, value } as const);
const fail = <T extends string>(code: T) => ({ ok: false, code } as const);
const project: CertifiedProject = {
  uri, repoDid: groupDid, groupDid, cid: "bafyfixture", title: "Fictional Seed Library",
  createdAt: "2026-11-01T00:00:00.000Z", visibility: "public",
};
function setup(provider: Partial<CertifiedProjectProvider>, store: ProjectStore) {
  return createProjectCommands({
    getProject: async () => ok(project),
    ...provider,
  } as CertifiedProjectProvider, store, "https://dev.certified.app");
}

test("only a verified workspace admin can resolve a teammate handle; resolving never grants access", async () => {
  let resolutions = 0;
  const writes: string[] = [];
  let accessRole = "viewer";
  const execute = setup({ getMembership: async () => ok("member"), resolveHandle: async handle => {
    resolutions++; assert.equal(handle, "teammate.certified.one"); return ok({ did: recipientDid, handle });
  } }, { async execute(_, action) { writes.push(action); return { workspaceId, accessRole }; } });
  const command = parseProjectCommand({ action: "resolve_teammate", projectUri: uri, workspaceId, handle: "@TEAMMATE.certified.one" });
  await assert.rejects(execute(actor, command), { code: "workspace_admin_required" });
  assert.equal(resolutions, 0);
  accessRole = "admin";
  assert.deepEqual(await execute(actor, command), { recipientDid, handle: "teammate.certified.one" });
  assert.equal(resolutions, 1);
  assert.deepEqual(writes, ["lookup", "lookup"]);
  for (const handle of ["person@example.test", "https://example.test", "did:plc:aaaaaaaaaaaaaaaaaaaaaaaa"])
    assert.throws(() => parseProjectCommand({ action: "resolve_teammate", projectUri: uri, workspaceId, handle }));
});

test("the HTTP boundary rejects forged role claims and cross-origin writes", async () => {
  let ran = false;
  const origin = "https://weave.example";
  const handle = createProjectHandler({
    origin,
    async resolveActor() { return actor; },
    async execute() { ran = true; return { status: "linked" }; },
  });
  const post = (payload: unknown, from = origin) => handle(new Request(`${origin}/api/projects`, {
    method: "POST", headers: { origin: from, "content-type": "application/json" }, body: JSON.stringify(payload),
  }));
  const lookup = { action: "lookup", projectUri: uri };
  assert.equal((await post(lookup, "https://elsewhere.example")).status, 403);
  assert.equal((await post({ ...lookup, actorRole: "owner" })).status, 400);
  assert.equal(ran, false);
  const response = await post(lookup);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(ran, true);
});

test("a verified member can request setup but cannot approve it", async () => {
  const calls: string[] = [];
  const execute = setup({ getMembership: async () => ok("member") }, {
    async execute(current, action, data) {
      assert.deepEqual(current, actor);
      assert.equal(data.actorRole, "member");
      calls.push(action);
      return { status: "pending", requestId };
    },
  });
  const command = (action: string, extra = {}) => parseProjectCommand({ action, projectUri: uri, ...extra });
  assert.deepEqual(await execute(actor, command("request_setup")), { status: "pending", requestId });
  await assert.rejects(execute(actor, command("approve_setup", { requestId })),
    (error: unknown) => error instanceof AccountError && error.code === "project_authority_required");
  assert.deepEqual(calls, ["request_setup"]);
});

test("a verified absence suspends access while an unavailable check leaves grants alone", async () => {
  const calls: string[] = [];
  const store: ProjectStore = {
    async execute(_actor, action, data) {
      assert.equal(data.recipientDid, actor.did);
      assert.equal(data.recipientRole, "absent");
      assert.equal(typeof data.observedAt, "string");
      calls.push(action);
      return { status: "suspended" };
    },
  };
  const lookup = parseProjectCommand({ action: "lookup", projectUri: uri });
  await assert.rejects(setup({ getMembership: async () => fail("unavailable") }, store)(actor, lookup));
  assert.deepEqual(calls, []);
  await assert.rejects(setup({ getMembership: async () => ok(null) }, store)(actor, lookup));
  assert.deepEqual(calls, ["suspend_access"]);
});

test("adding an existing Certified account confirms membership before granting, and retries skip the upstream write", async () => {
  let added = false;
  const calls: string[] = [];
  const execute = setup({
    getMembership: async () => ok("admin"),
    getGroupMember: async () => ok(added ? "member" : null),
    async addMember(_actor, _group, data) {
      assert.deepEqual(data, { memberDid: recipientDid, role: "member" });
      calls.push("add");
      added = true;
      return fail("pending");
    },
  }, {
    async execute(_actor, action, data) {
      calls.push(action);
      if (action === "lookup") return { workspaceId, accessRole: "admin" };
      assert.equal(data.recipientDid, recipientDid);
      if (action === "check_recipient") return { status: "verified" };
      assert.equal(data.recipientRole, "member");
      return { status: "granted" };
    },
  });
  const command = parseProjectCommand({
    action: "add_member_and_grant", projectUri: uri, workspaceId, recipientDid,
    accessRole: "editor", confirmGroupPermissions: true,
  });
  assert.deepEqual(await execute(actor, command), { status: "granted" });
  assert.deepEqual(await execute(actor, command), { status: "granted" });
  assert.deepEqual(calls, ["lookup", "check_recipient", "add", "grant_access", "lookup", "grant_access"]);
});

test("group and project writes reconcile a lost response against the same durable intent", async () => {
  let intent: Record<string, unknown> | null = null;
  let groupCalls = 0, projectCalls = 0;
  let createdDraft: CertifiedProjectDraft | undefined;
  const fullHandle = "seed-library.dev.certified.app";
  const execute = setup({
    async findRegisteredGroup() {
      return groupCalls ? ok({ groupDid, handle: fullHandle }) : fail("not_found");
    },
    async registerGroup() { groupCalls++; return fail("pending"); },
    getMembership: async () => ok("owner"),
    async createProject(_actor, _group, draft) { projectCalls++; createdDraft = draft; return fail("pending"); },
    async confirmProject(_group, draft) {
      assert.deepEqual(draft, createdDraft);
      return ok({ ...project, uri: `at://${groupDid}/org.hypercerts.collection/${draft.rkey}` });
    },
    async getProject(projectUri) { return ok({ ...project, uri: projectUri }); },
  }, {
    async execute(_actor, action, data) {
      if (action === "get_create") return intent;
      if (action === "begin_create") return intent ??= { ...data, status: "prepared" };
      assert.ok(intent);
      if (action === "claim_create_step") intent.status = `${data.step}_pending`;
      if (action === "record_group") Object.assign(intent, { groupDid, status: "group_confirmed" });
      if (action === "record_project") Object.assign(intent, { projectUri: data.projectUri, status: "project_confirmed" });
      if (action === "finish_create") Object.assign(intent, { workspaceId, status: "linked" });
      return { ...intent, ...(action === "claim_create_step" ? { claimed: true } : {}) };
    },
  });
  const command = parseProjectCommand({
    action: "create", initiativeId: workspaceId, expectedRevision: 1, requestId,
    groupLabel: "seed-library", publicProfile: { title: "Fictional Seed Library", description: "Shared seeds." },
  });
  assert.deepEqual(await execute(actor, command), { status: "pending", step: "group", requestId });
  assert.deepEqual(await execute(actor, command), { status: "pending", step: "project", requestId });
  const result = await execute(actor, command);
  assert.equal((result as { status: string }).status, "linked");
  assert.equal(groupCalls, 1);
  assert.equal(projectCalls, 1);
  assert.match(createdDraft!.rkey, /^[2-7a-j][2-7a-z]{12}$/);
});

const projectRkey = "3jzfcijpj2z2a", locationRkey = "3jzfcijpj2z2b";
const ownProjectUri = `at://${actor.did}/org.hypercerts.collection/${projectRkey}`;
const ownLocationUri = `at://${actor.did}/app.certified.location/${locationRkey}`;
const draft = {
  action: "create_personal_project", requestId, projectRkey, locationRkey,
  title: "  Fictional Seed Library ", description: "Shared seeds.\nFor the valley. ", place: " Upper  valley ",
};
const unplaced = (({ locationRkey: _, place: __, ...rest }) => rest)(draft);
const personal = (body: Record<string, unknown> = draft) => parseProjectCommand(body) as PersonalProjectCommand;

test("a personal project command takes exactly its own fields, each checked and tidied at the boundary", async () => {
  assert.deepEqual(personal(), {
    action: "create_personal_project", requestId, projectRkey, title: "Fictional Seed Library",
    description: "Shared seeds.\nFor the valley.", place: { rkey: locationRkey, name: "Upper valley" },
  });
  assert.deepEqual(personal(unplaced), {
    action: "create_personal_project", requestId, projectRkey, title: "Fictional Seed Library", description: "Shared seeds.\nFor the valley.",
  });
  assert.deepEqual(parseProjectRequest(draft), personal(), "POST /api/projects reaches this parser");
  assert.equal(personal({ ...draft, description: "" }).description, "");
  assert.equal(personal({ ...draft, title: "é".repeat(80), place: "p".repeat(120) }).place?.name, "p".repeat(120));
  const { locationRkey: _, ...placeWithoutKey } = draft;
  const { place: __, ...keyWithoutPlace } = draft;
  const { description: ___, ...noDescription } = draft;
  for (const [label, body] of [
    ["a request ID that is not a UUID", { ...draft, requestId: "retry-1" }],
    ["an uppercase project key", { ...draft, projectRkey: projectRkey.toUpperCase() }],
    ["a short project key", { ...draft, projectRkey: "3jzfcijpj2z2" }],
    ["a location key that is not a TID", { ...draft, locationRkey: "self" }],
    ["a place without its key", placeWithoutKey],
    ["a location key without a place", keyWithoutPlace],
    ["no description", noDescription],
    ["an empty title", { ...draft, title: "   " }],
    ["a title of 81 graphemes", { ...draft, title: "t".repeat(81) }],
    ["a title over 800 bytes in 33 graphemes", { ...draft, title: "\u{1F469}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}".repeat(33) }],
    ["a title with a control character", { ...draft, title: "Seed\u0007Library" }],
    ["a title on two lines", { ...draft, title: "Seed\nLibrary" }],
    ["a number for a title", { ...draft, title: 7 }],
    ["a description of 801 characters", { ...draft, description: "d".repeat(801) }],
    ["a description with a NUL", { ...draft, description: "Shared\u0000seeds" }],
    ["a description with a lone surrogate", { ...draft, description: "Shared \ud800 seeds" }],
    ["an empty place", { ...draft, place: "  " }],
    ["a place of 121 characters", { ...draft, place: "p".repeat(121) }],
    ["a place on two lines", { ...draft, place: "Upper\nvalley" }],
    ["a null place", { ...draft, place: null }],
    ["an extra field", { ...draft, visibility: "public" }],
    ["a supplied repository", { ...draft, repo: "did:plc:bbbbbbbbbbbbbbbbbbbbbbbb" }],
  ] as const) assert.throws(() => parseProjectCommand(body), { code: "invalid_project_command" }, label);

  let ran = false;
  const origin = "https://weave.example";
  const handle = createProjectHandler({ origin, async resolveActor() { return actor; }, async execute() { ran = true; return {}; } });
  const response = await handle(new Request(`${origin}/api/projects`, {
    method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ ...draft, createdAt: "2020-01-01T00:00:00Z" }),
  }));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "invalid_project_command" });
  assert.equal(ran, false);
});

/** The signed-in person's own repository on a synthetic PDS: public reads, and writes made with their consent. */
function personalRepository(options: { groupService?: boolean } = {}) {
  const pds = "https://pds.example.test";
  const records = new Map<string, { cid: string; value: Record<string, unknown> }>();
  const state = { writes: [] as string[], reads: 0, refuse: false, failWrites: new Set<string>(), loseResponses: false, failReads: false };
  let next = 0;
  const provider = createCertifiedProjectProvider({
    groupServiceOrigin: "https://groups.example.test", groupPdsOrigin: pds, serviceAuth: async () => assert.fail("no group service call"),
    async fetch(input) {
      const url = new URL(String(input));
      state.reads++;
      if (url.origin === "https://plc.directory") return Response.json({ id: actor.did, alsoKnownAs: [], service: [
        { id: "#atproto_pds", type: "AtprotoPersonalDataServer", serviceEndpoint: pds },
        ...options.groupService ? [{ id: "#certified_group", type: "CertifiedGroupService", serviceEndpoint: "https://groups.example.test" }] : [],
      ] });
      assert.equal(url.origin, pds);
      assert.equal(url.pathname, "/xrpc/com.atproto.repo.getRecord");
      assert.equal(url.searchParams.get("repo"), actor.did, "only the person's own repository is read");
      if (state.failReads) return Response.json({ error: "private upstream detail" }, { status: 502 });
      const key = `${url.searchParams.get("collection")}/${url.searchParams.get("rkey")}`;
      const found = records.get(key);
      return found ? Response.json({ uri: `at://${actor.did}/${key}`, ...structuredClone(found) })
        : Response.json({ error: "RecordNotFound" }, { status: 400 });
    },
    async ownRecordWrite({ actorDid, collection, rkey, record, signal }) {
      assert.equal(actorDid, actor.did);
      assert.equal(signal.aborted, false);
      const key = `${collection}/${rkey}`;
      state.writes.push(key);
      if (state.refuse) return null;
      if (state.failWrites.has(collection)) return Response.json({ error: "private upstream detail" }, { status: 502 });
      if (records.has(key)) return Response.json({ error: "InvalidRequest", message: "private detail" }, { status: 400 });
      const cid = `bafyrei${String.fromCharCode(97 + next++).repeat(52)}`;
      records.set(key, { cid, value: structuredClone(record) });
      return state.loseResponses ? Response.json({ error: "private upstream detail" }, { status: 504 })
        : Response.json({ uri: `at://${actorDid}/${key}`, cid });
    },
  });
  return { provider, records, state };
}
const grantGiven = async (did: string) => { assert.equal(did, actor.did); };

test("a personal project is written once: its place, then the project pinning that place, and a retry writes nothing", async () => {
  const { provider, records, state } = personalRepository();
  const run = createPersonalProjectCommand(provider, grantGiven);
  const created = await run(actor, personal());
  assert.deepEqual(state.writes, [`app.certified.location/${locationRkey}`, `org.hypercerts.collection/${projectRkey}`]);
  const location = records.get(`app.certified.location/${locationRkey}`)!;
  const stored = records.get(`org.hypercerts.collection/${projectRkey}`)!;
  assert.deepEqual(created, { status: "created", projectUri: ownProjectUri, cid: stored.cid });
  assert.deepEqual({ ...location.value, createdAt: "set" }, {
    $type: "app.certified.location", lpVersion: "1.0.0", srs: "http://www.opengis.net/def/crs/OGC/1.3/CRS84",
    locationType: "address", location: { $type: "app.certified.location#string", string: "Upper valley" },
    name: "Upper valley", createdAt: "set",
  });
  assert.deepEqual(stored.value, {
    $type: "org.hypercerts.collection", type: "project", title: "Fictional Seed Library", createdAt: location.value.createdAt,
    description: { $type: "org.hypercerts.defs#descriptionString", value: "Shared seeds.\nFor the valley." },
    location: { uri: ownLocationUri, cid: location.cid },
  }, "no visibility field, so the project is public");

  // A lost response is retried with the same body, later: the same project comes back and nothing is written.
  assert.deepEqual(await run(actor, personal()), created);
  assert.equal(state.writes.length, 2);
  assert.equal(records.size, 2);

  // The project Weave just made is an ordinary personal project: a saved card links to it and its support is reviewed.
  const linked: Array<{ action: string; data: Record<string, unknown> }> = [];
  const commands = createProjectCommands(provider, { async execute(_actor, action, data) {
    linked.push({ action, data }); return { status: "linked", workspaceId };
  } }, "https://dev.certified.app");
  assert.deepEqual(await commands(actor, parseProjectCommand({ action: "link", projectUri: ownProjectUri, initiativeId: workspaceId, expectedRevision: 1 })),
    { status: "linked", workspaceId });
  assert.deepEqual(linked, [{ action: "link", data: {
    projectUri: ownProjectUri, repositoryDid: actor.did, cid: stored.cid, initiativeId: workspaceId, expectedRevision: 1,
  } }]);
  const reviewed: Array<{ action: string; role: unknown; projectCid: unknown }> = [];
  const supportStore: SupportPublicationStore = {
    async target() { return { projectUri: ownProjectUri, repositoryDid: actor.did, groupDid: null }; },
    async command(_actor, id, role, projectCid, action) {
      assert.equal(id, workspaceId);
      reviewed.push({ action, role, projectCid });
      return { reviewId: requestId };
    },
  };
  const noWrites = { authorize: () => assert.fail(), read: () => assert.fail(), create: () => assert.fail(), delete: () => assert.fail() };
  assert.deepEqual(await createSupportPublication(provider, supportStore, noWrites).execute(actor, parseSupportPublicationCommand({
    action: "support_review", workspaceId, kind: "need", entryId: "00000000-0000-0000-0000-000000000005",
    expectedRevision: 1, expectedEntryRevision: 1, expiresAt: null,
  })), { reviewId: requestId });
  assert.deepEqual(reviewed, [{ action: "support_review", role: null, projectCid: stored.cid }]);
  assert.equal(state.writes.length, 2);
});

test("a draft without a place writes only its project, and lost or partial writes finish on a retry without a second record", async () => {
  const bare = personalRepository();
  const created = await createPersonalProjectCommand(bare.provider, grantGiven)(actor, personal(unplaced));
  assert.deepEqual(bare.state.writes, [`org.hypercerts.collection/${projectRkey}`]);
  assert.equal(Object.hasOwn(bare.records.get(`org.hypercerts.collection/${projectRkey}`)!.value, "location"), false);
  assert.equal(created.projectUri, ownProjectUri);

  // A place longer than the lexicon allows for a name is kept as its address text alone, and still read back.
  const long = personalRepository();
  const street = "Plot ".repeat(22).trim();
  await createPersonalProjectCommand(long.provider, grantGiven)(actor, personal({ ...draft, place: street }));
  const written = long.records.get(`app.certified.location/${locationRkey}`)!.value;
  assert.equal(Object.hasOwn(written, "name"), false);
  assert.deepEqual(written.location, { $type: "app.certified.location#string", string: street });

  // Both answers lost: each record is read back at its key, so the first attempt still succeeds.
  const lost = personalRepository();
  lost.state.loseResponses = true;
  const first = await createPersonalProjectCommand(lost.provider, grantGiven)(actor, personal());
  assert.equal(first.cid, lost.records.get(`org.hypercerts.collection/${projectRkey}`)!.cid);
  assert.equal(lost.state.writes.length, 2);

  // The place is written and the project's write fails: the retry pins the same place and writes only the project.
  const partial = personalRepository();
  partial.state.failWrites.add("org.hypercerts.collection");
  const run = createPersonalProjectCommand(partial.provider, grantGiven);
  await assert.rejects(run(actor, personal()), { status: 503, code: "project_workspace_unavailable" });
  assert.deepEqual([...partial.records.keys()], [`app.certified.location/${locationRkey}`]);
  partial.state.failWrites.clear();
  assert.equal((await run(actor, personal())).projectUri, ownProjectUri);
  assert.deepEqual(partial.state.writes, [`app.certified.location/${locationRkey}`, `org.hypercerts.collection/${projectRkey}`,
    `org.hypercerts.collection/${projectRkey}`]);
  assert.equal(partial.records.size, 2);
});

test("different records at the draft's keys are a conflict, and nothing more is written", async () => {
  for (const [label, seed] of [
    ["another project at the key", (records: Map<string, { cid: string; value: Record<string, unknown> }>) =>
      records.set(`org.hypercerts.collection/${projectRkey}`, { cid: `bafyrei${"z".repeat(52)}`, value: {
        $type: "org.hypercerts.collection", type: "project", title: "Another project", createdAt: "2026-11-01T00:00:00.000Z" } })],
    ["another place at the key", (records: Map<string, { cid: string; value: Record<string, unknown> }>) =>
      records.set(`app.certified.location/${locationRkey}`, { cid: `bafyrei${"z".repeat(52)}`, value: {
        $type: "app.certified.location", lpVersion: "1.0.0", srs: "http://www.opengis.net/def/crs/OGC/1.3/CRS84",
        locationType: "address", location: { $type: "app.certified.location#string", string: "Lower valley" },
        name: "Lower valley", createdAt: "2026-11-01T00:00:00.000Z" } })],
    ["this project without its place", (records: Map<string, { cid: string; value: Record<string, unknown> }>) =>
      records.set(`org.hypercerts.collection/${projectRkey}`, { cid: `bafyrei${"z".repeat(52)}`, value: {
        $type: "org.hypercerts.collection", type: "project", title: "Fictional Seed Library", createdAt: "2026-11-01T00:00:00.000Z",
        description: { $type: "org.hypercerts.defs#descriptionString", value: "Shared seeds.\nFor the valley." } } })],
  ] as const) {
    const { provider, records, state } = personalRepository();
    seed(records);
    const before = structuredClone([...records]);
    await assert.rejects(createPersonalProjectCommand(provider, grantGiven)(actor, personal()),
      { status: 409, code: "project_conflict" }, label);
    assert.deepEqual(state.writes, [], label);
    assert.deepEqual([...records], before, label);
  }
});

test("without the publish-initiative grant nothing is read or written, and a refused write stops before the project", async () => {
  const { provider, records, state } = personalRepository();
  const refused = createPersonalProjectCommand(provider, async () => { throw new AccountError(403, "project_consent_required"); });
  await assert.rejects(refused(actor, personal()), { status: 403, code: "project_consent_required" });
  assert.equal(state.reads, 0);
  assert.deepEqual(state.writes, []);
  // The grant lapsed between the check and the write: the PDS write is never sent and the project is not tried.
  state.refuse = true;
  await assert.rejects(createPersonalProjectCommand(provider, grantGiven)(actor, personal()), { status: 403, code: "project_consent_required" });
  assert.deepEqual(state.writes, [`app.certified.location/${locationRkey}`]);
  assert.equal(records.size, 0);
});

test("upstream failures answer one stable code and never the provider's words", async () => {
  for (const [label, prepare] of [
    ["reads fail", (state: ReturnType<typeof personalRepository>["state"]) => { state.failReads = true; }],
    ["the place cannot be written", (state: ReturnType<typeof personalRepository>["state"]) => { state.failWrites.add("app.certified.location"); }],
  ] as const) {
    const { provider, records, state } = personalRepository();
    prepare(state);
    const error = await createPersonalProjectCommand(provider, grantGiven)(actor, personal()).then(() => assert.fail(label), (caught: unknown) => caught);
    assert.ok(error instanceof AccountError, label);
    assert.deepEqual({ status: error.status, code: error.code }, { status: 503, code: "project_workspace_unavailable" }, label);
    assert.doesNotMatch(String(error.message), /private/u, label);
    assert.equal(records.size, 0, label);
  }
  const group = personalRepository({ groupService: true });
  await assert.rejects(createPersonalProjectCommand(group.provider, grantGiven)(actor, personal()), { status: 503, code: "project_workspace_unavailable" });
  assert.deepEqual(group.state.writes, [], "a group's repository is never written as a personal project");
});
