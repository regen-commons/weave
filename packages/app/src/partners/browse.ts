import { CAPITALS } from "../capitals.ts";
import type { Facet } from "../filters.ts";
import type { EvidenceKind, PartnerEvidence } from "./evidence.ts";

/** The public catalog by kind of evidence, for browsing it with no need or offer to match. */
export const BROWSE_GROUPS: readonly { kind: EvidenceKind; heading: string }[] = [
  { kind: "confirmed_offer", heading: "Confirmed offers" },
  { kind: "published_offer", heading: "Published offers to check" },
  { kind: "inferred_capability", heading: "Relevant experience" },
  { kind: "published_need", heading: "Public requests" },
];

/** What narrows the starter list on Initiatives: words, kinds of support and what the source lists. */
export interface BrowseFilters {
  readonly search: string;
  readonly support: readonly string[];
  readonly listed: readonly string[];
}
export const EMPTY_BROWSE: BrowseFilters = { search: "", support: [], listed: [] };

const plain = (value: string) => value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();

/**
 * The starter list's filters. Each offers only what the list holds, plus anything already chosen,
 * so no option leads to an empty list on its own.
 */
export function browseFacets(catalog: readonly PartnerEvidence[], filters: BrowseFilters): Facet[] {
  const held = new Set(catalog.flatMap((evidence) => evidence.capitals));
  const kinds = new Set(catalog.map((evidence) => evidence.kind));
  return [
    {
      key: "support",
      label: "Kind of support",
      kind: "many",
      options: CAPITALS.filter((capital) => held.has(capital.key) || filters.support.includes(capital.key)).map(
        (capital) => ({ value: capital.key, label: `${capital.title}: ${capital.label}` }),
      ),
      chosen: filters.support,
    },
    {
      key: "listed",
      label: "What is listed",
      kind: "many",
      options: BROWSE_GROUPS.filter((group) => kinds.has(group.kind) || filters.listed.includes(group.kind)).map(
        (group) => ({ value: group.kind, label: group.heading }),
      ),
      chosen: filters.listed,
    },
  ];
}

/** The filters after one facet changes. A facet the list does not have changes nothing. */
export function applyBrowseFacet(filters: BrowseFilters, key: string, chosen: readonly string[]): BrowseFilters {
  return key === "support" || key === "listed" ? { ...filters, [key]: chosen } : filters;
}

/**
 * The entries a search and the filters leave. Every word typed must appear in the project's name,
 * its summary, its topics or its publisher; case and accents do not matter. Within a filter any
 * choice fits, and across filters all must.
 */
export function browseEvidence(catalog: readonly PartnerEvidence[], filters: BrowseFilters): PartnerEvidence[] {
  const terms = plain(filters.search).split(/\s+/u).filter(Boolean);
  return catalog.filter((evidence) => {
    const text = plain(`${evidence.project} ${evidence.summary} ${evidence.topics} ${evidence.source.publisher}`);
    return (
      terms.every((term) => text.includes(term)) &&
      (!filters.support.length || evidence.capitals.some((capital) => filters.support.includes(capital))) &&
      (!filters.listed.length || filters.listed.includes(evidence.kind))
    );
  });
}
