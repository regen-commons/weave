import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseDocument, parseSaved } from "@weave/api/account-contract";
import { AccountFailure } from "../src/account/client.ts";
import { accountDocument, loadedDraft } from "../src/account/document.ts";
import { newDraft, revise } from "../src/describe/contracts.ts";
import { DraftController } from "../src/describe/controller.ts";
import { MemoryDraftRepository } from "../src/describe/repository.ts";
import { clearRejectedProjectCreate, parsePendingProjectCreate, projectCreationKey, projectGroupPattern, validProjectGroupLabel } from "../src/initiative/project-creation.ts";
import { connectPersonalProject, loadPersonalProject, personalProjectDraft, preparePersonalProject, saveForProject } from "../src/initiative/project-save.ts";
import { projectPage, setupPage, workspacePage } from "../src/initiative/projects-client.ts";

const owner="10000000-0000-4000-8000-000000000001", other="10000000-0000-4000-8000-000000000002";
const project={uri:"at://did:plc:aaaaaaaaaaaaaaaaaaaaaaaa/org.hypercerts.collection/project",repoDid:"did:plc:aaaaaaaaaaaaaaaaaaaaaaaa",
  cid:"bafyfixture",title:"Public garden",description:"The actual public description."};
const document=parseDocument(JSON.parse(readFileSync(new URL("../../api/src/test-data/account.json",import.meta.url),"utf8")));
const saved=parseSaved({id:"10000000-0000-4000-8000-000000000003",revision:2,updatedAt:"2026-11-10T00:00:00Z",document});
const command={action:"create",initiativeId:saved.id,expectedRevision:2,requestId:"10000000-0000-4000-8000-000000000004",
  groupLabel:"garden-project",publicProfile:{title:"Reviewed title",description:"Reviewed description"}};

test("a first personal project starts from actual public fields, with empty reviewed needs and offers and no inferred facts",()=>{
  const draft=personalProjectDraft(project), result=accountDocument(draft);
  assert.equal(result.initiative.name,project.title); assert.equal(result.initiative.description,project.description);
  assert.deepEqual(result.initiative.locations,[]); assert.equal(result.initiative.stage,null);
  assert.deepEqual(result.initiative.links,[]); assert.deepEqual(result.needs,[]); assert.deepEqual(result.offers,[]);
});

test("initializing a personal project backs up unfinished words and files, while a complete card retains its checked needs",async()=>{
  const before=revise(newDraft(),{composer:"Unfinished private words"});
  const repo=new MemoryDraftRepository(before), controller=new DraftController(repo); await controller.initialize();
  await preparePersonalProject(controller,project,new AbortController().signal);
  assert.equal(repo.history[0]?.draft.composer,"Unfinished private words");
  assert.equal(controller.getSnapshot().draft.confirmed?.name,project.title);
  const complete=loadedDraft(saved,owner), retained=new MemoryDraftRepository(complete), current=new DraftController(retained);
  await current.initialize(); await preparePersonalProject(current,project,new AbortController().signal);
  assert.deepEqual(accountDocument(current.getSnapshot().draft),document); assert.equal(retained.history.length,0);
});

test("opening a personal workspace fetches its exact saved identity and backs up the unrelated current draft",async()=>{
  const initial=revise(newDraft(),{composer:"Keep this current draft"}),repo=new MemoryDraftRepository(initial),controller=new DraftController(repo);
  await controller.initialize(); const original=globalThis.fetch;
  globalThis.fetch=async (path,init)=>{
    assert.equal(path,`/api/account?id=${saved.id}`); assert.equal(init?.method,"GET");
    return Response.json({user:{id:owner,email:"fixture@example.test"},saved});
  };
  try {
    await loadPersonalProject(controller,saved.id,owner,new AbortController().signal);
    assert.equal(controller.getSnapshot().draft.account.saved?.id,saved.id);
    assert.equal(repo.history[0]?.draft.composer,"Keep this current draft");
  } finally {globalThis.fetch=original;}
});

