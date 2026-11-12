import { useEffect, useId, useRef, useState } from "react";
import { connectPopover } from "@regen-commons/design-system/overlays";
import { Link } from "../router.tsx";
import { navLabel, pathTo, type RouteName } from "../routes.ts";
import { useSocial, useSocialFixture } from "../social/context.tsx";
import { Icon } from "../ui/Icon.tsx";
import { accountRequest } from "./client.ts";
import { useAccount } from "./context.tsx";
import { signOut } from "./sign-out.ts";

/**
 * The account's menu in the app header on a wide screen (DL-070): who is signed in, the two
 * places that are theirs, and Sign out. It renders the Account button (`rc-account`) and a Menu
 * (`rc-menu`). A phone has no room for it and keeps the You tab and the Settings gear.
 */
export function AccountMenu({
  current,
  onSignedOut,
}: {
  /** The page the person is on, so the menu can mark it. */
  current?: RouteName | undefined;
  /** The menu leaves with the session, so the header says what happened and takes the focus. */
  onSignedOut(message: string): void;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const account = useAccount();
  const social = useSocial();
  const example = useSocialFixture();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  useEffect(() => {
    if (trigger.current && panel.current) return connectPopover(trigger.current, panel.current);
  }, []);
  const handle = social?.state.identity?.handle;
  async function leave() {
    if (busy) return;
    setBusy(true);
    setProblem("");
    const result =
      import.meta.env.DEV && example
        ? await signOut(() => example.service.signOut(), example.refresh)
        : await signOut(() => accountRequest("", { action: "sign_out" }), account.clear);
    setBusy(false);
    if (result.cleared) return onSignedOut(result.message);
    setProblem(result.message);
    // The reason has to be read, so the menu comes back if it was closed while this was under way.
    if (trigger.current?.getAttribute("aria-expanded") !== "true") trigger.current?.click();
  }
  return (
    <>
      <button ref={trigger} className="rc-account" type="button" aria-label="Account" popoverTarget={id} data-from="wide">
        <Icon name="person" />
      </button>
      <div className="rc-menu" data-align="end" ref={panel} id={id} popover="auto">
        <p className="rc-menu-head">{handle ? `Signed in as ${handle}` : "Signed in with Certified"}</p>
        {(["your-initiatives", "settings"] as const).map((name) => (
          <Link
            key={name}
            className="rc-menu-item"
            href={pathTo(name)}
            aria-current={current === name ? "page" : undefined}
            data-close-popover
          >
            {navLabel(name)}
          </Link>
        ))}
        {/* Busy, not disabled: a disabled button would drop the keyboard's focus out of the menu. */}
        <button
          className="rc-menu-item"
          data-divide
          type="button"
          aria-busy={busy || undefined}
          aria-disabled={busy || undefined}
          onClick={() => void leave()}
        >
          {busy ? "Signing out" : "Sign out"}
        </button>
        {problem && (
          <p className="rc-notice" data-tone="warning" role="alert">
            {problem}
          </p>
        )}
      </div>
    </>
  );
}
