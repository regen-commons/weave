import {
  EMPTY_INITIATIVE,
  applyReview,
  reviewedProposal,
  type DeviceDraft,
  type Initiative,
} from "./contracts.ts";
import { stepHasWords, stepText } from "../intake/state.ts";
import { keywordSuggestion } from "./keywords.ts";
export function previewFields(draft: DeviceDraft): Initiative {
  if (draft.mode === "fields") return applyReview(draft, { ...EMPTY_INITIATIVE, ...draft.publicEdits });
  if (draft.proposal && draft.proposalVersion === draft.inputVersion) return reviewedProposal(draft)!;
  return applyReview(
    draft,
    keywordSuggestion(draft, [...draft.turns.map((turn) => turn.text), draft.composer].join("\n\n")),
  );
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
export const emptyFields = () => ({ ...EMPTY_INITIATIVE });
