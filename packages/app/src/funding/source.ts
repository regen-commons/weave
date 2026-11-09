import { safeFundUrl } from "../../../../dist/domain.mjs";
import type { Fund } from "./contracts.ts";
/** Keep the catalog's source warnings in force, including on individual program links. */
export function fundingSourceUrl(fund: Fund, value: string): string {
  try {
    const url = new URL(value);
    if (url.username || url.password) return "";
    return safeFundUrl(fund, value);
  } catch {
    return "";
  }
}
