import { useEffect, useMemo, type ReactNode } from "react";
import type { FixtureContext } from "../fixtures.ts";
import { describeFixture, intakeFixture } from "../fixtures.ts";
import { confirmDraft } from "./contracts.ts";
import { DraftController } from "./controller.ts";
import { MemoryDraftRepository } from "./repository.ts";
import { IndexedDraftRepository } from "./indexed-repository.ts";
const device = new DraftController(new IndexedDraftRepository());
import { DraftContext } from "./draft-context.ts";
export function DraftProvider({ fixture, children }: { fixture?: FixtureContext; children: ReactNode }) {
  const controller = useMemo(() => {
    if (import.meta.env.DEV && fixture) {
      const memory = new MemoryDraftRepository(
        fixture.intake === "off"
          ? window.location.pathname.startsWith("/funding") && fixture.scenario !== "visitor"
            ? confirmDraft(describeFixture("kept"))
            : describeFixture(fixture.describe)
          : intakeFixture(fixture.intake, window.location.pathname),
      );
      return new DraftController(
        fixture.describe === "storage-error" || fixture.intake === "storage-error"
          ? {
              load: () => memory.load(),
              save: async () => {
                throw new Error("Example storage failure");
              },
            }
          : memory,
      );
    }
    return device;
  }, [fixture?.describe, fixture?.intake, fixture?.scenario, !!fixture]);
  useEffect(() => {
    void controller.initialize();
  }, [controller]);
  useEffect(() => {
    if (!!fixture) return;
    const warn = (event: BeforeUnloadEvent) => {
      const current = controller.getSnapshot();
      if (["saving", "memory", "conflict"].includes(current.storage) && current.draft.revision > 0)
        event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [controller, !!fixture]);
  return <DraftContext.Provider value={{ controller, fixture: !!fixture }}>{children}</DraftContext.Provider>;
}
