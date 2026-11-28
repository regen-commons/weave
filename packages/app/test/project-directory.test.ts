import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseDocument, parseTeamSaved } from "@weave/api/account-contract";
import { AccountFailure } from "../src/account/client.ts";
import { clearRejectedProjectCreate, parsePendingProjectCreate, projectCreationKey, projectGroupPattern, validProjectGroupLabel } from "../src/initiative/project-creation.ts";
import { projectPage, setupPage, workspacePage } from "../src/initiative/projects-client.ts";

const owner="10000000-0000-4000-8000-000000000001", other="10000000-0000-4000-8000-000000000002";
const project={uri:"at://did:plc:aaaaaaaaaaaaaaaaaaaaaaaa/org.hypercerts.collection/project",repoDid:"did:plc:aaaaaaaaaaaaaaaaaaaaaaaa",
  cid:"bafyfixture",title:"Public garden",description:"The actual public description."};
const document=parseDocument(JSON.parse(readFileSync(new URL("../../api/src/test-data/account.json",import.meta.url),"utf8")));
const saved=parseTeamSaved({id:"10000000-0000-4000-8000-000000000003",revision:2,updatedAt:"2026-11-10T00:00:00Z",document});
const command={action:"create",initiativeId:saved.id,expectedRevision:2,requestId:"10000000-0000-4000-8000-000000000004",
  groupLabel:"garden-project",publicProfile:{title:"Reviewed title",description:"Reviewed description"}};

test("pending creation recovery validates the entire frozen command and keeps uncertain original IDs despite old UI expiry",()=>{
  assert.deepEqual(parsePendingProjectCreate({...command,until:1}),command);
  for (const bad of [{...command,publicProfile:undefined},{...command,publicProfile:{title:"bad"}},
    {...command,publicProfile:{...command.publicProfile,title:"x".repeat(81)}},{...command,expectedRevision:0},
    {...command,groupLabel:"INVALID"},{...command,unexpected:"field"}]) assert.equal(parsePendingProjectCreate(bad),null);
  assert.notEqual(projectCreationKey(owner,saved.id),projectCreationKey(other,saved.id));
  assert.equal(clearRejectedProjectCreate(new AccountFailure("group_handle_in_use")),true);
  assert.equal(clearRejectedProjectCreate(new AccountFailure("connection_failed")),false);
  assert.equal(clearRejectedProjectCreate(new AccountFailure("project_consent_required")),false);
});

test("the native Unicode Sets form pattern and command validation enforce the same group label before any save",()=>{
  const native=new RegExp(`^(?:${projectGroupPattern})$`,"v");
  for (const value of ["garden-project","abc","a1b"]) assert.equal(native.test(value)&&validProjectGroupLabel(value),true);
  for (const value of ["UPPERCASE","two words","1garden","ab","a".repeat(33),"garden-"]) {
    assert.equal(native.test(value),false);assert.equal(validProjectGroupLabel(value),false);
  }
});

test("project pages retain current Certified role independently of the group picker page and parse admin requests without requester identity",()=>{
  assert.equal(projectPage({projects:[project],certifiedRole:"member"}).certifiedRole,"member");
  const groupDid="did:plc:bbbbbbbbbbbbbbbbbbbbbbbb", uri=project.uri.replace(project.repoDid,groupDid);
  const page=setupPage({pendingSetups:[{requestId:saved.id,projectUri:uri,groupDid,project:{...project,uri,repoDid:groupDid,groupDid},requesterEmail:"PRIVATE"}]},groupDid);
  assert.ok(!JSON.stringify(page).includes("PRIVATE")); assert.equal(page.requests[0]?.requestId,saved.id);
});

test("paused authorized workspaces retain stable private routing without stale public title or description",()=>{
  const result=workspacePage({workspaces:[{workspaceId:saved.id,projectUri:project.uri,kind:"personal",accessRole:"admin",status:"paused",project:null}]});
  assert.equal(result.workspaces[0]?.workspaceId,saved.id);assert.equal(result.workspaces[0]?.project,null);
  assert.equal(result.workspaces[0]?.status,"paused");
});


test("project pages keep the source place and publisher links the server read, and refuse malformed ones",()=>{
  const sourced={...project,place:{status:"named",name:"Riverside allotments"},publisherLinks:["https://garden.example.org/"]};
  assert.deepEqual(projectPage({projects:[sourced]}).projects[0],sourced);
  assert.deepEqual(projectPage({projects:[{...project,place:{status:"unread"}}]}).projects[0],{...project,place:{status:"unread"}});
  assert.deepEqual(projectPage({projects:[project]}).projects[0],project,"a project without them gets none");
  for (const bad of [
    {place:{status:"named",name:""}},{place:{status:"named",name:"x".repeat(121)}},{place:{status:"guessed",name:"Brazil"}},
    {place:"Brazil"},{publisherLinks:"https://garden.example.org/"},{publisherLinks:["javascript:alert(1)"]},
    {publisherLinks:Array.from({length:7},(_,i)=>`https://garden.example.org/${i}`)},
  ]) assert.throws(()=>projectPage({projects:[{...project,...bad}]}),/project_workspace_unavailable/u);
  const listing=workspacePage({workspaces:[{workspaceId:saved.id,projectUri:project.uri,kind:"personal",accessRole:"admin",project:sourced}]});
  assert.deepEqual(listing.workspaces[0]?.project,sourced);
});

