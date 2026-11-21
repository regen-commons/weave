import { AccountFailure, accountMessage, type AccountState } from "./client.ts";
import { sessionRefused } from "./session-end.ts";

export interface ActionFailure {
  /** What the account section says in its own place. Empty when the page's notice already says it. */
  readonly message: string;
  /** The account behind the list may have changed, so selections and loaded pages are dropped. */
  readonly reset: boolean;
}

/**
 * Settles a failed account action (save, load, delete) in the account section. `/api/account` renews
 * the session before it answers, so `sign_in_required` from it means the session ended: the screen is
 * cleared and the page's notice says so, once (SessionEndedNotice). After `account_changed` the
 * session is checked again. That check clears the screen itself when the session ended; any other
 * failure, such as being offline, leaves the person signed in and says what went wrong.
 */
export async function settleActionFailure(
  error: unknown,
  { refresh, clear }: { refresh(): Promise<AccountState>; clear(): void },
): Promise<ActionFailure> {
  if (sessionRefused(error)) {
    clear();
    return { message: "", reset: false };
  }
  if (!(error instanceof AccountFailure && error.code === "account_changed"))
    return { message: accountMessage(error), reset: false };
  try {
    await refresh();
  } catch (failure) {
    return { message: sessionRefused(failure) ? "" : accountMessage(failure), reset: true };
  }
  return { message: accountMessage(error), reset: true };
}
