/** Where an account's choice of Certified project for a card is kept on this device. */
export function projectChoiceKey(owner: string, draftId: string): string {
  return `weave-project-choice/${owner}/${draftId}`;
}

const CHOICE = /^weave-project-choice\/([^/]+)\/(.+)$/u;

/**
 * The accounts that chose a Certified project for this card on this device. A card opened from an
 * account's project belongs to that account even before anyone saves it (DL-055). Storage whose
 * keys cannot be listed names nobody, so the card stays with whoever uses the device.
 */
export function projectChoosers(storage: Pick<Storage, "length" | "key"> | undefined, draftId: string): string[] {
  if (!storage) return [];
  const choosers: string[] = [];
  try {
    for (let index = 0; index < storage.length; index++) {
      const match = CHOICE.exec(storage.key(index) ?? "");
      if (match?.[1] && match[2] === draftId) choosers.push(match[1]);
    }
  } catch {
    return [];
  }
  return choosers;
}

/** The Certified project this account chose for a card on this device, or null when it chose none. */
export function chosenProjectUri(
  storage: Pick<Storage, "getItem"> | undefined, owner: string | null | undefined, draftId: string,
): string | null {
  if (!storage || !owner) return null;
  try {
    return storage.getItem(projectChoiceKey(owner, draftId));
  } catch {
    return null;
  }
}

/**
 * This device's storage for project choices (DL-119). A choice outlives the tab it was made in: a
 * card linked to a Certified project is still linked in a new tab, after the app is closed and
 * after signing in again. It is a note of what the person chose and never grants access: the
 * server checks every project on each command. Where the browser refuses storage there is none,
 * and a tab then remembers its own choice only while it is open.
 *
 * Only a link the person made is kept here. What an earlier build kept for a tab alone is not
 * brought across: it cannot be told apart from a team workspace that tab merely opened, and a
 * second account's entry for the same card would lift the card's set-aside. A card linked by an
 * earlier build is linked once more from its own page.
 */
export function choiceStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/** The choosers of a card, read from this device's own storage. Where storage is blocked or absent, nobody has chosen. */
export function deviceChoosers(draftId: string): string[] {
  return projectChoosers(choiceStorage(), draftId);
}
