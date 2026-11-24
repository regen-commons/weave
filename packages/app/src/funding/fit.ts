import type { Evaluation } from "./contracts.ts";

/**
 * How well a program's own documented purpose matches an initiative's own words, in four plain
 * levels (DL-129). It reads Funding's fit, a score from 0 to 100 on the rubric's scale, worked out
 * from the fields of work, people and places both name (DL-143). Fit is about topics and place
 * only: it never says whether anyone may apply.
 */
export type FundingFit = "strong" | "good" | "possible" | "low";

/**
 * The lowest score of each level (DL-129). Since DL-143 one field of work in common scores 40, a
 * Good fit; a field and the program's own country, or two fields, 60 and more, a Strong one; a field
 * named only as an example, people or tools alone stay Possible or Low.
 */
export const FIT_FLOORS: Readonly<Record<FundingFit, number>> = { strong: 60, good: 40, possible: 20, low: 0 };

/** The level a thematic score reads as. Null where the rubric could not assess the program. */
export function fundingFit(score: number | null): FundingFit | null {
  if (score === null || !Number.isFinite(score)) return null;
  if (score >= FIT_FLOORS.strong) return "strong";
  if (score >= FIT_FLOORS.good) return "good";
  if (score >= FIT_FLOORS.possible) return "possible";
  return "low";
}

/** What a fit line explains on request: the fields and places it rests on, and what it is not. */
export function fitExplanation(result: Pick<Evaluation, "thematicFit">): string {
  const topics = result.thematicFit.evidenceTerms;
  // Since DL-143 these are the fields of work, people and places both sides name, field first.
  const basis = topics.length
    ? `In common: ${topics.slice(0, 5).join(", ")}.`
    : "No field of work or place in common with your card.";
  return `${basis} Worked out on this device from what your card and the program each describe. Fit is not eligibility.`;
}

/** A program's place when the list is ordered by fit: its score, and its place in research priority. */
export interface FitPlace {
  readonly score: number | null;
  /** Where research priority puts it. Programs with equal fit keep this order. */
  readonly priority: number;
}

/**
 * Strongest fit first. A program whose fit could not be assessed comes after every assessed one,
 * and one with no result at all comes last. Equal scores keep research priority's order.
 */
export function compareFit(a: FitPlace | undefined, b: FitPlace | undefined): number {
  const score = (place: FitPlace | undefined) => (place === undefined ? -2 : (place.score ?? -1));
  return (
    score(b) - score(a) ||
    (a?.priority ?? Number.POSITIVE_INFINITY) - (b?.priority ?? Number.POSITIVE_INFINITY) ||
    0
  );
}
