import { SCOPES, STATUS, TERMS, URGENCY, type AskFields, type AskKind } from "./contracts.ts";
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
