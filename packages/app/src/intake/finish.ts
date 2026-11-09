import { amountText } from "./presentation.ts";
import { CAPITALS } from "../capitals.ts";
import type { DeviceDraft } from "../describe/contracts.ts";
import { SCOPES, STATUS, TERMS, type AskFields, type AskKind } from "./contracts.ts";
import { reviewStep } from "./state.ts";
export function intakeComplete(draft: DeviceDraft): boolean {
  try {
    return (
      !!draft.confirmed &&
      draft.proposalVersion === draft.inputVersion &&
      (["needs", "offers"] as const).every(
        (kind) =>
          draft[kind].reviewedVersion === draft[kind].inputVersion &&
          reviewStep(draft[kind]).reviewedVersion === draft[kind].inputVersion,
      )
    );
  } catch {
    return false;
  }
}
export function keptAsks(draft: DeviceDraft, kind: AskKind): AskFields[] {
  return draft[kind].items.filter((item) => item.decision === "kept").map((item) => item.value);
}
/** A person's checked card, not a backup of their source conversation or file bytes. */
export function cardText(draft: DeviceDraft): string {
  if (!intakeComplete(draft))
    throw new Error("Check your initiative, needs and offers before copying the finished card.");
  const card = draft.confirmed!;
  const section = (kind: AskKind) =>
    [
      kind === "needs" ? "Needs" : "Offers",
      ...keptAsks(draft, kind).map((value) =>
        [
          value.title,
          value.description,
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
          .join("\n"),
      ),
    ].join("\n\n");
  return [
    card.name,
    card.isGlobal ? "Global" : card.locations.join("; "),
    card.description,
    ...card.links,
    section("needs"),
    section("offers"),
    "Checked on this device. Not shared.",
  ]
    .filter(Boolean)
    .join("\n\n");
}
