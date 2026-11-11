import { CAPITALS } from "../capitals.ts";
import { ASK_LIMIT, type AskItem, type AskKind, type AskStep } from "./contracts.ts";
import { keepPending, toggleKind } from "./entries.ts";
import { activeItems, decide, reviewStep } from "./state.ts";

/** One of the eight forms of capital, shown to people as a kind of support. */
export type CapitalForm = AskItem["value"]["capitalForms"][number];

/** The two lists on the needs and offers page, in the order they show. */
export const ASK_KINDS = ["needs", "offers"] as const satisfies readonly AskKind[];

/** "2 of 5": how many entries a list holds against the limit, as one phrase. */
export const sectionCount = (step: AskStep): string => `${activeItems(step).length} of ${ASK_LIMIT}`;

/** An entry the app made from a conversation that no person has confirmed, so the whole card is pencil. */
export const suggestedEntry = (item: AskItem): boolean =>
  item.decision === "pencil" && item.sourceKey !== null;

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

/** What to say when a conversation's words changed since cards were last made. Empty when they are current. */
export function cardsNote(step: AskStep): string {
  const hasSource = step.turns.length > 0 || step.attachments.length > 0;
  if (step.mode !== "conversation" || !hasSource || step.builtVersion === step.inputVersion) return "";
  return step.builtVersion === null
    ? "Make cards from your words, then continue."
    : "Your words changed. Make cards again, then continue.";
}

/** The conversation behind "Longer answers, files and links" holds unfinished work, so it starts open. */
export const talkWaiting = (step: AskStep): boolean =>
  !!step.composer.trim() ||
  !!step.pendingLink.trim() ||
  Object.keys(step.answerEdits).length > 0 ||
  !!cardsNote(step);

/** Why a list cannot continue yet, and the part of its section that holds the unfinished work. */
export interface Blocker {
  readonly where: "add" | "editor" | "talk" | "list";
  readonly message: string;
}
export type StepResult =
  | { readonly ok: true; readonly step: AskStep }
  | { readonly ok: false; readonly blocker: Blocker };
export type ContinueResult =
  | { readonly ok: true; readonly steps: Record<AskKind, AskStep> }
  | { readonly ok: false; readonly blocked: Partial<Record<AskKind, Blocker>> };

function blockerFor(step: AskStep, error: unknown): Blocker {
  if (step.editor)
    return { where: "editor", message: "Keep or cancel the details you have open, then continue." };
  if (Object.keys(step.answerEdits).length)
    return { where: "talk", message: "Keep or cancel the answer you are changing, then continue." };
  if (step.composer.trim())
    return {
      where: "talk",
      message:
        step.mode === "manual"
          ? "Keep your notes or clear them, then continue."
          : "Make cards from your answer or clear it, then continue.",
    };
  if (step.pendingLink.trim()) return { where: "talk", message: "Add the link or clear it, then continue." };
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
 * Words typed into quick add and not added yet stop it, so a person sees the entry and its
 * suggested kinds before Continue confirms them.
 */
export function continueStep(step: AskStep, words = ""): StepResult {
  if (words.trim())
    return { ok: false, blocker: { where: "add", message: "Add what you typed or clear it, then continue." } };
  try {
    return { ok: true, step: reviewStep(keepPending(step)) };
  } catch (error) {
    return { ok: false, blocker: blockerFor(step, error) };
  }
}

/** Continue for the page. Both lists pass together or neither is changed. */
export function continueBoth(
  steps: Readonly<Record<AskKind, AskStep>>,
  words: Readonly<Record<AskKind, string>> = { needs: "", offers: "" },
): ContinueResult {
  const needs = continueStep(steps.needs, words.needs);
  const offers = continueStep(steps.offers, words.offers);
  if (needs.ok && offers.ok) return { ok: true, steps: { needs: needs.step, offers: offers.step } };
  return {
    ok: false,
    blocked: {
      ...(needs.ok ? {} : { needs: needs.blocker }),
      ...(offers.ok ? {} : { offers: offers.blocker }),
    },
  };
}

/**
 * Adds or removes one kind of support from the card. Making cards again replaces every
 * conversation card still in pencil, so a change to one keeps it and the change survives.
 */
export function changeKind(step: AskStep, id: string, kind: CapitalForm): AskStep {
  const item = step.items.find((current) => current.id === id);
  const next = toggleKind(step, id, kind);
  return item && suggestedEntry(item) ? decide(next, id, "kept") : next;
}

/**
 * Where focus goes after a kind is added or removed. The control that was pressed leaves its
 * row, so focus moves to the next one in that row, then the one before, then the control
 * that brings the kind back.
 */
export function kindFocus(id: string, chosen: readonly CapitalForm[], kind: CapitalForm): string {
  const order = CAPITALS.map((capital) => capital.key);
  const removing = chosen.includes(kind);
  const row = order.filter((key) => key !== kind && chosen.includes(key) === removing);
  const at = order.indexOf(kind);
  const neighbour =
    row.find((key) => order.indexOf(key) > at) ?? row.findLast((key) => order.indexOf(key) < at);
  if (neighbour) return entryId(id, `kind-${neighbour}-${removing ? "remove" : "add"}`);
  return removing ? entryId(id, "kinds") : entryId(id, `kind-${kind}-remove`);
}
