import { EMPTY_INITIATIVE, SuggestionSchema, type DeviceDraft, type Initiative } from "./contracts.ts";
import { keptDetails } from "./details.ts";
import { stepHasWords, stepText } from "../intake/state.ts";
/**
 * The card as it stands before Continue: the four fields as they read, and the details the
 * person kept. Words in the box that have not been put into the fields are not on it, and
 * neither is a suggestion still in pencil (DL-110). A card loaded from an account or built
 * earlier supplies the fields the person has not changed.
 */
export function previewFields(draft: DeviceDraft): Initiative {
  const base = draft.proposal ?? EMPTY_INITIATIVE;
  return SuggestionSchema.parse({
    ...EMPTY_INITIATIVE,
    name: base.name,
    description: base.description,
    locations: base.locations,
    isGlobal: base.isGlobal,
    ...draft.publicEdits,
    links: [...draft.links],
    ...keptDetails(draft),
    confidence: base.confidence,
  });
}
export function hasDraft(draft: DeviceDraft): boolean {
  return !!(
    stepHasWords(draft.needs) ||
    stepHasWords(draft.offers) ||
    draft.turns.length ||
    draft.composer ||
    draft.pendingLink ||
    draft.links.length ||
    draft.attachments.length ||
    (draft.form && Object.values(draft.form).some((value) => value.trim())) ||
    draft.confirmed
  );
}
export function draftText(draft: DeviceDraft): string {
  return [
    draft.funding.editor ? `Unfinished funding details: ${JSON.stringify(draft.funding.editor)}` : "",
    `Funding details: ${JSON.stringify(draft.funding.form)}`,
    `Funding requirement answers: ${JSON.stringify(draft.funding.programAnswers)}`,
    stepText(draft.needs),
    stepText(draft.offers),
    ...draft.turns.map((turn) => `${turn.prompt}\n${turn.text}`),
    draft.composer,
    draft.pendingLink,
    ...Object.values(draft.answerEdits),
    ...Object.entries(draft.reviewEdits).map(
      ([key, value]) => `${key}: ${value.value} ${value.lenses.join(", ")}`,
    ),
    ...(draft.form ? [draft.form.name, draft.form.where, draft.form.about, draft.form.links] : []),
    ...draft.links,
    ...draft.attachments.map((file) => `File kept locally: ${file.name}`),
  ]
    .filter(Boolean)
    .join("\n\n");
}
