import type { EvidenceKind } from "./evidence.ts";
import type { NetworkMatch } from "./matching-client.ts";

/** Every kind of evidence a partner result can rest on. Device matching and the network name some differently. */
export type FitEvidence = EvidenceKind | NetworkMatch["evidenceKind"];
export type FitGroupKey = "direct" | "possible";

interface FitRule {
  readonly group: FitGroupKey;
  /** What supports the result. "This offer", "this need" and "this request" mean the evidence shown with it. */
  readonly supports: string;
  /** What a person still has to check before relying on the result. */
  readonly check: string;
}

const stated = { group: "direct", check: "Check the details before making plans." } as const;
const request = {
  group: "direct",
  supports: "Their public source makes this request.",
  check: "Check what is still needed before you offer help.",
} as const;

// A direct fit rests on something the other side has stated. A possible fit is read from their public work:
// experience is not an offer, and work that could use an offer is not a need they stated.
const RULES: Record<FitEvidence, FitRule> = {
  confirmed_offer: { ...stated, supports: "They confirmed this offer." },
  confirmed_need: { ...stated, supports: "They confirmed this need." },
  published_offer: {
    group: "direct",
    supports: "Their public source lists this offer.",
    check: "Check that it is still available, and on what terms.",
  },
  published_need: request,
  published_request: request,
  inferred_capability: {
    group: "possible",
    supports: "Their public work shows related experience.",
    check: "They have not offered this. Availability is unknown.",
  },
  potential_use: {
    group: "possible",
    supports: "Their public work could use what you offer.",
    check: "They have not asked for this.",
  },
};

export const FIT_GROUPS: Readonly<Record<FitGroupKey, { readonly heading: string; readonly explanation: string }>> = {
  direct: { heading: "Direct fits", explanation: "They have said they offer or need this." },
  possible: { heading: "Possible fits", explanation: "Their public work suggests a fit. They have not offered or asked." },
};
const GROUP_ORDER: readonly FitGroupKey[] = ["direct", "possible"];

/** How many results a preview shows from each group. */
export const PREVIEW_FITS = 2;

export function fitGroupOf(kind: FitEvidence): FitGroupKey {
  return RULES[kind].group;
}

/** Plain lines for one result: what supports it and what to check. */
export function fitLines(kind: FitEvidence): { supports: string; check: string } {
  const { supports, check } = RULES[kind];
  return { supports, check };
}

/** Names the person's own need or offer that a result is for, as one whole phrase. */
export function entryLine(kind: "need" | "offer", title: string): string {
  return `${kind === "need" ? "For your need" : "For your offer"}: ${title}`;
}

/**
 * How strong a fit is, as a card says it (DL-064). It comes from what is known about the fit and
 * nothing else: whether the other side stated it, and whether it holds in both directions. It is
 * never a score, and it does not reorder results; the search's own order stands.
 */
export type FitStrength = "strong" | "good" | "possible";

export function fitStrength(kind: FitEvidence, reciprocal = false): FitStrength {
  if (fitGroupOf(kind) === "possible") return "possible";
  return reciprocal ? "strong" : "good";
}

/** Why a fit has its strength, in one sentence a person can check against the card. */
export const FIT_BASIS: Readonly<Record<FitStrength, string>> = {
  strong: "They said so themselves, and the fit goes both ways.",
  good: "They said so themselves.",
  possible: "Read from their public work. They have not offered or asked.",
};

const ORDER: readonly FitStrength[] = ["strong", "good", "possible"];

/** The strongest of several fits, for a card that stands for more than one. */
export function strongestFit(strengths: readonly FitStrength[]): FitStrength {
  return ORDER.find((strength) => strengths.includes(strength)) ?? "possible";
}

/** Which way a fit runs: the other side has something the person needs, or needs something they offer. */
export type FitDirection = "they-offer" | "they-need";

const LEADS: Record<FitEvidence, { direction: FitDirection; lead: string }> = {
  confirmed_offer: { direction: "they-offer", lead: "They offer what you need" },
  published_offer: { direction: "they-offer", lead: "They offer what you need" },
  inferred_capability: { direction: "they-offer", lead: "Their work relates to what you need" },
  confirmed_need: { direction: "they-need", lead: "They need what you offer" },
  published_need: { direction: "they-need", lead: "They ask for what you offer" },
  published_request: { direction: "they-need", lead: "They ask for what you offer" },
  potential_use: { direction: "they-need", lead: "Their work could use what you offer" },
};

/**
 * What the other side brings to one of the person's entries, as a phrase the entry's title completes:
 * "They offer what you need: Native seedlings". A possible fit never claims an offer or a request.
 */
export function fitLead(kind: FitEvidence): { direction: FitDirection; lead: string } {
  return LEADS[kind];
}

const UNKNOWN_WORDS: Record<string, string> = {
  terms: "the terms",
  place: "the place",
  timing: "the timing",
  capacity: "how much they can take on",
  audience: "who it is for",
  availability: "whether it is still available",
};

/** What the search could not tell, as one sentence, or nothing when it found no gap. */
export function unknownLine(unknowns: readonly string[]): string {
  const words = [...new Set(unknowns)].flatMap((unknown) => UNKNOWN_WORDS[unknown] ?? []);
  if (!words.length) return "";
  const list = words.length === 1 ? words[0] : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
  return `Not known yet: ${list}.`;
}

/**
 * Whether every fit on a card leaves availability unknown. The card then says so once, under its
 * reasons, instead of after each one. A card whose fits differ keeps the note on the fits it concerns.
 */
export function availabilityUnknownForAll(
  fits: readonly { readonly match: { readonly unknowns: readonly string[] } }[],
): boolean {
  return fits.length > 0 && fits.every(({ match }) => match.unknowns.includes("availability"));
}

/** At most this many shared topics on a card; more would be a list to read, not a reason. */
export const FIT_TOPICS = 4;

/** The topics two sides share, as one sentence, or nothing when none were found. */
export function topicsLine(topics: readonly string[]): string {
  const shown = [...new Set(topics.map((topic) => topic.trim()).filter(Boolean))].slice(0, FIT_TOPICS);
  if (!shown.length) return "";
  const list = shown.length === 1 ? shown[0] : `${shown.slice(0, -1).join(", ")} and ${shown.at(-1)}`;
  return `You both mention ${list}.`;
}

export interface FitGroup<Result> {
  key: FitGroupKey;
  heading: string;
  explanation: string;
  results: Result[];
}

/**
 * Splits ranked results into direct fits, then possible fits. Each group keeps the order the ranking gave,
 * and `limit` keeps at most that many results in each. Both groups are always returned.
 */
export function groupFits<Result>(
  ranked: readonly Result[],
  kindOf: (result: Result) => FitEvidence,
  limit = Infinity,
): FitGroup<Result>[] {
  return GROUP_ORDER.map((key) => ({
    key,
    ...FIT_GROUPS[key],
    results: ranked.filter((result) => fitGroupOf(kindOf(result)) === key).slice(0, limit),
  }));
}
