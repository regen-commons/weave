import { LENSES, parseSavedAsk, record, uuid, type JsonObject } from "./account-contract.ts";
import type { PartnerMatch, ProjectEvidence, SharedPartnerEntry } from "./partner-matcher.ts";

export type MatchingKind = "need" | "offer";
export type MatchingShare = "private" | "shared" | "needs_review" | "withdrawn" | "expired";
export type MatchingEntryStatus = "open" | "met" | "withdrawn" | "expired";
export type LeadDisposition = "saved" | "dismissed" | "removed";
export type LeadEvidenceStatus = "current" | "unavailable" | "unknown";
export interface MatchingEntryKey {
  kind: MatchingKind;
  entryId: string;
}
export interface MatchingEntryRef extends MatchingEntryKey {
  revision: number;
  shareVersion: number;
}
export interface MatchingEntryState extends MatchingEntryRef {
  status: MatchingEntryStatus;
  sharing: MatchingShare;
  confirmedAt: string | null;
  expiresAt: string | null;
}
export interface MatchingSummary extends JsonObject {
  name: string;
  description: string;
  locations: string[];
  isGlobal: boolean;
  lenses: string[];
  themes: string[];
}
export interface MatchingState {
  initiativeId: string;
  initiativeRevision: number;
  entries: MatchingEntryState[];
}
export interface MatchingPreview {
  reviewId: string;
  initiativeId: string;
  initiativeRevision: number;
  audience: "weave_users";
  expiresAt: string | null;
  summary: MatchingSummary;
  entries: (MatchingEntryRef & { value: JsonObject })[];
}
export interface MatchingLead extends MatchingEntryKey {
  candidateId: string;
  disposition: Exclude<LeadDisposition, "removed">;
  updatedAt: string;
  evidenceStatus: LeadEvidenceStatus;
}
export interface MatchingLeads {
  initiativeId: string;
  leads: MatchingLead[];
}
export interface MatchingCoverage {
  shared: "available" | "not_joined";
  external: "available" | "partial" | "stale" | "unavailable";
  corpusVersion: string | null;
  modelVersion: string | null;
  engineVersion: string;
}
export interface MatchingSearch {
  initiativeId: string;
  results: PartnerMatch[];
  coverage: MatchingCoverage;
}
export type MatchingProjection = SharedPartnerEntry & MatchingEntryRef;
export type MatchingLeadUpdate = { candidateId: string; requestId: string } & (
  | { disposition: "removed"; entry: MatchingEntryKey | MatchingEntryRef }
  | { disposition: "saved" | "dismissed"; entry: MatchingEntryRef }
);
export type MatchingCommand = { initiativeId: string } & (
  | { action: "state" | "leads" }
  | { action: "preview"; initiativeRevision: number; entries: MatchingEntryRef[]; expiresAt?: string }
  | { action: "share" | "renew"; reviewId: string; requestId: string }
  | { action: "withdraw"; entries: MatchingEntryRef[]; requestId: string }
  | { action: "search"; entries?: MatchingEntryRef[] }
  | ({ action: "set_lead" } & MatchingLeadUpdate)
);

