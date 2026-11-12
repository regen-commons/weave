import { isDeepStrictEqual } from "node:util";
import { certifiedHandle, record } from "./account-contract.ts";
import { parseProjectUri } from "./project-index-source.ts";

const collection = "org.hypercerts.collection";
const organization = "app.certified.actor.organization";
const descriptionType = "org.hypercerts.defs#descriptionString";
const register = "app.certified.group.register";
const memberships = "app.certified.groups.membership.list";
const members = "app.certified.group.member.list";
const add = "app.certified.group.member.add";
const create = "app.certified.group.repo.createRecord";
const getRecord = "com.atproto.repo.getRecord";
const listRecords = "com.atproto.repo.listRecords";
const projectPageSize = 25;
const pageSize = 100;
const maxPages = 10;
const maxResponseBytes = 512 * 1024;
const graphemes = new Intl.Segmenter();
const plcDid = /^did:plc:[a-z2-7]{24}$/u;
const label = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
const shortHandle = new RegExp(`^${label}$`, "u");
const handle = new RegExp(`^(?:${label}\\.)+[a-z][a-z0-9-]{0,62}$`, "u");
const tid = /^[2-7a-j][2-7a-z]{12}$/u;
const cid = /^bafyrei[a-z2-7]{52}$/u;

export type CertifiedProjectRpc = typeof register | typeof memberships | typeof members | typeof add | typeof create;
export type CertifiedServiceAuthRequest = {
  actorDid: string;
  audience: string;
  method: CertifiedProjectRpc;
  signal: AbortSignal;
};
export type CertifiedServiceProxyRequest = Omit<CertifiedServiceAuthRequest, "method"> & {
  method: typeof register | typeof memberships;
  init: RequestInit;
  query?: URLSearchParams;
};

export type CertifiedProjectError = "invalid_input" | "authorization_required" | "forbidden" | "not_found"
  | "conflict" | "unavailable" | "invalid_response" | "unsupported" | "pending";
export type CertifiedProjectResult<T> = { ok: true; value: T } | { ok: false; code: CertifiedProjectError };
type Failure = Extract<CertifiedProjectResult<never>, { ok: false }>;
const ok = <T>(value: T): CertifiedProjectResult<T> => ({ ok: true, value });
const fail = (code: CertifiedProjectError): Failure => ({ ok: false, code });

export type CertifiedGroupRole = "owner" | "admin" | "member";
export type CertifiedMembership = { groupDid: string; role: CertifiedGroupRole; joinedAt: string; handle?: string; displayName?: string };
export type CertifiedGroup = { groupDid: string; handle: string };
export type CertifiedProject = {
  uri: string;
  cid: string;
  repoDid: string;
  groupDid?: string;
  title: string;
  description?: string;
  createdAt: string;
  visibility: "public" | "unlisted";
};
export type CertifiedProjectDraft = { rkey: string; title: string; description?: string; createdAt: string };
export type CertifiedProjectTarget = { kind: "personal" } | { kind: "group"; groupDid: string };
export type CertifiedProjectPage = { repositoryDid: string; certifiedRole?: CertifiedGroupRole; projects: CertifiedProject[]; cursor?: string };

