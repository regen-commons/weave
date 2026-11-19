import { useSetAside } from "../account/set-aside.ts";
import { describeDoor } from "../describe/start-new.ts";
import { useDraft } from "../describe/use-draft.ts";
import { hasDraft } from "../describe/view.ts";
import { cardRoute } from "../initiative/status.ts";

/**
 * The door on a page that is not fitted to an initiative yet: Continue for this person's card in
 * progress, otherwise a new card. Another account's card is not this person's to go on with (DL-055).
 */
export function useDescribeDoor(): { href: string; label: string; started: boolean } {
  const { draft } = useDraft();
  const setAside = useSetAside();
  const started = hasDraft(draft) && !setAside;
  return { ...describeDoor(started, started ? cardRoute(draft) : "initiative"), started };
}
