import { AccountFailure, type AccountState } from "./client.ts";

/**
 * How a session ended: the person pressed Sign Out in this tab, or it ended without that, because
 * renewal was refused, the session lapsed, or another tab signed out.
 */
export type SessionEnding = "signed_out" | "ended";

/** Shown when a session ends without this tab's Sign Out. Sign Out keeps its own message in sign-out.ts. */
export const SESSION_ENDED_NOTICE = "You were signed out. Your card is still here.";

export const sessionRefused = (error: unknown) => error instanceof AccountFailure && error.code === "sign_in_required";

/**
 * What a refusal from a matching or project endpoint means, once `/api/account` has been asked.
 * - `retry`: the session is still there (its access token had lapsed, and asking renewed it), so run the request again.
 * - `ended`: the session ended, and the account session has already cleared the screen and noted why.
 * - `unconfirmed`: the session could not be checked, or it was renewed and the request was refused again.
 *   The screen keeps the person signed in and shows `error`.
 */
export type RefusalOutcome =
  | { readonly outcome: "retry" }
  | { readonly outcome: "ended" }
  | { readonly outcome: "unconfirmed"; readonly error: unknown };

/**
 * Matching and project endpoints read the access cookie only, and that lapses within the hour while
 * the session itself still renews. Only `/api/account` renews it, so a refusal from them is not proof
 * that the session ended. `confirm` asks `/api/account`. `retried` says this request was already run
 * again after a renewal, so a second refusal is not retried, and nothing loops.
 */
export async function confirmRefusal(
  confirm: () => Promise<AccountState>,
  owner: string,
  retried: boolean,
): Promise<RefusalOutcome> {
  let state: AccountState;
  try {
    state = await confirm();
  } catch (error) {
    return sessionRefused(error) ? { outcome: "ended" } : { outcome: "unconfirmed", error };
  }
  if (!state.available) return { outcome: "unconfirmed", error: new AccountFailure("account_unavailable") };
  // Another account in its place ended this one's session here too; the screen already shows the new one.
  if (state.user?.id !== owner) return { outcome: "ended" };
  return retried ? { outcome: "unconfirmed", error: new AccountFailure("account_unavailable") } : { outcome: "retry" };
}

/**
 * Runs a request to a matching or project endpoint. A refusal for want of a session is confirmed
 * through `/api/account`, and the request runs once more when the session was only renewed. What
 * still fails is thrown: `sign_in_required` only when the session really ended, and otherwise the
 * reason the session could not be confirmed.
 */
export async function withConfirmedSession<T>(
  run: () => Promise<T>,
  confirm: () => Promise<AccountState>,
  owner: string,
): Promise<T> {
  let retried = false;
  for (;;) {
    try {
      return await run();
    } catch (error) {
      if (!sessionRefused(error)) throw error;
      const check = await confirmRefusal(confirm, owner, retried);
      if (check.outcome === "ended") throw error;
      if (check.outcome === "unconfirmed") throw check.error;
      retried = true;
    }
  }
}

/** A refusal this soon after a retry is shown rather than retried again. */
const RETRY_WINDOW_MS = 60_000;

/**
 * For a page that hears of refusals after the fact, from parts that ran their own requests. It
 * remembers when it last reloaded after a renewal, so a refusal that keeps coming back is shown, not looped.
 */
export class RefusalRetries {
  private last = Number.NEGATIVE_INFINITY;
  private now: () => number;
  constructor(now: () => number = Date.now) {
    this.now = now;
  }
  /** Whether a retry ran so recently that another refusal should not be retried. */
  recent = () => this.now() - this.last < RETRY_WINDOW_MS;
  retrying = () => {
    this.last = this.now();
  };
}

/**
 * Where the ended-session notice shows: on the page the person was on when the session ended, until
 * they sign in again or move to another page. `endedOn` is that page, kept by the caller across pages.
 * Sign Out says what happened in its own place, so a signed-out ending shows nothing here.
 */
export function sessionEndedNotice(ending: SessionEnding | null, endedOn: string | null, pathname: string) {
  return {
    text: ending === "ended" && (endedOn === null || endedOn === pathname) ? SESSION_ENDED_NOTICE : "",
    /** The page the ending belongs to, once it is known. */
    endedOn: ending === null ? null : endedOn ?? pathname,
    /** The person has moved on from the page where it ended. */
    acknowledge: ending !== null && endedOn !== null && endedOn !== pathname,
  };
}
