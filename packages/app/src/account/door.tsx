import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { navigate, routeSearch } from "../router.tsx";
import { fixtureHref, pathTo, matchRoute } from "../routes.ts";
import { ExampleDoor, type DoorIntent } from "../social/Door.tsx";
import { useSocialFixture } from "../social/context.tsx";
import { useAccount } from "./context.tsx";
import { TaskDialog } from "../ui/TaskDialog.tsx";
import { AccountSection } from "./AccountSection.tsx";
import { doorOnReturn, doorShows } from "./sign-in.ts";
import { useSetAside } from "./set-aside.ts";
/** Opens the door. `problem` is a sign-in failure from the page that sent the person here, said at the door. */
const DoorContext = createContext<((intent?: DoorIntent, problem?: string) => void) | null>(null);
/** Where an earlier build kept the door's place while the person left to save, cleared on the way back. */
const SAVING_KEY = "weave.door.saving";
function forgetSaving(): void {
  try {
    window.sessionStorage.removeItem(SAVING_KEY);
  } catch {
    // Storage is off, so nothing was kept.
  }
}
/** The one account door. Sign-in returns to the task; nothing is saved privately (DL-155). */
export function AccountDoorProvider({ children }: { children: ReactNode }) {
  const social = useSocialFixture();
  const account = useAccount();
  const setAside = useSetAside();
  const [problem, setProblem] = useState("");
  // Coming back from Certified opens the door again only to say why a sign-in did not finish, unless
  // the page shows the account itself. A finished sign-in comes back to the page alone.
  const [intent, setIntent] = useState<DoorIntent | null>(() =>
    doorOnReturn(
      new URLSearchParams(window.location.search).get("account"),
      // Nothing is saved privately any more (DL-155), so the door never reopens to save.
      false,
      [pathTo("settings"), pathTo("your-initiatives")].includes(window.location.pathname) ||
        matchRoute(window.location.pathname)?.name === "team-workspace",
    ),
  );
  useEffect(() => {
    forgetSaving();
    const url = new URL(window.location.href);
    if (url.searchParams.has("account")) {
      url.searchParams.delete("account");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }
  }, []);
  return (
    <DoorContext.Provider value={(next = "keep", note = "") => { setProblem(note); setIntent(next); }}>
      {children}
      <TaskDialog
        title="Sign In"
        open={intent !== null}
        onClose={() => setIntent(null)}
      >
        {import.meta.env.DEV && social ? (
          <ExampleDoor
            save={false}
            direct={intent === "certified"}
            onDone={(result) => {
              const wanted = intent;
              setIntent(null);
              if (result === "signed-in" && wanted !== "keep")
                navigate(fixtureHref(pathTo("your-initiatives"), routeSearch(), true));
            }}
          />
        ) : intent !== null && doorShows(intent, !!account.state?.user, setAside) === "another-accounts-card" ? (
          // Signed in as someone else than the card's account, as on a shared device: the card is
          // not offered to this account (DL-055).
          <div className="rc-stack">
            <p>This card belongs to another account. It stays on this device and opens again when that account signs in.</p>
            <div className="rc-action-bar">
              <button className="rc-button" data-variant="secondary" type="button"
                onClick={() => { setIntent(null); navigate(pathTo("your-initiatives")); }}>
                Go To Your Initiatives
              </button>
            </div>
          </div>
        ) : (
          // Signed out, the door is the sign-in offer alone. Device backups are in Settings.
          <AccountSection autoFocus heading={false} showBackups={false} notice={problem} onBeginCard={() => setIntent(null)}
            onNotNow={() => setIntent(null)} />
        )}
      </TaskDialog>
    </DoorContext.Provider>
  );
}
export function useAccountDoor() {
  const open = useContext(DoorContext);
  if (!open) throw new Error("AccountDoorProvider is required");
  return open;
}
