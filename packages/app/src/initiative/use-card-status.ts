import { useAccount } from "../account/context.tsx";
import { accountKey } from "../account/document.ts";
import { useDraft } from "../describe/use-draft.ts";
import { useSocialFixture } from "../social/context.tsx";
import { cardStatus, type AccountSave, type CardStatus } from "./status.ts";

/** The card's status line from the device draft, the live account and, in development, the example account. */
export function useCardStatus(): CardStatus {
  const { draft, storage } = useDraft();
  const account = useAccount();
  const social = useSocialFixture();
  const saved = draft.account.saved;
  const user = account.state?.user;
  const held: AccountSave = !user
    ? "signed-out"
    : saved?.owner !== user.id || account.savedCheck !== "present"
      ? "none"
      : saved.contentKey === accountKey(draft)
        ? "current"
        : "changed";
  const result = cardStatus(draft, storage, import.meta.env.DEV && social ? social.state : null, held);
  if (!social && account.savedCheck === "changed") return { ...result, save: null, line: "Your saved copy changed elsewhere. Open its latest version from Your initiatives. Your device draft is still here." };
  if (!social && (account.savedCheck === "checking" || account.savedCheck === "unavailable"))
    return { ...result, save: null, line: account.savedCheck === "checking" ? "Checking your saved copy." : "Your saved copy could not be checked. Your device draft is still here." };
  return !social && account.missingRecord ? { ...result, line: "This card is no longer saved in your account. Your device copy is still here. Save it again when ready." } : result;
}
