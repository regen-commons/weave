import { useEffect, useState } from "react";
import { uuid } from "@weave/api/account-contract";
import { AccountFailure } from "../account/client.ts";
import { useAccount } from "../account/context.tsx";
import { loadedDraft } from "../account/document.ts";
import { withConfirmedSession } from "../account/session-end.ts";
import { requestTeamWorkspace } from "../partners/team-workspace.ts";
import type { FundingSubject } from "./use-catalog.ts";

type WorkspaceFunding =
  | { state: "device" | "loading" }
  | { state: "ready"; card: FundingSubject }
  | { state: "unavailable"; message: string };

/** A workspace ID in the URL is only a navigation choice. The server checks access on each load. */
export function useWorkspaceFunding(id: string | null): WorkspaceFunding {
  const { state, confirm } = useAccount();
  const owner = state?.user?.id;
  const [loaded, setLoaded] = useState<{
    id: string;
    owner: string;
    result: Extract<WorkspaceFunding, { state: "ready" | "unavailable" }>;
  }>();

  useEffect(() => {
    if (!uuid(id) || !owner) return;
    const abort = new AbortController();
    void withConfirmedSession(
      () => requestTeamWorkspace(id, abort.signal), confirm, owner,
    ).then(({ saved }) => {
      if (abort.signal.aborted) return;
      const result = saved
        ? { state: "ready" as const, card: loadedDraft(saved, owner) }
        : { state: "unavailable" as const, message: "This workspace has no saved initiative to compare yet." };
      setLoaded({ id, owner, result });
    }).catch((error: unknown) => {
      if (abort.signal.aborted) return;
      const code = error instanceof AccountFailure ? error.code : "";
      const message = code === "project_consent_required"
        ? "Confirm Certified access in the workspace to see its funding fits."
        : code === "sign_in_required"
          ? "Sign in to see funding fits for this workspace."
          : "Weave could not open this workspace to compare funding.";
      setLoaded({ id, owner, result: { state: "unavailable", message } });
    });
    return () => {
      abort.abort();
      setLoaded((current) => current?.id === id && current.owner === owner ? undefined : current);
    };
  }, [id, owner, confirm]);

  if (id === null) return { state: "device" };
  if (!uuid(id)) return { state: "unavailable", message: "Weave could not open this workspace to compare funding." };
  if (state && !owner) return { state: "unavailable", message: "Sign in to see funding fits for this workspace." };
  return loaded?.id === id && loaded.owner === owner ? loaded.result : { state: "loading" };
}
