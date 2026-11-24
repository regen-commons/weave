import { z } from "../validation.ts";
import { LinkSchema, type Attachment, type Turn } from "../describe/source-contracts.ts";
import { askFormText, askText } from "./presentation.ts";
import {
  ASK_DESCRIPTION_LIMIT,
  ASK_LIMIT,
  ASK_LIMIT_HELP,
  AskStepSchema,
  AskSchema,
  AskSuggestionSchema,
  EMPTY_ASK,
  type AskExtraction,
  type AskFields,
  type AskForm,
  type AskItem,
  type AskKind,
  type AskStep,
} from "./contracts.ts";

export const activeItems = (step: AskStep) => step.items.filter((item) => item.decision !== "removed");
export const fingerprint = (text: string) => text.trim().toLocaleLowerCase().replace(/\s+/gu, " ");
/** Suggestions from a linked Certified project's page carry this prefix in their source key. */
export const PROJECT_PAGE_SOURCE = "project:";
/** An entry suggested from a linked project's public description, not from the person's words. */
export const fromProjectPage = (item: Pick<AskItem, "sourceKey">): boolean =>
  item.sourceKey?.startsWith(PROJECT_PAGE_SOURCE) ?? false;
/**
 * Entries that making cards again keeps: every decided entry, every entry added by hand and
 * every suggestion from a project page. None of them came from the words being read again.
 */
export const keptOnRebuild = (item: AskItem): boolean =>
  item.decision !== "pencil" || item.sourceKey === null || fromProjectPage(item);
export function question(step: AskStep, kind: AskKind): string {
  if (!step.turns.length)
    return kind === "needs" ? "What would help your initiative next?" : "What can you share with others?";
  if (
    kind === "needs" &&
    !step.moneyNudgeSeen &&
    activeItems(step).some((item) => item.value.capitalForms.includes("financial"))
  )
    return "Money is one kind of support; what else would help?";
  return kind === "needs" ? "Anything else you need?" : "Anything else you can offer?";
}
export function changeStep(step: AskStep, change: Partial<AskStep>, input = false): AskStep {
  return AskStepSchema.parse({
    ...step,
    ...change,
    reviewedVersion: null,
    ...(input ? { inputVersion: step.inputVersion + 1 } : {}),
  });
}
export function answerStep(step: AskStep, kind: AskKind, text: string, via: Turn["via"] = "typed"): AskStep {
  const prompt = question(step, kind);
  return changeStep(
    step,
    {
      turns: [...step.turns, { id: crypto.randomUUID(), prompt, text: text.trim(), via }],
      composer: "",
      moneyNudgeSeen: step.moneyNudgeSeen || prompt.startsWith("Money is"),
    },
    true,
  );
}
export function commitPending(step: AskStep, kind: AskKind, via: Turn["via"] = "typed"): AskStep {
  let next = step;
  if (Object.values(next.answerEdits).some((text) => !text.trim()))
    throw new Error("Keep a nonempty answer before making cards.");
  if (Object.keys(next.answerEdits).length)
    next = changeStep(
      next,
      {
        turns: next.turns.map((turn) => ({ ...turn, text: next.answerEdits[turn.id]?.trim() ?? turn.text })),
        answerEdits: {},
      },
      true,
    );
  if (next.pendingLink.trim()) {
    next = keepLink(next);
  }
  if (next.composer.trim()) next = answerStep(next, kind, next.composer, via);
  return next;
}
/**
 * Reading the words failed or was stopped: they go back into the box, and the list is as it was
 * before they were added, so nothing waits on words the person can no longer see.
 */
export function returnWords(step: AskStep, turnId: string): AskStep {
  const turn = step.turns.find((item) => item.id === turnId);
  if (!turn) return step;
  const inputVersion = step.inputVersion + 1;
  return AskStepSchema.parse({
    ...step,
    turns: step.turns.filter((item) => item.id !== turnId),
    composer: step.composer.trim() ? step.composer : turn.text,
    inputVersion,
    builtVersion: step.builtVersion === null ? null : inputVersion,
    reviewedVersion: null,
  });
}
/** True while a list from the earlier guided conversation holds an unfinished answer change or link. */
export const hasEarlierInput = (step: AskStep): boolean =>
  Object.keys(step.answerEdits).length > 0 || !!step.pendingLink.trim();
/**
 * Settles what the earlier guided conversation left open, which this page no longer shows: a
 * changed answer is kept as changed, a complete link is kept, and anything else typed there
 * goes into the box, so nothing is lost and nothing hidden can hold the page.
 */
