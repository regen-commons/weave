import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { createCertifiedProjectProvider, type CertifiedProjectProviderOptions } from "./certified-project-provider.ts";

const actorDid = "did:plc:aaaaaaaaaaaaaaaaaaaaaaaa";
const groupDid = "did:plc:bbbbbbbbbbbbbbbbbbbbbbbb";
const recipientDid = "did:plc:cccccccccccccccccccccccc";
const cgs = "https://groups.example.test";
const pds = "https://pds.example.test";
const collection = "org.hypercerts.collection";
const organization = "app.certified.actor.organization";
const groupHandle = "garden.pds.example.test";
const date = "2026-11-09T18:00:00.000Z";
const cid = "bafyreihx4gq5r3ptzuv6k2ymw7jl5nfbq3d2ewo6xacsyrtm4kz7vf2qdu";
const rkey = "3jzfcijpj2z2a";
const draft = { rkey, title: "Community garden", description: "A garden for neighbors.", createdAt: date };
const uri = `at://${groupDid}/${collection}/${rkey}`;
const value = {
  $type: collection, type: "project", title: draft.title, createdAt: date,
  description: { $type: "org.hypercerts.defs#descriptionString", value: draft.description },
};
const fullProject = {
  uri, cid, repoDid: groupDid, groupDid,
  title: draft.title, description: draft.description, createdAt: date, visibility: "public",
};
const missingRecord = () => Response.json({ error: "RecordNotFound" }, { status: 400 });
const badGateway = () => Response.json({ error: "upstream private details" }, { status: 502 });

function identity(did = groupDid, groupService?: string) {
  return {
    id: did,
    alsoKnownAs: [`at://${groupHandle}`],
    service: [
      { id: "#atproto_pds", type: "AtprotoPersonalDataServer", serviceEndpoint: pds },
      ...(groupService ? [{ id: "#certified_group", type: "CertifiedGroupService", serviceEndpoint: groupService }] : []),
    ],
  };
}

type RequestHandler = (url: URL, init?: RequestInit) => Response | Promise<Response>;
function fixture(handler: RequestHandler, options: Partial<CertifiedProjectProviderOptions> = {}) {
  const calls: Array<{ url: URL; init?: RequestInit }> = [];
  const auth: Array<{ method: string; actorDid: string }> = [];
  const provider = createCertifiedProjectProvider({
    groupServiceOrigin: cgs,
    groupPdsOrigin: pds,
    async serviceAuth({ actorDid, audience, method, signal }) {
      assert.equal(audience, "did:web:groups.example.test");
      assert.equal(signal.aborted, false);
      auth.push({ actorDid, method });
      return `jwt.fixture.page${auth.length}`;
    },
    async fetch(input, init) {
      const url = new URL(String(input));
      assert.equal(init?.redirect, "error");
      assert.equal(init.cache, "no-store");
      assert.ok(init.signal);
      calls.push({ url, init });
      const authorization = new Headers(init.headers).get("authorization");
      if (url.origin === cgs) assert.equal(authorization, `Bearer jwt.fixture.page${auth.length}`);
      else assert.equal(authorization, null);
      return handler(url, init);
    },
    ...options,
  });
  return { provider, calls, auth };
}

function projectReads(url: URL, entry: Record<string, unknown> = value) {
  if (url.origin === "https://plc.directory" && url.pathname === `/${groupDid}`)
    return Response.json(identity(groupDid, cgs));
  assert.equal(url.origin, pds);
  assert.equal(url.pathname, "/xrpc/com.atproto.repo.getRecord");
  assert.equal(url.searchParams.get("repo"), groupDid);
  if (url.searchParams.get("collection") === organization) {
    assert.equal(url.searchParams.get("rkey"), "self");
    return missingRecord();
  }
  assert.equal(url.searchParams.get("collection"), collection);
  assert.equal(url.searchParams.get("rkey"), rkey);
  return Response.json({ uri, cid, value: entry });
}