const invalid = (): never => { throw Error("invalid_data"); };
function exact(value: unknown, required: readonly string[], optional: readonly string[] = []) {
  const o = record(value);
  if (required.some(key => !Object.hasOwn(o, key)) ||
    Object.keys(o).some(key => !required.includes(key) && !optional.includes(key))) invalid();
  return o;
}
function identifier(value: unknown) { return uuid(value) ? value.toLowerCase() : invalid(); }
function version(value: unknown, min = 1, max = Number.MAX_SAFE_INTEGER) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= max ? value : invalid();
}
function text(value: unknown, max: number) {
  return typeof value === "string" && value.length <= max ? value : invalid();
}
function option<T extends string>(value: unknown, choices: readonly T[]): T {
  return typeof value === "string" && choices.includes(value as T) ? value as T : invalid();
}
function date(value: unknown) {
  if (typeof value !== "string" || value.length > 40 || !Number.isFinite(Date.parse(value))) return invalid();
  return value;
}
const nullableDate = (value: unknown) => value === null ? null : date(value);
const kind = (value: unknown) => option(value, ["need", "offer"]);
const entryKeys = ["kind", "entryId"];
const refKeys = [...entryKeys, "revision", "shareVersion"];
function entryKey(o: Record<string, unknown>): MatchingEntryKey {
  return { kind: kind(o.kind), entryId: identifier(o.entryId) };
}
function entryRef(o: Record<string, unknown>): MatchingEntryRef {
  return { ...entryKey(o), revision: version(o.revision),
    shareVersion: version(o.shareVersion, 0) };
}
function array<T>(value: unknown, max: number, parse: (value: unknown) => T): T[] {
  return Array.isArray(value) && value.length <= max ? value.map(parse) : invalid();
}
function selections(value: unknown) {
  const refs = array(value, 10, item => entryRef(exact(item, refKeys)));
  if (!refs.length || new Set(refs.map(ref => `${ref.kind}:${ref.entryId}`)).size !== refs.length) invalid();
  return refs;
}
export function matchingCandidateId(value: unknown) {
  const id = text(value, 640);
  const [source, initiativeId, entryKind, entryId, extra] = id.split(":");
  if (source === "weave" && uuid(initiativeId) && ["need", "offer"].includes(entryKind ?? "") && uuid(entryId) && extra === undefined)
    return `weave:${initiativeId.toLowerCase()}:${entryKind}:${entryId.toLowerCase()}`;
  return /^public:at:\/\/did:[a-z]+:[^/\s]+\/[a-zA-Z0-9.-]+\/[a-zA-Z0-9._~:-]+$/u.test(id) && !/[\s\u0000-\u001f\u007f]/u.test(id)
    ? id : invalid();
}
export function parseMatchingCommand(value: unknown): MatchingCommand {
  const o = record(value), initiativeId = identifier(o.initiativeId), base = ["action", "initiativeId"];
  switch (o.action) {
    case "state":
    case "leads":
      exact(o, base);
      return { initiativeId, action: o.action };
    case "preview": {
      exact(o, [...base, "initiativeRevision", "entries"], ["expiresAt"]);
      let expiresAt: string | undefined;
      if (o.expiresAt !== undefined) {
        const input = date(o.expiresAt);
        if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/u.test(input)) invalid();
        expiresAt = new Date(input).toISOString();
        if (expiresAt.slice(0, 19) !== input.slice(0, 19)) invalid();
      }
      return { initiativeId, action: o.action, initiativeRevision: version(o.initiativeRevision, 1, 2147483647),
        entries: selections(o.entries), ...(expiresAt === undefined ? {} : { expiresAt }) };
    }
    case "share":
    case "renew":
      exact(o, [...base, "reviewId", "requestId"]);
      return { initiativeId, action: o.action, reviewId: identifier(o.reviewId), requestId: identifier(o.requestId) };
    case "withdraw":
      exact(o, [...base, "entries", "requestId"]);
      return { initiativeId, action: o.action, entries: selections(o.entries), requestId: identifier(o.requestId) };
    case "search":
      exact(o, base, ["entries"]);
      return { initiativeId, action: o.action, ...(o.entries === undefined ? {} : { entries: selections(o.entries) }) };
    case "set_lead": {
      exact(o, [...base, "entry", "candidateId", "disposition", "requestId"]);
      const disposition = option(o.disposition, ["saved", "dismissed", "removed"]);
      const common = { initiativeId, action: o.action, candidateId: matchingCandidateId(o.candidateId),
        requestId: identifier(o.requestId) } as const;
      const entry = record(o.entry);
      if (disposition === "removed") {
        // Older clients can still send a full reference. Only the key identifies the lead.
        const { kind, entryId } = Object.keys(entry).length === entryKeys.length
          ? entryKey(exact(entry, entryKeys))
          : entryRef(exact(entry, refKeys));
        return { ...common, disposition, entry: { kind, entryId } };
      }
      return { ...common, disposition, entry: entryRef(exact(entry, refKeys)) };
    }
    default: return invalid();
  }
}
function matchingSummary(value: unknown): MatchingSummary {
  const o = exact(value, ["name", "description", "locations", "isGlobal", "lenses", "themes"]);
  if (typeof o.isGlobal !== "boolean") return invalid();
  return { name: text(o.name, 200), description: text(o.description, 800), isGlobal: o.isGlobal,
    locations: array(o.locations, 8, item => text(item, 120)),
    lenses: array(o.lenses, 5, item => option(item, LENSES)), themes: array(o.themes, 10, item => text(item, 60)) };
}
export function parseMatchingState(value: unknown): MatchingState {
  const o = record(value);
  return { initiativeId: identifier(o.initiativeId), initiativeRevision: version(o.initiativeRevision),
    entries: array(o.entries, 10, item => {
      const e = record(item);
      return { ...entryRef(e), status: option(e.status, ["open", "met", "withdrawn", "expired"]),
        sharing: option(e.sharing, ["private", "shared", "needs_review", "withdrawn", "expired"]),
        confirmedAt: nullableDate(e.confirmedAt), expiresAt: nullableDate(e.expiresAt) };
    }) };
}
function reviewedEntry(value: unknown) {
  const e = record(value), ref = entryRef(e);
  return { ...ref, value: parseSavedAsk({ id: ref.entryId, value: e.value }).value };
}
export function parseMatchingPreview(value: unknown): MatchingPreview {
  const o = record(value);
  return { reviewId: identifier(o.reviewId), initiativeId: identifier(o.initiativeId),
    initiativeRevision: version(o.initiativeRevision), audience: option(o.audience, ["weave_users"]),
    expiresAt: nullableDate(o.expiresAt), summary: matchingSummary(o.summary), entries: array(o.entries, 10, reviewedEntry) };
}
function projection(value: unknown): MatchingProjection {
  const o = record(value);
  return { ...reviewedEntry(o), initiativeId: identifier(o.initiativeId), confirmedAt: date(o.confirmedAt),
    expiresAt: nullableDate(o.expiresAt), summary: matchingSummary(o.summary) };
}
export function parseMatchingShortlist(value: unknown): { entry: MatchingProjection; candidates: MatchingProjection[]; publicEvidence: unknown; publicModelVersion: unknown }[] {
  return array(value, 10, item => {
    const o = record(item);
    return { entry: projection(o.entry), candidates: array(o.candidates, 75, projection),
      publicEvidence: o.publicEvidence, publicModelVersion: o.publicModelVersion };
  });
}
export function parseMatchingLeads(value: unknown): MatchingLeads {
  const o = record(value);
  return { initiativeId: identifier(o.initiativeId),
    leads: array(o.leads, 500, item => {
      const e = record(item);
      return { kind: kind(e.kind), entryId: identifier(e.entryId), candidateId: matchingCandidateId(e.candidateId),
        disposition: option(e.disposition, ["saved", "dismissed"]), updatedAt: date(e.updatedAt),
        evidenceStatus: option(e.evidenceStatus, ["current", "unavailable", "unknown"]) };
    }) };
}
export function parseProjectEvidence(value: unknown): ProjectEvidence {
  const o = record(value), projectUri = text(o.projectUri, 633), sourceUrl = text(o.sourceUrl, 2048);
  matchingCandidateId(`public:${projectUri}`);
  const url = new URL(sourceUrl);
  if (url.protocol !== "https:" || url.username || url.password) return invalid();
  return {
    id: text(o.id, 1000), projectUri, projectName: text(o.projectName, 300),
    sourceUri: text(o.sourceUri, 1000), sourceUrl, cid: text(o.cid, 160),
    contentHash: text(o.contentHash, 160), fieldPath: text(o.fieldPath, 300),
    passage: text(o.passage, 8000), sourceCreatedAt: date(o.sourceCreatedAt),
    sourceIndexedAt: nullableDate(o.sourceIndexedAt), fetchedAt: date(o.fetchedAt),
    extractionVersion: text(o.extractionVersion, 120), kind: option(o.kind, ["work", "published_offer", "published_request"]),
  };
}
export function parsePublicEvidenceSnapshot(value: unknown) {
  const o = record(value);
  if (typeof o.truncated !== "boolean") return invalid();
  return {
    workspaceId: identifier(o.workspaceId),
    corpusVersion: text(o.corpusVersion, 200),
    status: option(o.status, ["bounded", "partial", "stale"]),
    indexedAt: nullableDate(o.indexedAt),
    availableUntil: date(o.availableUntil),
    truncated: o.truncated,
    evidence: array(o.evidence, 160, parseProjectEvidence),
  };
}

