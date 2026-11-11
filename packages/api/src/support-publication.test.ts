import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { AccountError } from "./account-provider.ts";
import type { CertifiedGroupRole, CertifiedProjectProvider } from "./certified-project-provider.ts";
import { createSupportPublicationAdapter } from "./support-publication-provider.ts";
import {
  SUPPORT_COLLECTION, createSupportPublication, parseSupportListing, parseSupportPublicationCommand,
  type SupportListing, type SupportPublication, type SupportPublicationCommand, type SupportPublicationStore,
} from "./support-publication.ts";

const id = (n: number) => `31000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const alice = "did:plc:aaaaaaaaaaaaaaaaaaaaaaaa", bob = "did:plc:bbbbbbbbbbbbbbbbbbbbbbbb";
const group = "did:plc:cccccccccccccccccccccccc";
const key = "3jui7kd54zh2y";
const cid = (n: number) => "b" + String.fromCharCode(97 + n).repeat(58);
const actor = { userId: id(1), sessionId: id(2), did: alice };
function listing(repo = alice, kind: "need" | "offer" = "need"): SupportListing {
  return { $type: SUPPORT_COLLECTION, projectUri: `at://${repo}/org.hypercerts.collection/${key}`, kind,
    title: kind === "need" ? "A place to meet" : "Oral history transcription", description: "Fictional community support.",
    capitalForms: ["social", "cultural"], status: "open", createdAt: "2026-11-10T18:00:00.000Z", expiresAt: "2027-01-31T00:00:00.000Z" };
}

