/**
 * Where each page of this tab was scrolled, kept for the tab's session, so a page that is reloaded,
 * or that a phone dropped in the background and loads again, comes back where it was left
 * (DL-092). It holds a history entry's random key and a number: no address and no words.
 */
export const SCROLL_KEY = "weave.scroll";
/** How many pages are remembered. The ones left longest ago go first. */
export const SCROLL_LIMIT = 50;

/** Notes where a page is, as the page most recently left. */
export function remember(positions: Map<string, number>, key: string, top: number): void {
  positions.delete(key);
  positions.set(key, top);
}

/** What the tab kept, oldest first. Anything that is not a key and a place on a page is left out. */
export function readPositions(storage: Pick<Storage, "getItem">): Map<string, number> {
  const positions = new Map<string, number>();
  let kept: unknown;
  try {
    kept = JSON.parse(storage.getItem(SCROLL_KEY) ?? "null");
  } catch {
    return positions;
  }
  if (!Array.isArray(kept)) return positions;
  for (const pair of kept.slice(-SCROLL_LIMIT) as unknown[]) {
    if (!Array.isArray(pair)) continue;
    const [key, top]: unknown[] = pair;
    if (typeof key === "string" && typeof top === "number" && Number.isFinite(top) && top >= 0) positions.set(key, top);
  }
  return positions;
}

/** Keeps the newest places. A store that is full or closed only costs the place on the page. */
export function writePositions(storage: Pick<Storage, "setItem">, positions: ReadonlyMap<string, number>): void {
  try {
    storage.setItem(SCROLL_KEY, JSON.stringify([...positions].slice(-SCROLL_LIMIT)));
  } catch {
    // Nothing else depends on it.
  }
}

/** A load that returns to a page already in this tab's history: a reload, or Back and Forward from another site. */
export const resumesPage = (type: string | undefined): boolean => type === "reload" || type === "back_forward";
