import assert from "node:assert/strict";
import { test } from "node:test";
import { beginConsentReturn, finishConsentReturn, takeConsentReturn } from "../src/initiative/consent-return.ts";
import { startProjectConsent } from "../src/initiative/projects-client.ts";
import { startTeamAccess } from "../src/partners/team-workspace.ts";

const workspaceId = "10000000-0000-4000-8000-000000000001";
const authorizeUrl = "https://auth.certified.one/oauth/authorize?request_uri=fixture";
function storage(): Storage {
  const values = new Map<string,string>();
  return {get length(){return values.size;},key:index=>[...values.keys()][index]??null,
    getItem:key=>values.get(key)??null,setItem:(key,value)=>{values.set(key,value);},
    removeItem:key=>{values.delete(key);},clear:()=>values.clear()};
}

test("one latest consent task supersedes older team and directory tasks and consumes one finish receipt",async () => {
  const current = storage(), original = globalThis.fetch, actions: string[] = [];
  globalThis.fetch = async (_,init) => {
    const {action} = JSON.parse(String(init?.body)); actions.push(action);
    return Response.json(action === "finish" ? {granted:"create-project"} : {authorizeUrl});
  };
  try {
    current.setItem("weave-team-membership-return","stale");
    await startTeamAccess(workspaceId,current);
    await startProjectConsent("create-project",current);
    assert.equal(current.length,1);
    const first = takeConsentReturn("ready",()=>current), duplicate = takeConsentReturn("ready",()=>current);
    assert.deepEqual(first,{kind:"directory",action:"create-project",result:"ready"});
    assert.equal(duplicate,null);
    assert.ok(first);
    assert.equal(await finishConsentReturn(first),"/your-initiatives?access=ready");
    assert.deepEqual(actions,["membership","create-project","finish"]);
  } finally {globalThis.fetch=original;}
});

test("a slow superseded consent start cannot redirect or erase the current task",async () => {
  const current = storage(),original=globalThis.fetch;
  let release!: (response: Response)=>void;
  globalThis.fetch = async (_,init) => JSON.parse(String(init?.body)).action === "create-project"
    ? new Promise<Response>(resolve=>{release=resolve;}) : Response.json({authorizeUrl});
  try {
    const first = startProjectConsent("create-project",current);
    await startTeamAccess(workspaceId,current);
    release(Response.json({authorizeUrl}));
    await assert.rejects(first,{code:"project_consent_failed"});
    assert.deepEqual(takeConsentReturn("denied",()=>current),{kind:"team",workspaceId,result:"denied"});
  } finally {globalThis.fetch=original;}
});

test("denied, expired and unavailable storage returns never consume an authorization receipt",async () => {
  const current = storage(), original=globalThis.fetch;
  globalThis.fetch = async ()=>assert.fail("no finish call for denial or an absent task");
  try {
    beginConsentReturn(current,{kind:"directory",action:"membership"});
    const denied=takeConsentReturn("denied",()=>current); assert.ok(denied);
    assert.equal(await finishConsentReturn(denied),"/your-initiatives?access=denied");
    assert.equal(takeConsentReturn("ready",()=>{throw Error("unavailable");}),null);
    beginConsentReturn(current,{kind:"directory",action:"membership"});
    const key=current.key(0)!;
    current.setItem(key,JSON.stringify({...JSON.parse(current.getItem(key)!),until:Date.now()-1}));
    assert.equal(takeConsentReturn("ready",()=>current),null);
  } finally {globalThis.fetch=original;}
});

test("a receipt for another action cannot finish the reviewed task or perform any project write",async () => {
  const original=globalThis.fetch;
  let requests=0;
  globalThis.fetch=async (path,init)=>{
    assert.equal(path,"/api/certified-project-consent");
    assert.deepEqual(JSON.parse(String(init?.body)),{action:"finish"}); requests++;
    return Response.json({granted:"membership"});
  };
  try {
    assert.equal(await finishConsentReturn({kind:"directory",action:"create-project",result:"ready"}),"/your-initiatives?access=failed");
    assert.equal(requests,1);
  } finally {globalThis.fetch=original;}
});
