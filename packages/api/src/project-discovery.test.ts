import assert from "node:assert/strict";
import { test } from "node:test";
import { AccountError } from "./account-provider.ts";
import { createProjectDiscovery } from "./project-discovery.ts";
import { parseProjectDiscoveryCommand } from "./project-discovery-contract.ts";
import type { ProjectActor } from "./project-commands.ts";
import type { ProjectDiscoveryStore } from "./project-discovery-store.ts";

const actor: ProjectActor = { userId: "10000000-0000-4000-8000-000000000001",
  sessionId: "10000000-0000-4000-8000-000000000002", did: "did:plc:aaaaaaaaaaaaaaaaaaaaaaaa" };
const groupDid = "did:plc:bbbbbbbbbbbbbbbbbbbbbbbb";
const otherDid = "did:plc:cccccccccccccccccccccccc";
const workspaceId = "10000000-0000-4000-8000-000000000003";
const requestId = "10000000-0000-4000-8000-000000000004";
const projectUri = `at://${groupDid}/org.hypercerts.collection/project`;
const date = "2026-11-10T00:00:00.000Z";
const project = { uri: projectUri, cid: "bafyfixture", repoDid: groupDid, groupDid,
  title: "Public garden project", description: "A public project description.", createdAt: date, visibility: "public" as const };
const workspace = { workspaceId, projectUri, repositoryDid: groupDid, groupDid, accessRole: "editor", kind: "group" };
const ok = <T>(value: T) => ({ ok: true as const, value });
type Provider = Parameters<typeof createProjectDiscovery>[0];

function fixture(overrides: Partial<Provider> = {}, read?: ProjectDiscoveryStore["read"]) {
  const memberships: string[] = [];
  const reads: Array<{ action: string; data: Record<string, unknown> }> = [];
  const lifecycleCalls: Array<{action:string;data:unknown}> = [];
  const provider: Provider = {
    listMemberships: async () => ok({ groups: [{ groupDid, role: "admin" as const, joinedAt: date }] }),
    listProjects: async () => ok({ repositoryDid: groupDid, certifiedRole: "admin" as const, projects: [project] }),
    getProject: async uri => ok({ ...project, uri }),
    getMembership: async (_, group) => { memberships.push(group); return ok("member" as const); },
    ...overrides,
  };
  const execute = createProjectDiscovery(provider, { async read(actor, action, data) {
    reads.push({ action, data });
    return read ? read(actor, action, data) : { entries: [] };
  } }, {projects:{async execute(_,action,data){lifecycleCalls.push({action,data});return null;}},
    content:{async target(){return {projectUri,repositoryDid:groupDid,groupDid,cid:project.cid};},
      async command(_,__,___,____,action,data){lifecycleCalls.push({action,data});return null;}}});
  return { execute, memberships, reads, lifecycleCalls };
}

const rejects = (operation: Promise<unknown>, status: number, code: string) =>
  assert.rejects(operation, error => error instanceof AccountError && error.status === status && error.code === code);

test("strictly parses explicit listing targets and rejects mutation fields, arbitrary repositories and invalid cursors", () => {
  for (const command of [
    { action: "list_projects" }, { action: "list_projects", target: { kind: "personal", actorDid: otherDid } },
    { action: "list_projects", target: { kind: "group", groupDid: "did:plc:bad" } },
    { action: "list_workspaces", actorDid: otherDid }, { action: "list_workspaces", setupCursor: "abc" },
    { action: "list_project_groups", cursor: "a+b" }, { action: "list_project_groups", cursor: "x".repeat(4097) },
    { action: "list_workspaces", privateDocument: {} },
  ]) assert.throws(() => parseProjectDiscoveryCommand(command));
  assert.deepEqual(parseProjectDiscoveryCommand({ action: "list_projects", target: { kind: "personal" } }),
    { action: "list_projects", target: { kind: "personal" }, cursor: undefined });
  assert.equal(parseProjectDiscoveryCommand({ action: "lookup", projectUri }), undefined);
});

