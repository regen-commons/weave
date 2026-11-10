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
    : saved?.owner !== user.id
      ? "none"
      : saved.contentKey === accountKey(draft)
        ? "current"
        : "changed";
  return cardStatus(draft, storage, import.meta.env.DEV && social ? social.state : null, held);
}
