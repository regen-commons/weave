import assert from "node:assert/strict";
import { test } from "node:test";
import type { CertifiedGroupRole, CertifiedProject, CertifiedProjectResult } from "./certified-project-provider.ts";
import type { ProjectActor } from "./project-commands.ts";
import { createWorkspaceContent } from "./workspace-content.ts";

const workspaceId = "11000000-0000-4000-8000-000000000001";
const actor: ProjectActor = {
  userId: "11000000-0000-4000-8000-000000000002",
  sessionId: "11000000-0000-4000-8000-000000000003",
  did: "did:plc:aaaaaaaaaaaaaaaaaaaaaaaa",
};
const groupDid = "did:plc:bbbbbbbbbbbbbbbbbbbbbbbb";
const projectUri = `at://${groupDid}/org.hypercerts.collection/group-project`;
const command = { action: "search", initiativeId: workspaceId } as const;
const load = { action: "team_load", workspaceId } as const;

function fixture(
  membership: CertifiedProjectResult<CertifiedGroupRole | null>,
  visibility: CertifiedProject["visibility"] = "public",
) {
  const calls: unknown[][] = [];
  const workspace = createWorkspaceContent({
    async getMembership(did, group) {
      calls.push(["membership", did, group]);
      return membership;
    },
    async getProject(uri) {
      calls.push(["project", uri]);
      return { ok: true, value: {
        uri, repoDid: groupDid, groupDid, cid: "bafycurrent", visibility,
        title: "Fixture", createdAt: "2026-01-01T00:00:00Z",
      } };
    },
  }, {
    async target() {
      return { projectUri, repositoryDid: groupDid, groupDid, cid: "bafyfixture" };
    },
    async command(_actor, id, role, cid, action) {
      calls.push([action, id, role, cid]);
      return action === "matching_shortlist" ? { groups: [], externalCoverage: null }
        : action === "team_load" ? { saved: null, accessRole: "viewer" } : null;
    },
  }, {
    async execute(_actor, action, payload) {
      calls.push([action, payload.recipientDid, payload.recipientRole]);
      return { status: "suspended" };
    },
  });
  return { workspace, calls };
}

test("team content distinguishes confirmed departure from a membership outage", async () => {
  const removed = fixture({ ok: true, value: null });
  await assert.rejects(removed.workspace.saveOrLoad(actor, load), { status: 403, code: "workspace_access_required" });
  assert.deepEqual(removed.calls, [
    ["membership", actor.did, groupDid], ["suspend_access", actor.did, "absent"],
  ]);
  const outage = fixture({ ok: false, code: "unavailable" });
  await assert.rejects(outage.workspace.match(actor, command), { status: 503, code: "certified_project_unavailable" });
  assert.deepEqual(outage.calls, [["membership", actor.did, groupDid]]);
});

test("matching verifies the linked project without exposing team drafts to Certified", async () => {
  const active = fixture({ ok: true, value: "member" });
  assert.deepEqual(await active.workspace.saveOrLoad(actor, load), { saved: null, accessRole: "viewer", projectTitle: null, projectUri });
  assert.deepEqual(active.calls, [["membership", actor.did, groupDid], ["team_load", workspaceId, "member", null]]);
  active.calls.length = 0;
  assert.equal((await active.workspace.match(actor, command)).initiativeId, workspaceId);
  assert.deepEqual(active.calls, [
    ["membership", actor.did, groupDid], ["project", projectUri],
    ["matching_shortlist", workspaceId, "member", "bafycurrent"],
  ]);
  const unlisted = fixture({ ok: true, value: "member" }, "unlisted");
  await assert.rejects(unlisted.workspace.match(actor, command), { status: 404, code: "project_not_found" });
  assert.deepEqual(unlisted.calls, [
    ["membership", actor.did, groupDid], ["project", projectUri],
    ["pause_matching", workspaceId, "member", null],
  ]);
});