export function settleEarlierInput(step: AskStep): AskStep {
  if (!hasEarlierInput(step)) return step;
  const pending = step.pendingLink.trim();
  const link = LinkSchema.safeParse(pending);
  const room = step.links.length < 6;
  const kept = link.success && room;
  return changeStep(
    step,
    {
      turns: step.turns.map((turn) => ({ ...turn, text: step.answerEdits[turn.id]?.trim() || turn.text })),
      answerEdits: {},
      pendingLink: "",
      links: kept ? [...new Set([...step.links, link.data])] : step.links,
      composer: pending && !kept ? [step.composer, pending].filter(Boolean).join(" ") : step.composer,
    },
    true,
  );
}
export function keepLink(step: AskStep): AskStep {
  const link = LinkSchema.parse(step.pendingLink.trim());
  return changeStep(step, { links: [...new Set([...step.links, link])], pendingLink: "" }, true);
}
export function reconcile(step: AskStep, result: AskExtraction): AskStep {
  const fixed = step.items.filter(keptOnRebuild);
  const keys = new Set(fixed.map((item) => item.sourceKey).filter(Boolean));
  const prints = new Set(fixed.map((item) => item.fingerprint));
  const candidates = result.items.filter(
    (item) =>
      !keys.has(item.sourceKey) && !prints.has(fingerprint(item.value.description || item.value.title)),
  );
  const kept = fixed.filter((item) => item.decision !== "removed").length;
  // A list stored with five is already past the limit, so it takes no more.
  const added: AskItem[] = candidates.slice(0, Math.max(0, ASK_LIMIT - kept)).map((item) => ({
    id:
      step.items.find((old) => old.sourceKey === item.sourceKey && old.decision === "pencil")?.id ??
      crypto.randomUUID(),
    sourceKey: item.sourceKey,
    fingerprint: fingerprint(item.value.description || item.value.title),
    value: item.value,
    decision: "pencil",
    decisionBeforeRemove: null,
  }));
  return changeStep(step, {
    items: [...fixed, ...added],
    builtVersion: step.inputVersion,
    heard: kept + result.heard,
    omitted: Math.max(0, result.heard - added.length),
  });
}
export function decide(step: AskStep, id: string, decision: AskItem["decision"]): AskStep {
  const item = step.items.find((item) => item.id === id);
  if (!item) throw new Error("This card is no longer present.");
  const restored =
    item.decision === "removed" && decision === "pencil" ? (item.decisionBeforeRemove ?? "pencil") : decision;
  if (item.decision === "removed" && decision !== "removed" && activeItems(step).length >= ASK_LIMIT)
    throw new Error("Four is the limit. Remove another card before undoing this removal.");
  return changeStep(step, {
    items: step.items.map((current) =>
      current.id === id
        ? {
            ...current,
            decision: restored,
            decisionBeforeRemove:
              restored === "removed"
                ? current.decision === "removed"
                  ? current.decisionBeforeRemove
                  : current.decision
                : null,
          }
        : current,
    ),
  });
}
export function formFromAsk(value: AskFields = EMPTY_ASK): AskForm {
  return {
    title: value.title,
    description: value.description ?? "",
    capitalForms: [...value.capitalForms],
    amountMin: value.amount?.min?.toString() ?? "",
    amountMax: value.amount?.max?.toString() ?? "",
    currency: value.amount?.currency ?? "",
    timeframe: value.timeframe ?? "",
    urgency: value.urgency ?? "",
    placeScope: value.placeScope,
    exchangeTerms: [...value.exchangeTerms],
    purpose: value.purpose ?? "",
    capacity: value.capacity ?? "",
    audience: value.audience ?? "",
    status: value.status,
  };
}
/** The editor's fields a problem can belong to: the ones a person can correct in it. */
export type AskFormField = "title" | "description" | "capitalForms" | "amountMin" | "amountMax" | "currency" | "exchangeTerms";
/** A problem with one field of the editor, so the editor can mark that field and move to it. */
export class AskFieldError extends Error {
  readonly field: AskFormField;
  constructor(field: AskFormField, message: string) {
    super(message);
    this.field = field;
  }
}
/** What the editor says when nothing more precise is known. */
export const ASK_FORM_PROBLEM = "Add a title. Check amounts, currency and terms. Your unfinished values are still here.";
/**
 * Says which field a failed save is about and what to do, so the editor can mark that field and
 * move the focus to it (WCAG 3.3.1, 3.3.3). The schema's own sentences are used where they exist.
 */
