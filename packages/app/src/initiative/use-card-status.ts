import { useAccount } from "../account/context.tsx";
import { useDraft } from "../describe/use-draft.ts";
import { useSocialFixture } from "../social/context.tsx";
import { cardStatus, type CardStatus } from "./status.ts";

/** The card's status line from the device draft, the live account and, in development, the example account. */
export function useCardStatus(): CardStatus {
  const { draft, storage } = useDraft();
  const account = useAccount();
  const social = useSocialFixture();
  return cardStatus(draft, storage, import.meta.env.DEV && social ? social.state : null, account.state?.user ? "none" : "signed-out");
}
