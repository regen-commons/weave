import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { AccountError } from "./account-provider.ts";
import { createWorkspaceInvites } from "./workspace-invites.ts";
import { parseWorkspaceInviteCommand } from "./workspace-invites-contract.ts";
import type { WorkspaceInviteStore } from "./workspace-invites-store.ts";

const actor = { userId: "10000000-0000-4000-8000-000000000001",sessionId: "10000000-0000-4000-8000-000000000002",
  did: "did:plc:aaaaaaaaaaaaaaaaaaaaaaaa" };
const groupDid = "did:plc:bbbbbbbbbbbbbbbbbbbbbbbb";
const recipientDid = "did:plc:cccccccccccccccccccccccc";
const workspaceId = "10000000-0000-4000-8000-000000000003";
const inviteId = "10000000-0000-4000-8000-000000000004";
const projectUri = `at://${groupDid}/org.hypercerts.collection/project`;
const date = "2026-11-10T00:00:00.000Z";
const expiresAt = "2026-11-17T00:00:00.000Z";
const project = { uri: projectUri,cid: "bafyfixture",repoDid: groupDid,groupDid,title: "Public garden",createdAt: date,visibility: "public" as const };
type Provider = Parameters<typeof createWorkspaceInvites>[0];
const ok = <T>(value: T) => ({ ok: true as const,value });
const target = { projectUri,workspaceId };

function fixture(overrides: Partial<Provider> = {}, run?: WorkspaceInviteStore["execute"]) {
  const calls: Array<{action: string;data: Record<string,unknown>}> = [];
  const memberReads: string[] = [];
  const lifecycleCalls: string[] = [];
  const provider: Provider = {
    getProject: async () => ok(project),
    getMembership: async () => ok("member" as const),
    getGroupMember: async (_,__,did) => { memberReads.push(did); return ok("member" as const); },
    ...overrides,
  };
  const execute = createWorkspaceInvites(provider,{ async execute(actor,action,data) {
    calls.push({action,data});
    if (run) return run(actor,action,data);
    const status = {create:"pending",claim:"pending_review",check:"verified",approve:"granted",revoke:"revoked",list:"list"}[action];
    return { status,inviteId,expiresAt };
  } },{projects:{async execute(_,action){lifecycleCalls.push(action);return null;}},
    content:{async target(){return {projectUri,repositoryDid:groupDid,groupDid,cid:project.cid};},
      async command(_,__,___,____,action){lifecycleCalls.push(action);return null;}}});
  return { execute,calls,memberReads,lifecycleCalls };
}
const rejects = (operation: Promise<unknown>,status: number,code: string) => assert.rejects(operation,
  error => error instanceof AccountError && error.status === status && error.code === code);

test("invitation commands strictly validate target, exact recipient DID, roles and random token encoding", () => {
  const token = randomBytes(32).toString("base64url");
  assert.deepEqual(parseWorkspaceInviteCommand({action:"claim_invite",token}),{action:"claim_invite",token});
  for (const command of [
    {action:"claim_invite",token:"short"}, {action:"claim_invite",token,workspaceId},
    {action:"create_invite",...target,accessRole:"admin"}, {action:"list_invites",...target,cursor:"bad"},
    {action:"approve_invite",...target,inviteId,recipientDid,accessRole:"owner"},
    {action:"approve_invite",...target,inviteId,recipientDid:"did:plc:bad",accessRole:"editor"},
  ]) assert.throws(() => parseWorkspaceInviteCommand(command));
  assert.equal(parseWorkspaceInviteCommand({action:"lookup",projectUri}),undefined);
});

test("creates a random one-time link response while storage receives only its token hash", async () => {
  const { execute,calls } = fixture();
  const first = await execute(actor,{action:"create_invite",...target});
  const second = await execute(actor,{action:"create_invite",...target});
  assert.equal(first.status,"pending");
  assert.equal(first.expiresAt,expiresAt);
  assert.ok(first.token && /^[A-Za-z0-9_-]{43}$/u.test(first.token));
  assert.notEqual(first.token,second.token);
  assert.ok(typeof calls[0]?.data.tokenHash === "string" && /^[a-f0-9]{64}$/u.test(calls[0].data.tokenHash));
  assert.ok(!JSON.stringify(calls).includes(first.token));
  assert.equal(calls[0]?.data.actorRole,"member");
});

test("claiming passes the live actor and token hash only, grants no access and returns no workspace details", async () => {
  const token = randomBytes(32).toString("base64url");
  const { execute,calls,memberReads } = fixture({getProject: async () => assert.fail("claim never fetches workspace details")},
    async (_,action) => {
      assert.equal(action,"claim");
      return {status:"pending_review",inviteId,expiresAt,workspaceId,claimedDid:recipientDid,privateDocument:"PRIVATE"};
    });
  assert.deepEqual(await execute(actor,{action:"claim_invite",token}),{status:"pending_review",inviteId,expiresAt});
  assert.deepEqual(calls.map(call => call.action),["claim"]);
  assert.deepEqual(Object.keys(calls[0]!.data),["tokenHash"]);
  assert.deepEqual(memberReads,[]);
});

