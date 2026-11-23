import { effectiveAccess } from "../../../../dist/domain.mjs";
import { MATCH_GROUPS, programFund } from "../../../../dist/matching.mjs";
import type { Entry, Evaluation } from "./contracts.ts";
import { closingDay, closingDayEnds } from "./deadline.ts";
import { compareFit, fundingFit } from "./fit.ts";

/**
 * How to apply, as a visitor chooses it (DL-062). The catalog records twelve states and several are
 * research notes, not routes. A program in one of those belongs to no group: it is listed while no
 * route is chosen, and its card says what is unconfirmed.
 */
export const ROUTE_GROUPS = {
  open: { label: "Open now", routes: ["open", "rolling"] },
  invitation: {
    label: "By invitation or relationship",
    routes: ["inquiry", "relationship", "restricted", "directory"],
  },
  closed: { label: "Not open now", routes: ["future", "closed"] },
} as const;
export type RouteGroup = keyof typeof ROUTE_GROUPS;
const GROUPS = Object.keys(ROUTE_GROUPS) as RouteGroup[];

export function routeGroupOf(route: string): RouteGroup | null {
  return GROUPS.find((group) => (ROUTE_GROUPS[group].routes as readonly string[]).includes(route)) ?? null;
}

/** The kinds of funding a program can be, by the catalog's word for each. "unknown" is not a choice. */
export const FUNDING_KINDS: Readonly<Record<string, string>> = {
  grant: "Grant",
  prize: "Prize",
  fellowship: "Fellowship",
  scholarship: "Scholarship",
  investment: "Investment",
  mixed: "More than one kind",
};
const SORTS = ["closing", "name", "recent", "fit"];

/**
 * The list's own order, where no other is chosen: strongest fit first while an initiative is
 * compared with the catalog, otherwise the soonest closing. Fit means nothing without one.
 */
export function fundingOrder(sort: string, compared: boolean): string {
  if (!sort || (sort === "fit" && !compared)) return compared ? "fit" : "closing";
  return sort;
}

export interface FundingFilters {
  readonly search: string;
  /** How to apply: any of the chosen route groups. */
  readonly access: readonly string[];
  readonly region: readonly string[];
  readonly theme: readonly string[];
  /** Kind of funding: the program's instrument. */
  readonly kind: readonly string[];
  /** Closing within this many days, or any date. */
  readonly closing: string;
  readonly group: string;
  /** An order a person chose, or empty for the list's own (`fundingOrder`). */
  readonly sort: string;
}
export const emptyFundingFilters: FundingFilters = {
  search: "",
  access: [],
  region: [],
  theme: [],
  kind: [],
  closing: "",
  group: "",
  sort: "",
};

/** The filters as an address carries them: one value each, or one entry per chosen value. */
export const FUNDING_QUERY = {
  one: ["q", "closing", "group", "sort"],
  many: ["access", "region", "theme", "kind"],
} as const;

/**
 * The address's mark for browsing funding with no initiative compared, so a person who chose it
 * keeps it on the way to a fund and back. It is not a filter: Clear Filters leaves it alone.
 */
export const BROWSING = { key: "initiative", value: "none" } as const;
export const readBrowsing = (search: string) => new URLSearchParams(search).get(BROWSING.key) === BROWSING.value;
export function writeBrowsing(browsing: boolean, params: URLSearchParams): void {
  if (browsing) params.set(BROWSING.key, BROWSING.value);
  else params.delete(BROWSING.key);
}

/**
 * The list's address for these choices, keeping the rest of the address it was given. The page works
 * it out as it draws, so the address and every card's link carry the choices in force, never the last.
 */
export function fundingListSearch(search: string, filters: FundingFilters, browsing: boolean): string {
  const params = new URLSearchParams(search);
  writeFundingFilters(filters, params);
  writeBrowsing(browsing, params);
  return params.toString();
}

