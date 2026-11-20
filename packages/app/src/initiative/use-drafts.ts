import { useAccount } from "../account/context.tsx";
import { belongsToAnotherAccount } from "../account/document.ts";
import type { DeviceDraft } from "../describe/contracts.ts";
import { useDraft } from "../describe/use-draft.ts";
import { useSocial } from "../social/context.tsx";
import { choiceStorage, projectChoosers } from "../social/project-choice.ts";
import { deviceDrafts } from "./list.ts";

/**
 * The initiatives in this browser that are this person's to open: every draft with words in it,
 * the tab's own as it reads now, without a card that belongs to another account (DL-055). Your
 * Initiatives lists them, and Funding offers them to compare with.
 */
export function useListedDrafts(): DeviceDraft[] {
  const { draft, drafts } = useDraft();
  const accountId = useAccount().state?.user?.id;
  const choices = choiceStorage();
  return deviceDrafts(draft, drafts, (item) => belongsToAnotherAccount(item, accountId, projectChoosers(choices, item.id)));
}

/**
 * Opens one of this browser's initiatives in this tab, in place of the one it was on. Both stay
 * stored. Throws, and changes nothing, when the tab's latest words are not stored yet or the
 * initiative is no longer on the device.
 */
export function useOpenDraft(): (id: string) => Promise<void> {
  const { controller } = useDraft();
  const social = useSocial();
  return async (id) => {
    if (controller.getSnapshot().draft.id === id) return;
    await controller.open(id);
    // The example account's saved and shared state describes one card, so it does not follow another.
    if (social && social.mode !== "live") await social.service.clearCard();
  };
}
