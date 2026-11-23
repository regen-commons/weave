/**
 * What every list's filter bar is made of (DL-061). A page describes its filters as facets and gets
 * back the facet that changed with its new values; the bar knows nothing about funds or initiatives.
 */
export interface FacetOption {
  readonly value: string;
  readonly label: string;
}

export interface Facet {
  readonly key: string;
  readonly label: string;
  /** Several values at once, or one of a short list whose first option means "no filter". */
  readonly kind: "many" | "one";
  readonly options: readonly FacetOption[];
  /** The values that narrow the list. A "one" facet holds at most one, and none is its first option. */
  readonly chosen: readonly string[];
  /** A second, single choice that narrows this one, such as where to look for a kind of support. */
  readonly scope?: Facet;
}

export interface SortChoice {
  readonly value: string;
  readonly options: readonly FacetOption[];
  /** The list's own order, which needs no chip and is what removing the chip returns to. The first option where left out. */
  readonly defaultValue?: string;
}

/** The order in force: the one chosen, or the first on offer where the choice is not one of them. */
export function sortChoice(sort: SortChoice): FacetOption | undefined {
  return sort.options.find((option) => option.value === sort.value) ?? sort.options[0];
}

/** The list's own order: the one it opens in, and the one Clear Filters and the chip return to. */
export function defaultSort(sort: SortChoice): string {
  return sort.defaultValue ?? sort.options[0]?.value ?? "";
}

/**
 * An order chosen over the list's own, which shows as a removable chip beside the filters (DL-122).
 * The Sort button says only "Sort", so the chip is where the order in force is read.
 */
export function chosenSort(sort: SortChoice | undefined): FacetOption | null {
  if (!sort) return null;
  const current = sortChoice(sort);
  return current && current.value !== defaultSort(sort) ? current : null;
}

/** The option a "one" facet shows as picked. */
export function pickedValue(facet: Facet): string {
  return facet.chosen[0] ?? facet.options[0]?.value ?? "";
}

/** A facet's values after one of its options is pressed. */
export function pressOption(facet: Facet, value: string): readonly string[] {
  if (facet.kind === "one") return value === facet.options[0]?.value ? [] : [value];
  return facet.chosen.includes(value) ? facet.chosen.filter((item) => item !== value) : [...facet.chosen, value];
}

/** How many of a facet's choices narrow the list. Its scope narrows nothing without a choice to look in. */
export function narrowing(facet: Facet): number {
  return facet.chosen.length + (facet.scope && facet.chosen.length ? facet.scope.chosen.length : 0);
}

export interface ActiveChoice {
  /** The facet the choice belongs to, which is the one to change when it is removed. */
  readonly facet: Facet;
  readonly value: string;
  readonly label: string;
}

/** A value from an address can be one the list no longer offers; it still shows, so it can be removed. */
const labelOf = (facet: Facet, value: string) => facet.options.find((option) => option.value === value)?.label ?? value;

/**
 * Every choice that narrows the list, in the facets' order, each one removable on its own. A "one"
 * facet and a scope carry their facet's name, because "Needs" or "Within 30 days" alone says little.
 */
export function activeChoices(facets: readonly Facet[]): ActiveChoice[] {
  return facets.flatMap((facet) => [
    ...facet.chosen.map((value) => ({
      facet,
      value,
      label: facet.kind === "one" ? `${facet.label}: ${labelOf(facet, value)}` : labelOf(facet, value),
    })),
    ...(facet.scope && facet.chosen.length
      ? facet.scope.chosen.map((value) => ({
          facet: facet.scope!,
          value,
          label: `${facet.scope!.label}: ${labelOf(facet.scope!, value)}`,
        }))
      : []),
  ]);
}

/** A facet's values with one choice taken away. */
export function withoutChoice(choice: ActiveChoice): readonly string[] {
  return choice.facet.chosen.filter((value) => value !== choice.value);
}

/**
 * Where a person's choices now stand: the search, every facet's values and the order. The pinned
 * filter row compares it before and after a menu or the sheet, and goes back to the bar only where
 * something changed (DL-130).
 */
export function choicesKey(search: string, facets: readonly Facet[], sort?: SortChoice): string {
  return JSON.stringify([
    search.trim(),
    facets.map((facet) => [facet.key, facet.chosen, facet.scope?.chosen ?? []]),
    sort?.value ?? "",
  ]);
}

/**
 * The observer's root margin for noticing the bar's controls go up under the app bar, which is
 * `header` pixels tall: the window less that strip at its top.
 */
export const underAppBar = (header: number): string => `-${Math.max(0, Math.round(header))}px 0px 0px 0px`;