test("lists bounded invitation summaries for an authorized admin while excluding stored hashes and account IDs", async () => {
  const { execute } = fixture({},async () => ({invitations:[{inviteId,status:"claimed",createdAt:date,expiresAt,
    claimedDid:recipientDid,claimedAt:date,tokenHash:"PRIVATE",claimedBy:actor.userId}]}));
  const result = await execute(actor,{action:"list_invites",...target});
  assert.deepEqual(result,{invitations:[{inviteId,status:"claimed",createdAt:date,expiresAt,claimedDid:recipientDid,claimedAt:date}],cursor:undefined});
  assert.ok(!JSON.stringify(result).includes("PRIVATE"));
});

test("approval checks explicit workspace administration and exact claimed DID before reading recipient membership", async () => {
  const { execute,memberReads,calls } = fixture({},async () => { throw new AccountError(403,"workspace_admin_required"); });
  await rejects(execute(actor,{action:"approve_invite",...target,inviteId,recipientDid,accessRole:"admin"}),403,"workspace_admin_required");
  assert.deepEqual(memberReads,[]);
  assert.deepEqual(calls.map(call => call.action),["check"]);
});

test("approval requires current recipient membership and passes explicit reviewed role to atomic storage command", async () => {
  const command = {action:"approve_invite",...target,inviteId,recipientDid,accessRole:"viewer"} as const;
  const { execute,calls } = fixture();
  assert.deepEqual(await execute(actor,command),{status:"granted",inviteId});
  assert.deepEqual(calls.map(call => call.action),["check","approve"]);
  assert.equal(calls[1]?.data.recipientDid,recipientDid);
  assert.equal(calls[1]?.data.accessRole,"viewer");
  assert.equal(calls[1]?.data.recipientRole,"member");
  assert.ok(typeof calls[1]?.data.observedAt === "string");
  const absent = fixture({getGroupMember:async () => ok(null)});
  await rejects(absent.execute(actor,command),403,"certified_membership_required");
  assert.deepEqual(absent.calls.map(call => call.action),["check"]);
  const outage = fixture({getGroupMember:async () => ({ok:false,code:"unavailable"})});
  await rejects(outage.execute(actor,command),503,"certified_project_unavailable");
  assert.deepEqual(outage.calls.map(call => call.action),["check"]);
});

test("a replay after prior approval returns already reviewed without re-granting revoked access", async () => {
  const { execute,calls,memberReads } = fixture({},async () => ({status:"already_reviewed",inviteId}));
  assert.deepEqual(await execute(actor,{action:"approve_invite",...target,inviteId,recipientDid,accessRole:"admin"}),
    {status:"already_reviewed",inviteId});
  assert.deepEqual(calls.map(call => call.action),["check"]);
  assert.deepEqual(memberReads,[]);
});

test("removed actor membership, hidden projects and cancellation cannot operate on invitation storage", async () => {
  for (const [overrides,status,code] of [
    [{getMembership:async () => ok(null)},403,"project_authority_required"],
    [{getProject:async () => ok({...project,visibility:"unlisted" as const})},404,"project_not_found"],
  ] as const) {
    const { execute,calls,lifecycleCalls } = fixture(overrides);
    await rejects(execute(actor,{action:"create_invite",...target}),status,code);
    assert.equal(calls.length,0);
    assert.deepEqual(lifecycleCalls,[code==="project_authority_required"?"suspend_access":"pause_matching"]);
  }
  const stopped = fixture();
  await rejects(stopped.execute(actor,{action:"create_invite",...target},AbortSignal.abort()),503,"project_workspace_unavailable");
  assert.equal(stopped.calls.length,0);
});

test("revocation only closes the invitation and storage never receives a membership addition", async () => {
  const { execute,calls } = fixture();
  assert.deepEqual(await execute(actor,{action:"revoke_invite",...target,inviteId}),{status:"revoked",inviteId});
  assert.deepEqual(calls.map(call => call.action),["revoke"]);
  assert.equal(calls[0]?.data.inviteId,inviteId);
});

test("a delayed recipient membership response keeps its pre-request timestamp so concurrent revocation wins",async()=>{
  let providerStarted=0,providerFinished=0;
  const {execute,calls}=fixture({getGroupMember:async()=>{
    providerStarted=Date.now();await delay(5);providerFinished=Date.now();return ok("member" as const);
  }});
  await execute(actor,{action:"approve_invite",...target,inviteId,recipientDid,accessRole:"editor"});
  const evidence=Date.parse(String(calls.find(call=>call.action==="approve")?.data.observedAt));
  assert.ok(evidence<=providerStarted);assert.ok(evidence<providerFinished);
});

test("confirmed hidden projects pause matching but still allow invitation revocation without granting access",async()=>{
  const {execute,calls,lifecycleCalls}=fixture({getProject:async()=>ok({...project,visibility:"unlisted"})});
  assert.deepEqual(await execute(actor,{action:"revoke_invite",...target,inviteId}),{status:"revoked",inviteId});
  assert.deepEqual(lifecycleCalls,["pause_matching"]);assert.deepEqual(calls.map(call=>call.action),["revoke"]);
  const outage=fixture({getProject:async()=>({ok:false,code:"unavailable"})});
  await rejects(outage.execute(actor,{action:"create_invite",...target}),503,"certified_project_unavailable");
  assert.deepEqual(outage.lifecycleCalls,[]);assert.deepEqual(outage.calls,[]);
});
