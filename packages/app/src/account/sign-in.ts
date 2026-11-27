import { beginUsage, rememberSignInUsage, reportUsage, takeSignInUsage } from "../usage.ts";
import { signInResults, type SignInResult } from "@weave/api/account-contract";
import type { DraftController } from "../describe/controller.ts";
import { AccountFailure } from "./client.ts";

/** Do not leave this tab until every device edit is durable, including during the request. */
export async function continueToCertified(
  controller: DraftController,
  returnTo: string,
  start: (returnTo: string) => Promise<Record<string, unknown>>,
  navigate: (target: string) => void,
): Promise<void> {
  const attempt = beginUsage("sign-in-started");
  try {
    const before = controller.getSnapshot().draft;
    const check = () => {
      const current = controller.getSnapshot();
      if (!current.ready || current.draft !== before || !["saved", "none"].includes(current.storage))
        throw new Error("Your latest changes need to be stored on this device before sign-in. Keep this tab open and try device storage again.");
    };
    await controller.settled();
    check();
    const result = await start(returnTo);
    if (typeof result.redirect !== "string") throw new AccountFailure("sign_in_unavailable");
    const url = new URL(result.redirect);
    if (url.username || url.password ||
        (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))))
      throw new AccountFailure("sign_in_unavailable");
    check();
    reportUsage(attempt, "sign-in-handoff");
    rememberSignInUsage(attempt);
    navigate(url.href);
  } catch (error) {
    if (attempt) takeSignInUsage(attempt.id);
    reportUsage(attempt, "sign-in-start-failed");
    throw error;
  }
}
const returnMessages: Record<SignInResult, string> = {
  "signed-in": "You are signed in. Choose Save or Load when you are ready. Your device draft is unchanged.",
  cancelled: "Sign-in was cancelled. Your device draft is still here. You can try Certified again.",
  expired: "Certified sign-in took too long and expired. Your device draft is still here. Sign in again.",
  failed: "Certified sign-in could not finish. Your device draft is still here. Try again.",
};
/** The callback's marker on the task's address. Anything else in the address is not a sign-in return. */
export const isSignInReturn = (result: string | null): result is SignInResult =>
  (signInResults as readonly (string | null)[]).includes(result);
export const signInReturnMessage = (result: string | null): string => isSignInReturn(result) ? returnMessages[result] : "";
/** Every return except a finished sign-in leaves the person signed out, with sign-in offered again. */
export const signInReturnFailed = (result: string | null): boolean => isSignInReturn(result) && result !== "signed-in";
/**
 * Which account dialog, if any, opens when the person comes back from Certified. One who left from
 * the dialog while saving comes back to it. A sign-in from the app bar or a page comes back to the
 * page alone, unless it did not finish: then the sign-in dialog opens and says why. A page that
 * shows the account itself, such as Settings, says all of this in place.
 */
export function doorOnReturn(result: string | null, leftWhileSaving: boolean, accountPage: boolean): "keep" | "sign-in" | null {
  if (!isSignInReturn(result) || accountPage) return null;
  if (leftWhileSaving) return "keep";
  return signInReturnFailed(result) ? "sign-in" : null;
}

/**
 * What the account dialog shows for the card on this device. Nothing is saved privately any more
 * (DL-155), so the dialog is the sign-in offer, or the account itself for someone signed in. A card
 * that belongs to another account is said to be theirs and is never offered (DL-055), which matters
 * most on a shared device.
 */
export function doorShows(intent: "keep" | "sign-in" | "certified", signedIn: boolean, setAside: boolean): "another-accounts-card" | "sign-in" {
  return signedIn && intent === "keep" && setAside ? "another-accounts-card" : "sign-in";
}
