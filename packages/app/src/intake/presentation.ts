import { CAPITALS } from "../capitals.ts";
import { SCOPES, STATUS, TERMS, URGENCY, type AskFields, type AskForm, type AskKind } from "./contracts.ts";
export function askTerms(value: AskFields, kind: AskKind): string {
  const amount = amountText(value.amount);
  return [
    amount,
    value.timeframe || (kind === "needs" && value.urgency ? URGENCY[value.urgency] : ""),
    kind === "offers" ? value.capacity : "",
    SCOPES[value.placeScope],
    value.exchangeTerms.map((term) => TERMS[term]).join(" or "),
    value.status === "open" ? "" : STATUS[value.status],
  ]
    .filter(Boolean)
    .join(", ");
}

export function amountText(amount: AskFields["amount"]): string {
  if (!amount) return "";
  if (amount.min === amount.max) return `${amount.currency} ${amount.min}`;
  if (amount.min === null) return `Up to ${amount.currency} ${amount.max}`;
  if (amount.max === null) return `From ${amount.currency} ${amount.min}`;
  return `${amount.currency} ${amount.min} to ${amount.max}`;
}

/** The details a person added beyond the defaults, so a card stays quiet until there is something to say. */
export function askExtras(value: AskFields, kind: AskKind): string {
  const open = value.exchangeTerms.length === 1 && value.exchangeTerms[0] === "open";
  return [
    amountText(value.amount),
    value.timeframe || (kind === "needs" && value.urgency ? URGENCY[value.urgency] : ""),
    kind === "offers" ? value.capacity : "",
    value.placeScope === "anywhere" ? "" : SCOPES[value.placeScope],
    open ? "" : value.exchangeTerms.map((term) => TERMS[term]).join(" or "),
    value.status === "open" ? "" : STATUS[value.status],
  ]
    .filter(Boolean)
    .join(", ");
}

/**
 * A need or offer as plain lines a person can read and paste: its title, its description where
 * it says more than the title, its kinds of support and every detail that is filled in.
 */
export function askText(value: AskFields): string {
  return [
    value.title,
    value.description !== value.title && value.description,
    CAPITALS.filter((capital) => value.capitalForms.includes(capital.key))
      .map((capital) => capital.title)
      .join(", "),
    amountText(value.amount),
    value.timeframe,
    value.capacity,
    value.purpose,
    value.audience,
    SCOPES[value.placeScope],
    value.exchangeTerms.map((term) => TERMS[term]).join(" or "),
    STATUS[value.status],
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * A need or offer still open in its dialog, as lines labeled the way the dialog labels its fields
 * (ui/AskEditor.tsx), with what is typed exactly as typed and nothing for an empty field.
 */
export function askFormText(form: AskForm, kind: AskKind): string {
  const line = (label: string, value: string) => (value.trim() ? `${label}: ${value.trim()}` : "");
  const need = kind === "needs";
  return [
    line(need ? "What you need" : "What you can offer", form.title),
    line("In a line", form.description),
    line("Kinds of support", CAPITALS.filter((capital) => form.capitalForms.includes(capital.key)).map((capital) => capital.title).join(", ")),
    line("Amount from", form.amountMin),
    line("Amount up to", form.amountMax),
    line("Currency", form.currency),
    line(need ? "When" : "When it is available", form.timeframe),
    line("Timeframe", need && form.urgency ? URGENCY[form.urgency] : ""),
    line("What you would do with it", need ? form.purpose : ""),
    line("How much, how often", need ? "" : form.capacity),
    line("Who it is for", need ? "" : form.audience),
    line("Where", SCOPES[form.placeScope]),
    line("Terms you would accept", form.exchangeTerms.map((term) => TERMS[term]).join(" or ")),
    line("Status", STATUS[form.status]),
  ]
    .filter(Boolean)
    .join("\n");
}
