import { effectiveAccess } from "../../../../dist/domain.mjs";
import { MATCH_GROUPS, programFund } from "../../../../dist/matching.mjs";
import type { Entry, Evaluation } from "./contracts.ts";

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
  sort: "fit",
};

/** The filters as an address carries them: one value each, or one entry per chosen value. */
export const FUNDING_QUERY = {
  one: ["q", "closing", "group", "sort"],
  many: ["access", "region", "theme", "kind"],
} as const;

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
 * Time left to apply, to the end of the closing day in UTC. NaN when the call states no closing
 * date or has closed, so the closing filter and Home's previews both leave it out.
 */
export function timeToClose(entry: Entry, now = new Date()): number {
  const deadline = entry.program?.application.closesOn;
  if (!deadline || effectiveAccess(programFund(entry.fund, entry.program), now) === "closed") return Number.NaN;
  return Date.parse(`${deadline}T23:59:59Z`) - now.getTime();
}

const intersects = (chosen: readonly string[], values: readonly string[]) =>
  chosen.some((value) => values.includes(value));

/** Any of the chosen values within one filter, and every filter at once. Filtering never computes a fit. */
export function filterFunding(
  entries: Entry[],
  filters: FundingFilters,
  results: Evaluation[] | null,
  now = new Date(),
): Entry[] {
  const ranks = new Map(results?.map((result, index) => [result.documentId, { result, index }]));
  const query = filters.search
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
    .split(/\s+/u)
    .filter(Boolean);
  const selected = entries.filter((entry) => {
    const access = effectiveAccess(programFund(entry.fund, entry.program), now);
    const text = [
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
    const remaining = timeToClose(entry, now);
    return (
      query.every((word) => text.includes(word)) &&
      (!filters.access.length || filters.access.includes(routeGroupOf(access) ?? "")) &&
      (!filters.region.length || intersects(filters.region, entry.fund.regions)) &&
      (!filters.theme.length || intersects(filters.theme, entry.fund.sectors)) &&
      // An overview record names no program, so it has no kind to match.
      (!filters.kind.length || (!!entry.program && filters.kind.includes(entry.program.instrument))) &&
      (!filters.group || ranks.get(entry.id)?.result.group === filters.group) &&
      (!filters.closing || (remaining >= 0 && remaining <= Number(filters.closing) * 86400000))
    );
  });
  return selected.sort((a, b) => {
    const rank =
      filters.sort === "fit" && results
        ? (ranks.get(a.id)?.index ?? Infinity) - (ranks.get(b.id)?.index ?? Infinity)
        : 0;
    const nextDeadline = (entry: Entry) => {
      const date = entry.program?.application.closesOn;
      return date && effectiveAccess(programFund(entry.fund, entry.program), now) !== "closed"
        ? date
        : "9999";
    };
    const closing = filters.sort === "closing" ? nextDeadline(a).localeCompare(nextDeadline(b)) : 0;
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
export const fitLevel = (result: Evaluation) =>
  result.thematicFit.band === "strong"
    ? "strong"
    : result.thematicFit.band === "relevant"
      ? "good"
      : "possible";
