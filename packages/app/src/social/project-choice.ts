/** Where an account's choice of Certified project for a card is kept on this device. */
export function projectChoiceKey(owner: string, draftId: string): string {
  return `weave-project-choice/${owner}/${draftId}`;
}

const CHOICE = /^weave-project-choice\/([^/]+)\/(.+)$/u;

/** What a choice needs of the storage it is kept in. Its keys can be listed, which is how a card's choosers are read. */
export type ChoiceStorage = Pick<Storage, "length" | "key" | "getItem" | "setItem">;

/**
 * The accounts that chose a Certified project for this card on this device. A card opened from an
 * account's project belongs to that account even before anyone saves it (DL-055).
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
 * Brings across the choices a tab kept for itself alone, as builds before this one did, so a card
 * linked in a tab that is still open stays linked. A choice already kept on the device is left as
 * it is. The tab's own copy stays too: an older build in that tab still reads it.
 */
export function keepSessionChoices(session: ChoiceStorage | undefined, device: ChoiceStorage | undefined): void {
  if (!session || !device) return;
  try {
    for (let index = 0; index < session.length; index++) {
      const key = session.key(index);
      if (!key || !CHOICE.test(key) || device.getItem(key) !== null) continue;
      const uri = session.getItem(key);
      if (uri) device.setItem(key, uri);
    }
  } catch {
    /* A choice that could not be copied is asked for again; nothing else depends on it. */
  }
}

let broughtAcross = false;

/**
 * This device's storage for project choices. A choice outlives the tab it was made in: a card
 * linked to a Certified project is still linked in a new tab, after the app is closed and after
 * signing in again. It is a note of what the person chose and never grants access: the server
 * checks every project on each command. Where the browser refuses storage there is none, and a
 * tab then remembers its own choice only while it is open.
 */
export function choiceStorage(): Storage | undefined {
  try {
    const device = window.localStorage;
    if (!broughtAcross) {
      broughtAcross = true;
      keepSessionChoices(window.sessionStorage, device);
    }
    return device;
  } catch {
    return undefined;
  }
}

/** The choosers of a card, read from this device's own storage. Where storage is blocked or absent, nobody has chosen. */
export function deviceChoosers(draftId: string): string[] {
  return projectChoosers(choiceStorage(), draftId);
}
