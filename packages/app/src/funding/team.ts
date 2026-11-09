export interface TeamCandidate {
  id: string;
  name: string;
  reason: string;
}
export interface TeamAsk {
  id: string;
  label: string;
  candidates: TeamCandidate[];
}
/** Coverage is an example of requirements met, not an eligibility or partnership score. */
export function teamCoverage(asks: TeamAsk[], selected: readonly string[]) {
  const available = new Set(asks.flatMap((ask) => ask.candidates.map((candidate) => candidate.id)));
  const chosen = [...new Set(selected)];
  if (chosen.some((id) => !available.has(id))) throw new Error("This candidate is no longer in the example.");
  return {
    chosen,
    covered: asks.filter((ask) => ask.candidates.some((candidate) => chosen.includes(candidate.id))).length,
    total: asks.length,
  };
}
