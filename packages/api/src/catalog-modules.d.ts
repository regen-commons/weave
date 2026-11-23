/** Typed boundary to the fund catalog's own code and data at the repository root, which the live site also runs. */
declare module "*dist/domain.mjs" {
  export function effectiveAccess(fund: unknown, now?: Date): string;
  export function utcDate(now?: Date): string;
  export function safeFundUrl(fund: unknown, url: string): string;
  export function researchStatus(fund: unknown): string;
  export function filterFunds<T>(funds: T[], state: { q?: string; region?: string; theme?: string; access?: string }, savedIds?: string[], now?: Date): T[];
  export function sortFunds<T>(funds: T[], sort?: string, now?: Date): T[];
  export const ACCESS: Record<string, { label: string; tone: string } | undefined>;
  export const RESEARCH: Record<string, string | undefined>;
}
declare module "*dist/data/funders.json" {
  const catalog: unknown;
  export default catalog;
}
