import { useEffect, useRef, useState } from "react";
import { useSocialFixture } from "../social/context.tsx";
import { AccountMenu } from "../account/AccountMenu.tsx";
import { useAccount } from "../account/context.tsx";
import { useAccountDoor } from "../account/door.tsx";
import type { SaveStatus } from "../initiative/header-status.ts";
import { Link } from "../router.tsx";
import { matchRoute, pathTo, type BackTarget } from "../routes.ts";
import { BackLink } from "./BackLink.tsx";
import { tabPress } from "./BottomNav.tsx";
import { Icon } from "./Icon.tsx";
import { Logo } from "./Logo.tsx";
import { SECTIONS } from "./sections.ts";
/** Short enough to sit beside the logo on a phone. The card's own page says the rest. */
const STATUS_TEXT: Record<Exclude<SaveStatus, "none">, string> = {
  account: "Saved",
  device: "On this device",
  saving: "Saving",
  memory: "Not saved",
  conflict: "Changed elsewhere",
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
        {/* The way back takes the logo's place, where a native app bar keeps it. */}
        {back ? <BackLink target={back} /> : <Logo current={current === "home"} />}
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
        {!signedIn && (
          <button
            ref={signIn}
            className="rc-button"
            data-variant="secondary"
            data-size="sm"
            type="button"
            onClick={() => openAccount("sign-in")}
          >
            Sign in
          </button>
        )}
        {/* On a phone Settings is a gear on every page, read without a word (DL-059), and the You tab
            holds the account. A wide screen gives a signed-in person the account's menu in the
            gear's place; it holds Settings, and signed out Settings is in the footer (DL-070). */}
        <Link
          className="rc-icon-button"
          href={pathTo("settings")}
          aria-label="Settings"
          aria-current={route?.name === "settings" ? "page" : undefined}
          data-until="wide"
        >
          <Icon name="settings" />
        </Link>
        {signedIn && <AccountMenu current={route?.name} onSignedOut={setSignedOut} />}
        <p className="rc-visually-hidden" role="status">
          {signedIn ? "" : signedOut}
        </p>
      </div>
    </header>
  );
}
