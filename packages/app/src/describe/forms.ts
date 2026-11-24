import { z } from "../validation.ts";
import { PublicEditsSchema, SuggestionSchema, type Initiative, type RecordForm } from "./contracts.ts";
export const formFrom = (fields: Initiative): RecordForm => ({
  name: fields.name,
  where: fields.isGlobal ? "Global" : fields.locations.join("; "),
  about: fields.description,
  links: fields.links.join("\n"),
});
/**
 * A link as people type it. A bare address, such as orchardcircle.example.org, gets https:// in
 * front before it is checked: VOICE asks to accept what people type. Anything with a scheme of its
 * own, or that does not read as an address, is left as typed, for the link check to answer.
 */
export function completeLink(typed: string): string {
  const link = typed.trim();
  if (!link || /^[a-z][a-z\d+.-]*:/iu.test(link)) return link;
  return /^[^\s/?#@:]+\.[^\s/?#@:]+(?::\d+)?(?:[/?#]\S*)?$/u.test(link) ? `https://${link}` : link;
}
/** The links text as the card holds them: one per space or line, each completed as typed. */
const typedLinks = (text: string): string[] => text.split(/\s+/u).filter(Boolean).map(completeLink);
export function parseRecordForm(form: RecordForm) {
  const isGlobal = /^(global|worldwide|em todo o mundo)$/iu.test(form.where.trim());
  return z.required(PublicEditsSchema).parse({
    name: form.name,
    description: form.about,
    locations: isGlobal
      ? []
      : form.where
          .split(/[;\n]/u)
          .map((value) => value.trim())
          .filter(Boolean),
    isGlobal,
    links: typedLinks(form.links),
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
  const links = SuggestionSchema.shape.links.safeParse(typedLinks(form.links));
  if (links.success) next.links = links.data;
  return PublicEditsSchema.parse(next);
}
