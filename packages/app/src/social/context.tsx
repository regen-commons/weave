import { createContext, useContext, useRef, useState, useMemo, useEffect, type ReactNode } from "react";
import type { FixtureContext } from "../fixtures.ts";
import { createSocialFixture, type SocialService, type SocialState } from "./fixture.ts";
import { createLiveSocialService, type LiveSocialService } from "./live.ts";
import { useAccount } from "../account/context.tsx";
import { useDraft } from "../describe/use-draft.ts";
import { continueToCertified } from "../account/sign-in.ts";
import { accountRequest } from "../account/client.ts";
import { navigate } from "../router.tsx";
import { teamWorkspacePath } from "../routes.ts";
type SocialView = {
  state: SocialState;
  refresh(): void;
  today: string;
  loading?: boolean;
  problem?: string | null;
  consent?: boolean;
  reload?(): Promise<void>;
};
const SocialContext = createContext<(SocialView & (
  { mode: "fixture"; service: SocialService } | { mode: "live"; service: LiveSocialService }
)) | null>(null);
export function SocialFixtureProvider({ fixture, children }: { fixture: FixtureContext; children: ReactNode }) {
  const outcome = useRef(fixture.certified);
  outcome.current = fixture.certified;
  const [service] = useState(() => createSocialFixture(fixture.scenario, fixture.asOf, () => outcome.current, fixture.projects));
  const [state, setState] = useState(service.snapshot);
  return (
    <SocialContext.Provider
      value={{ service, state, refresh: () => setState(service.snapshot()), today: fixture.asOf, mode: "fixture" }}
    >
      {children}
    </SocialContext.Provider>
  );
}
export function useSocialFixture() {
  const value = useContext(SocialContext);
  return value?.mode === "fixture" ? value : null;
}
export const useSocial = () => useContext(SocialContext);

export function LiveSocialProvider({ children }: { children: ReactNode }) {
  const account = useAccount();
  const latestAccount = useRef(account.state);
  latestAccount.current = account.state;
  const { controller } = useDraft();
  const service = useMemo(() => createLiveSocialService({
    account: account.state ?? { available: false, fixture: false, user: null, items: [] }, controller,
    refreshAccount: account.refresh, signedOut: account.clear,
    storage: (() => { try { return window.sessionStorage; } catch { return undefined; } })(),
    openWorkspace: id => navigate(teamWorkspacePath(id)),
    signIn: () => continueToCertified(controller, window.location.pathname,
      returnTo => accountRequest("", { returnTo }, "/api/sign-in"), target => window.location.assign(target)),
  }), [account.state?.user?.id, account.state?.available, controller]);
  const [view, setView] = useState(() => ({ state: service.snapshot(), ...service.status() }));
  useEffect(() => {
    const update = () => setView({ state: service.snapshot(), ...service.status() });
    update();
    const unsubscribe = service.subscribe(update);
    void service.reload();
    return () => { unsubscribe(); service.dispose(); };
  }, [service]);
  useEffect(() => { if (account.state) service.syncAccount(account.state); }, [service, account.state]);
  useEffect(() => controller.subscribe(() => {
    if (latestAccount.current) service.syncAccount(latestAccount.current);
  }), [controller, service]);
  const current = view.state.identity === service.snapshot().identity ? view : { state: service.snapshot(), ...service.status() };
  return <SocialContext.Provider value={{ ...current, service, mode: "live", today: new Date().toISOString().slice(0, 10),
    refresh: () => setView({ state: service.snapshot(), ...service.status() }), reload: service.reload }}>{children}</SocialContext.Provider>;
}