test("lists current Certified group memberships for the picker", async () => {
  const result = await fixture().execute(actor, { action: "list_project_groups" });
  assert.deepEqual(result, { groups: [{ groupDid, role: "admin", joinedAt: date }], cursor: undefined });
});

test("binds opaque provider pagination to the exact actor, action and project repository", async () => {
  let observed: string | undefined;
  const { execute } = fixture({ listProjects: async (_, target, cursor) => {
    observed = cursor;
    return ok({ repositoryDid: target.kind === "personal" ? actor.did : target.groupDid,
      projects: [], cursor: "provider+=/cursor" });
  } });
  const result = await execute(actor, { action: "list_projects", target: { kind: "personal" } });
  assert.ok(result.cursor);
  await execute(actor, { action: "list_projects", target: { kind: "personal" }, cursor: result.cursor });
  assert.equal(observed, "provider+=/cursor");
  await rejects(execute(actor, { action: "list_projects", target: { kind: "group", groupDid }, cursor: result.cursor }),
    400, "invalid_project_command");
  await rejects(execute({ ...actor, did: otherDid }, { action: "list_projects", target: { kind: "personal" }, cursor: result.cursor }),
    400, "invalid_project_command");
  await rejects(execute(actor, { action: "list_project_groups", cursor: result.cursor }), 400, "invalid_project_command");
});

test("workspace discovery returns stable IDs and public summaries without selecting private saved content", async () => {
  const { execute, memberships } = fixture({}, async () => ({ entries: [
    { ...workspace, privateSavedTitle: "PRIVATE TITLE", document: { needs: ["PRIVATE NEED"] } },
  ] }));
  const result = await execute(actor, { action: "list_workspaces" });
  assert.deepEqual(result, { workspaces: [{ workspaceId, kind: "group", accessRole: "editor",
    projectUri, certifiedRole: "member", project }], cursor: undefined, pendingSetups: [], setupCursor: undefined });
  assert.deepEqual(memberships, [groupDid]);
  assert.ok(!JSON.stringify(result).includes("PRIVATE"));
});

test("solo workspace discovery requires the actor's own repository and reports the separate kind", async () => {
  const personalUri = projectUri.replace(groupDid, actor.did);
  const { groupDid: _, ...personal } = { ...project, uri: personalUri, repoDid: actor.did };
  const { execute, memberships } = fixture({ getProject: async () => ok(personal) }, async () => ({ entries: [
    { workspaceId, projectUri: personalUri, repositoryDid: actor.did, accessRole: "admin", kind: "personal" },
  ] }));
  const result = await execute(actor, { action: "list_workspaces" });
  assert.equal(result.workspaces?.[0]?.kind, "personal");
  assert.deepEqual(memberships, []);
  const forged = fixture({}, async () => ({ entries: [{ ...workspace, kind: "personal", accessRole: "admin" }] }));
  await rejects(forged.execute(actor, { action: "list_workspaces" }), 503, "project_workspace_unavailable");
});

test("suspends a confirmed departed member and keeps unavailable public projects as paused authorized private workspaces", async () => {
  for (const overrides of [
    { getMembership: async () => ok(null) },
    { getProject: async () => ok({ ...project, visibility: "unlisted" as const }) },
    { getProject: async () => ({ ok: false as const, code: "not_found" as const }) },
  ]) {
    const { execute,lifecycleCalls } = fixture(overrides, async () => ({ entries: [workspace] }));
    const result=await execute(actor, { action: "list_workspaces" });
    if ("getMembership" in overrides) {
      assert.deepEqual(result.workspaces,[]);
      assert.equal(lifecycleCalls[0]?.action,"suspend_access");
      assert.equal((lifecycleCalls[0]?.data as {recipientRole:string}).recipientRole,"absent");
    } else {
      assert.equal(result.workspaces?.[0]?.status,"paused");
      assert.equal(result.workspaces?.[0]?.project,null);
      assert.equal(lifecycleCalls[0]?.action,"pause_matching");
      assert.ok(!JSON.stringify(result).includes(project.title));
    }
  }
});

