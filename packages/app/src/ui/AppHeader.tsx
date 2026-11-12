import { useSocialFixture } from "../social/context.tsx";
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
  return (
    <header className="rc-app-header">
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
      <div className="rc-app-header-state">
        {status !== "none" && (
          <p className="rc-save-status" data-state={status}>
            <Icon name={status === "account" ? "done" : "device"} size="sm" />
            <span>{STATUS_TEXT[status]}</span>
          </p>
        )}
        {/* Signed in, the Your initiatives tab holds the account, so the header adds no second door. */}
        {!signedIn && (
          <button className="rc-button" data-variant="quiet" type="button" onClick={() => openAccount("sign-in")}>
            Sign in
          </button>
        )}
        {/* Settings is the same on every page, signed in or out. The gear is read without a word (DL-059). */}
        <Link
          className="rc-icon-button"
          href={pathTo("settings")}
          aria-label="Settings"
          aria-current={route?.name === "settings" ? "page" : undefined}
        >
          <Icon name="settings" />
        </Link>
      </div>
    </header>
  );
}
