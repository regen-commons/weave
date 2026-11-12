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
const DoorContext = createContext<((intent?: DoorIntent) => void) | null>(null);
const RETURNS = ["signed-in", "failed", "cancelled"];
/** The one account door. Sign-in returns to the task; saving stays a separate choice. */
export function AccountDoorProvider({ children }: { children: ReactNode }) {
  const social = useSocialFixture();
  const account = useAccount();
  const status = useCardStatus();
  const [message, setMessage] = useState("");
  // Coming back from Certified reopens the door where the person left it, unless the page shows the account itself.
  const [intent, setIntent] = useState<DoorIntent | null>(() =>
    RETURNS.includes(new URLSearchParams(window.location.search).get("account") ?? "") &&
    ![pathTo("settings"), pathTo("your-initiatives")].includes(window.location.pathname) &&
    matchRoute(window.location.pathname)?.name !== "team-workspace"
      ? "keep"
      : null,
  );
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has("account")) {
      url.searchParams.delete("account");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }
  }, []);
  return (
    <DoorContext.Provider value={(next = "keep") => setIntent(next)}>
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
          <AccountSection autoFocus heading={false} onBeginCard={() => setIntent(null)} />
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
