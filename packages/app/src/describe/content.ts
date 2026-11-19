import { newDraft, type DeviceDraft } from "./contracts.ts";

/**
 * The keys that are only bookkeeping: when and how often a draft was written, its mark, and the
 * note of how the last fill ran. Everything else is content. That includes the card binding
 * (saved, pending, retired), because dropping a version that differs only there would leave a
 * Save aimed at a card the other tab deleted, and `runs`, the record of what the assistant did,
 * which the person can read in Settings.
 */
const BOOKKEEPING = new Set(["version", "revision", "inputVersion", "updatedAt", "mark", "proposalVersion", "lastBuild"]);
/** A value as plain data in one order: keys sorted, absent and undefined alike, a file as its name, type and size. */
function canonical(value: unknown): unknown {
  if (value instanceof Blob) return { blob: value.size, type: value.type };
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
        .sort()
        .map((key) => [key, canonical((value as Record<string, unknown>)[key])]),
    );
  return value;
}
/**
 * The same words, files, card binding and assistant record, whatever the bookkeeping says. It does
 * not depend on the order of keys, which differs between the two builds' stored drafts. `also`
 * names more keys to leave out of the comparison.
 */
export function sameContent(a: DeviceDraft, b: DeviceDraft, also: readonly string[] = []): boolean {
  const skipped = new Set([...BOOKKEEPING, ...also]);
  const content = (draft: DeviceDraft) =>
    JSON.stringify(canonical(Object.fromEntries(Object.entries(draft).filter(([key]) => !skipped.has(key)))));
  return content(a) === content(b);
}

/**
 * True for a card with nothing of the person's in it: no words, files, choices, card binding or
 * assistant record, exactly as a new card starts. Its ID and bookkeeping do not count.
 */
export function blankCard(draft: DeviceDraft): boolean {
  return sameContent(draft, { ...newDraft(), id: draft.id });
}
