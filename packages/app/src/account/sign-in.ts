import type { DraftController } from "../describe/controller.ts";
import { AccountFailure } from "./client.ts";

/** Do not leave this tab until every device edit is durable, including during the request. */
export async function continueToCertified(
  controller: DraftController,
  returnTo: string,
  start: (returnTo: string) => Promise<Record<string, unknown>>,
  navigate: (target: string) => void,
): Promise<void> {
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
  navigate(url.href);
}
export function signInReturnMessage(result: string | null): string {
  return result === "signed-in" ? "You are signed in. Choose Save or Load when you are ready. Your device draft is unchanged." :
    result === "cancelled" ? "Sign-in was cancelled. Your device draft is still here. You can try Certified again." :
    result === "failed" ? "Certified sign-in could not finish. Your device draft is still here. Try again." : "";
}