/** The filters an address asks for. A value it could not mean is left out, never guessed at. */
export function readFundingFilters(search: string): FundingFilters {
  const params = new URLSearchParams(search);
  const many = (key: string) =>
    [...new Set(params.getAll(key).map((value) => value.trim()))]
      .filter((value) => value && value.length <= 120)
      .slice(0, 24);
  const closing = params.get("closing") ?? "";
  const group = params.get("group") ?? "";
  const sort = params.get("sort") ?? "";
  return {
    search: params.get("q") ?? "",
    // An address from before the routes were grouped names one route; it opens that route's group.
    access: [
      ...new Set(
        many("access").flatMap((value) => (value in ROUTE_GROUPS ? [value] : (routeGroupOf(value) ?? []))),
      ),
    ],
    region: many("region"),
    theme: many("theme"),
    kind: many("kind").filter((value) => Object.hasOwn(FUNDING_KINDS, value)),
    closing: /^[1-9]\d{0,2}$/.test(closing) ? closing : "",
    group: Object.hasOwn(MATCH_GROUPS, group) ? group : "",
    sort: SORTS.includes(sort) ? sort : emptyFundingFilters.sort,
  };
}

/** Writes the filters into an address's query and leaves its other entries alone. */
export function writeFundingFilters(filters: FundingFilters, params: URLSearchParams): void {
  const one: Record<(typeof FUNDING_QUERY.one)[number], string> = {
    q: filters.search,
    closing: filters.closing,
    group: filters.group,
    sort: filters.sort,
  };
  for (const key of FUNDING_QUERY.one) {
    if (one[key]) params.set(key, one[key]);
    else params.delete(key);
  }
  for (const key of FUNDING_QUERY.many) {
    params.delete(key);
    for (const value of filters[key]) params.append(key, value);
  }
}

/**
 * Time left to apply, to the end of the closing day in UTC (see `closingDay`). NaN when the call
 * states no closing date or has closed, so the closing filter and Home's previews both leave it out.
 */
export function timeToClose(entry: Entry, now = new Date()): number {
  const application = entry.program?.application;
  if (!application?.closesOn || effectiveAccess(programFund(entry.fund, entry.program), now) === "closed")
    return Number.NaN;
  return closingDayEnds(closingDay(application.closesOn, application.deadlineInstant)) - now.getTime();
}

const intersects = (chosen: readonly string[], values: readonly string[]) =>
  chosen.some((value) => values.includes(value));
const within = (remaining: number, limit: number) => remaining >= 0 && remaining <= limit;

/** A fund's words as search reads them: accents aside and in lower case. Worked out once per entry. */
const folded = new WeakMap<Entry, string>();
function searchText(entry: Entry): string {
  let text = folded.get(entry);
  if (text === undefined) {
    text = [
      entry.fund.displayName,
      entry.fund.description,
      ...entry.fund.sectors,
      ...entry.fund.regions,
      entry.program?.name,
      ...(entry.program?.focus ?? []),
    ]
      .join(" ")
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase();
    folded.set(entry, text);
  }
  return text;
}

/**
 * Any of the chosen values within one filter, and every filter at once. Filtering never computes a
 * fit. `results` come in research priority's order, which breaks ties when the list is ordered by fit.
 */
