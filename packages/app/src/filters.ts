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
