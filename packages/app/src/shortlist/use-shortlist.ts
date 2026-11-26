import { useSyncExternalStore } from "react";
import { FUND_SHORTLIST, INITIATIVE_SHORTLIST, type FundItem, type InitiativeItem } from "./items.ts";
import { createShortlistStore, type ShortlistEntry, type ShortlistState, type ShortlistStore } from "./store.ts";

function browserStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** One store per kind for every page in this tab, so a card, a page and the rail never disagree. */
export const fundShortlist = createShortlistStore(browserStorage, FUND_SHORTLIST);
export const initiativeShortlist = createShortlistStore(browserStorage, INITIATIVE_SHORTLIST);

let listening = false;
function listen() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  // Another tab of this browser changed a shortlist.
  window.addEventListener("storage", (event) => {
    for (const store of [fundShortlist, initiativeShortlist] as const)
      if (event.key === store.key || event.key === null) store.reload();
  });
}

const EMPTY = { items: [], kept: true } as const;

function useStore<T extends ShortlistEntry>(store: ShortlistStore<T>) {
  const state: ShortlistState<T> = useSyncExternalStore(
    (listener) => {
      listen();
      return store.subscribe(listener);
    },
    store.current,
    () => EMPTY,
  );
  return { ...state, toggle: store.toggle, remove: store.remove };
}

/** The funds this browser keeps on its shortlist, and their two actions. The build's first view draws it empty. */
export const useFundShortlist = () => useStore<FundItem>(fundShortlist);
/** The initiatives this browser keeps on its shortlist, and their two actions. */
export const useInitiativeShortlist = () => useStore<InitiativeItem>(initiativeShortlist);

/**
 * Whether this visit has already said where a shortlisted record goes. The list says it once, after
 * the first bookmark, then goes back to its count (DL-153).
 */
let told = false;
export function firstAddOfVisit(): boolean {
  if (told) return false;
  told = true;
  return true;
}