test("registers a group with the authenticated person as owner and no implicit recovery email", async () => {
  const { provider, auth } = fixture((url, init) => {
    assert.equal(url.pathname, "/xrpc/app.certified.group.register");
    assert.equal(init?.method, "POST");
    assert.deepEqual(JSON.parse(String(init.body)), { handle: "garden", ownerDid: actorDid });
    return Response.json({ groupDid, handle: groupHandle });
  });
  assert.deepEqual(await provider.registerGroup(actorDid, { handle: "garden" }), {
    ok: true, value: { groupDid, handle: groupHandle },
  });
  assert.deepEqual(auth, [{ actorDid, method: "app.certified.group.register" }]);
});

test("can proxy service-scoped CGS methods through a separately consented PDS session", async () => {
  const { provider, auth, calls } = fixture(() => assert.fail("the service proxy owns these HTTP requests"), {
    async serviceProxy({ actorDid: actor, audience, method, signal, init, query }) {
      assert.equal(actor, actorDid);
      assert.equal(audience, "did:web:groups.example.test");
      assert.equal(init.signal, signal);
      assert.equal(new Headers(init.headers).has("authorization"), false);
      if (method === "app.certified.group.register") {
        assert.deepEqual(JSON.parse(String(init.body)), {
          handle: "garden", ownerDid: actorDid, email: "garden@example.test",
        });
        assert.equal(query, undefined);
        return Response.json({ groupDid, handle: groupHandle });
      }
      assert.equal(query?.get("cursor"), "page+=/2");
      assert.equal(init.method, "GET");
      return Response.json({ groups: [] });
    },
  });
  assert.equal((await provider.registerGroup(actorDid, { handle: "garden", email: "garden@example.test" })).ok, true);
  assert.deepEqual(await provider.listMemberships(actorDid, "page+=/2"), { ok: true, value: { groups: [] } });
  assert.deepEqual(auth, []);
  assert.deepEqual(calls, []);
});

test("checks actor membership and recipient membership with different paginated read methods", async () => {
  const { provider, calls, auth } = fixture(url => {
    const cursor = url.searchParams.get("cursor");
    if (url.pathname === "/xrpc/app.certified.groups.membership.list") {
      assert.equal(url.searchParams.has("repo"), false);
      return cursor
        ? Response.json({ groups: [{ groupDid, role: "admin", joinedAt: date }] })
        : Response.json({ groups: [{ groupDid: recipientDid, role: "member", joinedAt: date }], cursor: "actor+=/2" });
    }
    assert.equal(url.pathname, "/xrpc/app.certified.group.member.list");
    assert.equal(url.searchParams.get("repo"), groupDid);
    return cursor
      ? Response.json({ members: [{ did: recipientDid, role: "member", addedBy: actorDid, addedAt: date }] })
      : Response.json({ members: [{ did: actorDid, role: "admin", addedBy: actorDid, addedAt: date }], cursor: "group+=/2" });
  });
  assert.deepEqual(await provider.getMembership(actorDid, groupDid), { ok: true, value: "admin" });
  assert.deepEqual(await provider.getGroupMember(actorDid, groupDid, recipientDid), { ok: true, value: "member" });
  assert.deepEqual(calls.map(call => call.url.searchParams.get("cursor")), [null, "actor+=/2", null, "group+=/2"]);
  assert.equal(auth.length, 4);
  assert.ok(auth.every(request => request.actorDid === actorDid));
});

