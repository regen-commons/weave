import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import type { FixtureContext } from "../fixtures.ts";
import { createSocialFixture, type SocialService, type SocialState } from "./fixture.ts";
const SocialContext = createContext<{
  service: SocialService;
  state: SocialState;
  refresh(): void;
  /** The example's reference date, so sharing periods read the same on every visit. */
  today: string;
} | null>(null);
export function SocialFixtureProvider({ fixture, children }: { fixture: FixtureContext; children: ReactNode }) {
  const outcome = useRef(fixture.certified);
  outcome.current = fixture.certified;
  const [service] = useState(() => createSocialFixture(fixture.scenario, fixture.asOf, () => outcome.current, fixture.projects));
  const [state, setState] = useState(service.snapshot);
  return (
    <SocialContext.Provider
      value={{ service, state, refresh: () => setState(service.snapshot()), today: fixture.asOf }}
    >
      {children}
    </SocialContext.Provider>
  );
}
export function useSocialFixture() {
  return useContext(SocialContext);
}
