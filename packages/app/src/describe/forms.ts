import type { z } from "zod";
import { PublicEditsSchema, SuggestionSchema, type Initiative, type RecordForm } from "./contracts.ts";
export const formFrom = (fields: Initiative): RecordForm => ({
  name: fields.name,
  where: fields.isGlobal ? "Global" : fields.locations.join("; "),
  about: fields.description,
  links: fields.links.join("\n"),
});
export function parseRecordForm(form: RecordForm) {
  const isGlobal = /^(global|worldwide|em todo o mundo)$/iu.test(form.where.trim());
  return PublicEditsSchema.required().parse({
    name: form.name,
    description: form.about,
    locations: isGlobal
      ? []
      : form.where
          .split(/[;\n]/u)
          .map((value) => value.trim())
          .filter(Boolean),
    isGlobal,
    links: form.links.split(/\s+/u).filter(Boolean),
  });
}
export function editsFromForm(form: RecordForm, previous: z.infer<typeof PublicEditsSchema>) {
  const next = { ...previous, name: form.name, description: form.about };
  try {
    const parsed = parseRecordForm({ ...form, links: "" });
    next.locations = parsed.locations;
    next.isGlobal = parsed.isGlobal;
  } catch {
    /* Keep raw text in the draft until corrected. */
  }
  const links = SuggestionSchema.shape.links.safeParse(form.links.split(/\s+/u).filter(Boolean));
  if (links.success) next.links = links.data;
  return PublicEditsSchema.parse(next);
}