export type PublicEvidenceSnapshot = ReturnType<typeof parsePublicEvidenceSnapshot>;

export function parseMatchingSearch(value: unknown): MatchingSearch {
  const o = record(value), c = record(o.coverage);
  return { initiativeId: identifier(o.initiativeId), results: array(o.results, 300, item => {
    const r = record(item), query = record(r.query), counterpart = record(r.counterpart), evidence = record(r.evidence);
    const type = option(evidence.type, ["shared", "public"]);
    if (typeof r.reciprocal !== "boolean") return invalid();
    const candidateId = matchingCandidateId(r.candidateId);
    const evidenceKind = option(r.evidenceKind, ["confirmed_offer", "confirmed_need", "published_offer",
      "published_request", "inferred_capability", "potential_use"]);
    const action = option(r.action, ["review_entry", "open_source"]);
    const confirmed = evidenceKind === "confirmed_offer" || evidenceKind === "confirmed_need";
    if ((type === "shared") !== confirmed || confirmed !== candidateId.startsWith("weave:") ||
      confirmed !== (action === "review_entry")) return invalid();
    return {
      query: { kind: kind(query.kind), entryId: identifier(query.entryId), revision: version(query.revision) },
      candidateId, counterpart: { id: text(counterpart.id, 640), name: text(counterpart.name, 300) },
      evidenceKind, action, reciprocal: r.reciprocal,
      evidence: type === "shared" ? { type, entryId: identifier(evidence.entryId), revision: version(evidence.revision),
        title: text(evidence.title, 140), passage: text(evidence.passage, 8000),
        confirmedAt: date(evidence.confirmedAt), expiresAt: nullableDate(evidence.expiresAt) }
        : { type, ...parseProjectEvidence(evidence) },
      reasons: array(r.reasons, 15, value => {
        const reason = record(value);
        return { type: option(reason.type, ["shared_terms", "related_terms"]), terms: array(reason.terms, 20, value => text(value, 120)) };
      }),
      unknowns: array(r.unknowns, 6, value => option(value, ["terms", "place", "timing", "capacity", "audience", "availability"])),
    };
  }), coverage: { shared: option(c.shared, ["available", "not_joined"]),
    external: option(c.external, ["available", "partial", "stale", "unavailable"]),
    corpusVersion: c.corpusVersion === null ? null : text(c.corpusVersion, 200),
    modelVersion: c.modelVersion === null ? null : text(c.modelVersion, 200), engineVersion: text(c.engineVersion, 120) } };
}
