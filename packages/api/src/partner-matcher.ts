import type { JsonObject } from "./account-contract.ts";

export const PARTNER_ENGINE_VERSION = "partner-lexical-v1";
export type PartnerKind = "need" | "offer";
export type PartnerEntry = {
  initiativeId: string;
  entryId: string;
  revision: number;
  kind: PartnerKind;
  value: JsonObject;
  summary: JsonObject;
};
export type SharedPartnerEntry = PartnerEntry & { confirmedAt: string; expiresAt: string };
export type ProjectEvidence = {
  id: string;
  projectUri: string;
  projectName: string;
  sourceUri: string;
  sourceUrl: string;
  cid: string;
  contentHash: string;
  fieldPath: string;
  passage: string;
  sourceCreatedAt: string;
  sourceIndexedAt: string | null;
  fetchedAt: string;
  extractionVersion: string;
  kind: "work" | "published_offer" | "published_request";
};
export type PartnerEvidenceKind =
  | "confirmed_offer"
  | "confirmed_need"
  | "published_offer"
  | "published_request"
  | "inferred_capability"
  | "potential_use";
type Unknown = "terms" | "place" | "timing" | "capacity" | "audience" | "availability";
export type PartnerMatch = {
  query: { kind: PartnerKind; entryId: string; revision: number };
  candidateId: string;
  counterpart: { id: string; name: string };
  evidenceKind: PartnerEvidenceKind;
  evidence:
    | { type: "shared"; entryId: string; revision: number; title: string; passage: string; confirmedAt: string; expiresAt: string }
    | ({ type: "public" } & ProjectEvidence);
  reasons: { type: "shared_terms"; terms: string[] }[];
  unknowns: Unknown[];
  reciprocal: boolean;
  action: "review_entry" | "open_source";
};

const genericTerms = new Set(
  ("about across after all also and another any anyone are area around assistance available before been being both but can could development did doing each " +
   "enable enough even every first for from give good group had has have help here how initiative into its just kind local looking make may might more most must need needs " +
   "offer offers only other our ours out over part people please project provide public relevant same seeking services should some such support team than that the " +
   "their them then there these they this those through together too under until very want was way well were what when where which while will with " +
   "within work working would you your").split(" "),
);
const fields = ["title", "description", "purpose"] as const;
const str = (value: unknown): string => typeof value === "string" ? value.trim() : "";
const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(str).filter(Boolean) : [];
export const partnerQueryProjection = (entry: PartnerEntry) => fields.map((field) => str(entry.value[field])).filter(Boolean).join(". ");

function normalize(value: string) {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
}

function lexicalTerms(text: string): Map<string, string> {
  const terms = new Map<string, string>();
  for (const term of text.slice(0, 2400).match(/[\p{L}\p{M}][\p{L}\p{M}\p{N}]+/gu) ?? []) {
    const key = normalize(term);
    if (key.length < 3 || genericTerms.has(key)) continue;
    terms.set(key, term.toLowerCase());
  }
  return terms;
}

/** The DB shortlist and browser matcher use the same query projection. */
export function partnerSearchText(entry: PartnerEntry): string {
  return partnerLexicalText(partnerQueryProjection(entry));
}

export const partnerLexicalText = (text: string): string => [...lexicalTerms(text).keys()].join(" ");

