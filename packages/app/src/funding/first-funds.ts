import { catalogEntries } from "./catalog.ts";
import type { Bundle, Entry, Fund } from "./contracts.ts";
import { filterFunding, emptyFundingFilters, timeToClose, type FundingFilters } from "./select.ts";

/**
 * The first funds Funding shows, built into the app so they appear with the page instead of
 * after the 3.6 MB catalog (quality's Lighthouse work: the first card was the largest paint).
 * They are the list's own first cards with no initiative compared and no filter: the soonest
 * closing. The full catalog replaces them with the same cards in the same places.
 */

/** How many cards the page shows before the catalog arrives: whole rows at one to four columns. */
export const FIRST_FUNDS_SHOWN = 12;
/** How many the build keeps, so the page still has its first cards on a later day as calls close. */
export const FIRST_FUNDS_KEPT = 18;

/**
 * One first card as the build keeps it: its entry's fund with only what a card reads, the fund's
 * own fields and this one program, without the fund's other programs or its source history. The
 * program is kept once, inside the fund, and becomes the entry's program again when read.
 */
export interface FirstFund {
  readonly id: string;
  readonly fund: Fund;
}
export interface FirstFunds {
  /** When the build chose them. */
  readonly asOf: string;
  /** The list's first cards then, in its order. */
  readonly funds: readonly FirstFund[];
}

export function firstFund(entry: Entry): FirstFund {
  const { fund, program } = entry;
  return { id: entry.id, fund: { ...fund, enrichment: { ...fund.enrichment, programs: program ? [program] : [], sources: [] } } };
}
export const firstEntry = ({ id, fund }: FirstFund): Entry => ({ id, fund, program: fund.enrichment.programs[0] ?? null });

/** The file the build writes: the first funds in the list's own order as of `asOf`. */
export function firstFundsFile(bundle: Bundle, asOf: Date, kept = FIRST_FUNDS_KEPT): FirstFunds {
  const listed = filterFunding(catalogEntries(bundle), { ...emptyFundingFilters, sort: "closing" }, null, asOf);
  return { asOf: asOf.toISOString(), funds: listed.slice(0, kept).map(firstFund) };
}

/**
 * The cards to show now, before the catalog arrives: those still open, soonest closing first. Calls
 * that closed since the build drop out, and the full list then starts with the ones left, so the
 * catalog only adds cards after them. With none left the page waits for the catalog as before.
 */
export function firstPage(file: FirstFunds, now: Date, shown = FIRST_FUNDS_SHOWN): Entry[] {
  const open = file.funds.map(firstEntry).filter((entry) => timeToClose(entry, now) >= 0);
  return filterFunding(open, { ...emptyFundingFilters, sort: "closing" }, null, now).slice(0, shown);
}

/** Whether the list is in its own first view: no search, no filter and its own order. */
export function isFirstView(filters: FundingFilters): boolean {
  return (
    !filters.search.trim() &&
    !filters.access.length &&
    !filters.region.length &&
    !filters.theme.length &&
    !filters.kind.length &&
    !filters.closing &&
    !filters.group &&
    (!filters.sort || filters.sort === "closing")
  );
}
