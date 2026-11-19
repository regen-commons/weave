import { useEffect, useMemo, type ReactNode } from "react";
import type { FixtureContext } from "../fixtures.ts";
import { describeFixture, intakeFixture, otherDraftFixtures } from "../fixtures.ts";
import { confirmDraft } from "./contracts.ts";
import { DraftController } from "./controller.ts";
import { MemoryDraftRepository } from "./repository.ts";
import { IndexedDraftRepository } from "./indexed-repository.ts";
import { broadcastChannel, sessionPointer } from "./tabs.ts";
// One controller for the tab. Its pointer keeps the tab on its draft across a reload, and the
// channel tells the browser's other tabs about each write (DL-112).
const device = new DraftController(new IndexedDraftRepository(), {
  pointer: sessionPointer(() => (typeof window === "undefined" ? undefined : window.sessionStorage)),
  channel: broadcastChannel(),
});
import { DraftContext } from "./draft-context.ts";
import { routePath } from "../router.tsx";
export function DraftProvider({ fixture, children }: { fixture?: FixtureContext; children: ReactNode }) {
  const controller = useMemo(() => {
    if (import.meta.env.DEV && fixture) {
      const path = routePath();
      const memory = new MemoryDraftRepository(
        fixture.intake !== "off"
          ? intakeFixture(fixture.intake, path)
          : path.startsWith("/start/")
            ? describeFixture(fixture.describe)
            : path.startsWith("/funding") && fixture.scenario !== "visitor"
              ? confirmDraft(describeFixture("kept"))
              : fixture.scenario === "visitor" || fixture.scenario === "returning"
                ? describeFixture("fresh")
                : intakeFixture("kept", path),
        fixture.drafts === "several" ? otherDraftFixtures() : [],
      );
      return new DraftController(
        fixture.describe === "storage-error" || fixture.intake === "storage-error"
          ? {
              load: (id) => memory.load(id),
              list: () => memory.list(),
              save: async () => {
                throw new Error("Example storage failure");
              },
            }
          : memory,
      );
    }
    return device;
  }, [fixture?.describe, fixture?.intake, fixture?.scenario, fixture?.drafts, !!fixture]);
  useEffect(() => {
    void controller.initialize();
  }, [controller]);
  useEffect(() => {
    if (!!fixture) return;
    const warn = (event: BeforeUnloadEvent) => {
      const current = controller.getSnapshot();
      if (["saving", "memory"].includes(current.storage) && current.draft.revision > 0)
        event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [controller, !!fixture]);
  return <DraftContext.Provider value={{ controller, fixture: !!fixture }}>{children}</DraftContext.Provider>;
}
