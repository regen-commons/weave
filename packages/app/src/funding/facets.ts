import { MATCH_GROUPS } from "../../../../dist/matching.mjs";
import type { Facet, FacetOption } from "../filters.ts";
import type { Entry } from "./contracts.ts";
import { FUNDING_KINDS, ROUTE_GROUPS, type FundingFilters } from "./select.ts";

/**
 * How many themes the Theme filter offers. The catalog holds a couple of hundred, most on a handful
 * of funders; a list that long is not a choice, and search still finds the rest (DL-062).
 */
export const COMMON_THEMES = 18;

/** What the catalog on hand can be filtered by. Read once per catalog; it does not change with the filters. */
export interface FundingVocabulary {
  readonly regions: readonly string[];
  readonly themes: readonly string[];
  readonly kinds: readonly string[];
}

const byName = (a: string, b: string) => a.localeCompare(b);

export function fundingVocabulary(entries: readonly Entry[], themeLimit = COMMON_THEMES): FundingVocabulary {
  // A funder with five programs still names each of its themes once.
  const funds = new Map(entries.map((entry) => [entry.fund.id, entry.fund]));
  const uses = new Map<string, number>();
  for (const fund of funds.values())
    for (const theme of new Set(fund.sectors)) uses.set(theme, (uses.get(theme) ?? 0) + 1);
  const instruments = new Set(entries.map((entry) => entry.program?.instrument));
  return {
    regions: [...new Set([...funds.values()].flatMap((fund) => fund.regions))].sort(byName),
    themes: [...uses]
      .sort((a, b) => b[1] - a[1] || byName(a[0], b[0]))
      .slice(0, themeLimit)
      .map(([theme]) => theme)
      .sort(byName),
    kinds: Object.keys(FUNDING_KINDS).filter((kind) => instruments.has(kind)),
  };
}

const named = (values: readonly string[]): FacetOption[] => values.map((value) => ({ value, label: value }));
/** A value chosen through an address stays on offer, so it shows as chosen and can be taken off. */
const withChosen = (offered: readonly string[], chosen: readonly string[]) => [
  ...offered,
  ...chosen.filter((value) => !offered.includes(value)),
];

const CLOSING: readonly FacetOption[] = [
  { value: "", label: "Any date" },
  { value: "30", label: "Within 30 days" },
  { value: "90", label: "Within 90 days" },
];

/**
 * Funding's filters, in the order the bar shows them: the short choices first and the long list of
 * themes last, so a phone's sheet does not bury the rest under it. The priority group needs a card
 * to rank against.
 */
export function fundingFacets(
  vocabulary: FundingVocabulary,
  filters: FundingFilters,
  personalized: boolean,
): Facet[] {
  const closing = CLOSING.some((option) => option.value === filters.closing)
    ? CLOSING
    : [...CLOSING, { value: filters.closing, label: `Within ${filters.closing} days` }];
  return [
    { key: "closing", label: "Closing", kind: "one", options: closing, chosen: filters.closing ? [filters.closing] : [] },
    {
      key: "access",
      label: "How to apply",
      kind: "many",
      options: Object.entries(ROUTE_GROUPS).map(([value, { label }]) => ({ value, label })),
      chosen: filters.access,
    },
    {
      key: "region",
      label: "Region",
      kind: "many",
      options: named(withChosen(vocabulary.regions, filters.region)),
      chosen: filters.region,
    },
    {
      key: "kind",
      label: "Kind of funding",
      kind: "many",
      options: withChosen(vocabulary.kinds, filters.kind).map((value) => ({
        value,
        label: FUNDING_KINDS[value] ?? value,
      })),
      chosen: filters.kind,
    },
    ...(personalized
      ? [
          {
            key: "group",
            label: "Priority group",
            kind: "one" as const,
            options: [
              { value: "", label: "Every group" },
              ...Object.entries(MATCH_GROUPS as Record<string, string>).map(([value, label]) => ({ value, label })),
            ],
            chosen: filters.group ? [filters.group] : [],
          },
        ]
      : []),
    {
      key: "theme",
      label: "Theme",
      kind: "many",
      options: named(withChosen(vocabulary.themes, filters.theme)),
      chosen: filters.theme,
    },
  ];
}

/** The filters after one facet changes. A facet the page does not have changes nothing. */
export function applyFundingFacet(
  filters: FundingFilters,
  key: string,
  chosen: readonly string[],
): FundingFilters {
  switch (key) {
    case "access":
    case "region":
    case "theme":
    case "kind":
      return { ...filters, [key]: chosen };
    case "closing":
    case "group":
      return { ...filters, [key]: chosen[0] ?? "" };
    default:
      return filters;
  }
}

/** "Research priority" stays Funding's word for its ranking: a rank is not eligibility. */
export function fundingSorts(personalized: boolean): FacetOption[] {
  return [
    { value: "closing", label: "Closing soon" },
    { value: "name", label: "Name A to Z" },
    { value: "recent", label: "Recently checked" },
    ...(personalized ? [{ value: "fit", label: "Research priority" }] : []),
  ];
}