export type CertifiedProjectProviderOptions = {
  groupServiceOrigin: string;
  groupPdsOrigin: string;
  pdsOrigins?: readonly string[];
  /** Mint a one-use CGS JWT from the current actor's consented AT Protocol session. */
  serviceAuth: (request: CertifiedServiceAuthRequest) => Promise<string | null>;
  /** Use PDS service proxying for service-level methods when AT OAuth scopes require it. */
  serviceProxy?: (request: CertifiedServiceProxyRequest) => Promise<Response | null>;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

function httpsOrigin(value: unknown): string {
  if (typeof value !== "string") throw Error("invalid_certified_origin");
  const url = new URL(value);
  if (url.protocol !== "https:" || !handle.test(url.hostname)
    || (value !== url.origin && value !== `${url.origin}/`) || url.port)
    throw Error("invalid_certified_origin");
  return url.origin;
}

function isDid(value: unknown): value is string {
  return typeof value === "string" && (plcDid.test(value)
    || (value.startsWith("did:web:") && value.length <= 261 && handle.test(value.slice(8))));
}

function isRole(value: unknown): value is CertifiedGroupRole {
  return value === "member" || value === "admin" || value === "owner";
}

function isCursor(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 2048 && !/\p{Cc}/u.test(value);
}

function isTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,20})?(?:Z|[+-]\d{2}:\d{2})$/u.test(value)
    || !Number.isFinite(Date.parse(value))) return false;
  const day = value.slice(0, 10);
  const date = new Date(`${day}T00:00:00Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().startsWith(day);
}

function validText(value: unknown, bytes: number, maxGraphemes?: number): value is string {
  if (typeof value !== "string" || /\p{Surrogate}/u.test(value) || Buffer.byteLength(value) > bytes || !value.trim()) return false;
  if (maxGraphemes === undefined) return true;
  let count = 0;
  for (const _ of graphemes.segment(value)) if (++count > maxGraphemes) return false;
  return true;
}

function projectRecord(input: CertifiedProjectDraft) {
  if (!tid.test(input.rkey) || !validText(input.title, 800, 80) || !isTimestamp(input.createdAt)
    || (input.description !== undefined && !validText(input.description, 250_000))) throw Error("invalid_project_draft");
  return {
    $type: collection, type: "project", title: input.title, createdAt: input.createdAt,
    ...(input.description === undefined ? {} : { description: { $type: descriptionType, value: input.description } }),
  };
}

async function responseJson(response: Response, signal: AbortSignal): Promise<unknown> {
  if (!response.body) throw Error("invalid_body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let body = "";
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    signal.throwIfAborted();
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxResponseBytes) throw Error("response_too_large");
      body += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(body + decoder.decode());
  } finally {
    signal.removeEventListener("abort", cancel);
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

async function within<T>(signal: AbortSignal, operation: () => Promise<T>): Promise<T> {
  signal.throwIfAborted();
  let abort!: () => void;
  const expired = new Promise<never>((_, reject) => {
    abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
  });
  try {
    return await Promise.race([expired, operation()]);
  } finally {
    signal.removeEventListener("abort", abort);
  }
}

function decode<Input, Output>(
  result: CertifiedProjectResult<Input>, parse: (value: Input) => Output,
): CertifiedProjectResult<Output> {
  if (!result.ok) return result;
  try { return ok(parse(result.value)); } catch { return fail("invalid_response"); }
}

function membershipRole(row: Record<string, unknown>, didField: string, dateField: string) {
  const memberDid = row[didField];
  const joinedAt = row[dateField];
  if (!isDid(memberDid) || !isRole(row.role) || !isTimestamp(joinedAt)) throw Error("invalid_membership");
  return { did: memberDid, role: row.role, joinedAt };
}

function membershipPage(value: unknown, rows: "groups" | "members", cursor?: string) {
  const page = record(value);
  const data = page[rows];
  const next = page.cursor;
  if (!Array.isArray(data) || data.length > pageSize || (next !== undefined && (!isCursor(next) || next === cursor || !data.length)))
    throw Error("invalid_memberships");
  const entries = data.map((input: unknown) => {
    const row = record(input);
    if (rows === "groups") return membershipRole(row, "groupDid", "joinedAt");
    if (!isDid(row.addedBy)) throw Error("invalid_membership");
    return membershipRole(row, "did", "addedAt");
  });
  if (new Set(entries.map(entry => entry.did)).size !== entries.length) throw Error("duplicate_membership");
  return { entries, ...(next === undefined ? {} : { cursor: next }) };
}

async function findRole(
  readPage: (cursor?: string) => Promise<CertifiedProjectResult<ReturnType<typeof membershipPage>>>,
  did: string,
): Promise<CertifiedProjectResult<CertifiedGroupRole | null>> {
  const seen = new Set<string>();
  const membersSeen = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const result = await readPage(cursor);
    if (!result.ok) return result;
    for (const entry of result.value.entries) {
      if (membersSeen.has(entry.did)) return fail("invalid_response");
      membersSeen.add(entry.did);
    }
    const found = result.value.entries.find(entry => entry.did === did);
    if (found) return ok(found.role);
    cursor = result.value.cursor;
    if (cursor === undefined) return ok(null);
    if (seen.has(cursor)) return fail("invalid_response");
    seen.add(cursor);
  }
  return fail("unavailable");
}

function visibility(value: unknown): CertifiedProject["visibility"] {
  if (value === undefined || value === "public") return "public";
  if (typeof value === "string") return "unlisted";
  throw Error("invalid_visibility");
}

function readProjectDescription(item: Record<string, unknown>): string | undefined {
  if (item.description !== undefined) {
    const description = record(item.description);
    if (typeof description.$type !== "string") throw Error("invalid_description");
    if (description.$type === descriptionType) {
      if (description.value === "") return undefined;
      if (!validText(description.value, 250_000)) throw Error("invalid_description");
      return description.value;
    }
  }
  if (item.shortDescription === undefined || item.shortDescription === "") return undefined;
  if (!validText(item.shortDescription, 3000, 300)) throw Error("invalid_short_description");
  return item.shortDescription;
}

function recordEnvelope(value: unknown, uri: string) {
  const row = record(value);
  if (row.uri !== uri || typeof row.cid !== "string" || !cid.test(row.cid)) throw Error("invalid_record_reference");
  return { cid: row.cid, value: record(row.value) };
}

export function createCertifiedProjectProvider(options: CertifiedProjectProviderOptions) {
  const cgs = httpsOrigin(options.groupServiceOrigin);
  const audience = `did:web:${new URL(cgs).hostname}`;
  const groupPds = httpsOrigin(options.groupPdsOrigin);
  const groupHost = new URL(groupPds).hostname;
  const pdsOrigins = new Set([groupPds, ...(options.pdsOrigins ?? []).map(httpsOrigin)]);
  const request = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 5000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) throw Error("invalid_certified_timeout");
  const deadline = (signal?: AbortSignal) => signal
    ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);

  async function fetchJson(
    url: URL, signal: AbortSignal, init: RequestInit = {},
    send: (init: RequestInit) => Promise<Response | null> = init => request(url, init),
  ): Promise<CertifiedProjectResult<unknown>> {
    try {
      return await within(signal, async () => {
        const headers = new Headers(init.headers);
        headers.set("accept", "application/json");
        const response = await send({ ...init, headers, signal, cache: "no-store", redirect: "error" });
        if (response === null) return fail("authorization_required");
        if (signal.aborted) {
          void response.body?.cancel().catch(() => undefined);
          return fail("unavailable");
        }
        if (response.status === 401 || response.status === 403 || response.status === 409
          || response.status === 429 || response.status >= 500) {
          void response.body?.cancel().catch(() => undefined);
          if (response.status === 401) return fail("authorization_required");
          if (response.status === 403) return fail("forbidden");
          if (response.status === 409) return fail("conflict");
          return fail("unavailable");
        }
        let value: unknown;
        try { value = await responseJson(response, signal); } catch { return fail(signal.aborted ? "unavailable" : "invalid_response"); }
        if (response.ok) return ok(value);
        if (response.status !== 400 && response.status !== 404) return fail("unavailable");
        if (url.origin === "https://plc.directory" && response.status === 404) return fail("not_found");
        const error = record(value).error;
        if ((url.pathname === `/xrpc/${getRecord}` && error === "RecordNotFound")
          || (url.pathname === "/xrpc/com.atproto.identity.resolveHandle" && error === "HandleNotFound")) return fail("not_found");
        return fail("invalid_response");
      });
    } catch { return fail("unavailable"); }
  }

  async function groupRequest(
    actorDid: string, method: CertifiedProjectRpc, signal: AbortSignal,
    input: { query: URLSearchParams } | { body: Record<string, unknown> },
  ): Promise<CertifiedProjectResult<unknown>> {
    const url = new URL(`/xrpc/${method}`, cgs);
    const query = "query" in input ? input.query : undefined;
    const init: RequestInit = "body" in input
      ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input.body) }
      : { method: "GET" };
    if (query) url.search = query.toString();

    const proxy = options.serviceProxy;
    let result: CertifiedProjectResult<unknown>;
    if (proxy && (method === register || method === memberships)) {
      result = await fetchJson(url, signal, init, init => proxy({ actorDid, audience, method, signal, init, query }));
    } else {
      let token: string | null;
      try {
        token = await within(signal, () => options.serviceAuth({ actorDid, audience, method, signal }));
      } catch { return fail("unavailable"); }
      if (typeof token !== "string" || token.length > 8192 || !/^[\w-]+\.[\w-]+\.[\w-]+$/u.test(token))
        return fail("authorization_required");
      if (signal.aborted) return fail("unavailable");
      const headers = new Headers(init.headers);
      headers.set("authorization", `Bearer ${token}`);
      result = await fetchJson(url, signal, { ...init, headers });
    }
    if ("body" in input && !result.ok && (result.code === "unavailable" || result.code === "invalid_response"))
      return fail("pending");
    return result;
  }

  async function readIdentity(did: string, signal: AbortSignal) {
    const url = plcDid.test(did)
      ? new URL(`/${did}`, "https://plc.directory")
      : new URL(`https://${did.slice(8)}/.well-known/did.json`);
    if (url.origin !== "https://plc.directory" && !pdsOrigins.has(url.origin)) return fail("unsupported");
    const decoded = decode(await fetchJson(url, signal), value => {
      const doc = record(value);
      if (doc.id !== did || !Array.isArray(doc.service) || doc.service.length > 20) throw Error("invalid_did_document");
      const services = doc.service.map((entry: unknown) => record(entry));
      const service = (fragment: string, type: string, required: boolean) => {
        const matches = services.filter(item => item.id === fragment || item.id === `${did}${fragment}`);
        if (!matches.length && !required) return undefined;
        const selected = matches[0];
        if (matches.length !== 1 || selected?.type !== type) throw Error("invalid_did_service");
        return httpsOrigin(selected.serviceEndpoint);
      };
      return {
        pds: service("#atproto_pds", "AtprotoPersonalDataServer", true)!,
        groupService: service("#certified_group", "CertifiedGroupService", false),
        aliases: doc.alsoKnownAs,
      };
    });
    if (decoded.ok && (!pdsOrigins.has(decoded.value.pds)
      || (decoded.value.groupService && decoded.value.groupService !== cgs))) return fail("unsupported");
    return decoded;
  }

  async function readRecord(pds: string, repo: string, nsid: string, rkey: string, signal: AbortSignal) {
    const url = new URL(`/xrpc/${getRecord}`, pds);
    url.search = new URLSearchParams({ repo, collection: nsid, rkey }).toString();
    return decode(await fetchJson(url, signal), value => recordEnvelope(value, `at://${repo}/${nsid}/${rkey}`));
  }

  async function actorProfile(did: string, signal: AbortSignal) {
    const identity = await readIdentity(did, signal);
    if (!identity.ok) return identity;
    const aliases = Array.isArray(identity.value.aliases) ? identity.value.aliases : [];
    const alias = aliases.find((entry): entry is string => typeof entry === "string" && entry.startsWith("at://") && handle.test(entry.slice(5)));
    const profile = await readRecord(identity.value.pds, did, "app.certified.actor.profile", "self", signal);
    const displayName = profile.ok && profile.value.value.$type === "app.certified.actor.profile"
      && validText(profile.value.value.displayName, 640, 64) ? profile.value.value.displayName : undefined;
    return ok({ did, ...(alias ? { handle: alias.slice(5) } : {}), ...(displayName ? { displayName } : {}) });
  }

  async function readProject(uri: string, signal: AbortSignal) {
    let repo: string;
    try { repo = parseProjectUri(uri).did; } catch { return fail("invalid_input"); }
    if (!isDid(repo)) return fail("unsupported");
    const identity = await readIdentity(repo, signal);
    if (!identity.ok) return identity.code === "not_found" ? fail("unavailable") : identity;
    const rkey = uri.slice(uri.lastIndexOf("/") + 1);
    const source = await readRecord(identity.value.pds, repo, collection, rkey, signal);
    if (!source.ok) return source;
    const project = decode(source, ({ cid, value }): CertifiedProject => {
      if (value.$type !== collection || value.type !== "project" || !validText(value.title, 800, 80)
        || !isTimestamp(value.createdAt)) throw Error("invalid_project_record");
      const description = readProjectDescription(value);
      return {
        uri, cid, repoDid: repo, ...(identity.value.groupService === cgs ? { groupDid: repo } : {}),
        title: value.title, createdAt: value.createdAt, visibility: visibility(value.visibility),
        ...(description === undefined ? {} : { description }),
      };
    });
    if (!project.ok) return project;
    const org = await readRecord(identity.value.pds, repo, organization, "self", signal);
    if (org.ok) {
      const orgVisibility = decode(org, ({ value }) => {
        if (value.$type !== organization) throw Error("invalid_organization_record");
        return visibility(value.visibility);
      });
      if (!orgVisibility.ok) return orgVisibility;
      if (orgVisibility.value === "unlisted") project.value.visibility = "unlisted";
    } else if (org.code !== "not_found") return org;
    return ok({ project: project.value, value: source.value.value });
  }

  async function readPage(actorDid: string, signal: AbortSignal, cursor?: string, groupDid?: string) {
    const query = new URLSearchParams({ limit: String(pageSize) });
    if (cursor !== undefined) query.set("cursor", cursor);
    if (groupDid !== undefined) query.set("repo", groupDid);
    return decode(await groupRequest(actorDid, groupDid === undefined ? memberships : members, signal, { query }),
      value => membershipPage(value, groupDid === undefined ? "groups" : "members", cursor));
  }

  async function getMembership(actorDid: string, groupDid: string, cancellation?: AbortSignal) {
    if (!isDid(actorDid) || !isDid(groupDid)) return fail("invalid_input");
    const signal = deadline(cancellation);
    return findRole(cursor => readPage(actorDid, signal, cursor), groupDid);
  }

  async function confirmRecord(groupDid: string, input: CertifiedProjectDraft, expectedCid?: string) {
    let expected: ReturnType<typeof projectRecord>;
    try { expected = projectRecord(input); } catch { return fail("invalid_input"); }
    if (!isDid(groupDid)) return fail("invalid_input");
    const read = await readProject(`at://${groupDid}/${collection}/${input.rkey}`, deadline());
    if (!read.ok) return read;
    const { project, value } = read.value;
    if ((expectedCid !== undefined && project.cid !== expectedCid) || !isDeepStrictEqual(value, expected))
      return fail("conflict");
    if (project.groupDid !== groupDid) return fail("pending");
    if (project.visibility !== "public") return fail("conflict");
    return ok(project);
  }

  /** Bidirectional handle proof. Only approved PDS origins receive requests; no handle-derived URL is fetched. */
  async function resolveHandle(input: string, cancellation?: AbortSignal) {
    const normalized = input.trim().replace(/^@/u, "").toLowerCase();
    if (normalized.length > 253 || !handle.test(normalized)) return fail("invalid_input");
    const signal = deadline(cancellation);
    const url = new URL("/xrpc/com.atproto.identity.resolveHandle", groupPds);
    url.searchParams.set("handle", normalized);
    const resolved = decode(await fetchJson(url, signal), value => {
      const { did } = record(value);
      if (!isDid(did)) throw Error("invalid_handle_resolution");
      return did;
    });
    if (!resolved.ok) return resolved;
    const identity = await readIdentity(resolved.value, signal);
    if (!identity.ok) return identity;
    if (!Array.isArray(identity.value.aliases) || !identity.value.aliases.includes(`at://${normalized}`)) return fail("conflict");
    return ok({ did: resolved.value, handle: normalized });
  }

  return {
    resolveHandle,
    async verifiedHandle(did: string, cancellation?: AbortSignal) {
      if (!isDid(did)) return fail("invalid_input");
      const signal = deadline(cancellation);
      const identity = await readIdentity(did, signal);
      if (!identity.ok) return identity;
      const aliases = Array.isArray(identity.value.aliases) ? identity.value.aliases : [];
      const alias = aliases.find((entry): entry is string => typeof entry === "string"
        && entry.startsWith("at://") && certifiedHandle(entry.slice(5)));
      if (!alias) return fail("not_found");
      const resolved = await resolveHandle(alias.slice(5), signal);
      if (!resolved.ok) return resolved;
      return resolved.value.did === did ? resolved : fail("conflict");
    },
    async listMemberships(actorDid: string, cursor?: string, cancellation?: AbortSignal) {
      if (!isDid(actorDid) || (cursor !== undefined && !isCursor(cursor))) return fail("invalid_input");
      const signal = deadline(cancellation);
      const result = await readPage(actorDid, signal, cursor);
      if (!result.ok) return result;
      // Display metadata is optional and never contributes authority. Read in bounded batches.
      const groups: CertifiedMembership[] = [];
      for (let start = 0; start < result.value.entries.length; start += 5) {
        const batch = await Promise.all(result.value.entries.slice(start, start + 5).map(async ({ did: groupDid, role, joinedAt }) => {
          const profile = await actorProfile(groupDid, signal);
          return { groupDid, role, joinedAt, ...(profile.ok && profile.value.handle ? { handle: profile.value.handle } : {}),
            ...(profile.ok && profile.value.displayName ? { displayName: profile.value.displayName } : {}) };
        }));
        groups.push(...batch);
      }
      return ok({
        groups,
        ...(result.value.cursor === undefined ? {} : { cursor: result.value.cursor }),
      });
    },
    getMembership,
    async getGroupMember(actorDid: string, groupDid: string, recipientDid: string, cancellation?: AbortSignal) {
      if (!isDid(actorDid) || !isDid(groupDid) || !isDid(recipientDid)) return fail("invalid_input");
      const signal = deadline(cancellation);
      return findRole(cursor => readPage(actorDid, signal, cursor, groupDid), recipientDid);
    },
    async registerGroup(actorDid: string, input: { handle: string; email?: string }) {
      if (!isDid(actorDid) || !shortHandle.test(input.handle)
        || (input.email !== undefined && (input.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(input.email))))
        return fail("invalid_input");
      const fullHandle = `${input.handle}.${groupHost}`;
      const result = decode(await groupRequest(actorDid, register, deadline(), {
        body: { handle: input.handle, ownerDid: actorDid, ...(input.email === undefined ? {} : { email: input.email }) },
      }), (value): CertifiedGroup => {
        const row = record(value);
        if (!isDid(row.groupDid) || row.groupDid === actorDid || row.handle !== fullHandle) throw Error("invalid_group");
        return { groupDid: row.groupDid, handle: fullHandle };
      });
      return !result.ok && result.code === "invalid_response" ? fail("pending") : result;
    },
    async findRegisteredGroup(actorDid: string, fullHandle: string) {
      if (!isDid(actorDid) || !handle.test(fullHandle) || !fullHandle.endsWith(`.${groupHost}`)
        || !shortHandle.test(fullHandle.slice(0, -(groupHost.length + 1)))) return fail("invalid_input");
      const signal = deadline();
      const url = new URL("/xrpc/com.atproto.identity.resolveHandle", groupPds);
      url.searchParams.set("handle", fullHandle);
      const resolved = decode(await fetchJson(url, signal), value => {
        const { did } = record(value);
        if (!isDid(did)) throw Error("invalid_handle_resolution");
        return did;
      });
      if (!resolved.ok) return resolved;
      if (resolved.value === actorDid) return fail("conflict");
      const identity = await readIdentity(resolved.value, signal);
      if (!identity.ok) return identity.code === "not_found" ? fail("pending") : identity;
      if (identity.value.pds !== groupPds || !Array.isArray(identity.value.aliases)
        || !identity.value.aliases.includes(`at://${fullHandle}`)) return fail("conflict");
      if (identity.value.groupService !== cgs) return fail("pending");
      const role = await findRole(cursor => readPage(actorDid, signal, cursor), resolved.value);
      if (!role.ok) return role;
      if (role.value !== "owner") return fail("conflict");
      return ok({ groupDid: resolved.value, handle: fullHandle });
    },
    async addMember(actorDid: string, groupDid: string, input: { memberDid: string; role: "member" | "admin" }) {
      if (!isDid(actorDid) || !isDid(groupDid) || !isDid(input.memberDid)
        || (input.role !== "member" && input.role !== "admin")) return fail("invalid_input");
      const result = decode(await groupRequest(actorDid, add, deadline(), {
        body: { repo: groupDid, memberDid: input.memberDid, role: input.role },
      }), value => {
        const row = record(value);
        if (row.memberDid !== input.memberDid || row.role !== input.role || row.addedBy !== actorDid
          || !isTimestamp(row.addedAt)) throw Error("invalid_added_member");
        return { memberDid: input.memberDid, role: input.role, addedBy: actorDid, addedAt: row.addedAt };
      });
      return !result.ok && result.code === "invalid_response" ? fail("pending") : result;
    },
    async getProject(uri: string, cancellation?: AbortSignal) {
      const result = await readProject(uri, deadline(cancellation));
      return result.ok ? ok(result.value.project) : result;
    },
    async readRepoRecord(repoDid: string, nsid: string, rkey: string, cancellation?: AbortSignal) {
      if (!isDid(repoDid) || nsid.length > 317 || !/^(?:[a-z][a-z0-9-]{0,62}\.){2,}[A-Za-z][A-Za-z0-9]{0,62}$/u.test(nsid)
        || !/^[A-Za-z0-9._:~-]{1,512}$/u.test(rkey) || rkey === "." || rkey === "..") return fail("invalid_input");
      const signal = deadline(cancellation);
      const identity = await readIdentity(repoDid, signal);
      if (!identity.ok) return identity.code === "not_found" ? fail("unavailable") : identity;
      return readRecord(identity.value.pds, repoDid, nsid, rkey, signal);
    },
    async listProjects(actorDid: string, target: CertifiedProjectTarget, cursor?: string, cancellation?: AbortSignal): Promise<CertifiedProjectResult<CertifiedProjectPage>> {
      if (!isDid(actorDid) || (target.kind !== "personal" && target.kind !== "group")
        || (target.kind === "group" && (!isDid(target.groupDid) || target.groupDid === actorDid))
        || (cursor !== undefined && !isCursor(cursor))) return fail("invalid_input");
      const signal = deadline(cancellation);
      const repositoryDid = target.kind === "personal" ? actorDid : target.groupDid;
      let certifiedRole: CertifiedGroupRole | undefined;
      if (target.kind === "group") {
        const role = await findRole(next => readPage(actorDid, signal, next), repositoryDid);
        if (!role.ok) return role;
        if (!role.value) return fail("forbidden");
        certifiedRole = role.value;
      }
      const identity = await readIdentity(repositoryDid, signal);
      if (!identity.ok) return identity.code === "not_found" ? fail("unavailable") : identity;
      if (target.kind === "group" && (identity.value.groupService !== cgs || identity.value.pds !== groupPds))
        return fail("unsupported");
      if (target.kind === "personal" && identity.value.groupService !== undefined) return fail("unsupported");
      const base = { repositoryDid, ...(certifiedRole === undefined ? {} : { certifiedRole }) };
      const org = await readRecord(identity.value.pds, repositoryDid, organization, "self", signal);
      if (org.ok) {
        const publicOrganization = decode(org, ({ value }) => {
          if (value.$type !== organization) throw Error("invalid_organization_record");
          return visibility(value.visibility) === "public";
        });
        if (!publicOrganization.ok) return publicOrganization;
        if (!publicOrganization.value) return ok({ ...base, projects: [] as CertifiedProject[] });
      } else if (org.code !== "not_found") return org;
      const url = new URL(`/xrpc/${listRecords}`, identity.value.pds);
      url.search = new URLSearchParams({ repo: repositoryDid, collection, limit: String(projectPageSize),
        ...(cursor === undefined ? {} : { cursor }) }).toString();
      return decode(await fetchJson(url, signal), value => {
        const page = record(value);
        if (!Array.isArray(page.records) || page.records.length > projectPageSize
          || (page.cursor !== undefined && (!isCursor(page.cursor) || page.cursor === cursor || !page.records.length)))
          throw Error("invalid_project_page");
        const seen = new Set<string>();
        const projects = page.records.flatMap((input: unknown): CertifiedProject[] => {
          const row = record(input);
          const { uri, did } = parseProjectUri(row.uri);
          if (did !== repositoryDid || seen.has(uri)) throw Error("invalid_project_page_repository");
          seen.add(uri);
          const { cid, value } = recordEnvelope(row, uri);
          if (value.$type !== collection || typeof value.type !== "string") throw Error("invalid_collection_record");
          if (value.type !== "project" || visibility(value.visibility) !== "public") return [];
          if (!validText(value.title, 800, 80) || !isTimestamp(value.createdAt)) throw Error("invalid_project_record");
          const description = readProjectDescription(value);
          return [{ uri, cid, repoDid: repositoryDid, ...(target.kind === "group" ? { groupDid: repositoryDid } : {}),
            title: value.title, createdAt: value.createdAt, visibility: "public",
            ...(description === undefined ? {} : { description }) }];
        });
        return { ...base, projects, ...(page.cursor === undefined ? {} : { cursor: page.cursor }) };
      });
    },
    confirmProject(groupDid: string, input: CertifiedProjectDraft) {
      return confirmRecord(groupDid, input);
    },
    async createProject(actorDid: string, groupDid: string, input: CertifiedProjectDraft) {
      if (!isDid(actorDid) || !isDid(groupDid) || actorDid === groupDid) return fail("invalid_input");
      let entry: ReturnType<typeof projectRecord>;
      try { entry = projectRecord(input); } catch { return fail("invalid_input"); }
      const uri = `at://${groupDid}/${collection}/${input.rkey}`;
      const created = decode(await groupRequest(actorDid, create, deadline(), {
        body: { repo: groupDid, collection, rkey: input.rkey, record: entry },
      }), value => {
        const row = record(value);
        if (row.uri !== uri || typeof row.cid !== "string" || !cid.test(row.cid)) throw Error("invalid_create_result");
        return row.cid;
      });
      if (!created.ok && created.code !== "conflict" && created.code !== "pending" && created.code !== "invalid_response")
        return created;
      const confirmed = await confirmRecord(groupDid, input, created.ok ? created.value : undefined);
      return !confirmed.ok && confirmed.code !== "conflict" ? fail("pending") : confirmed;
    },
  };
}

export type CertifiedProjectProvider = ReturnType<typeof createCertifiedProjectProvider>;
