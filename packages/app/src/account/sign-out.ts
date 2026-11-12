import { AccountFailure, accountMessage } from "./client.ts";

export interface SignOutResult {
  readonly failed: boolean;
  /** Whether the screen stopped showing the person as signed in. */
  readonly cleared: boolean;
  /** What happened, in words the person can act on. */
  readonly message: string;
}

/**
 * Ends the session and says what happened. It is the one rule for every place that offers Sign
 * out: the screen stops showing the person as signed in only once sign-out is confirmed, or when
 * the session had already ended. After any other failure they may still be signed in, so they
 * stay shown that way and are told to try again.
 *
 * `end` asks the server to end the session; `clear` drops the identity from the screen.
 */
export async function signOut(end: () => Promise<unknown>, clear: () => void): Promise<SignOutResult> {
  try {
    await end();
    clear();
    return { failed: false, cleared: true, message: "You are signed out. The device draft and its backups are still here." };
  } catch (error) {
    const ended = error instanceof AccountFailure && error.code === "sign_in_required";
    if (ended) clear();
    return { failed: true, cleared: ended, message: accountMessage(error) };
  }
}
