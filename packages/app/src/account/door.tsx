import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { navigate, routeSearch } from "../router.tsx";
import { fixtureHref, pathTo, matchRoute } from "../routes.ts";
import { ExampleDoor, type DoorIntent } from "../social/Door.tsx";
import { useSocialFixture } from "../social/context.tsx";
import { useAccount } from "./context.tsx";
import { PrivateSaveAction } from "./PrivateSaveAction.tsx";
import { useCardStatus } from "../initiative/use-card-status.ts";
import { TaskDialog } from "../ui/TaskDialog.tsx";
import { AccountSection } from "./AccountSection.tsx";
import { doorOnReturn } from "./sign-in.ts";
/** Opens the door. `problem` is a sign-in failure from the page that sent the person here, said at the door. */
const DoorContext = createContext<((intent?: DoorIntent, problem?: string) => void) | null>(null);
/**
 * Kept for one trip to Certified: the person left from the door while saving, so the door reopens on
 * the way back. A sign-in from the app bar or a page leaves nothing here and returns to the page alone.
 */
const SAVING_KEY = "weave.door.saving";
function leftWhileSaving(): boolean {
  try {
    return window.sessionStorage.getItem(SAVING_KEY) === "1";
  } catch {
    return false;
  }
}
function markSaving(saving: boolean): void {
  try {
    if (saving) window.sessionStorage.setItem(SAVING_KEY, "1");
    else window.sessionStorage.removeItem(SAVING_KEY);
  } catch {
    // Storage is off: the page returns without reopening the door, and Save is still one press away.
  }
}
/** The one account door. Sign-in returns to the task; saving stays a separate choice. */
export function AccountDoorProvider({ children }: { children: ReactNode }) {
  const social = useSocialFixture();
  const account = useAccount();
  const status = useCardStatus();
  const [message, setMessage] = useState("");
  const [problem, setProblem] = useState("");
  // Coming back from Certified reopens the door where the person left it to save, unless the page
  // shows the account itself. A sign-in that did not start at the door comes back to the page alone.
  const [intent, setIntent] = useState<DoorIntent | null>(() =>
    doorOnReturn(
      new URLSearchParams(window.location.search).get("account"),
      leftWhileSaving(),
      [pathTo("settings"), pathTo("your-initiatives")].includes(window.location.pathname) ||
        matchRoute(window.location.pathname)?.name === "team-workspace",
    ),
  );
  useEffect(() => {
    markSaving(false);
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
        title={intent === "sign-in" || intent === "certified" ? "Sign in" : "Save your initiative"}
        open={intent !== null}
        onClose={() => setIntent(null)}
      >
        {import.meta.env.DEV && social ? (
          <ExampleDoor
            save={intent === "keep"}
            direct={intent === "certified"}
            onDone={(result) => {
              const wanted = intent;
              setIntent(null);
              if (result === "signed-in" && wanted !== "keep")
                navigate(fixtureHref(pathTo("your-initiatives"), routeSearch(), true));
            }}
          />
        ) : account.state?.user && intent === "keep" ? (
          <div className="rc-stack"><p>{status.line}</p>
            {status.save && <><p className="rc-meta">{status.save.note}</p>
              <PrivateSaveAction onFailed={setMessage} onSaved={() => setIntent(null)}>{status.save.label}</PrivateSaveAction></>}
            {message && <p role="alert">{message}</p>}
          </div>
        ) : (
          // Signed out, the door is the sign-in offer alone. Saved cards and backups are in Settings.
          <AccountSection autoFocus heading={false} showBackups={false} notice={problem} onBeginCard={() => setIntent(null)}
            onNotNow={() => setIntent(null)} onSignInStart={() => markSaving(intent === "keep")} />
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
export function SaveAction({
  children,
  variant = "primary",
  size,
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "quiet";
  size?: "sm";
}) {
  const open = useAccountDoor();
  return (
    <button className="rc-button" data-variant={variant} data-size={size} type="button" onClick={() => open("keep")}>
      {children}
    </button>
  );
}
