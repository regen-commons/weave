/** Where an account's choice of Certified project for a card is kept in this browser session. */
export function projectChoiceKey(owner: string, draftId: string): string {
  return `weave-project-choice/${owner}/${draftId}`;
}

/**
 * The accounts that chose a Certified project for this card in this browser session. A card opened
 * from an account's project belongs to that account even before anyone saves it (DL-055).
 */
export function projectChoosers(storage: Pick<Storage, "length" | "key"> | undefined, draftId: string): string[] {
  if (!storage) return [];
  const choosers: string[] = [];
  try {
    for (let index = 0; index < storage.length; index++) {
      const match = /^weave-project-choice\/([^/]+)\/(.+)$/u.exec(storage.key(index) ?? "");
      if (match?.[1] && match[2] === draftId) choosers.push(match[1]);
    }
  } catch {
    return [];
  }
  return choosers;
}
