import { LENS_LABELS, type DerivedKey, type Initiative } from "./contracts.ts";
import { STAGE_LABELS } from "../listing.ts";

export const NOT_STATED = "Not stated";

/** A derived detail as people read it on the card. */
export function detailText(key: DerivedKey, fields: Initiative): string {
  if (key === "stage") return fields.stage ? STAGE_LABELS[fields.stage] : NOT_STATED;
  if (key === "lenses") return fields.lenses.map((lens) => LENS_LABELS[lens]).join(", ") || NOT_STATED;
  if (key === "languages")
    return (
      fields.languages
        .map((code) => new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code)
        .join(", ") || NOT_STATED
    );
  return fields[key].join(", ") || NOT_STATED;
}

export function hasDetail(key: DerivedKey, fields: Initiative): boolean {
  return key === "stage" ? fields.stage !== null : fields[key].length > 0;
}
