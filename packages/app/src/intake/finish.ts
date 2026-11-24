import { askText } from "./presentation.ts";
import type { DeviceDraft } from "../describe/contracts.ts";
import type { AskFields, AskKind } from "./contracts.ts";
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
export function keptAsks(draft: Pick<DeviceDraft, AskKind>, kind: AskKind): AskFields[] {
  return draft[kind].items.filter((item) => item.decision === "kept").map((item) => item.value);
}
/**
 * Kept needs and offers that have no kind of support yet. They can stay on this device;
 * sharing one for matching needs at least one kind.
 */
export function asksWithoutKind(draft: DeviceDraft): { kind: AskKind; id: string; title: string }[] {
  return (["needs", "offers"] as const).flatMap((kind) =>
    draft[kind].items
      .filter((item) => item.decision === "kept" && item.value.capitalForms.length === 0)
      .map((item) => ({ kind, id: item.id, title: item.value.title })),
  );
}
/** A person's checked card, not a backup of their source conversation or file bytes. */
export function cardText(draft: DeviceDraft): string {
  if (!intakeComplete(draft))
    throw new Error("Check your initiative, needs and offers before copying the finished card.");
  const card = draft.confirmed!;
  const section = (kind: AskKind) =>
    [
      kind === "needs" ? "Needs" : "Offers",
      ...keptAsks(draft, kind).map(askText),
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
