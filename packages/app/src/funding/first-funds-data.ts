import file from "virtual:first-funds";
import type { FirstFunds } from "./first-funds.ts";

/** Funding's first cards, built into the app (`dev/first-funds.ts`). Only the page imports this. */
export const FIRST_FUNDS: FirstFunds = file;
