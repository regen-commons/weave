import { EMPTY_INITIATIVE, SuggestionSchema, type DeviceDraft, type Initiative } from "./contracts.ts";
import { keptDetails } from "./details.ts";
import { stepHasWords, stepText } from "../intake/state.ts";
import type { FundingDetails, FundingForm } from "../funding/contracts.ts";
import { APPLICANT_TYPES, countryList } from "../funding/details.ts";
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
/**
 * One set of funding details as lines labeled the way the Details For Funding dialog labels its
 * fields, with nothing for a field left empty. The kept details hold country codes, which read as
 * names; what is still open in the dialog is copied exactly as typed, so nothing typed is lost.
 */
function fundingLines(form: FundingForm, typed: boolean): string[] {
  const places = (text: string) => (typed ? text.trim() : countryList(text));
  const goal = [form.goalMin.trim() && `from ${form.goalMin.trim()}`, form.goalMax.trim() && `up to ${form.goalMax.trim()}`, form.currency.trim()]
    .filter(Boolean)
    .join(" ");
  const line = (label: string, value: string | false) => (value ? `${label}: ${value}` : "");
  return [
    line("Where you work", places(form.workCountries)),
    line("Where the people you serve live", places(form.benefitCountries)),
    line("Where you are based", places(form.applicantBaseCountry)),
    line("Where you are registered", places(form.registrationCountry)),
    line("Who is applying", form.applicantType !== "unknown" && APPLICANT_TYPES[form.applicantType]),
    line("Kinds of funding", form.fundingInstruments.join(", ")),
    line("Amount you are looking for", goal),
    line("States where you work", form.usWorkStates.trim()),
    line("States where the people you serve live", form.usBenefitStates.trim()),
  ].filter(Boolean);
}

/** The funding details, any still open in their dialog, and the answers given to a fund's requirements, as plain lines. */
export function fundingText(funding: FundingDetails): string {
  const section = (title: string, lines: string[]) => (lines.length ? [title, ...lines].join("\n") : "");
  return [
    section("Unfinished funding details", funding.editor ? fundingLines(funding.editor, true) : []),
    section("Funding details", fundingLines(funding.form, false)),
    section(
      "Answers to funding requirements",
      Object.entries(funding.programAnswers).map(
        ([key, { answer, sourceCheckedOn }]) =>
          `${key.split("::").join(", ")}: ${answer === "yes" ? "Yes" : "No"}, for the requirement as checked on ${sourceCheckedOn}`,
      ),
    ),
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function draftText(draft: DeviceDraft): string {
  return [
    fundingText(draft.funding),
    stepText(draft.needs, "needs"),
    stepText(draft.offers, "offers"),
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
