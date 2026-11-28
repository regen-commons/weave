import { reportUsage, takeSignInUsage } from "../usage.ts";
import { isSignInReturn } from "./sign-in.ts";
import { createContext, useContext, useEffect, useState, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";
import { type AccountState } from "./client.ts";
import { AccountSession } from "./session.ts";
import type { SessionEnding } from "./session-end.ts";
import { browserSessionEvents } from "./session-events.ts";
import { browserPresence } from "./presence.ts";
const AccountContext = createContext<{
  state: AccountState | null;
  checkingAccount: boolean;
  /**
   * The session has not been checked yet and an account is expected: this device last saw one signed
   * in, or another tab has just signed in. Hold the page's shape and do not offer sign-in.
   */
  expectsAccount: boolean;
  refresh: () => Promise<AccountState>;
  /** The session ended without this tab's Sign Out. */
  clear: () => void;
  /** This tab's Sign Out ended the session. */
  signedOut: () => void;
  /** Asks /api/account, which renews the session, after another endpoint refused a request. */
  confirm: () => Promise<AccountState>;
  ending: SessionEnding | null;
  acknowledgeEnding: () => void;
  returnResult: string | null;
  acknowledgeReturn: () => void;
} | null>(null);
const unavailable: AccountState = { available: false, fixture: false, user: null };
export function AccountProvider({ children, fixture = false }: { children: ReactNode; fixture?: boolean }) {
  const session = useMemo(() => new AccountSession(undefined, undefined, undefined, browserPresence()), [fixture]);
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const checking = useSyncExternalStore(session.subscribe, session.getChecking);
  const expected = useSyncExternalStore(session.subscribe, session.getExpected);
  const ending = useSyncExternalStore(session.subscribe, session.getEnding);
  // Capture before the address bar is cleaned; the draft may finish loading later.
  const [returnResult, setReturnResult] = useState(() => new URLSearchParams(window.location.search).get("account"));
  const announced = useRef(false);
  useEffect(() => {
    if (fixture) return;
    const disconnect = session.connect(browserSessionEvents());
    if (!announced.current && isSignInReturn(returnResult)) {
      announced.current = true;
      if (returnResult === "signed-in") session.changed();
      reportUsage(takeSignInUsage(), returnResult === "signed-in" ? "sign-in-completed" : `sign-in-${returnResult}`);
    }
    void session.refresh().catch(() => {});
    return disconnect;
  }, [session, fixture]);
  return (
    <AccountContext.Provider
      value={{
        state: fixture ? unavailable : state,
        checkingAccount: !fixture && checking,
        expectsAccount: !fixture && expected,
        refresh: fixture ? async () => unavailable : session.refresh,
        clear: session.clear,
        signedOut: session.signedOut,
        confirm: fixture ? async () => unavailable : session.confirm,
        ending: fixture ? null : ending,
        acknowledgeEnding: session.acknowledgeEnding,
        returnResult,
        acknowledgeReturn: () => setReturnResult(null),
      }}
    >
      {children}
    </AccountContext.Provider>
  );
}
export function useAccount() {
  const value = useContext(AccountContext);
  if (!value) throw new Error("AccountProvider is required");
  return value;
}