test("other-account, wrong-ID and canceled personal load responses cannot replace the device draft",async()=>{
  const original=globalThis.fetch;
  try {
    for (const response of [
      {user:{id:other,email:"other@example.test"},saved},
      {user:{id:owner,email:"fixture@example.test"},saved:{...saved,id:other}},
    ]) {
      const initial=newDraft(),repo=new MemoryDraftRepository(initial),controller=new DraftController(repo); await controller.initialize();
      globalThis.fetch=async ()=>Response.json(response);
      await assert.rejects(loadPersonalProject(controller,saved.id,owner,new AbortController().signal));
      assert.equal(controller.getSnapshot().draft.id,initial.id); assert.equal(repo.history.length,0);
    }
    const initial=newDraft(),repo=new MemoryDraftRepository(initial),controller=new DraftController(repo); await controller.initialize();
    const canceled=new AbortController();
    globalThis.fetch=async ()=>{canceled.abort();return Response.json({user:{id:owner,email:"fixture@example.test"},saved});};
    await assert.rejects(loadPersonalProject(controller,saved.id,owner,canceled.signal));
    assert.equal(controller.getSnapshot().draft.id,initial.id);
  } finally {globalThis.fetch=original;}
});

test("a canceled in-flight project save never binds a late account receipt to the device card",async()=>{
  const initial=personalProjectDraft(project),repo=new MemoryDraftRepository(initial),controller=new DraftController(repo); await controller.initialize();
  const original=globalThis.fetch,canceled=new AbortController();
  globalThis.fetch=async (_,init)=>{
    const body=JSON.parse(String(init?.body)); assert.equal(body.accountId,owner); canceled.abort();
    return Response.json({saved:{id:body.id,revision:1,updatedAt:"2026-11-10T00:00:00Z",document:body.document}});
  };
  try {await assert.rejects(saveForProject(controller,owner,canceled.signal));assert.equal(controller.getSnapshot().draft.account.saved,null);}
  finally {globalThis.fetch=original;}
});

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


test("connecting an existing personal project opens its canonical save without creating a duplicate",async()=>{
  const initial=revise(newDraft(),{composer:"Preserve my unrelated unfinished draft"});
  const repo=new MemoryDraftRepository(initial),controller=new DraftController(repo); await controller.initialize();
  const original=globalThis.fetch,calls:string[]=[];
  globalThis.fetch=async (path,init)=>{
    calls.push(String(path));
    if (path==="/api/projects") {
      const body=JSON.parse(String(init?.body)); assert.equal(body.action,"lookup");
      return Response.json({status:"linked",workspaceId:saved.id,projectUri:project.uri});
    }
    assert.equal(path,`/api/account?id=${saved.id}`);
    return Response.json({user:{id:owner,email:null},saved});
  };
  try {
    await connectPersonalProject(controller,owner,project,new AbortController().signal);
    assert.deepEqual(calls,["/api/projects",`/api/account?id=${saved.id}`]);
    assert.equal(controller.getSnapshot().draft.account.saved?.id,saved.id);
    assert.equal(repo.history[0]?.draft.composer,initial.composer);
  } finally {globalThis.fetch=original;}
});

test("a competing personal link loads the winner and retains the newly saved card as a backup",async()=>{
  const initial=personalProjectDraft(project),repo=new MemoryDraftRepository(initial),controller=new DraftController(repo);
  await controller.initialize();const original=globalThis.fetch;let projectCalls=0,privateSave:string|undefined;
  globalThis.fetch=async (path,init)=>{
    if (path==="/api/projects") {
      const body=JSON.parse(String(init?.body));projectCalls++;
      if(body.action==="lookup") return Response.json({status:"unlinked"});
      assert.equal(body.action,"link");assert.equal(body.initiativeId,privateSave);
      return Response.json({status:"linked",workspaceId:saved.id,projectUri:project.uri});
    }
    if(init?.method==="POST") {
      const body=JSON.parse(String(init.body));privateSave=body.id;
      return Response.json({saved:{id:body.id,revision:1,updatedAt:saved.updatedAt,document:body.document}});
    }
    return Response.json({user:{id:owner,email:null},saved});
  };
  try {
    await connectPersonalProject(controller,owner,project,new AbortController().signal);
    assert.equal(projectCalls,2);assert.equal(controller.getSnapshot().draft.account.saved?.id,saved.id);
    assert.ok(repo.history.some(b=>b.draft.account.saved?.id===privateSave));
  } finally {globalThis.fetch=original;}
});
