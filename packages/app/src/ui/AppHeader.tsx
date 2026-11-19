import { useEffect, useRef, useState } from "react";
import { useSocialFixture } from "../social/context.tsx";
import { AccountMenu } from "../account/AccountMenu.tsx";
import { useAccount } from "../account/context.tsx";
import { useAccountDoor } from "../account/door.tsx";
import { SignInButton } from "../account/SignInButton.tsx";
import type { SaveStatus } from "../initiative/header-status.ts";
import { Link } from "../router.tsx";
import { matchRoute, pathTo, type BackTarget } from "../routes.ts";
import { BackLink } from "./BackLink.tsx";
import { tabPress } from "./BottomNav.tsx";
import { Icon } from "./Icon.tsx";
import { Logo } from "./Logo.tsx";
import { SECTIONS } from "./sections.ts";
import { ThemeSwitch } from "./ThemeSwitch.tsx";
/** Short enough to sit beside the logo on a phone. The card's own page says the rest. */
const STATUS_TEXT: Record<Exclude<SaveStatus, "none">, string> = {
  account: "Saved",
  memory: "Not saved",
};
export function AppHeader({
  pathname,
  sections,
  status,
  back,
}: {
  pathname: string;
  sections: boolean;
  /** How the card is saved, on the pages where it is worked on; "none" everywhere else. */
  status: SaveStatus;
  /** On a page that is not a tab, the way back. */
  back: BackTarget | null;
}) {
  const openAccount = useAccountDoor();
  const { state } = useAccount();
  const social = useSocialFixture();
  const signedIn = !!state?.user || (import.meta.env.DEV && !!social?.state.identity);
  const route = matchRoute(pathname);
  const current = route?.section;
  // Signing out from the account's menu removes the menu, so Sign in takes the focus it held and
  // the header says what happened to people who cannot see it change.
  const signIn = useRef<HTMLButtonElement>(null);
  const [signedOut, setSignedOut] = useState("");
  useEffect(() => {
    if (signedOut && !signedIn) signIn.current?.focus();
    if (signedOut && signedIn) setSignedOut("");
  }, [signedOut, signedIn]);
  return (
    <header className="rc-app-header">
      <div className="rc-app-header-lead">
        {/* On a phone the way back takes the logo's place, where a native app bar keeps it. A wide
            screen keeps the logo and shows breadcrumbs above the page's title instead (DL-080). */}
        {back && <BackLink target={back} />}
        <Logo current={current === "home"} from={back ? "wide" : undefined} />
        {sections && (
          <nav className="rc-app-nav" aria-label="Main">
            {SECTIONS.filter((section) => section.header !== false).map((section) => (
              <Link
                key={section.route}
                href={pathTo(section.route)}
                aria-current={section.route === current ? "page" : undefined}
                onClick={(event) => tabPress(event, section.route, pathname)}
              >
                {section.label}
              </Link>
            ))}
          </nav>
        )}
      </div>
      <div className="rc-app-header-state">
        {status !== "none" && (
          <p className="rc-save-status" data-state={status}>
            <Icon name={status === "account" ? "done" : "device"} size="sm" />
            <span>{STATUS_TEXT[status]}</span>
          </p>
        )}
        <ThemeSwitch />
        {/* One press goes to Certified, as every other Sign in does. A failure opens the account
            dialog, which says what went wrong and offers the same step again. */}
        {!signedIn && (
          <SignInButton ref={signIn} variant="secondary" size="sm" onProblem={(message) => openAccount("sign-in", message)}>
            Sign In
          </SignInButton>
        )}
        {/* A wide screen gives a signed-in person the account's menu, which holds Settings; signed
            out, Settings is in the footer (DL-070). A phone's bar has neither that nor a gear: its
            You tab holds the account, the theme and the way to Settings (DL-086). */}
        {signedIn && <AccountMenu current={route?.name} onSignedOut={setSignedOut} />}
        <p className="rc-visually-hidden" role="status">
          {signedIn ? "" : signedOut}
        </p>
      </div>
    </header>
  );
}