export function filterFunding(
  entries: Entry[],
  filters: FundingFilters,
  results: Evaluation[] | null,
  now = new Date(),
): Entry[] {
  const ranks = new Map(results?.map((result, index) => [result.documentId, { result, index }]));
  const place = (entry: Entry) => {
    const rank = ranks.get(entry.id);
    return rank && { score: rank.result.thematicFit.score, priority: rank.index };
  };
  const query = filters.search
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
    .split(/\s+/u)
    .filter(Boolean);
  // Each check runs only for a filter in use, and each fund's words are folded for search once.
  const selected = entries.filter(
    (entry) =>
      query.every((word) => searchText(entry).includes(word)) &&
      (!filters.access.length ||
        filters.access.includes(routeGroupOf(effectiveAccess(programFund(entry.fund, entry.program), now)) ?? "")) &&
      (!filters.region.length || intersects(filters.region, entry.fund.regions)) &&
      (!filters.theme.length || intersects(filters.theme, entry.fund.sectors)) &&
      // An overview record names no program, so it has no kind to match.
      (!filters.kind.length || (!!entry.program && filters.kind.includes(entry.program.instrument))) &&
      (!filters.group || ranks.get(entry.id)?.result.group === filters.group) &&
      (!filters.closing || within(timeToClose(entry, now), Number(filters.closing) * 86400000)),
  );
  // The closing order counts only calls still open to their closing day. One whose date has passed
  // goes to the end with the undated, even where its intake is not confirmed closed.
  const deadlines = new Map(
    filters.sort === "closing"
      ? selected.map((entry) => {
          const application = entry.program?.application;
          return [
            entry.id,
            application?.closesOn && timeToClose(entry, now) >= 0
              ? closingDay(application.closesOn, application.deadlineInstant)
              : "9999",
          ];
        })
      : [],
  );
  return selected.sort((a, b) => {
    const rank = filters.sort === "fit" && results ? compareFit(place(a), place(b)) : 0;
    const closing =
      filters.sort === "closing" ? (deadlines.get(a.id) ?? "9999").localeCompare(deadlines.get(b.id) ?? "9999") : 0;
    const recent =
      filters.sort === "recent" ? (b.fund.verifiedOn ?? "").localeCompare(a.fund.verifiedOn ?? "") : 0;
    return (
      rank ||
      closing ||
      recent ||
      a.fund.displayName.localeCompare(b.fund.displayName) ||
      (a.program?.name ?? "").localeCompare(b.program?.name ?? "")
    );
  });
}

/** A fund the initiative may fit, with how it fits: its fit line and its caveat. */
export interface FundingFitResult {
  readonly entry: Entry;
  readonly result: Evaluation;
}
export interface FundingFits {
  /** The strongest fits, in Funding's own order for the initiative. */
  readonly first: readonly FundingFitResult[];
  /** How many fit with a Strong or Good fit. */
  readonly well: number;
  /** How many share one topic, a Possible fit. */
  readonly possible: number;
}

/**
 * What an initiative's own page shows of its funding (DL-141): the first funds in Funding's own fit
 * order, the same function Funding sorts with, so the two cannot disagree. Every fund the rubric
 * gives a shared topic counts, whatever it still needs checking (scope, route, dates), since each
 * card says what to check. A fund sharing no topic (Low fit) or not assessed is not a fit.
 */
export function fundingFits(
  entries: Entry[],
  results: readonly Evaluation[],
  now = new Date(),
  shown = 2,
): FundingFits {
  const byId = new Map(results.map((result) => [result.documentId, result]));
  const fits = filterFunding(entries, { ...emptyFundingFilters, sort: "fit" }, [...results], now).flatMap((entry) => {
    const result = byId.get(entry.id);
    const level = result && fundingFit(result.thematicFit.score);
    return result && level && level !== "low" ? [{ entry, result, level }] : [];
  });
  return {
    first: fits.slice(0, shown).map(({ entry, result }) => ({ entry, result })),
    well: fits.filter(({ level }) => level === "strong" || level === "good").length,
    possible: fits.filter(({ level }) => level === "possible").length,
  };
}

/** The line under those funds: how many may fit, and that each needs a check. Never eligibility. */
export function fundingFitsLine({ well, possible }: Pick<FundingFits, "well" | "possible">): string {
  const check = (count: number) => (count === 1 ? "It needs a check with the funder." : "Each needs a check with the funder.");
  if (well) return `${well === 1 ? "1 fund may" : `${well} funds may`} fit this card well. ${check(well)}`;
  if (possible) return `${possible === 1 ? "1 fund shares" : `${possible} funds share`} a topic with this card. ${check(possible)}`;
  return "No fund shares a topic with this card yet.";
}
