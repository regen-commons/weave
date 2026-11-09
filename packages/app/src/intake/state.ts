import { LinkSchema, type Attachment, type Turn } from "../describe/source-contracts.ts";
import {
  ASK_LIMIT,
  AskSchema,
  AskStepSchema,
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
export function keepLink(step: AskStep): AskStep {
  const link = LinkSchema.parse(step.pendingLink.trim());
  return changeStep(step, { links: [...new Set([...step.links, link])], pendingLink: "" }, true);
}
export function reconcile(step: AskStep, result: AskExtraction): AskStep {
  const fixed = step.items.filter((item) => item.decision === "kept" || item.decision === "removed");
  const keys = new Set(fixed.map((item) => item.sourceKey).filter(Boolean));
  const prints = new Set(fixed.map((item) => item.fingerprint));
  const candidates = result.items.filter(
    (item) =>
      !keys.has(item.sourceKey) && !prints.has(fingerprint(item.value.description || item.value.title)),
  );
  const kept = fixed.filter((item) => item.decision === "kept").length;
  const added: AskItem[] = candidates.slice(0, ASK_LIMIT - kept).map((item) => ({
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
  if (restored === "kept") AskSchema.parse(item.value);
  if (item.decision === "removed" && decision !== "removed" && activeItems(step).length >= ASK_LIMIT)
    throw new Error("Five is the limit. Remove another card before undoing this removal.");
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
function numeric(text: string): number | null {
  if (!text.trim()) return null;
  if (!/^\d+(?:\.\d+)?$/u.test(text.trim()))
    throw new Error("Use numbers with a dot for decimals, without grouping separators.");
  const number = Number(text);
  if (!Number.isFinite(number)) throw new Error("Check the amount.");
  return number;
}
export function parseAskForm(form: AskForm, kind: AskKind): AskFields {
  const financial = form.capitalForms.includes("financial");
  const hasAmount = financial && !!(form.amountMin.trim() || form.amountMax.trim() || form.currency.trim());
  return AskSchema.parse({
    title: form.title.trim(),
    description: form.description.trim() || null,
    capitalForms: form.capitalForms,
    amount: hasAmount
      ? {
          min: numeric(form.amountMin),
          max: numeric(form.amountMax),
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
  if (!step.editor.id && activeItems(step).length >= ASK_LIMIT)
    throw new Error("Five is the limit. Remove one to add another.");
  const old = step.items.find((item) => item.id === step.editor!.id);
  if (step.editor.id && !old) throw new Error("This card changed. Cancel the editor and open it again.");
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
export function reviewStep(step: AskStep): AskStep {
  if (step.editor || Object.keys(step.answerEdits).length || step.composer.trim() || step.pendingLink.trim())
    throw new Error("Keep or cancel unfinished changes before continuing.");
  if (step.items.some((item) => item.decision === "pencil"))
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
export function stepText(step: AskStep): string {
  return [
    ...step.turns.map((turn) => `${turn.prompt}\n${turn.text}`),
    step.composer,
    ...Object.values(step.answerEdits),
    step.pendingLink,
    ...step.links,
    ...step.attachments.map((file) => `File kept locally: ${file.name}`),
    ...step.items.map((item) => `${item.decision}: ${JSON.stringify(item.value)}`),
    step.editor ? `Unfinished card: ${JSON.stringify(step.editor.form)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
export function addStepFiles(step: AskStep, attachments: Attachment[]): AskStep {
  return changeStep(step, { attachments: [...step.attachments, ...attachments] }, true);
}