test("distinguishes absent membership, authorization failure and malformed or looping pagination", async () => {
  const absent = fixture(() => Response.json({ groups: [] }));
  assert.deepEqual(await absent.provider.getMembership(actorDid, groupDid), { ok: true, value: null });
  const unauthorized = fixture(() => Response.json({}, { status: 401 }));
  assert.deepEqual(await unauthorized.provider.getMembership(actorDid, groupDid), { ok: false, code: "authorization_required" });
  const badRole = fixture(() => Response.json({ groups: [{ groupDid, role: "editor", joinedAt: date }] }));
  assert.deepEqual(await badRole.provider.getMembership(actorDid, groupDid), { ok: false, code: "invalid_response" });
  let page = 0;
  const nextGroup = () => "did:plc:" + String.fromCharCode(100 + page++).repeat(24);
  const loop = fixture(url => Response.json({
    groups: [{ groupDid: nextGroup(), role: "member", joinedAt: date }],
    cursor: url.searchParams.get("cursor") === "one" ? "two" : "one",
  }));
  assert.deepEqual(await loop.provider.getMembership(actorDid, groupDid), { ok: false, code: "invalid_response" });
  assert.equal(loop.calls.length, 3);
  page = 0;
  const tooMany = fixture(url => Response.json({
    groups: [{ groupDid: nextGroup(), role: "member", joinedAt: date }],
    cursor: String(Number(url.searchParams.get("cursor")) + 1),
  }));
  assert.deepEqual(await tooMany.provider.getMembership(actorDid, groupDid), { ok: false, code: "unavailable" });
  assert.equal(tooMany.calls.length, 10);
});

test("writes the requested teammate role once and distinguishes duplicate and uncertain writes", async () => {
  const input = { memberDid: recipientDid, role: "member" } as const;
  for (const status of [200, 409, 502]) {
    const { provider, calls } = fixture((url, init) => {
      assert.equal(url.pathname, "/xrpc/app.certified.group.member.add");
      assert.deepEqual(JSON.parse(String(init?.body)), { repo: groupDid, ...input });
      if (status === 409) return Response.json({ error: "MemberAlreadyExists" }, { status });
      if (status === 502) return badGateway();
      return Response.json({ ...input, addedBy: actorDid, addedAt: date });
    });
    const result = await provider.addMember(actorDid, groupDid, input);
    if (status === 200) assert.deepEqual(result, { ok: true, value: { ...input, addedBy: actorDid, addedAt: date } });
    else assert.deepEqual(result, { ok: false, code: status === 409 ? "conflict" : "pending" });
    assert.equal(calls.length, 1);
  }
});

test("distinguishes missing handles from resolution failures and recovers only a verified owner candidate", async () => {
  const { provider, calls } = fixture(url => {
    if (url.origin === pds) {
      assert.equal(url.pathname, "/xrpc/com.atproto.identity.resolveHandle");
      switch (url.searchParams.get("handle")) {
        case groupHandle: return Response.json({ did: groupDid });
        case "free.pds.example.test": return Response.json({ error: "HandleNotFound" }, { status: 400 });
        default: return Response.json({ error: "InvalidRequest" }, { status: 400 });
      }
    }
    if (url.origin === "https://plc.directory") return Response.json(identity(groupDid, cgs));
    assert.equal(url.pathname, "/xrpc/app.certified.groups.membership.list");
    return Response.json({ groups: [{ groupDid, role: "owner", joinedAt: date }] });
  });
  assert.deepEqual(await provider.findRegisteredGroup(actorDid, "free.pds.example.test"), { ok: false, code: "not_found" });
  assert.deepEqual(await provider.findRegisteredGroup(actorDid, "unknown.pds.example.test"), { ok: false, code: "invalid_response" });
  assert.deepEqual(await provider.findRegisteredGroup(actorDid, groupHandle), { ok: true, value: { groupDid, handle: groupHandle } });
  assert.ok(calls.every(call => call.init?.method !== "POST"));
});

test("reads group and personal records from the canonical PDS and honors organization visibility", async () => {
  const ownUri = uri.replace(groupDid, actorDid);
  const { provider, auth } = fixture(url => {
    if (url.origin === "https://plc.directory") {
      return Response.json(url.pathname.endsWith(actorDid) ? identity(actorDid) : identity(groupDid, cgs));
    }
    if (url.searchParams.get("repo") === actorDid) {
      if (url.searchParams.get("collection") === organization) return Response.json({
        uri: `at://${actorDid}/${organization}/self`, cid, value: { $type: organization, visibility: "unlisted" },
      });
      return Response.json({ uri: ownUri, cid, value });
    }
    return projectReads(url);
  });
  assert.deepEqual(await provider.getProject(uri), { ok: true, value: fullProject });
  const { groupDid: _, ...solo } = fullProject;
  assert.deepEqual(await provider.getProject(ownUri), {
    ok: true, value: { ...solo, uri: ownUri, repoDid: actorDid, visibility: "unlisted" },
  });
  assert.deepEqual(auth, []);
});

