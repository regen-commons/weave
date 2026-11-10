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
