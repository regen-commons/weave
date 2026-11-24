import { CAPITALS } from "../capitals.ts";
import { ASK_LIMIT, type AskItem, type AskKind, type AskStep } from "./contracts.ts";
import { keepPending, toggleKind } from "./entries.ts";
import { activeItems, decide, fromProjectPage, reviewStep } from "./state.ts";

/** One of the eight forms of capital, shown to people as a kind of support. */
export type CapitalForm = AskItem["value"]["capitalForms"][number];

/** The two lists, needs and then offers, in the order their steps come. */
export const ASK_KINDS = ["needs", "offers"] as const satisfies readonly AskKind[];

/** "2 of 4": how many entries a list holds against the limit, as one phrase. */
export const sectionCount = (step: AskStep): string => `${activeItems(step).length} of ${ASK_LIMIT}`;

/**
 * An entry the app made, from a conversation or a linked project's page, that no person has
 * confirmed, so the whole card is pencil.
 */
export const suggestedEntry = (item: AskItem): boolean =>
  item.decision === "pencil" && item.sourceKey !== null;

/** Where a suggested entry came from, as its card says. */
export const suggestionSource = (item: AskItem): string =>
  fromProjectPage(item) ? "Suggested from your project page" : "Suggested from your words";

/** The element id of one part of an entry card, so focus can return to it after a change. */
export const entryId = (id: string, part: string): string => `ask-${id}-${part}`;

/** The one line under a list that says what dashed means. Empty when nothing in the list is dashed. */
export function pencilHint(step: AskStep): string {
  const pencil = step.items.filter((item) => item.decision === "pencil");
  if (pencil.some(suggestedEntry)) return "Dashed cards and kinds are suggestions. Remove any that are wrong.";
  if (pencil.some((item) => item.value.capitalForms.length > 0))
    return "Dashed kinds are suggestions. Remove any that are wrong.";
  return "";
}

/**
 * What to say when words or files were added and have not been read into the list yet, as after
 * a reading that failed. Add To List reads them again. Empty when the list is current. Files are
 * named only when the step holds some: they are added on the describe step now, and only a draft
 * from an earlier build has files here.
 */
export function cardsNote(step: AskStep): string {
  const hasSource = step.turns.length > 0 || step.attachments.length > 0;
  if (step.mode !== "conversation" || !hasSource || step.builtVersion === step.inputVersion) return "";
  return `Your ${step.attachments.length ? "words or files" : "words"} changed. Press Add To List to read them, then continue.`;
}

/** Why a list cannot continue yet, and the part of its section that holds the unfinished work. */
export interface Blocker {
  readonly where: "editor" | "talk" | "list";
  readonly message: string;
}
export type StepResult =
  | { readonly ok: true; readonly step: AskStep }
  | { readonly ok: false; readonly blocker: Blocker };

function blockerFor(step: AskStep, error: unknown): Blocker {
  if (step.editor)
    return { where: "editor", message: "Keep or cancel the details you have open, then continue." };
  if (step.composer.trim())
    return { where: "talk", message: "Add what is in the box to your list, or clear the box, then continue." };
  const stale = cardsNote(step);
  if (stale) return { where: "talk", message: stale };
  return {
    where: "list",
    message:
      error instanceof Error && !error.message.startsWith("[")
        ? error.message
        : "Check this list, then continue.",
  };
}

/**
 * Continue for one list: every entry still in pencil is kept, then the list is checked.
 * Words still in the box stop it, so a person sees each entry and its suggested kinds before
 * Continue confirms them.
 */
export function continueStep(step: AskStep): StepResult {
  try {
    return { ok: true, step: reviewStep(keepPending(step)) };
  } catch (error) {
    return { ok: false, blocker: blockerFor(step, error) };
  }
}

/**
 * Removes one kind of support from the card, or puts it back. Reading words again replaces every
 * suggested card still in pencil, so a change to one keeps it and the change survives.
 */
export function changeKind(step: AskStep, id: string, kind: CapitalForm): AskStep {
  const item = step.items.find((current) => current.id === id);
  const next = toggleKind(step, id, kind);
  return item && suggestedEntry(item) ? decide(next, id, "kept") : next;
}

/**
 * Where focus goes after a kind is removed from a card. The control that was pressed leaves its
 * row, so focus moves to the next kind in that row, then the one before, then Change Details,
 * where a kind is put back.
 */
export function kindFocus(id: string, chosen: readonly CapitalForm[], kind: CapitalForm): string {
  const order = CAPITALS.map((capital) => capital.key);
  const row = order.filter((key) => key !== kind && chosen.includes(key));
  const at = order.indexOf(kind);
  const neighbour = row.find((key) => order.indexOf(key) > at) ?? row.findLast((key) => order.indexOf(key) < at);
  return neighbour ? entryId(id, `kind-${neighbour}-remove`) : entryId(id, "more");
}
