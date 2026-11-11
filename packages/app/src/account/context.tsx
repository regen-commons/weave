import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { accountRequest, accountState, AccountFailure, type AccountState } from "./client.ts";
import { checkSavedPresence, type SavedPresence } from "./saved-presence.ts";
import { useDraft } from "../describe/use-draft.ts";
import { revise } from "../describe/contracts.ts";
const AccountContext = createContext<{
  state: AccountState | null;
  refresh: () => Promise<AccountState>;
  clear: () => void;
  returnResult: string | null;
  acknowledgeReturn: () => void;
  missingRecord: boolean;
  savedCheck: SavedPresence | null;
} | null>(null);
const unavailable: AccountState = { available: false, fixture: false, user: null, items: [] };
export function AccountProvider({ children, fixture = false }: { children: ReactNode; fixture?: boolean }) {
  const [state, setState] = useState<AccountState | null>(null);
  const { controller, draft } = useDraft();
  const [missingDraft, setMissingDraft] = useState<string | null>(null);
  const missingRecord = missingDraft === draft.id;
  const [verified, setVerified] = useState<{ owner: string; id: string; status: SavedPresence } | null>(null);
  const binding = draft.account.saved;
  const listed = !!binding && state?.items.some(item => item.id === binding.id);
  useEffect(() => {
    if (fixture || !state?.user || binding?.owner !== state.user.id) { setVerified(null); if (!state?.user) setMissingDraft(null); return; }
    const owner = state.user.id, id = binding.id;

    const cancellation = new AbortController();
    setVerified({ owner, id, status: "checking" });
    // The first list page is not proof of absence. Check this exact saved ID before clearing a stale binding.
    void checkSavedPresence(binding, owner, state.items, cancellation.signal).then(status => {
      if (cancellation.signal.aborted) return;
      setVerified({ owner, id, status });
      setMissingDraft(status === "missing" ? controller.getSnapshot().draft.id : null);
      if (status === "missing") {
        const current = controller.getSnapshot().draft;
        if (current.account.saved?.id === id && current.account.saved.owner === owner && current.account.saved.revision === binding.revision)
          controller.change(d => revise(d, { account: { saved: null, pending: null } }));
      }
    }).catch(() => {});
    return () => cancellation.abort();
  }, [state?.user?.id, state?.items, binding?.id, binding?.owner, binding?.revision, fixture, controller]);
  const savedCheck = binding && state?.user && binding.owner === state.user.id
    ? listed ? state!.items.find(item => item.id === binding.id)!.revision === binding.revision ? "present" : "changed" : verified?.id === binding?.id && verified?.owner === state?.user?.id ? verified.status : "checking"
    : null;
  // Capture before the address bar is cleaned; the draft may finish loading later.
  const [returnResult, setReturnResult] = useState(() => new URLSearchParams(window.location.search).get("account"));
  const refresh = useCallback(async () => {
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
  }, [fixture]);
  const clear = useCallback(() => setState(current => current?.user ? { ...current, user: null, items: [] } : current), []);
  useEffect(() => {
    void refresh().catch(() => {});
  }, [fixture]);
  return (
    <AccountContext.Provider
      value={{
        state: fixture ? unavailable : state,
        refresh,
        clear,
        returnResult,
        acknowledgeReturn: () => setReturnResult(null),
        missingRecord, savedCheck,
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
