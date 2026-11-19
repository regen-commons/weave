import { useState, type ReactNode, type Ref } from "react";
import { useDraft } from "../describe/use-draft.ts";
import { useSocialFixture } from "../social/context.tsx";
import { accountMessage, accountRequest } from "./client.ts";
import { useAccount } from "./context.tsx";
import { useAccountDoor } from "./door.tsx";
import { continueToCertified } from "./sign-in.ts";

/**
 * Sign in with one press, from the header or from a page that has already said why: it goes to
 * Certified and comes back to the same page, with no dialog in between. Where sign-in cannot start
 * from here, because account access has not answered or is switched off, the account door opens and
 * says so. The example world opens its own door, which stands in for the trip to Certified.
 *
 * While the press is carried out the button keeps its label and its width and shows a spinner in the
 * label's place, so nothing beside it moves. A failure is said under the button, or handed to
 * `onProblem` where there is no room under it, as in the header.
 */
export function SignInButton({
  variant = "primary",
  size,
  ref,
  onProblem,
  children = "Sign in with Certified",
}: {
  variant?: "primary" | "secondary";
  size?: "sm";
  ref?: Ref<HTMLButtonElement>;
  /** Takes the failure in place of the line under the button. */
  onProblem?: (message: string) => void;
  children?: ReactNode;
}) {
  const { state } = useAccount();
  const { controller, ready } = useDraft();
  const example = useSocialFixture();
  const openDoor = useAccountDoor();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  async function signIn() {
    if (busy) return;
    if (import.meta.env.DEV && example) return openDoor("certified");
    if (!state?.available) return openDoor("sign-in");
    setBusy(true);
    setProblem("");
    try {
      await continueToCertified(
        controller,
        window.location.pathname,
        (returnTo) => accountRequest("", { returnTo }, "/api/sign-in"),
        (target) => window.location.assign(target),
      );
    } catch (error) {
      const message = accountMessage(error);
      if (onProblem) onProblem(message);
      else setProblem(message);
      setBusy(false);
    }
  }
  return (
    <>
      {/* Busy, it stays enabled to the eye and declines a second press, so it does not grey out mid-press. */}
      <button
        ref={ref}
        className="rc-button"
        data-variant={variant}
        data-size={size}
        data-busy="keep"
        type="button"
        aria-busy={busy || undefined}
        aria-disabled={busy || undefined}
        disabled={!ready}
        onClick={() => void signIn()}
      >
        <span>{children}</span>
        {busy && <span className="rc-spinner" aria-hidden="true" />}
      </button>
      <span className="rc-visually-hidden" role="status">
        {busy ? "Opening Certified" : ""}
      </span>
      {problem && (
        <p className="rc-notice" data-tone="warning" role="alert">
          {problem}
        </p>
      )}
    </>
  );
}
