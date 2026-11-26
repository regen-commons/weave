import assert from "node:assert/strict";
import { test } from "node:test";
import { beginConsentReturn, finishConsentReturn, recoverConsentReturn, takeConsentReturn } from "../src/initiative/consent-return.ts";
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

test("missing, expired, malformed and unavailable return tasks recover without promoting an unknown receipt", async t => {
  t.mock.method(globalThis, "fetch", async () => assert.fail("an unknown task cannot activate a receipt"));
  const current = storage();
  assert.equal(await recoverConsentReturn("ready", () => current), "/your-initiatives?access=failed");
  assert.equal(await recoverConsentReturn("ready", () => { throw Error("storage unavailable"); }), "/your-initiatives?access=failed");
  beginConsentReturn(current, { kind: "directory", action: "membership" });
  const key = current.key(0)!;
  current.setItem(key, JSON.stringify({ ...JSON.parse(current.getItem(key)!), until: Date.now() - 1 }));
  assert.equal(await recoverConsentReturn("ready", () => current), "/your-initiatives?access=failed");
  current.setItem(key, "invalid json");
  assert.equal(await recoverConsentReturn("ready", () => current), "/your-initiatives?access=failed");
  assert.equal(await recoverConsentReturn("unknown", () => current), "/your-initiatives?access=failed");
});

test("a reviewed return waits for promotion before handing off to the directory or workspace", async t => {
  const current = storage(), actions: string[] = [];
  let complete!: (response: Response) => void;
  t.mock.method(globalThis, "fetch", async (path: Parameters<typeof globalThis.fetch>[0], init?: RequestInit) => {
    assert.equal(path, "/api/certified-project-consent");
    const { action } = JSON.parse(String(init?.body)); actions.push(action);
    return new Promise<Response>(resolve => { complete = resolve; });
  });
  beginConsentReturn(current, { kind: "team", workspaceId });
  let handedOff = false;
  const team = recoverConsentReturn("ready", () => current).then(destination => { handedOff = true; return destination; });
  await Promise.resolve();
  assert.equal(handedOff, false);
  complete(Response.json({ granted: "membership" }));
  assert.equal(await team, `/workspaces/${workspaceId}`);
  beginConsentReturn(current, { kind: "directory", action: "membership" });
  const directory = recoverConsentReturn("ready", () => current);
  complete(Response.json({ granted: "membership" }));
  assert.equal(await directory, "/your-initiatives?access=ready");
  assert.deepEqual(actions, ["finish", "finish"]);
});

test("a consent that followed a sign-in elsewhere comes back to that page once granted or declined", async t => {
  const current = storage();
  let granted = "membership";
  t.mock.method(globalThis, "fetch", async (path: Parameters<typeof globalThis.fetch>[0], init?: RequestInit) => {
    assert.equal(path, "/api/certified-project-consent");
    const { action } = JSON.parse(String(init?.body));
    return Response.json(action === "finish" ? { granted } : { authorizeUrl });
  });
  await startProjectConsent("membership", current, undefined, "/funding");
  assert.equal(await recoverConsentReturn("ready", () => current), "/funding", "back where the person signed in");
  await startProjectConsent("membership", current, undefined, "/settings");
  assert.equal(await recoverConsentReturn("denied", () => current), "/settings", "a no goes back there too");
  // One that could not be confirmed goes where the page says so and offers Allow again.
  await startProjectConsent("membership", current, undefined, "/funding");
  assert.equal(await recoverConsentReturn("failed", () => current), "/your-initiatives?access=failed");
  granted = "create-project";
  await startProjectConsent("membership", current, undefined, "/funding");
  assert.equal(await recoverConsentReturn("ready", () => current), "/your-initiatives?access=failed", "a receipt for another action");
  granted = "membership";
  // Your Initiatives, or anything that is not a page of Weave's, is not kept: the return goes to Your Initiatives.
  for (const returnTo of ["/your-initiatives", "//elsewhere.test", "https://elsewhere.test/", "/no-such-page", "/funding?x=1"]) {
    await startProjectConsent("membership", current, undefined, returnTo);
    assert.equal(JSON.parse(current.getItem(current.key(0)!)!).returnTo, undefined, returnTo);
    assert.equal(await recoverConsentReturn("ready", () => current), "/your-initiatives?access=ready", returnTo);
  }
});

test("a stored return page that was changed to leave Weave activates nothing", async t => {
  t.mock.method(globalThis, "fetch", async () => assert.fail("an altered task cannot activate a receipt"));
  const current = storage();
  for (const returnTo of ["//elsewhere.test", "https://elsewhere.test/", "/no-such-page", 7]) {
    beginConsentReturn(current, { kind: "directory", action: "membership" });
    const key = current.key(0)!;
    current.setItem(key, JSON.stringify({ ...JSON.parse(current.getItem(key)!), returnTo }));
    assert.equal(await recoverConsentReturn("ready", () => current), "/your-initiatives?access=failed", String(returnTo));
  }
});
