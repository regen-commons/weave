import {
  confirmDraft,
  keepPendingDetails,
  revise,
  reviewedProposal,
  type DeviceDraft,
  type Initiative,
  type RecordForm,
} from "./contracts.ts";
import { formFrom } from "./forms.ts";
import { whereAnswer } from "./keywords.ts";
import { FieldsProblem, readFields } from "./screen.ts";

/** What the check card page shows: nothing to check yet, a card whose words changed after it was built, or the card. */
export type CheckView = "describe" | "rebuild" | "card";

/** True when the four fields are the card's only source: the person typed them, or a Certified project filled them. */
export function typedCard(draft: DeviceDraft): boolean {
  return draft.lastBuild?.engine === "manual";
}

/**
 * A card built from a conversation has to be built again once the words change. A typed card is
 * never out of date: the fields on the page are its latest words.
 */
export function checkView(draft: DeviceDraft): CheckView {
  if (!draft.proposal) return "describe";
  return draft.proposalVersion === draft.inputVersion || typedCard(draft) ? "card" : "rebuild";
}

/** The four fields as the check card shows them: the person's latest text, or the card as it was built. */
export function checkForm(draft: DeviceDraft): RecordForm | null {
  const fields = reviewedProposal(draft);
  return draft.form ?? (fields ? formFrom(fields) : null);
}

/**
 * True while Where shows a place the app read from the words, not one the person gave: the card
 * was built from their words, the Where question has no answer, and Where still reads as built.
 */
export function whereReadFromWords(draft: DeviceDraft): boolean {
  const form = checkForm(draft);
  if (!draft.proposal || !form || draft.confirmed || typedCard(draft) || whereAnswer(draft)) return false;
  const read = formFrom(draft.proposal).where;
  return read !== "" && form.where === read;
}

/** The line under the check card's heading: what was not read, what was cut, and what to check. */
export function checkNotes(draft: DeviceDraft): string {
  const build = draft.lastBuild;
  return [
    build?.unreadFiles
      ? `${build.unreadFiles} ${build.unreadFiles === 1 ? "file was" : "files were"} kept but not read.`
      : "",
    (build?.sourceCharacters ?? 0) > 800 ? "About it holds up to 800 characters. Your full words are kept." : "",
    build?.files.some((file) => file.status === "partial") ? "Some PDF pages had no readable text." : "",
    whereReadFromWords(draft) ? "Where you work was read from your words. Check it before you continue." : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * The card's four public details as a Certified project lists them. The read-only card shows
 * these, so what a linked person sees is what the card holds.
 */
export function publicDetails(fields: Initiative) {
  return {
    name: fields.name,
    locations: fields.isGlobal ? ["Global"] : [...fields.locations],
    description: fields.description,
    links: [...fields.links],
  };
}

/**
 * The check card's one button. It keeps the four fields as they read on the page, keeps every
 * detail still in pencil, and confirms the card. `readOnly` leaves the four fields alone, because
 * a linked Certified project owns them. Throws a sentence the page can show when something is open.
 */
export function keepCard(draft: DeviceDraft, readOnly = false): DeviceDraft {
  const form = checkForm(draft);
  if (!form) throw new FieldsProblem("Describe your initiative first.");
  const current = typedCard(draft) ? { proposalVersion: draft.inputVersion } : {};
  const next = revise(draft, readOnly ? current : { ...current, publicEdits: readFields(form) });
  return confirmDraft(keepPendingDetails(next));
}

/** Why the card could not be kept, as a sentence. Schema failures become plain words. */
export function keepProblem(error: unknown): string {
  if (error instanceof Error && !error.message.startsWith("[")) return error.message;
  return "Your card needs a name before it can be kept.";
}