test("rejects a forged DID document, untrusted PDS, foreign CGS, wrong record URI and oversized response", async () => {
  const doc = identity(groupDid, cgs);
  for (const [badDoc, code] of [
    [{ ...doc, id: actorDid }, "invalid_response"],
    [{ ...doc, service: [{ ...doc.service[0], serviceEndpoint: "https://other.example.test" }] }, "unsupported"],
    [identity(groupDid, "https://other.example.test"), "unsupported"],
  ] as const) {
    const { provider, calls } = fixture(() => Response.json(badDoc));
    assert.deepEqual(await provider.getProject(uri), { ok: false, code });
    assert.equal(calls.length, 1);
  }
  const wrongUri = fixture(url => url.origin === "https://plc.directory"
    ? Response.json(doc) : Response.json({ uri: uri.replace(groupDid, actorDid), cid, value }));
  assert.deepEqual(await wrongUri.provider.getProject(uri), { ok: false, code: "invalid_response" });
  const oversize = fixture(() => new Response(" ".repeat(600 * 1024)));
  assert.deepEqual(await oversize.provider.getProject(uri), { ok: false, code: "invalid_response" });
});

test("bounds calls even when the HTTP or authorization adapter ignores abort", async () => {
  const stall = async (): Promise<never> => {
    await delay(100);
    throw Error("private transport error");
  };
  const network = fixture(stall, { timeoutMs: 5 });
  assert.deepEqual(await network.provider.getProject(uri), { ok: false, code: "unavailable" });
  assert.deepEqual(await network.provider.registerGroup(actorDid, { handle: "garden" }), { ok: false, code: "pending" });
  const auth = fixture(() => assert.fail("no outbound HTTP after an authorization timeout"), { serviceAuth: stall, timeoutMs: 5 });
  assert.deepEqual(await auth.provider.registerGroup(actorDid, { handle: "garden" }), { ok: false, code: "unavailable" });
});

test("creates with a durable TID and confirms the exact public record and CID via the PDS", async () => {
  const { provider, calls } = fixture((url, init) => {
    if (url.origin === cgs) {
      assert.equal(url.pathname, "/xrpc/app.certified.group.repo.createRecord");
      assert.equal(init?.method, "POST");
      assert.deepEqual(JSON.parse(String(init.body)), { repo: groupDid, collection, rkey, record: value });
      return Response.json({ uri, cid });
    }
    return projectReads(url);
  });
  assert.deepEqual(await provider.createProject(actorDid, groupDid, draft), { ok: true, value: fullProject });
  assert.equal(calls.filter(call => call.init?.method === "POST").length, 1);
});

test("recovers an ambiguous or duplicate create by reading the same rkey, never replacing another record", async () => {
  for (const mode of ["lost", "duplicate", "missing", "mismatch", "different_cid"] as const) {
    const { provider, calls } = fixture(url => {
      if (url.origin === cgs) {
        if (mode === "duplicate") return Response.json({ error: "RecordAlreadyExists" }, { status: 409 });
        if (mode === "different_cid") return Response.json({ uri, cid: cid.replace("hx4", "hx5") });
        return badGateway();
      }
      if (mode === "missing" && url.origin === pds) return missingRecord();
      return projectReads(url, mode === "mismatch" ? { ...value, title: "A different project" } : value);
    });
    const result = await provider.createProject(actorDid, groupDid, draft);
    if (mode === "lost" || mode === "duplicate") assert.deepEqual(result, { ok: true, value: fullProject });
    else assert.deepEqual(result, { ok: false, code: mode === "missing" ? "pending" : "conflict" });
    assert.equal(calls.filter(call => call.init?.method === "POST").length, 1);
  }
  const reconciliation = fixture(url => projectReads(url));
  assert.deepEqual(await reconciliation.provider.confirmProject(groupDid, draft), { ok: true, value: fullProject });
  assert.ok(reconciliation.calls.every(call => call.init?.method !== "POST"));
  const missing = fixture(url => url.origin === pds ? missingRecord() : projectReads(url));
  assert.deepEqual(await missing.provider.confirmProject(groupDid, draft), { ok: false, code: "not_found" });
  const resolverOffline = fixture(() => badGateway());
  assert.deepEqual(await resolverOffline.provider.confirmProject(groupDid, draft), { ok: false, code: "unavailable" });
});

