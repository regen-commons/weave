import type { DeviceDraft } from "./contracts.ts";
import type { DraftController } from "./controller.ts";

/**
 * Whether this device's draft held a checked card when it was last open: a flag only, with nothing
 * of the card in it. public/theme-boot.js reads it before the first paint and marks the page
 * (data-checked-card), and a page that changes with the card, such as Funding, shows the room for
 * the state it names until the draft opens, so nothing moves when it does. The draft stays the
 * source of truth: when it opens and says otherwise, the flag is corrected, so a wrong flag costs at
 * most one move, once. It goes with the site's data, and it is cleared whenever the draft has no
 * checked card, as when the card is deleted.
 */
export const CHECKED_HINT_KEY = "weave-checked-card";

type HintStorage = Pick<Storage, "setItem" | "removeItem">;

/** The browser's own storage, or none where it cannot be reached (a private window, a blocked origin). */
function deviceStorage(): HintStorage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

/** A checked card: one the person kept with words about what it does. Funding compares it. */
export const hasCheckedCard = (draft: Pick<DeviceDraft, "confirmed">): boolean => !!draft.confirmed?.description.trim();

function writeCheckedHint(checked: boolean, storage: HintStorage | undefined): void {
  try {
    if (checked) storage?.setItem(CHECKED_HINT_KEY, "1");
    else storage?.removeItem(CHECKED_HINT_KEY);
  } catch {
    // A flag that cannot be written leaves the next first paint to hold the room it guesses, and nothing else.
  }
}

/**
 * Keeps the flag in step with the tab's draft once storage has opened, writing only when it
 * changes. Returns what stops it.
 */
export function keepCheckedHint(controller: DraftController, storage: HintStorage | undefined = deviceStorage()): () => void {
  let last: boolean | null = null;
  const follow = () => {
    const { ready, draft } = controller.getSnapshot();
    if (!ready) return;
    const checked = hasCheckedCard(draft);
    if (checked === last) return;
    last = checked;
    writeCheckedHint(checked, storage);
  };
  follow();
  return controller.subscribe(follow);
}