const negative = /\b(?:not|never|without|unable to|cannot|can['’]t|do(?:es)? not|don['’]t|doesn['’]t|no longer|used to|discontinued|unavailable|was offered|previously offered)\b/iu;
const noTopic = /\bno\s+(?!later\b|more than\b|less than\b)/iu;

const aspiration = /\b(?:need(?:s|ed|ing)?|seek(?:s|ing)?|request(?:s|ing)?|look(?:s|ing)? for|want(?:s|ed)?|hope(?:s|d)?|plan(?:s|ning)? to|aim(?:s|ing)? to|intend(?:s|ed)? to|would like|will need|lack(?:s|ing)?|wish(?:es)? to)\b/iu;

function supportedTerms(query: Map<string, string>, statement: string, rejectRequests = false): string[] {
  const overlap = new Map<string, string>();
  const excluded = new Set<string>();
  for (const clause of statement.split(/[.!?;\n]+/u)) {
    const isNegative = negative.test(clause) || noTopic.test(clause) || (rejectRequests && aspiration.test(clause));
    for (const key of lexicalTerms(clause).keys()) {
      const term = query.get(key);
      if (!term) continue;
      if (isNegative) excluded.add(key);
      else overlap.set(key, term);
    }
  }
  return [...overlap].filter(([key]) => !excluded.has(key)).map(([, term]) => term);
}

const intersects = (a: readonly string[], b: readonly string[]) => a.some((item) => b.includes(item));
const explicitTerms = (entry: PartnerEntry) => strings(entry.value.exchangeTerms).filter((term) => term !== "open");
const candidateId = (entry: PartnerEntry) => `weave:${entry.initiativeId}:${entry.kind}:${entry.entryId}`;

function dateWindow(input: unknown): [string, string] | null {
  const match = /^(\d{4}-\d{2}-\d{2})(?:\s+(?:to|through|–|-)\s+(\d{4}-\d{2}-\d{2}))?$/iu.exec(str(input));
  const first = match?.[1];
  if (!first) return null;
  const last = match?.[2] ?? first;
  const validDay = (day: string) => {
    const time = Date.parse(day);
    return Number.isFinite(time) && new Date(time).toISOString().startsWith(day);
  };
  return first <= last && validDay(first) && validDay(last) ? [first, last] : null;
}

function amount(entry: PartnerEntry) {
  const value = entry.value.amount;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const min = typeof value.min === "number" ? value.min : 0;
  const max = typeof value.max === "number" ? value.max : Infinity;
  const currency = str(value.currency);
  return currency && min <= max ? { min, max, currency } : null;
}

function compatible(query: PartnerEntry, other: SharedPartnerEntry): Unknown[] | null {
  const unknowns: Unknown[] = [];
  const queryTerms = explicitTerms(query), otherTerms = explicitTerms(other);
  if (queryTerms.length && otherTerms.length && !intersects(queryTerms, otherTerms)) return null;
  if (!queryTerms.length || !otherTerms.length) unknowns.push("terms");

  const queryScope = str(query.value.placeScope), otherScope = str(other.value.placeScope);
  if (queryScope !== "anywhere" || otherScope !== "anywhere") {
    const queryPlaces = strings(query.summary.locations).map(normalize);
    const otherPlaces = strings(other.summary.locations).map(normalize);
    if (queryScope === "here" && otherScope === "here" && queryPlaces.length && otherPlaces.length
      && !intersects(queryPlaces, otherPlaces)) return null;
    if (!queryPlaces.length || !otherPlaces.length || !intersects(queryPlaces, otherPlaces)) unknowns.push("place");
  }

  const queryWindow = dateWindow(query.value.timeframe), otherWindow = dateWindow(other.value.timeframe);
  if (queryWindow && otherWindow) {
    if (queryWindow[1] < otherWindow[0] || otherWindow[1] < queryWindow[0]) return null;
  } else unknowns.push("timing");

  const queryAmount = amount(query), otherAmount = amount(other);
  if (queryAmount && otherAmount && queryAmount.currency === otherAmount.currency) {
    if (queryAmount.max < otherAmount.min || otherAmount.max < queryAmount.min) return null;
  } else unknowns.push("capacity");

  // Audience is currently prose and describes the entry, not an authorized identity attribute.
  // A free-text audience cannot establish compatible membership.
  if (str(query.value.audience) || str(other.value.audience)) unknowns.push("audience");
  return unknowns;
}

function publicKind(query: PartnerKind, evidence: ProjectEvidence["kind"]): PartnerEvidenceKind | null {
  if (evidence === "work") return query === "need" ? "inferred_capability" : "potential_use";
  if (query === "need" && evidence === "published_offer") return evidence;
  if (query === "offer" && evidence === "published_request") return evidence;
  return null;
}

type Ranked = { match: PartnerMatch; overlap: number; capital: boolean; freshness: number; retrieval: number };
const evidenceOrder: PartnerEvidenceKind[] = [
  "confirmed_offer", "confirmed_need", "published_offer", "published_request", "inferred_capability", "potential_use",
];
const compare = (a: Ranked, b: Ranked) =>
  evidenceOrder.indexOf(a.match.evidenceKind) - evidenceOrder.indexOf(b.match.evidenceKind)
  || b.overlap - a.overlap
  || Number(b.capital) - Number(a.capital)
  || a.match.unknowns.length - b.match.unknowns.length
  || Number(b.match.reciprocal) - Number(a.match.reciprocal)
  || b.retrieval - a.retrieval
  || b.freshness - a.freshness
  || a.match.candidateId.localeCompare(b.match.candidateId, "en");

export function rankPartnerMatches(input: {
  queries: readonly PartnerEntry[];
  shared?: readonly SharedPartnerEntry[];
  sharedByEntry?: Readonly<Record<string, readonly SharedPartnerEntry[]>>;
  publicEvidence?: readonly ProjectEvidence[];
  publicEvidenceByEntry?: Readonly<Record<string, readonly ProjectEvidence[]>>;
  now?: number;
  limitPerEntryAndKind?: number;
}): PartnerMatch[] {
  const now = input.now ?? Date.now();
  const groups: { origin: string; candidates: Ranked[] }[] = [];
  const directions = new Map<string, Set<PartnerKind>>();
  for (const query of input.queries) {
    if (query.value.status !== "open") continue;
    const topics = lexicalTerms(partnerQueryProjection(query));
    if (!topics.size) continue;
    const candidates: Ranked[] = [];
    groups.push({ origin: query.initiativeId, candidates });
    const queryRef = { kind: query.kind, entryId: query.entryId, revision: query.revision };

    const entryKey = `${query.kind}:${query.entryId}`;
    for (const other of input.sharedByEntry?.[entryKey] ?? input.shared ?? []) {
      if (other.value.status !== "open" || !(Date.parse(other.confirmedAt) <= now && Date.parse(other.expiresAt) > now)) continue;
      if (other.kind === query.kind || other.initiativeId === query.initiativeId) continue;
      const terms = supportedTerms(topics, partnerQueryProjection(other), other.kind === "offer");
      if (!terms.length) continue;
      const unknowns = compatible(query, other);
      if (!unknowns) continue;
      const key = JSON.stringify([query.initiativeId, other.initiativeId]);
      const supported = directions.get(key) ?? new Set<PartnerKind>();
      supported.add(query.kind);
      directions.set(key, supported);
      candidates.push({
        match: {
          query: queryRef,
          candidateId: candidateId(other),
          counterpart: { id: other.initiativeId, name: str(other.summary.name) },
          evidenceKind: other.kind === "offer" ? "confirmed_offer" : "confirmed_need",
          evidence: {
            type: "shared", entryId: other.entryId, revision: other.revision, title: str(other.value.title),
            passage: partnerQueryProjection(other), confirmedAt: other.confirmedAt, expiresAt: other.expiresAt,
          },
          reasons: [{ type: "shared_terms", terms: terms.slice(0, 6) }],
          unknowns,
          reciprocal: false,
          action: "review_entry",
        },
        overlap: terms.length,
        capital: intersects(strings(query.value.capitalForms), strings(other.value.capitalForms)),
        freshness: Date.parse(other.confirmedAt),
        retrieval: 0,
      });
    }

    const byEntry = input.publicEvidenceByEntry;
    const passages = byEntry?.[entryKey] ?? input.publicEvidence ?? [];
    for (const [index, passage] of passages.entries()) {
      const evidenceKind = publicKind(query.kind, passage.kind);
      if (!evidenceKind) continue;
      const terms = supportedTerms(topics, passage.passage, passage.kind === "work" || passage.kind === "published_offer");
      if (!terms.length) continue;
      const unknowns: Unknown[] = ["terms", "timing", "capacity", "audience", "availability"];
      if (query.value.placeScope !== "anywhere") unknowns.push("place");
      candidates.push({
        match: {
          query: queryRef,
          candidateId: `public:${passage.projectUri}`,
          counterpart: { id: passage.projectUri, name: passage.projectName },
          evidenceKind,
          evidence: { ...passage, type: "public" },
          reasons: [{ type: "shared_terms", terms: terms.slice(0, 6) }],
          unknowns,
          reciprocal: false,
          action: "open_source",
        },
        overlap: terms.length,
        capital: false,
        freshness: Date.parse(passage.sourceIndexedAt ?? passage.sourceCreatedAt) || 0,
        retrieval: byEntry ? passages.length - index : 0,
      });
    }
  }

  const limit = Number.isInteger(input.limitPerEntryAndKind)
    ? Math.min(10, Math.max(1, input.limitPerEntryAndKind ?? 5)) : 5;
  return groups.flatMap(({ origin, candidates }) => {
    for (const { match } of candidates) {
      if (match.evidence.type !== "shared") continue;
      match.reciprocal = directions.get(JSON.stringify([origin, match.counterpart.id]))?.size === 2;
    }
    const seen = new Set<string>();
    const counts = new Map<PartnerEvidenceKind, number>();
    const results: PartnerMatch[] = [];
    for (const { match } of candidates.sort(compare)) {
      const count = counts.get(match.evidenceKind) ?? 0;
      if (count >= limit || seen.has(match.candidateId)) continue;
      seen.add(match.candidateId);
      counts.set(match.evidenceKind, count + 1);
      results.push(match);
    }
    return results;
  });
}
