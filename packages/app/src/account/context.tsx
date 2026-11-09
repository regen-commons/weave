import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { accountRequest, accountState, AccountFailure, type AccountState } from "./client.ts";
const AccountContext = createContext<{
  state: AccountState | null;
  refresh: () => Promise<AccountState>;
  clear: () => void;
  returnResult: string | null;
  acknowledgeReturn: () => void;
} | null>(null);
const unavailable: AccountState = { available: false, fixture: false, user: null, items: [] };
export function AccountProvider({ children, fixture = false }: { children: ReactNode; fixture?: boolean }) {
  const [state, setState] = useState<AccountState | null>(null);
  // Capture before the address bar is cleaned; the draft may finish loading later.
  const [returnResult, setReturnResult] = useState(() => new URLSearchParams(window.location.search).get("account"));
  async function refresh() {
    if (fixture) {
      setState(unavailable);
      return unavailable;
    }
    try {
      const next = accountState(await accountRequest());
      setState(next);
      return next;
    } catch (error) {
      if (error instanceof AccountFailure && error.code === "sign_in_required")
        setState((current) => (current ? { ...current, user: null, items: [] } : null));
      throw error;
    }
  }
  useEffect(() => {
    void refresh().catch(() => {});
  }, [fixture]);
  return (
    <AccountContext.Provider
      value={{
        state: fixture ? unavailable : state,
        refresh,
        clear: () => setState((current) => (current ? { ...current, user: null, items: [] } : null)),
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