export function askFormProblem(error: unknown): { field: AskFormField | null; message: string } {
  if (error instanceof AskFieldError) return { field: error.field, message: error.message };
  if (error instanceof z.core.$ZodError) {
    const issue = error.issues[0];
    const [first, second] = issue?.path ?? [];
    if (first === "title") return { field: "title", message: "Add a title." };
    if (first === "description") return { field: "description", message: `Keep the description to ${ASK_DESCRIPTION_LIMIT} characters or fewer.` };
    if (first === "amount" && second === "currency") return { field: "currency", message: "Use a three-letter currency code, such as USD." };
    if (first === "amount" && (second === "min" || second === "max"))
      return { field: second === "min" ? "amountMin" : "amountMax", message: "Use a number of zero or more." };
    if (first === "amount") return { field: "amountMin", message: issue?.message ?? ASK_FORM_PROBLEM };
    if (first === "exchangeTerms") return { field: "exchangeTerms", message: "Choose at least one term." };
    const message = issue?.message ?? ASK_FORM_PROBLEM;
    if (/Open to anything/u.test(message)) return { field: "exchangeTerms", message };
    if (/kind of support|Financial support/u.test(message)) return { field: "capitalForms", message };
    return { field: null, message: issue && !first ? message : ASK_FORM_PROBLEM };
  }
  if (error instanceof Error && !error.message.startsWith("[")) return { field: null, message: error.message };
  return { field: null, message: ASK_FORM_PROBLEM };
}
function numeric(text: string, field: "amountMin" | "amountMax"): number | null {
  if (!text.trim()) return null;
  if (!/^\d+(?:\.\d+)?$/u.test(text.trim()))
    throw new AskFieldError(field, "Use numbers with a dot for decimals, without grouping separators.");
  const number = Number(text);
  if (!Number.isFinite(number)) throw new AskFieldError(field, "Check the amount.");
  return number;
}
export function parseAskForm(form: AskForm, kind: AskKind, allowUnclassified = true): AskFields {
  const financial = form.capitalForms.includes("financial");
  const hasAmount = financial && !!(form.amountMin.trim() || form.amountMax.trim() || form.currency.trim());
  return (allowUnclassified ? AskSuggestionSchema : AskSchema).parse({
    title: form.title.trim(),
    description: form.description.trim() || null,
    capitalForms: form.capitalForms,
    amount: hasAmount
      ? {
          min: numeric(form.amountMin, "amountMin"),
          max: numeric(form.amountMax, "amountMax"),
          currency: form.currency.trim().toUpperCase(),
        }
      : null,
    timeframe: form.timeframe.trim() || null,
    urgency: kind === "needs" ? form.urgency || null : null,
    placeScope: form.placeScope,
    exchangeTerms: form.exchangeTerms,
    purpose: kind === "needs" ? form.purpose.trim() || null : null,
    capacity: kind === "offers" ? form.capacity.trim() || null : null,
    audience: kind === "offers" ? form.audience.trim() || null : null,
    status: form.status,
  });
}
export function keepEditor(step: AskStep, kind: AskKind): AskStep {
  if (!step.editor) throw new Error("Open a card to change it.");
  const value = parseAskForm(step.editor.form, kind);
  if (!step.editor.id && activeItems(step).length >= ASK_LIMIT) throw new Error(ASK_LIMIT_HELP);
  const old = step.items.find((item) => item.id === step.editor!.id);
  if (step.editor.id && !old) throw new Error("This card changed. Cancel the editor and open it again.");
  // A description written before the shorter limit stays as it is; a new or changed one fits it.
  if ((value.description?.length ?? 0) > ASK_DESCRIPTION_LIMIT && value.description !== old?.value.description)
    throw new AskFieldError("description", `Keep the description to ${ASK_DESCRIPTION_LIMIT} characters or fewer.`);
  const item: AskItem = {
    id: old?.id ?? crypto.randomUUID(),
    sourceKey: old?.sourceKey ?? null,
    fingerprint: old?.fingerprint ?? fingerprint(value.description || value.title),
    value,
    decision: "kept",
    decisionBeforeRemove: null,
  };
  return changeStep(step, {
    editor: null,
    items: old
      ? step.items.map((current) => (current.id === old.id ? item : current))
      : [...step.items, item],
  });
}
/**
 * Checks a list. Suggestions from a project page that arrived after the person checked it wait in
 * pencil without unchecking it: they leave nothing until kept, and Continue on the page keeps them.
 */
export function reviewStep(step: AskStep): AskStep {
  if (step.editor || Object.keys(step.answerEdits).length || step.composer.trim() || step.pendingLink.trim())
    throw new Error("Keep or cancel unfinished changes before continuing.");
  if (step.items.some((item) => item.decision === "pencil" && !fromProjectPage(item)))
    throw new Error("Keep, change or remove every card in pencil.");
  const hasSource = step.turns.length || step.attachments.length;
  if (step.mode === "conversation" && hasSource && step.builtVersion !== step.inputVersion)
    throw new Error("Your words changed. Make cards again before continuing.");
  return AskStepSchema.parse({ ...step, reviewedVersion: step.inputVersion });
}
export function stepHasWords(step: AskStep): boolean {
  return !!(
    step.turns.length ||
    step.composer ||
    step.pendingLink ||
    step.links.length ||
    step.attachments.length ||
    step.items.length ||
    step.editor
  );
}
/** How each card's state reads in the copy of the words, for a person and not a program. */
const DECISION_WORDS = { kept: "Kept card", pencil: "Card to check", removed: "Removed card" } as const;
export function stepText(step: AskStep, kind: AskKind): string {
  return [
    ...step.turns.map((turn) => `${turn.prompt}\n${turn.text}`),
    step.composer,
    ...Object.values(step.answerEdits),
    step.pendingLink,
    ...step.links,
    ...step.attachments.map((file) => `File kept locally: ${file.name}`),
    ...step.items.map((item) => `${DECISION_WORDS[item.decision]}\n${askText(item.value)}`),
    step.editor ? `Unfinished card\n${askFormText(step.editor.form, kind)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
export function addStepFiles(step: AskStep, attachments: Attachment[]): AskStep {
  return changeStep(step, { attachments: [...step.attachments, ...attachments] }, true);
}
