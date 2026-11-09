import { useContext, useSyncExternalStore } from "react";
import { DraftContext } from "./draft-context.ts";
export function useDraft() {
  const value = useContext(DraftContext);
  if (!value) throw new Error("DraftProvider is required");
  const snapshot = useSyncExternalStore(
    value.controller.subscribe,
    value.controller.getSnapshot,
    value.controller.getSnapshot,
  );
  return { ...snapshot, controller: value.controller, fixture: value.fixture };
}