function discoveryReads(url: URL, records: unknown[], options: { group?: boolean; org?: unknown; cursor?: string } = {}) {
  const repository = options.group ? groupDid : actorDid;
  if (url.origin === cgs) return Response.json({ groups: [{ groupDid, role: "admin", joinedAt: date }] });
  if (url.origin === "https://plc.directory") return Response.json(identity(repository, options.group ? cgs : undefined));
  assert.equal(url.origin, pds);
  assert.equal(url.searchParams.get("repo"), repository);
  if (url.searchParams.get("collection") === organization) return options.org === undefined ? missingRecord()
    : Response.json({ uri: `at://${repository}/${organization}/self`, cid, value: options.org });
  assert.equal(url.pathname, "/xrpc/com.atproto.repo.listRecords");
  assert.equal(url.searchParams.get("collection"), collection);
  assert.equal(url.searchParams.get("limit"), "25");
  return Response.json({ records, ...(options.cursor ? { cursor: options.cursor } : {}) });
}

test("enumerates only public projects in the person's repository with a bounded cursor page", async () => {
  const ownUri = uri.replace(groupDid, actorDid);
  const { provider, calls, auth } = fixture(url => discoveryReads(url, [
    { uri: ownUri, cid, value },
    { uri: `${ownUri}2`, cid, value: { ...value, title: "Unlisted title", visibility: "unlisted" } },
    { uri: `${ownUri}3`, cid, value: { ...value, type: "collection", title: "A different record type" } },
  ], { cursor: "opaque+=/2" }));
  const result = await provider.listProjects(actorDid, { kind: "personal" });
  assert.deepEqual(result, { ok: true, value: {
    repositoryDid: actorDid, projects: [{ ...fullProject, uri: ownUri, repoDid: actorDid, groupDid: undefined }]
      .map(({ groupDid: _, ...project }) => project), cursor: "opaque+=/2",
  } });
  assert.equal(auth.length, 0);
  assert.equal(calls.length, 3);
});

test("enumerates a verified group only after checking current membership and respects encoded pagination", async () => {
  const { provider, calls, auth } = fixture(url => {
    if (url.pathname.endsWith("listRecords")) assert.equal(url.searchParams.get("cursor"), "opaque+=/2");
    return discoveryReads(url, [{ uri, cid, value }], { group: true });
  });
  assert.deepEqual(await provider.listProjects(actorDid, { kind: "group", groupDid }, "opaque+=/2"), {
    ok: true, value: { repositoryDid: groupDid, certifiedRole: "admin", projects: [fullProject] },
  });
  assert.equal(calls[0]?.url.origin, cgs);
  assert.deepEqual(auth, [{ actorDid, method: "app.certified.groups.membership.list" }]);
});

test("group enumeration denies absent membership before reading any PDS and rejects uncertified group identities", async () => {
  const absent = fixture(() => Response.json({ groups: [] }));
  assert.deepEqual(await absent.provider.listProjects(actorDid, { kind: "group", groupDid }), { ok: false, code: "forbidden" });
  assert.equal(absent.calls.length, 1);
  const notGroup = fixture(url => url.origin === cgs
    ? Response.json({ groups: [{ groupDid, role: "owner", joinedAt: date }] }) : Response.json(identity(groupDid)));
  assert.deepEqual(await notGroup.provider.listProjects(actorDid, { kind: "group", groupDid }), { ok: false, code: "unsupported" });
  assert.equal(notGroup.calls.length, 2);
  const unauthorized = fixture(() => Response.json({}, { status: 401 }));
  assert.deepEqual(await unauthorized.provider.listProjects(actorDid, { kind: "group", groupDid }),
    { ok: false, code: "authorization_required" });
});