test("membership uncertainty fails closed instead of treating an incomplete check as absent", async () => {
  const { execute,lifecycleCalls } = fixture({ getMembership: async () => ({ ok: false, code: "unavailable" }) },
    async () => ({ entries: [workspace] }));
  await rejects(execute(actor, { action: "list_workspaces" }), 503, "certified_project_unavailable");
  assert.deepEqual(lifecycleCalls,[]);
});

test("a public project transport outage never pauses matching or returns a falsely confirmed deletion",async()=>{
  const {execute,lifecycleCalls}=fixture({getProject:async()=>({ok:false,code:"unavailable"})},async()=>({entries:[workspace]}));
  await rejects(execute(actor,{action:"list_workspaces"}),503,"certified_project_unavailable");
  assert.deepEqual(lifecycleCalls,[]);
});

test("validates storage page sizes, duplicate workspace IDs and canonical public repository proofs", async () => {
  for (const entries of [[workspace, workspace], Array.from({ length: 26 }, () => workspace),
    [{ ...workspace, groupDid: otherDid }], [{ ...workspace, accessRole: "owner" }]]) {
    await rejects(fixture({}, async () => ({ entries })).execute(actor, { action: "list_workspaces" }),
      503, "project_workspace_unavailable");
  }
  const forged = fixture({ getProject: async () => ok({ ...project, groupDid: otherDid }) }, async () => ({ entries: [workspace] }));
  await rejects(forged.execute(actor, { action: "list_workspaces" }), 503, "project_workspace_unavailable");
});

test("pending setup summaries require fresh group administration and omit requester identity", async () => {
  const setup = { requestId, projectUri, groupDid, requestedAt: date, requesterId: actor.userId, requesterEmail: "PRIVATE" };
  const { execute, reads } = fixture({ getMembership: async () => ok("admin") }, async (_, action) =>
    ({ entries: action === "list_workspaces" ? [] : [setup] }));
  const result = await execute(actor, { action: "list_workspaces", setupGroupDid: groupDid });
  assert.deepEqual(result.pendingSetups, [{ requestId, projectUri, groupDid, requestedAt: date, project }]);
  assert.ok(!JSON.stringify(result).includes("PRIVATE"));
  assert.deepEqual(reads[1], { action: "list_setup_requests", data: { groupDid, actorRole: "admin", cursor: undefined } });
  const member = fixture({}, async () => ({ entries: [] }));
  await rejects(member.execute(actor, { action: "list_workspaces", setupGroupDid: groupDid }), 403, "project_authority_required");
  assert.equal(member.reads.length, 1);
});

test("workspace page cursors continue through hidden public records without repeating or skipping SQL boundaries", async () => {
  const entries = Array.from({ length: 25 }, (_, i) => ({ ...workspace,
    workspaceId: `10000000-0000-4000-8000-${String(i + 10).padStart(12, "0")}` }));
  const boundary = entries.at(-1)!.workspaceId;
  let observed: unknown;
  const { execute } = fixture({ getMembership: async () => ok(null) }, async (_, __, data) => {
    observed = data.cursor;
    return data.cursor ? { entries: [] } : { entries, cursor: boundary };
  });
  const first = await execute(actor, { action: "list_workspaces" });
  assert.deepEqual(first.workspaces, []);
  assert.ok(first.cursor);
  await execute(actor, { action: "list_workspaces", cursor: first.cursor });
  assert.equal(observed, boundary);
});

test("caller cancellation stops discovery before any provider or SQL operation", async () => {
  const { execute, reads } = fixture({ listProjects: async () => assert.fail("no provider call after cancellation") });
  await rejects(execute(actor, { action: "list_projects", target: { kind: "personal" } }, AbortSignal.abort()),
    503, "project_workspace_unavailable");
  assert.equal(reads.length, 0);
});
