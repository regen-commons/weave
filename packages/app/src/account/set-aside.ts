import { useDraft } from "../describe/use-draft.ts";
import { hasDraft } from "../describe/view.ts";
import { useAccount } from "./context.tsx";
import { belongsToAnotherAccount } from "./document.ts";
import { deviceChoosers } from "../social/project-choice.ts";

/**
 * Whether the card on this device is set aside: it belongs to another account than the one signed
 * in, so it stays on the device but out of this account's lists, pages and suggestions (DL-055).
 */
export function useSetAside(): boolean {
  const { draft } = useDraft();
  const account = useAccount();
  return hasDraft(draft) && belongsToAnotherAccount(draft, account.state?.user?.id, deviceChoosers(draft.id));
}
