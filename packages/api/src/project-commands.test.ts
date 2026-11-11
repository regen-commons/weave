import assert from "node:assert/strict";
import { test } from "node:test";
import { AccountError } from "./account-provider.ts";
import { createProjectCommands, parseProjectCommand, type ProjectActor, type ProjectStore } from "./project-commands.ts";
import type { CertifiedProjectProvider, CertifiedProject, CertifiedProjectDraft } from "./certified-project-provider.ts";
import { createProjectHandler } from "./project-http.ts";

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
