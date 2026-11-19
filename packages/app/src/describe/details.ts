import { DERIVED_LABELS, EMPTY_INITIATIVE, type DerivedKey, type DeviceDraft, type Initiative } from "./contracts.ts";

export const DETAIL_KEYS = Object.keys(DERIVED_LABELS) as DerivedKey[];

/** One detail's values as plain strings, whatever its shape. */
export const detailValues = (key: DerivedKey, fields: Pick<Initiative, DerivedKey> | null): string[] =>
  !fields ? [] : key === "stage" ? (fields.stage ? [fields.stage] : []) : [...fields[key]];

/**
 * The values of one detail the person has kept. A suggestion nobody tapped is in pencil and is
 * not on the card, so it has none (DL-110).
 */
export function keptValues(draft: DeviceDraft, key: DerivedKey): string[] {
  if (draft.removed.includes(key) || !draft.kept.includes(key)) return [];
  if (key in draft.derivedEdits) return detailValues(key, { ...EMPTY_INITIATIVE, ...draft.derivedEdits });
  return detailValues(key, draft.proposal);
}

/** The five details as the card holds them: only what the person kept. */
export function keptDetails(draft: DeviceDraft): Pick<Initiative, DerivedKey> {
  const kept = (key: Exclude<DerivedKey, "stage">) => keptValues(draft, key);
  return {
    stage: (keptValues(draft, "stage")[0] as Initiative["stage"] | undefined) ?? null,
    lenses: kept("lenses") as Initiative["lenses"],
    themes: kept("themes"),
    beneficiaries: kept("beneficiaries"),
    languages: kept("languages"),
  };
}