test("public listings accept reviewed learning lenses, preserve older records, and reject unknown or duplicate lenses", () => {
  assert.equal(parseSupportListing(listing()).lenses, undefined);
  assert.deepEqual(parseSupportListing({ ...listing(), lenses: ["learning", "research"] }).lenses, ["learning", "research"]);
  for (const lenses of [["learning", "learning"], ["unreviewed-value"], "learning"])
    assert.throws(() => parseSupportListing({ ...listing(), lenses }));
});
type PublicRecord = { uri: string; cid: string; value: SupportListing; author: string };
async function fixture(groupProject = false, kind: "need" | "offer" = "need", sharedRecords?: Map<string, PublicRecord>) {
  const repo = groupProject ? group : alice;
  const target = { projectUri: listing(repo, kind).projectUri, repositoryDid: repo, groupDid: groupProject ? repo : null };
  const supportKey = kind === "need" ? key : "3jui7kd54zh2z";
  let state: SupportPublication = { kind, entryId: kind === "need" ? id(3) : id(13), rkey: supportKey,
    operationId: kind === "need" ? id(4) : id(14), record: listing(repo, kind),
    status: "publish_pending", cid: null, attempted: false, problem: null };
  const publicRecords = sharedRecords ?? new Map<string, PublicRecord>();
  const page = { listings: null as SupportPublication[] | null, next: null as { kind: "need" | "offer"; entryId: string } | null,
    lastData: {} as Record<string, unknown> };
  const fake = { consentCreate: true, consentDelete: true, editor: true, membership: "member" as CertifiedGroupRole | null,
    project: "public" as "public" | "unlisted" | "missing" | "outage", unavailableRead: false,
    loseCreateResponse: false, failReadAfterWrite: false, writes: 0, reads: 0, deleteSwaps: [] as string[],
    replaceBeforeDelete: false, disableConditionalDelete: false };
  const outcome = { rejectCreate: false, uncertainWithoutWrite: false };
  const uri = `at://${repo}/${SUPPORT_COLLECTION}/${supportKey}`;
  let createGate: Promise<void> | null = null;
  let reachedCreate: (() => void) | null = null;
  const readRepoRecord: CertifiedProjectProvider["readRepoRecord"] = async (repoDid, collection, rkey) => {
    fake.reads++;
    assert.equal(repoDid, repo); assert.equal(collection, SUPPORT_COLLECTION); assert.equal(rkey, supportKey);
    if (fake.unavailableRead) return { ok: false, code: "unavailable" };
    const found = publicRecords.get(uri);
    return found ? { ok: true, value: { cid: found.cid, value: { ...structuredClone(found.value) } } } : { ok: false, code: "not_found" };
  };
  const projects = {
    async getProject() {
      if (fake.project === "outage") return { ok: false, code: "unavailable" } as const;
      if (fake.project === "missing") return { ok: false, code: "not_found" } as const;
      return { ok: true, value: { uri: target.projectUri, cid: cid(0), repoDid: repo,
        ...(groupProject ? { groupDid: repo } : {}), title: "Fictional project", createdAt: state.record.createdAt,
        visibility: fake.project } } as const;
    },
    async getMembership() { return { ok: true, value: fake.membership } as const; },
  };
  const checkpoints: string[] = [];
  const store: SupportPublicationStore = {
    async target() { return target; },
    async command(_actor, _id, _role, _cid, action, data) {
      let claimed = false;
      if (action === "support_state") { page.lastData = data; return { listings: page.listings ?? [structuredClone(state)], next: page.next }; }
      if (action === "support_project_ineligible") { state.status = "withdrawal_pending"; return null; }
      if (!fake.editor) throw new AccountError(403, "workspace_edit_required");
      if (action === "support_withdraw") state.status = "withdrawal_pending";
      if (action === "support_checkpoint") {
        assert.equal(data.operationId, state.operationId);
        const event = String(data.event); checkpoints.push(event);
        if (event === "sending" && !state.attempted) { state.attempted = true; claimed = true; }
        else if (event === "published" || event === "observed") {
          state.cid = String(data.cid);
          if (event === "published" && state.status === "publish_pending") state.status = "published";
        } else if (event === "external_withdrawn" || event === "withdrawn") state.status = "withdrawn";
        else if (event === "conflict") { state.status = "conflict"; state.problem = "public_record_changed"; }
        else if (event === "problem" || event === "rejected") {
          state.problem = String(data.problem);
          if (event === "rejected") state.attempted = false;
        }
      }
      return { ...structuredClone(state), ...(data.event === "sending" ? { claimed } : {}) };
    },
  };
  async function mutate(operation: "create" | "delete", input: { rkey: string; record?: unknown; expectedCid?: string }, writer = alice) {
    fake.writes++;
    if (operation === "create") {
      reachedCreate?.();
      if (createGate) await createGate;
      if (outcome.rejectCreate) return Response.json({ error: "Forbidden" }, { status: 403 });
      if (outcome.uncertainWithoutWrite) return Response.json({ error: "UpstreamTimeout" }, { status: 502 });
      if (publicRecords.has(uri)) return Response.json({ error: "RecordAlreadyExists" }, { status: 409 });
      publicRecords.set(uri, { uri, cid: cid(1), value: structuredClone(input.record as SupportListing), author: writer });
      if (fake.failReadAfterWrite) fake.unavailableRead = true;
      if (fake.loseCreateResponse) return Response.json({ error: "UpstreamTimeout" }, { status: 502 });
      return Response.json({ uri, cid: cid(1) });
    }
    fake.deleteSwaps.push(input.expectedCid!);
    const before = publicRecords.get(uri);
    if (groupProject && before?.author !== writer && fake.membership === "member")
      return Response.json({ error: "Forbidden" }, { status: 403 });
    if (fake.replaceBeforeDelete && before) publicRecords.set(uri, { ...before, cid: cid(2), value: { ...before.value, title: "A newer independent replacement" } });
    if (publicRecords.get(uri)?.cid !== input.expectedCid) return Response.json({ error: "InvalidSwap" }, { status: 400 });
    publicRecords.delete(uri);
    return Response.json({});
  }
  const adapter = () => createSupportPublicationAdapter({
    projectProvider: { readRepoRecord }, groupServiceOrigin: "https://groups.example.test",
    groupConditionalDeleteVerified: !fake.disableConditionalDelete,
    async assertGrant(_did, methods) {
      if ((methods[0]!.endsWith("createRecord") && !fake.consentCreate) || (methods[0]!.endsWith("deleteRecord") && !fake.consentDelete))
        throw new AccountError(403, "project_consent_required");
    },
    async serviceAuth(did) { return "synthetic." + Buffer.from(did).toString("base64url") + ".signature"; },
    async personalWrite(_did, operation, input) { return mutate(operation, input); },
    async fetch(input, init) {
      assert.equal(new URL(String(input)).origin, "https://groups.example.test");
      const body = JSON.parse(String(init?.body));
      assert.equal(body.repo, repo); assert.equal(body.collection, SUPPORT_COLLECTION);
      const writer = Buffer.from(new Headers(init?.headers).get("authorization")!.split(".")[1]!, "base64url").toString();
      return mutate(new URL(String(input)).pathname.endsWith("createRecord") ? "create" : "delete",
        { rkey: body.rkey, record: body.record, expectedCid: body.swapRecord }, writer);
    },
  });
  const command = (action: "support_publish" | "support_withdraw" | "support_reconcile"): SupportPublicationCommand => action === "support_publish"
    ? { action, workspaceId: id(9), reviewId: id(8), requestId: state.operationId, audience: "public-atproto", confirmPublic: true }
    : action === "support_withdraw" ? { action, workspaceId: id(9), kind, entryId: state.entryId, requestId: kind === "need" ? id(5) : id(15) }
      : { action, workspaceId: id(9), kind, entryId: state.entryId };
  const execute = (action: "support_publish" | "support_withdraw" | "support_reconcile", who = actor) =>
    createSupportPublication(projects, store, adapter()).execute(who, command(action)) as Promise<SupportPublication>;
  // An independent public-reader fixture uses repository discovery, not the publication parser or its stored state.
  const independentReader = async () => {
    const response = Response.json({ records: [...publicRecords.values()].map(({ uri, cid, value }) => ({ uri, cid, value })) });
    const body = await response.json() as { records: { uri: string; cid: string; value: Record<string, unknown> }[] };
    return body.records.map(item => {
      assert.match(item.uri, /\/com\.regencommons\.weave\.supportListing\//);
      assert.equal(item.value.$type, "com.regencommons.weave.supportListing");
      assert.equal(item.value.projectUri, target.projectUri);
      assert.equal(item.value.kind, kind);
      assert.deepEqual(item.value.capitalForms, ["social", "cultural"]);
      assert.equal(item.value.status, "open");
      assert(!Object.hasOwn(item.value, "privateNotes"));
      return item;
    });
  };
  return { fake, outcome, page, execute, publicRecords, uri, checkpoints, independentReader, state: () => state,
    loadState: (cursor?: string) => createSupportPublication(projects, store, adapter()).execute(actor,
      { action: "support_state", workspaceId: id(9), ...(cursor ? { cursor } : {}) }),
    pauseCreate() {
      let release!: () => void;
      createGate = new Promise<void>(resolve => { release = resolve; });
      const entered = new Promise<void>(resolve => { reachedCreate = resolve; });
      return { release, entered };
    },
    edit: () => { state.status = "withdrawal_pending"; },
    republish: () => { state = { ...state, operationId: id(6), status: "publish_pending", cid: null, attempted: false,
      record: { ...state.record, title: "Explicitly reviewed replacement" } }; },
  };
}

test("listing validation rejects missing forms, duplicate forms, private fields, invalid dates and wrong project URIs", () => {
  assert.deepEqual(parseSupportListing(listing()), listing());
  const undated = { ...listing() }; delete undated.expiresAt;
  assert.deepEqual(parseSupportListing(undated), undated);
  assert.equal(parseSupportPublicationCommand({ action: "support_review", workspaceId: id(9), kind: "need", entryId: id(3),
    expectedRevision: 1, expectedEntryRevision: 2, expiresAt: null }).action, "support_review");
  for (const changed of [{ capitalForms: [] }, { capitalForms: ["social", "social"] }, { privateNotes: "private" },
    { createdAt: "2026-02-30T00:00:00Z" }, { expiresAt: "2020-01-01T00:00:00Z" }, { projectUri: "at://alice.test/other/abc" }])
    assert.throws(() => parseSupportListing({ ...listing(), ...changed }));
  const base = { action: "support_publish", workspaceId: id(9), reviewId: id(8), requestId: id(4), audience: "public-atproto", confirmPublic: true };
  assert.deepEqual(parseSupportPublicationCommand(base), base);
  for (const changed of [{ audience: "weave-users" }, { confirmPublic: false }, { actorDid: alice }, { expectedRevision: 1 }])
    assert.throws(() => parseSupportPublicationCommand({ ...base, ...changed }));
});

test("support state pages retain historical entries and bind their bounded cursor to the workspace", async () => {
  const f = await fixture();
  f.page.listings = Array.from({ length: 100 }, (_, n) => ({ ...structuredClone(f.state()), entryId: id(100 + n), status: "withdrawal_pending" }));
  f.page.next = { kind: "need", entryId: id(199) };
  const first = await f.loadState() as { listings: SupportPublication[]; nextCursor: string | null };
  assert.equal(first.listings.length, 100);
  assert.equal(first.listings[0]!.entryId, id(100));
  assert.equal(typeof first.nextCursor, "string");
  f.page.listings = []; f.page.next = null;
  const last = await f.loadState(first.nextCursor!) as { nextCursor: string | null };
  assert.deepEqual(f.page.lastData, { afterKind: "need", afterEntryId: id(199) });
  assert.equal(last.nextCursor, null);
  const foreign = Buffer.from(JSON.stringify([id(99), "need", id(199)])).toString("base64url");
  await assert.rejects(f.loadState(foreign), /invalid_support_command/);
  await assert.rejects(f.loadState("not-json"), /invalid_support_command/);
});

test("standalone public reader discovers one need and one offer from a synthetic repository and groups them by project", async () => {
  const records = new Map<string, PublicRecord>();
  const need = await fixture(true, "need", records), offer = await fixture(true, "offer", records);
  await need.execute("support_publish"); await offer.execute("support_publish");
  const schema = JSON.parse(await readFile(new URL("../lexicons/com/regencommons/weave/supportListing.json", import.meta.url), "utf8"));
  const calls: string[] = [];
  const publicFetch: typeof fetch = async input => {
    const url = new URL(String(input)); calls.push(url.pathname);
    assert.equal(url.searchParams.get("repo"), group);
    assert.equal(url.searchParams.get("collection"), schema.id);
    const all = [...records.values()].map(({ uri, cid, value }) => ({ uri, cid, value }));
    if (url.pathname === "/xrpc/com.atproto.repo.listRecords") {
      const offset = Number(url.searchParams.get("cursor") ?? 0);
      return Response.json({ records: all.slice(offset, offset + 1), ...(offset + 1 < all.length ? { cursor: String(offset + 1) } : {}) });
    }
    const item = all.find(item => item.uri.endsWith("/" + url.searchParams.get("rkey")));
    return item ? Response.json(item) : Response.json({ error: "RecordNotFound" }, { status: 400 });
  };
  // Deliberately independent: use only the published Lexicon and public XRPC envelopes, never app parser/storage state.
  const grouped = new Map<string, Array<{ kind: string; uri: string }>>();
  const object = (value: unknown): Record<string, unknown> => {
    assert(value && typeof value === "object" && !Array.isArray(value));
    return value as Record<string, unknown>;
  };
  let cursor: string | undefined;
  do {
    const query = new URLSearchParams({ repo: group, collection: schema.id, limit: "1", ...(cursor ? { cursor } : {}) });
    const discovered = object(await (await publicFetch(`https://public-reader.example.test/xrpc/com.atproto.repo.listRecords?${query}`)).json());
    assert(Array.isArray(discovered.records));
    for (const raw of discovered.records) {
      const item = object(raw);
      assert.equal(typeof item.uri, "string");
      const rkey = String(item.uri).split("/").at(-1)!;
      const readQuery = new URLSearchParams({ repo: group, collection: schema.id, rkey });
      const current = object(await (await publicFetch(`https://public-reader.example.test/xrpc/com.atproto.repo.getRecord?${readQuery}`)).json());
      assert.equal(current.uri, item.uri); assert.equal(current.cid, item.cid);
      const value = object(current.value);
      for (const required of schema.defs.main.record.required) assert(Object.hasOwn(value, required));
      assert.equal(value.$type, schema.id);
      assert.equal(typeof value.kind, "string"); assert.equal(typeof value.projectUri, "string");
      assert(schema.defs.main.record.properties.kind.enum.includes(value.kind));
      assert.equal(String(value.projectUri).split("/")[2], group);
      assert(Array.isArray(value.capitalForms) && value.capitalForms.length > 0);
      const project = String(value.projectUri), entries = grouped.get(project) ?? [];
      entries.push({ kind: String(value.kind), uri: String(current.uri) }); grouped.set(project, entries);
    }
    assert(discovered.cursor === undefined || typeof discovered.cursor === "string");
    cursor = discovered.cursor;
  } while (cursor);
  assert.equal(grouped.size, 1);
  assert.deepEqual([...grouped.values()][0]!.map(item => item.kind).sort(), ["need", "offer"]);
  assert.equal(new Set([...grouped.values()][0]!.map(item => item.uri)).size, 2);
  assert.equal(calls.filter(path => path.endsWith("listRecords")).length, 2);
  assert.equal(calls.filter(path => path.endsWith("getRecord")).length, 2);
});

for (const groupProject of [false, true]) for (const kind of ["need", "offer"] as const) {
  test(`fixture ${groupProject ? "group" : "personal"} ${kind}: independent read, edit withdrawal, explicit replacement and withdrawal`, async () => {
    const f = await fixture(groupProject, kind);
    assert.equal((await f.execute("support_publish")).status, "published");
    assert.equal((await f.independentReader()).length, 1);
    const stableUri = [...f.publicRecords.keys()][0];
    f.edit();
    assert.equal((await f.execute("support_reconcile")).status, "withdrawn");
    assert.equal((await f.independentReader()).length, 0);
    assert.deepEqual(f.fake.deleteSwaps, [cid(1)]);
    f.republish();
    assert.equal(f.publicRecords.size, 0, "replacement remains private before explicit publish");
    assert.equal((await f.execute("support_publish")).status, "published");
    assert.equal([...f.publicRecords.keys()][0], stableUri);
    assert.equal((await f.execute("support_withdraw")).status, "withdrawn");
    assert.equal((await f.independentReader()).length, 0);
  });
}

test("no consent, no editor grant and no current group membership cannot publish", async () => {
  const f = await fixture(true);
  f.fake.consentCreate = false;
  await assert.rejects(f.execute("support_publish"), /project_consent_required/);
  assert.equal(f.fake.writes, 0);
  f.fake.consentCreate = true; f.fake.editor = false;
  await assert.rejects(f.execute("support_publish"), /workspace_edit_required/);
  f.fake.editor = true; f.fake.membership = null;
  await assert.rejects(f.execute("support_publish"), /workspace_access_required/);
  assert.equal(f.fake.writes, 0);
});

test("lost response reconciles one stable record without another create", async () => {
  const f = await fixture(true);
  f.fake.loseCreateResponse = true; f.fake.failReadAfterWrite = true;
  assert.equal((await f.execute("support_publish")).status, "publish_pending");
  assert.equal(f.publicRecords.size, 1);
  f.fake.unavailableRead = false;
  assert.equal((await f.execute("support_publish")).status, "published");
  assert.equal(f.fake.writes, 1);
  assert(f.checkpoints.indexOf("sending") < f.checkpoints.indexOf("published"));
});

test("simultaneous publishers claim one create and no delayed retry can resurrect a withdrawn listing", async () => {
  const f = await fixture(true), gate = f.pauseCreate();
  const first = f.execute("support_publish");
  await gate.entered;
  assert.equal((await f.execute("support_publish")).status, "publish_pending");
  assert.equal(f.fake.writes, 1, "already-attempted operations reconcile without sending another create");
  gate.release();
  assert.equal((await first).status, "published");
  assert.equal((await f.execute("support_withdraw")).status, "withdrawn");
  assert.equal(f.fake.writes, 2, "one create and one conditional delete");
  assert.equal(f.publicRecords.size, 0);
});

test("a definitive rejection releases its sole create claim, while an uncertain unobserved create only reconciles", async () => {
  const rejected = await fixture(true); rejected.outcome.rejectCreate = true;
  assert.equal((await rejected.execute("support_publish")).problem, "forbidden");
  assert.equal(rejected.state().attempted, false);
  rejected.outcome.rejectCreate = false;
  assert.equal((await rejected.execute("support_publish")).status, "published");
  const uncertain = await fixture(); uncertain.outcome.uncertainWithoutWrite = true;
  assert.equal((await uncertain.execute("support_publish")).status, "publish_pending");
  assert.equal(uncertain.state().attempted, true);
  assert.equal((await uncertain.execute("support_publish")).status, "publish_pending");
  assert.equal(uncertain.fake.writes, 1);
  assert.equal((await uncertain.execute("support_withdraw")).problem, "unobserved_create");
});

test("withdrawal remains pending without authority, including an uncertain create that has not been observed", async () => {
  const f = await fixture(true);
  await f.execute("support_publish"); f.fake.consentDelete = false;
  const pending = await f.execute("support_withdraw");
  assert.equal(pending.status, "withdrawal_pending"); assert.equal(pending.problem, "project_consent_required");
  assert.equal(f.publicRecords.size, 1);
  f.fake.consentDelete = true;
  assert.equal((await f.execute("support_reconcile")).status, "withdrawn");
  const unknown = await fixture();
  unknown.state().attempted = true; unknown.edit();
  assert.equal((await unknown.execute("support_reconcile")).problem, "unobserved_create");
  assert.equal(unknown.state().status, "withdrawal_pending");
});

test("a group member cannot delete another author's publication and an admin can resolve it", async () => {
  const f = await fixture(true);
  await f.execute("support_publish");
  const other = { ...actor, did: bob, userId: id(11) };
  assert.equal((await f.execute("support_withdraw", other)).status, "withdrawal_pending");
  assert.equal(f.state().problem, "forbidden");
  assert.equal(f.publicRecords.size, 1);
  f.fake.membership = "admin";
  assert.equal((await f.execute("support_reconcile", other)).status, "withdrawn");
});

test("expected CID prevents a delayed withdrawal deleting a newer replacement", async () => {
  const f = await fixture(true);
  await f.execute("support_publish"); f.fake.replaceBeforeDelete = true;
  assert.equal((await f.execute("support_withdraw")).status, "conflict");
  assert.equal(f.publicRecords.get(f.uri)?.cid, cid(2));
  assert.equal(f.publicRecords.get(f.uri)?.value.title, "A newer independent replacement");
});

test("confirmed project unlisting requests withdrawal but an outage leaves publication untouched", async () => {
  const f = await fixture(true);
  await f.execute("support_publish"); f.fake.project = "outage";
  await assert.rejects(f.execute("support_publish"), /certified_project_unavailable/);
  assert.equal(f.state().status, "published");
  assert.equal((await f.execute("support_reconcile")).status, "published");
  f.fake.project = "unlisted";
  assert.equal((await f.execute("support_reconcile")).status, "withdrawn");
  const readOnly = await fixture(true);
  await readOnly.execute("support_publish");
  readOnly.fake.project = "missing"; readOnly.fake.editor = false;
  await readOnly.loadState();
  assert.equal(readOnly.state().status, "withdrawal_pending", "read-back of confirmed missing parent queues withdrawal");
});

test("verified external withdrawal updates only the public state and conditional group deletion is gated", async () => {
  const f = await fixture(true);
  await f.execute("support_publish");
  f.publicRecords.delete(f.uri);
  assert.equal((await f.execute("support_reconcile")).status, "withdrawn");
  assert.equal(f.fake.writes, 1);
  f.republish(); await f.execute("support_publish"); f.fake.disableConditionalDelete = true;
  const pending = await f.execute("support_withdraw");
  assert.equal(pending.status, "withdrawal_pending"); assert.equal(pending.problem, "support_group_lifecycle_unverified");
  assert.equal(f.publicRecords.size, 1);
  const blocked = await fixture(true); blocked.fake.disableConditionalDelete = true;
  await assert.rejects(blocked.execute("support_publish"), /support_group_lifecycle_unverified/);
  assert.equal(blocked.fake.writes, 0);
  assert.equal(blocked.state().attempted, false);
});
