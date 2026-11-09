import { createContext, useContext, useState, type ReactNode } from "react";
import { createSocialFixture, type SocialService, type SocialState } from "./fixture.ts";
import type { Scenario } from "../fixtures.ts";
const SocialContext = createContext<{ service: SocialService; state: SocialState; refresh(): void } | null>(
  null,
);
export function SocialFixtureProvider({ scenario, children }: { scenario: Scenario; children: ReactNode }) {
  const [service] = useState(() => createSocialFixture(scenario));
  const [state, setState] = useState(service.snapshot);
  return (
    <SocialContext.Provider value={{ service, state, refresh: () => setState(service.snapshot()) }}>
      {children}
    </SocialContext.Provider>
  );
}
export function useSocialFixture() {
  return useContext(SocialContext);
}
