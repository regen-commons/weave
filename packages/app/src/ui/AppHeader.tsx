import { useSocialFixture } from "../social/context.tsx";
import { useAccount } from "../account/context.tsx";
import { useAccountDoor } from "../account/door.tsx";
import { Link } from "../router.tsx";
import { matchRoute, pathTo } from "../routes.ts";
import { Icon } from "./Icon.tsx";
import { Logo } from "./Logo.tsx";
import { SECTIONS } from "./sections.ts";
export type SaveStatus = "none" | "device" | "account" | "saving" | "memory" | "conflict";
export function AppHeader({
  pathname,
  sections,
  status,
}: {
  pathname: string;
  sections: boolean;
  status: SaveStatus;
}) {
  const openAccount = useAccountDoor();
  const { state } = useAccount();
  const social = useSocialFixture();
  const signedIn = !!state?.user || (import.meta.env.DEV && !!social?.state.identity);
  const current = matchRoute(pathname)?.section;
  return (
    <header className="rc-app-header">
      <Logo />
      {sections && (
        <nav className="rc-app-nav" aria-label="Main">
          {SECTIONS.map((section) => (
            <Link
              key={section.route}
              href={pathTo(section.route)}
              aria-current={section.route === current ? "page" : undefined}
            >
              {section.label}
            </Link>
          ))}
        </nav>
      )}
      <div className="rc-app-header-state">
        <p className="rc-save-status" data-state={status}>
          <Icon name={status === "account" ? "done" : "device"} size="sm" />
          {status === "account"
            ? "Saved"
            : status === "device"
              ? "On this device"
              : status === "saving"
                ? "Saving on this device"
                : status === "memory"
                  ? "Not saved on this device"
                  : status === "conflict"
                    ? "Draft changed in another tab"
                    : "Nothing saved yet"}
        </p>
        {signedIn ? (
          <Link
            className="rc-button"
            data-variant="quiet"
            href={pathTo("your-initiatives")}
            aria-label="Your initiatives and account"
          >
            Account
          </Link>
        ) : (
          <button className="rc-button" data-variant="quiet" type="button" onClick={() => openAccount("sign-in")}>
            Sign in
          </button>
        )}
      </div>
    </header>
  );
}
