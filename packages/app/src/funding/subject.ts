import type { DeviceDraft } from "../describe/contracts.ts";
import { cardName } from "../initiative/status.ts";

/** One of this browser's initiatives, as Funding offers it to compare with the catalog. */
export interface SubjectChoice {
  readonly id: string;
  readonly name: string;
  /** Only a checked card with a description can be compared with the catalog. */
  readonly checked: boolean;
}

/** Which initiative Funding's fit is for, and the ones a person can change to. */
export interface FundingSubject {
  /** The initiative the list is compared with: the tab's own. Null when it is empty or set aside (DL-055). */
  readonly current: SubjectChoice | null;
  /** Every initiative to pick from, the current one included. Empty when there is no other to change to. */
  readonly choices: readonly SubjectChoice[];
}

const choice = (draft: DeviceDraft): SubjectChoice => ({
  id: draft.id,
  name: cardName(draft),
  checked: !!draft.confirmed?.description.trim(),
});

/**
 * Funding ranks the catalog for one initiative, the one the tab is on. A browser can hold several
 * (DL-112), so the page says which one, and offers the others. `listed` is what Your Initiatives
 * lists: the drafts with words in them that are this person's to open.
 */
export function fundingSubject(current: DeviceDraft, listed: readonly DeviceDraft[]): FundingSubject {
  const own = listed.find((draft) => draft.id === current.id);
  const others = listed.some((draft) => draft.id !== current.id);
  return { current: own ? choice(own) : null, choices: others ? listed.map(choice) : [] };
}

/** What a choice reads as in the menu. One that cannot be ranked yet says so before it is picked. */
export function choiceLabel(option: SubjectChoice): string {
  return option.checked ? option.name : `${option.name}, not checked yet`;
}

/** The menu's value for looking at funding without comparing any initiative with it. */
export const NO_INITIATIVE = "none";

/**
 * What Change Initiative offers: every initiative to pick from and, while a checked one can be
 * compared, No initiative, for someone who only wants to browse. Empty where there is no menu.
 */
export function subjectOptions(subject: FundingSubject): { value: string; label: string }[] {
  const { current, choices } = subject;
  const initiatives = choices.length ? choices : current ? [current] : [];
  const options = initiatives.map((option) => ({ value: option.id, label: choiceLabel(option) }));
  if (!current?.checked) return choices.length ? options : [];
  return [...options, { value: NO_INITIATIVE, label: "No initiative" }];
}

/**
 * The sentence above the list, in three parts so the page can set the name apart. Null when there
 * is nothing to say: no initiative here and none to choose, or one unchecked initiative, which the
 * page's own prompt already asks the person to finish. While someone browses without an
 * initiative it says that fit is left out.
 */
export function subjectLine(
  subject: FundingSubject,
  browsing = false,
): { before: string; name: string; after: string } | null {
  const { current, choices } = subject;
  if (browsing && current?.checked)
    return { before: "No initiative chosen, so fit is not shown or sorted on.", name: "", after: "" };
  if (!current) return choices.length ? { before: "Choose an initiative to see what fits it.", name: "", after: "" } : null;
  if (current.checked) return { before: "Showing what fits ", name: current.name, after: "." };
  return choices.length ? { before: "", name: current.name, after: " is not checked yet, so funding is not ranked for it." } : null;
}
