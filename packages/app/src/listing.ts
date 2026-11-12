import { CAPITALS, type Capital } from "./capitals.ts";
import type { Facet, FacetOption } from "./filters.ts";

export type CapitalKey = Capital["key"];
/**
 * The kinds of work the initiative list sorts by. Funders are not listed as initiatives: they
 * live in the funding directory.
 */
export type Work = "Place-based" | "Research" | "Art and culture" | "Technology" | "Learning and education";
export type Stage = "seed" | "sprout" | "flowering" | "tree";
export type Fit = "strong" | "good" | "possible";
export interface ListingRecord {
  readonly id: string;
  readonly kind: "initiative" | "funding";
  readonly title: string;
  readonly description: string;
  readonly country: string;
  readonly place: string;
  readonly work: readonly Work[];
  readonly stage: Stage;
  readonly needs: readonly CapitalKey[];
  readonly offers: readonly CapitalKey[];
  readonly fit?: Fit;
  readonly reasons: readonly string[];
  readonly confirmed: string;
  /** Supplied public sharing date, distinct from last confirmation. */
  readonly sharedOn?: string;
  readonly amount?: string;
  readonly closes?: string;
  /** Supplied public card content, never a private draft or a scraped page. */
  readonly publicDetails?: {
    readonly needs: readonly PublicAsk[];
    readonly offers: readonly PublicAsk[];
    readonly links: readonly {
      url: string;
      title: string;
      description: string;
    }[];
  };
}
export interface PublicAsk {
  readonly title: string;
  readonly description: string;
  readonly capitals: readonly CapitalKey[];
  readonly terms: string;
}

export interface ListFilters {
  readonly search: string;
  readonly work: readonly string[];
  readonly country: readonly string[];
  readonly stage: readonly string[];
  readonly support: readonly string[];
  readonly supportIn: "either" | "needs" | "offers";
  readonly relation: "any" | "offers-need" | "needs-offer";
  readonly sort: "name" | "recent" | "fit" | "closing";
}
export const EMPTY_FILTERS: ListFilters = {
  search: "",
  work: [],
  country: [],
  stage: [],
  support: [],
  supportIn: "either",
  relation: "any",
  sort: "name",
};
export const STAGE_LABELS: Record<Stage, string> = {
  seed: "Just starting",
  sprout: "Getting going",
  flowering: "Up and running",
  tree: "Long established",
};
export const WORK: readonly Work[] = [
  "Place-based",
  "Research",
  "Art and culture",
  "Technology",
  "Learning and education",
];
/** The initiative list's filters, in the order the filter bar shows them. */
export function listFacets(filters: ListFilters, countries: readonly string[]): Facet[] {
  const named = (values: readonly string[]): FacetOption[] => values.map((value) => ({ value, label: value }));
  return [
    { key: "work", label: "Type of work", kind: "many", options: named(WORK), chosen: filters.work },
    { key: "country", label: "Country", kind: "many", options: named(countries), chosen: filters.country },
    {
      key: "stage",
      label: "Stage",
      kind: "many",
      options: Object.entries(STAGE_LABELS).map(([value, label]) => ({ value, label })),
      chosen: filters.stage,
    },
    {
      key: "support",
      label: "Support",
      kind: "many",
      options: CAPITALS.map((capital) => ({ value: capital.key, label: `${capital.title}: ${capital.label}` })),
      chosen: filters.support,
      // A kind of support can be something an initiative needs or something it offers.
      scope: {
        key: "supportIn",
        label: "Look in",
        kind: "one",
        options: [
          { value: "either", label: "Needs or offers" },
          { value: "needs", label: "Needs" },
          { value: "offers", label: "Offers" },
        ],
        chosen: filters.supportIn === "either" ? [] : [filters.supportIn],
      },
    },
  ];
}

/** The filters after one facet changes. A facet the list does not have changes nothing. */
export function applyListFacet(filters: ListFilters, key: string, chosen: readonly string[]): ListFilters {
  switch (key) {
    case "work":
    case "country":
    case "stage":
    case "support":
      return { ...filters, [key]: chosen };
    case "supportIn":
      return { ...filters, supportIn: chosen[0] === "needs" || chosen[0] === "offers" ? chosen[0] : "either" };
    default:
      return filters;
  }
}

/** Best fit needs a card to compare with, so only a personalised list offers it. */
export function listSorts(personalized: boolean): FacetOption[] {
  return [
    { value: "name", label: "Name A to Z" },
    { value: "recent", label: "Recently confirmed" },
    ...(personalized ? [{ value: "fit", label: "Best fit" }] : []),
  ];
}

const folded = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase();
const intersects = (a: readonly string[], b: readonly string[]) => a.some((value) => b.includes(value));

/** OR within one filter, AND between filters. This filters supplied records; it never computes a match score. */
export function selectRecords(
  records: readonly ListingRecord[],
  filters: ListFilters,
  subject?: { needs: readonly CapitalKey[]; offers: readonly CapitalKey[] },
): ListingRecord[] {
  const query = folded(filters.search.trim());
  const selected = records.filter((record) => {
    const support =
      filters.supportIn === "needs"
        ? record.needs
        : filters.supportIn === "offers"
          ? record.offers
          : [...record.needs, ...record.offers];
    return (
      (!query ||
        folded(
          [record.title, record.description, record.place, record.country, ...record.work].join(" "),
        ).includes(query)) &&
      (!filters.work.length || intersects(filters.work, record.work)) &&
      (!filters.country.length || filters.country.includes(record.country)) &&
      (!filters.stage.length || filters.stage.includes(record.stage)) &&
      (!filters.support.length || intersects(filters.support, support)) &&
      (filters.relation === "any" ||
        (!!subject &&
          (filters.relation === "offers-need"
            ? intersects(record.offers, subject.needs)
            : intersects(record.needs, subject.offers))))
    );
  });
  const rank: Record<Fit, number> = { strong: 3, good: 2, possible: 1 };
  return selected.sort((a, b) => {
    let order = 0;
    if (filters.sort === "recent") order = b.confirmed.localeCompare(a.confirmed);
    if (filters.sort === "fit") order = (b.fit ? rank[b.fit] : 0) - (a.fit ? rank[a.fit] : 0);
    if (filters.sort === "closing") order = (a.closes ?? "9999").localeCompare(b.closes ?? "9999");
    return order || a.title.localeCompare(b.title);
  });
}
