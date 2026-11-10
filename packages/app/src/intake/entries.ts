import { ASK_LIMIT, CapitalFormSchema, EMPTY_ASK, type AskItem, type AskStep } from "./contracts.ts";
import { suggestKinds } from "./keywords.ts";
import { activeItems, changeStep, fingerprint } from "./state.ts";

type Kind = AskItem["value"]["capitalForms"][number];

/**
 * Adds one need or offer in the person's own words. The title is theirs; the kinds
 * of support are keyword suggestions, so the entry stays in pencil until Continue.
 */
export function addEntry(step: AskStep, words: string): AskStep {
  const text = words.trim().replace(/\s+/gu, " ");
  if (!text) throw new Error("Write a few words first.");
  if (activeItems(step).length >= ASK_LIMIT) throw new Error("Five is the limit. Remove one to add another.");
  const print = fingerprint(text);
  if (activeItems(step).some((item) => item.fingerprint === print))
    throw new Error("That is already on your list.");
  const item: AskItem = {
    id: crypto.randomUUID(),
    sourceKey: null,
    fingerprint: print,
    value: {
      ...EMPTY_ASK,
      // A long entry keeps its opening words as the title, cut between words; the rest stays in the description.
      title: text.length > 140 ? text.slice(0, 140).replace(/\s+\S*$/u, "") : text,
      description: text.length > 140 ? text.slice(0, 600) : null,
      capitalForms: suggestKinds(text),
    },
    decision: "pencil",
    decisionBeforeRemove: null,
  };
  return changeStep(step, { items: [...step.items, item] });
}

/** Adds or removes one kind of support on an entry. An amount belongs to Financial, so it leaves with it. */
export function toggleKind(step: AskStep, id: string, kind: Kind): AskStep {
  const item = step.items.find((item) => item.id === id);
  if (!item || item.decision === "removed") throw new Error("This card is no longer present.");
  const has = item.value.capitalForms.includes(kind);
  const capitalForms = CapitalFormSchema.options.filter((key) =>
    key === kind ? !has : item.value.capitalForms.includes(key),
  );
  const value = {
    ...item.value,
    capitalForms,
    amount: capitalForms.includes("financial") ? item.value.amount : null,
  };
  return changeStep(step, {
    items: step.items.map((current) => (current.id === id ? { ...current, value } : current)),
  });
}

/** Continue confirms every entry still in pencil, so no entry needs its own Keep. */
export function keepPending(step: AskStep): AskStep {
  if (!step.items.some((item) => item.decision === "pencil")) return step;
  return changeStep(step, {
    items: step.items.map((item) =>
      item.decision === "pencil" ? { ...item, decision: "kept" as const } : item,
    ),
  });
}
