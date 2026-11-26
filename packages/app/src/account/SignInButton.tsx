import { useEffect, useState, type ReactNode, type Ref } from "react";
import { useDraft } from "../describe/use-draft.ts";
import { useSocialFixture } from "../social/context.tsx";
import { accountMessage, accountRequest } from "./client.ts";
import { useAccount } from "./context.tsx";
import { useAccountDoor } from "./door.tsx";
import { continueToCertified } from "./sign-in.ts";
import { warmProjectConsent, warmSignIn, warmSignInOnIntent } from "./warm.ts";
import { expectProjectAccess, forgetProjectAccess } from "../initiative/consent-chain.ts";
import { pathTo } from "../routes.ts";

/**
 * Sign in with one press, from the header or from a page that has already said why: it goes to
 * Certified and comes back to the same page, with no dialog in between. Where sign-in cannot start
 * from here, because account access has not answered or is switched off, the account door opens and
 * says so. The example world opens its own door, which stands in for the trip to Certified.
 *
 * While the press is carried out the button keeps its label and its width and shows a spinner in the
 * label's place, so nothing beside it moves. A failure is said under the button, or handed to
 * `onProblem` where there is no room under it, as in the header.
 *
 * While the session has not been checked and an account is expected, the button is not drawn: a
 * person who is signed in is not offered sign-in for the moment the check takes. It appears as soon
 * as the check says nobody is signed in, or cannot be made.
 *
 * Shown to someone signed out, it readies sign-in on the server (`warm.ts`), and again when the
 * pointer or the keyboard reaches it after a short wait, so the press meets neither a cold start nor
 * a stale nonce at Certified.
 */
export function SignInButton({
  variant = "primary",
  size,
  ref,
  onProblem,
  children = "Sign In With Certified",
}: {
  variant?: "primary" | "secondary";
  size?: "sm";
  ref?: Ref<HTMLButtonElement>;
  /** Takes the failure in place of the line under the button. */
  onProblem?: (message: string) => void;
  children?: ReactNode;
}) {
  const { state, expectsAccount } = useAccount();
  const { controller, ready } = useDraft();
  const example = useSocialFixture();
  const openDoor = useAccountDoor();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  // Only where a press would go to Certified: accounts on, nobody signed in, and not the example world.
  const offered = !!state?.available && !state.user && !(import.meta.env.DEV && example);
  useEffect(() => {
    if (!offered) return;
    warmSignIn();
    // Every sign-in goes on to project access, but that function is readied only where projects are the
    // point, so a signed-out visit to any other page wakes no second function. The account fixture
    // answers it with a stand-in error, so not there.
    if (!state?.fixture && window.location.pathname === pathTo("your-initiatives")) warmProjectConsent();
  }, [offered, state?.fixture]);
  const warm = offered ? warmSignInOnIntent : undefined;
  async function signIn() {
    if (busy) return;
    if (import.meta.env.DEV && example) return openDoor("certified");
    if (!state?.available) return openDoor("sign-in");
    setBusy(true);
    setProblem("");
    const tab = () => window.sessionStorage;
    // Every Sign In goes on to project access from the page it comes back to (the user's choice,
    // 25 November 2026, DL-137). Only a sign-in that began at Save does not, and that is the door's.
    expectProjectAccess(tab, window.location.pathname);
    try {
      await continueToCertified(
        controller,
        window.location.pathname,
        (returnTo) => accountRequest("", { returnTo }, "/api/sign-in"),
        (target) => window.location.assign(target),
      );
    } catch (error) {
      forgetProjectAccess(tab);
      const message = accountMessage(error);
      if (onProblem) onProblem(message);
      else setProblem(message);
      setBusy(false);
    }
  }
  if (expectsAccount && !(import.meta.env.DEV && example)) return null;
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
        onPointerEnter={warm}
        onFocus={warm}
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
