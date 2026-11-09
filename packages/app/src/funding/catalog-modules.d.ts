/** Typed boundary to the existing catalog implementation. Results are validated in engine.ts. */
declare module "*dist/matching.mjs" {
  export function createLexicalIndex(funds: unknown[]): unknown;
  export function rankFunds(
    funds: unknown[],
    project: unknown,
    index: unknown,
    rules: unknown[],
    semantic: null,
    now: Date,
    conditions: unknown[] | null,
  ): unknown;
  export function programFund(fund: unknown, program: unknown): unknown;
  export function validConditions(data: unknown, funds: unknown[]): boolean;
  export const MATCH_GROUPS: Record<string, string>;
}
declare module "*dist/domain.mjs" {
  export function effectiveAccess(fund: unknown, now?: Date): string;
  export function safeFundUrl(fund: unknown, url: string): string;
  export const ACCESS: Record<string, { label: string; tone: string }>;
}
declare module "*dist/storage.mjs" {
  export const COUNTRIES: string[];
  export const US_STATES: Record<string, string>;
  export const FUNDING_INSTRUMENTS: Record<string, string>;
}