test("organization visibility stops public enumeration before the collection is requested", async () => {
  const { provider, calls } = fixture(url => discoveryReads(url, [], {
    org: { $type: organization, visibility: "unlisted" },
  }));
  assert.deepEqual(await provider.listProjects(actorDid, { kind: "personal" }),
    { ok: true, value: { repositoryDid: actorDid, projects: [] } });
  assert.equal(calls.length, 2);
});

test("rejects malformed project pages, cursor loops, duplicate records and foreign repository records", async () => {
  const ownUri = uri.replace(groupDid, actorDid);
  const entry = { uri: ownUri, cid, value };
  for (const records of [
    [{ ...entry, uri }], [entry, entry], [{ ...entry, cid: "bad-cid" }],
    [{ ...entry, value: { ...value, createdAt: "2026-02-30T00:00:00Z" } }],
    Array.from({ length: 26 }, (_, i) => ({ ...entry, uri: `${ownUri}${i}` })),
  ]) {
    const { provider } = fixture(url => discoveryReads(url, records));
    assert.deepEqual(await provider.listProjects(actorDid, { kind: "personal" }), { ok: false, code: "invalid_response" });
  }
  const looping = fixture(url => discoveryReads(url, [entry], { cursor: "again" }));
  assert.deepEqual(await looping.provider.listProjects(actorDid, { kind: "personal" }, "again"),
    { ok: false, code: "invalid_response" });
  const emptyCursor = fixture(url => discoveryReads(url, [], { cursor: "again" }));
  assert.deepEqual(await emptyCursor.provider.listProjects(actorDid, { kind: "personal" }),
    { ok: false, code: "invalid_response" });
});

test("cancels enumeration before HTTP and releases a stalled response body on caller cancellation", async () => {
  const stopped = fixture(() => assert.fail("an aborted request cannot issue HTTP"));
  assert.deepEqual(await stopped.provider.listProjects(actorDid, { kind: "personal" }, undefined, AbortSignal.abort()),
    { ok: false, code: "unavailable" });
  let canceled = false;
  const controller = new AbortController();
  const stalled = fixture(() => new Response(new ReadableStream({
    start(stream) { stream.enqueue(new TextEncoder().encode('{"id":')); },
    cancel() { canceled = true; },
  })));
  const result = stalled.provider.listProjects(actorDid, { kind: "personal" }, undefined, controller.signal);
  await delay(1);
  controller.abort();
  assert.deepEqual(await result, { ok: false, code: "unavailable" });
  assert.equal(canceled, true);
});

test("reads an exact repository record through canonical trusted PDS resolution without sending credentials", async () => {
  const nsid = "org.regen.weave.support";
  const supportUri = `at://${actorDid}/${nsid}/${rkey}`;
  const { provider, auth } = fixture(url => {
    if (url.origin === "https://plc.directory") return Response.json(identity(actorDid));
    assert.equal(url.searchParams.get("collection"), nsid);
    assert.equal(url.searchParams.get("rkey"), rkey);
    return Response.json({ uri: supportUri, cid, value: { $type: nsid } });
  });
  assert.deepEqual(await provider.readRepoRecord(actorDid, nsid, rkey), { ok: true, value: { cid, value: { $type: nsid } } });
  assert.deepEqual(auth, []);
  assert.deepEqual(await provider.readRepoRecord(actorDid, "../collection", rkey), { ok: false, code: "invalid_input" });
  assert.deepEqual(await provider.readRepoRecord(actorDid, nsid, ".."), { ok: false, code: "invalid_input" });
});
